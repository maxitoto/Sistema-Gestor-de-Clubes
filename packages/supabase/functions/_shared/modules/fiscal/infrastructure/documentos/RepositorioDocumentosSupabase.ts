import type { createEdgeClient, createServiceClient } from "@core/index.ts";
import { BUCKET_ARCHIVOS } from "../../../archivos/index.ts";
import {
  DocumentoError,
  type FuenteDocumento,
  type RepositorioDocumentos,
  type VersionDocumento,
} from "../../application/PuertoDocumentos.ts";
type Human = ReturnType<typeof createEdgeClient>;
type Technical = ReturnType<typeof createServiceClient>;
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DocumentoError("Las fuentes del comprobante están incompletas.");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 5000) {
    throw new DocumentoError("Las fuentes del comprobante están incompletas.");
  }
  return value;
}
function optional(value: unknown): string | null {
  return value === null ? null : text(value);
}
function amount(value: unknown): string {
  if (typeof value === "string" && /^(0|[1-9]\d{0,12})\.\d{2}$/.test(value)) {
    return value;
  }
  if (
    typeof value !== "number" || !Number.isFinite(value) || value <= 0 ||
    !Number.isSafeInteger(Math.round(value * 100)) ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.00001
  ) throw new DocumentoError("El importe del documento no es válido.");
  return value.toFixed(2);
}
export class RepositorioDocumentosSupabase implements RepositorioDocumentos {
  constructor(
    private human: Human,
    private technical: Technical,
    private firmarPrivado: (path: string) => Promise<string>,
  ) {}
  private async leer(
    table: string,
    columns: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await this.technical.from(table).select(columns).eq(
      "id",
      id,
    ).maybeSingle();
    if (error || !data) {
      throw new DocumentoError(
        "No se pudieron leer las fuentes del comprobante.",
        error ? 503 : 404,
      );
    }
    return row(data);
  }
  async leerFuente(comprobanteId: string): Promise<FuenteDocumento | null> {
    // Business RLS is checked with the request's human JWT before technical joins/storage.
    const permit = await this.human.from("comprobantes").select("id").eq(
      "id",
      comprobanteId,
    ).maybeSingle();
    if (permit.error) {
      throw new DocumentoError(
        "No se pudo comprobar el acceso al comprobante.",
        403,
      );
    }
    if (!permit.data) return null;
    const c = await this.leer(
      "comprobantes",
      "id,pago_id,tipo,punto_venta,numero_comprobante,cae,cae_vencimiento,estado_fiscal,solicitud_fiscal,updated_at,comprobante_origen_id",
      comprobanteId,
    );
    const p = await this.leer(
      "pagos",
      "id,cuota_id,monto,estado,fecha_pago,medio_pago,anulado_at,motivo_anulacion",
      text(c.pago_id),
    );
    const q = await this.leer(
      "cuotas",
      "id,socio_id,categoria_id,periodo_mes,periodo_anio",
      text(p.cuota_id),
    );
    const [s, club, categoria] = await Promise.all([
      this.leer("socios", "id,nombre,apellido,dni", text(q.socio_id)),
      this.leer(
        "club",
        "id,nombre,cuit,domicilio_fiscal",
        "00000000-0000-0000-0000-000000000000",
      ),
      this.leer("categorias", "id,deporte_id,nombre", text(q.categoria_id)),
    ]);
    const deporte = await this.leer(
      "deportes",
      "id,nombre",
      text(categoria.deporte_id),
    );
    if (
      !Number.isInteger(c.punto_venta) || !Number.isInteger(q.periodo_mes) ||
      !Number.isInteger(q.periodo_anio)
    ) throw new DocumentoError("La identidad documental está incompleta.");
    let original: FuenteDocumento["original"];
    if (c.tipo === "nota_credito") {
      const o = await this.leer(
        "comprobantes",
        "id,pago_id,tipo,punto_venta,tipo_fiscal,emisor_cuit,numero_comprobante,cae,solicitud_fiscal",
        text(c.comprobante_origen_id),
      );
      if (o.tipo !== "factura") {
        throw new DocumentoError(
          "La relación documental de la Nota de Crédito no es válida.",
        );
      }
      original = {
        id: text(o.id),
        pagoId: text(o.pago_id),
        numero: optional(o.numero_comprobante),
        puntoVenta: Number(o.punto_venta),
        tipoFiscal: o.tipo_fiscal === null ? null : Number(o.tipo_fiscal),
        cuit: optional(o.emisor_cuit),
        cae: optional(o.cae),
        solicitud: o.solicitud_fiscal,
      };
    }
    return {
      ...(original ? { original } : {}),
      ...(p.estado === "anulado"
        ? {
          anulacion: {
            fecha: text(p.anulado_at),
            motivo: text(p.motivo_anulacion),
          },
        }
        : {}),
      comprobanteId: text(c.id),
      pagoId: text(c.pago_id),
      tipo: text(c.tipo),
      estadoFiscal: text(c.estado_fiscal),
      puntoVenta: Number(c.punto_venta),
      numero: optional(c.numero_comprobante),
      cae: optional(c.cae),
      vencimiento: optional(c.cae_vencimiento),
      solicitud: c.solicitud_fiscal ?? null,
      actualizadoEn: optional(c.updated_at),
      pago: {
        estado: text(p.estado),
        importe: amount(p.monto),
        fecha: text(p.fecha_pago),
        medio: text(p.medio_pago),
      },
      club: {
        nombre: text(club.nombre),
        cuit: text(club.cuit),
        domicilio: text(club.domicilio_fiscal),
      },
      socio: {
        nombre: `${text(s.apellido)}, ${text(s.nombre)}`,
        documento: text(s.dni),
      },
      concepto: `${text(deporte.nombre)} - ${text(categoria.nombre)}`,
      periodo: `${q.periodo_mes}/${q.periodo_anio}`,
    };
  }
  async guardar(path: string, bytes: Uint8Array): Promise<void> {
    if (
      !/^comprobantes\/[0-9a-f-]{36}\/(provisional|autorizado)\/[0-9a-f]{64}\.pdf$/
        .test(path)
    ) throw new DocumentoError("La referencia del PDF no es válida.");
    const bucket = this.technical.storage.from(BUCKET_ARCHIVOS);
    const { error } = await bucket.upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "600",
    });
    if (!error) return;
    // Includes a response lost after Storage commit: verify immutable bytes before reuse.
    const existing = await bucket.download(path);
    if (!existing.error && existing.data) {
      const buffer = new Uint8Array(await existing.data.arrayBuffer());
      if (
        buffer.length === bytes.length &&
        buffer.every((byte, index) => byte === bytes[index])
      ) return;
    }
    throw new DocumentoError(
      "No se pudo guardar el PDF privado. La operación financiera se conserva; podés reintentar el documento.",
      503,
    );
  }
  async confirmarReferencia(
    f: FuenteDocumento,
    version: VersionDocumento,
    path: string,
  ): Promise<void> {
    const { error } = await this.technical.rpc("registrar_pdf_comprobante", {
      p_comprobante_id: f.comprobanteId,
      p_tipo_version: version,
      p_storage_path: path,
      p_fuente_esperada: {
        pago_id: f.pagoId,
        pago_estado: f.pago.estado,
        estado_fiscal: f.estadoFiscal,
        punto_venta: f.puntoVenta,
        numero_comprobante: f.numero,
        cae: f.cae,
        cae_vencimiento: f.vencimiento,
        solicitud_fiscal: f.solicitud,
        updated_at: f.actualizadoEn,
      },
    });
    if (error) {
      throw new DocumentoError(
        ["42501", "28000"].includes(error.code ?? "")
          ? "No tenés permiso para publicar este documento."
          : "El comprobante cambió durante la generación. Consultá su versión actual; el cobro no se modifica.",
        ["42501", "28000"].includes(error.code ?? "") ? 403 : 409,
      );
    }
  }
  firmar(path: string): Promise<string> {
    return this.firmarPrivado(path);
  }
}

import { TTL_ARCHIVO_SEGUNDOS } from "../../archivos/index.ts";
import { validarSolicitudFiscal } from "../domain/solicitud-fiscal.ts";
import {
  DocumentoError,
  type FuenteDocumento,
  type ModeloDocumento,
  type PuertoGeneradorPdf,
  type RepositorioDocumentos,
  type ResultadoDocumento,
} from "./PuertoDocumentos.ts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function fecha(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}
export function modeloDocumento(fuente: FuenteDocumento): ModeloDocumento {
  const esNc = fuente.tipo === "nota_credito";
  const anulado = fuente.pago.estado === "anulado";
  if (
    !uuid.test(fuente.comprobanteId) || !uuid.test(fuente.pagoId) ||
    !["factura", "nota_credito"].includes(fuente.tipo)
  ) {
    throw new DocumentoError(
      "El tipo de comprobante no admite este documento.",
    );
  }
  if (
    esNc
      ? !anulado
      : (anulado
        ? !["anulacion_pendiente", "anulado"].includes(fuente.estadoFiscal)
        : fuente.pago.estado !== "completado")
  ) {
    throw new DocumentoError(
      "El estado financiero y documental no es coherente.",
    );
  }
  if (
    anulado && (!fuente.anulacion || !fuente.anulacion.motivo.trim() ||
      !Number.isFinite(new Date(fuente.anulacion.fecha).getTime()))
  ) {
    throw new DocumentoError(
      "La anulación no tiene fecha y motivo verificables.",
    );
  }
  let original: ModeloDocumento["original"], solicitudOriginal;
  if (esNc) {
    const o = fuente.original;
    if (
      !o || !uuid.test(o.id) || o.id === fuente.comprobanteId ||
      o.pagoId !== fuente.pagoId ||
      !o.numero || !/^[1-9]\d{0,7}$/.test(o.numero) || !o.cae ||
      !/^\d{14}$/.test(o.cae) || /^0+$/.test(o.cae) ||
      !o.tipoFiscal || !o.cuit || !/^\d{11}$/.test(o.cuit)
    ) {
      throw new DocumentoError(
        "La Nota de Crédito requiere su factura original autorizada del mismo cobro.",
      );
    }
    try {
      solicitudOriginal = validarSolicitudFiscal(o.solicitud);
    } catch {
      throw new DocumentoError(
        "La factura original no tiene un snapshot fiscal verificable.",
      );
    }
    if (
      solicitudOriginal.detalle.CbteDesde !== o.numero ||
      solicitudOriginal.detalle.CbteHasta !== o.numero ||
      solicitudOriginal.identidad.puntoVenta !== o.puntoVenta ||
      solicitudOriginal.identidad.tipoComprobante !== o.tipoFiscal ||
      solicitudOriginal.identidad.cuit !== o.cuit ||
      solicitudOriginal.detalle.ImpTotal !== fuente.pago.importe
    ) {
      throw new DocumentoError(
        "La identidad o el importe de la factura original no coincide.",
      );
    }
    original = {
      id: o.id,
      numero: o.numero,
      puntoVenta: o.puntoVenta,
      tipoFiscal: o.tipoFiscal,
      cuit: o.cuit,
    };
  }
  if (
    !/^(0|[1-9]\d{0,12})\.\d{2}$/.test(fuente.pago.importe) ||
    BigInt(fuente.pago.importe.replace(".", "")) <= 0n ||
    !Number.isFinite(new Date(fuente.pago.fecha).getTime())
  ) {
    throw new DocumentoError(
      "El cobro no tiene datos documentales coherentes.",
    );
  }
  const base = {
    tipoDocumento: esNc ? "nota_credito" as const : "factura" as const,
    estadoDocumento: fuente.estadoFiscal,
    ...(fuente.anulacion ? { anulacion: fuente.anulacion } : {}),
    ...(original ? { original } : {}),
    comprobanteId: fuente.comprobanteId,
    pagoId: fuente.pagoId,
    concepto: fuente.concepto,
    periodo: fuente.periodo,
    fechaCobro: fuente.pago.fecha,
    medioPago: fuente.pago.medio === "transferencia"
      ? "Transferencia bancaria"
      : "Efectivo",
  };
  const tieneAutorizacion = fuente.estadoFiscal === "valido" ||
    (anulado &&
      ["anulacion_pendiente", "anulado"].includes(fuente.estadoFiscal) &&
      fuente.cae !== null);
  if (tieneAutorizacion) {
    let solicitud;
    try {
      solicitud = validarSolicitudFiscal(fuente.solicitud);
    } catch {
      throw new DocumentoError(
        "Falta el snapshot fiscal verificado. No se puede presentar un PDF autorizado.",
      );
    }
    if (
      !fuente.numero || !/^[1-9]\d{0,7}$/.test(fuente.numero) || !fuente.cae ||
      !/^\d{14}$/.test(fuente.cae) || /^0+$/.test(fuente.cae) ||
      !fuente.vencimiento ||
      !fecha(fuente.vencimiento) ||
      solicitud.detalle.CbteDesde !== fuente.numero ||
      solicitud.detalle.CbteHasta !== fuente.numero ||
      solicitud.detalle.ImpTotal !== fuente.pago.importe ||
      solicitud.identidad.puntoVenta !== fuente.puntoVenta
    ) {
      throw new DocumentoError(
        "La autorización, el importe o la identidad fiscal no coincide con el documento persistido.",
      );
    }
    if (esNc) {
      const asociados = solicitud.detalle.CbtesAsoc;
      if (
        !asociados || asociados.length !== 1 ||
        asociados[0].Tipo !== original!.tipoFiscal ||
        asociados[0].PtoVta !== original!.puntoVenta ||
        asociados[0].Nro !== original!.numero ||
        (asociados[0].Cuit !== undefined &&
          asociados[0].Cuit !== original!.cuit) ||
        solicitud.identidad.cuit !== original!.cuit ||
        solicitud.detalle.DocTipo !== solicitudOriginal!.detalle.DocTipo ||
        solicitud.detalle.DocNro !== solicitudOriginal!.detalle.DocNro ||
        solicitud.detalle.MonId !== solicitudOriginal!.detalle.MonId ||
        solicitud.detalle.MonCotiz !== solicitudOriginal!.detalle.MonCotiz
      ) {
        throw new DocumentoError(
          "La Nota de Crédito no corresponde a su factura original.",
        );
      }
    }
    return {
      ...base,
      version: "autorizado",
      concepto: ({
        1: "Productos",
        2: "Servicios",
        3: "Productos y servicios",
      } as const)[solicitud.detalle.Concepto],
      periodo: solicitud.detalle.FchServDesde && solicitud.detalle.FchServHasta
        ? [solicitud.detalle.FchServDesde, solicitud.detalle.FchServHasta].map((
          value,
        ) => `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`)
          .join(" - ")
        : `${solicitud.detalle.CbteFch.slice(6, 8)}/${
          solicitud.detalle.CbteFch.slice(4, 6)
        }/${solicitud.detalle.CbteFch.slice(0, 4)}`,
      importe: solicitud.detalle.ImpTotal,
      moneda: solicitud.detalle.MonId,
      emisor: {
        nombre: solicitud.emisor.nombre,
        cuit: solicitud.identidad.cuit,
        domicilio: solicitud.emisor.domicilio,
      },
      receptor: {
        nombre: solicitud.receptor.nombre,
        documento: solicitud.detalle.DocNro,
        ...(solicitud.receptor.domicilio
          ? { domicilio: solicitud.receptor.domicilio }
          : {}),
      },
      fiscal: {
        solicitud,
        numero: fuente.numero,
        cae: fuente.cae,
        vencimiento: fuente.vencimiento,
      },
    };
  }
  if (
    ![
      "pendiente_cae",
      "fallido",
      ...(anulado && !esNc ? ["anulacion_pendiente", "anulado"] : []),
    ].includes(fuente.estadoFiscal) ||
    fuente.cae !== null || fuente.numero !== null
  ) {
    throw new DocumentoError(
      "El estado fiscal requiere revisión antes de generar su documento.",
    );
  }
  return {
    ...base,
    version: "provisional",
    importe: fuente.pago.importe,
    moneda: "Moneda local",
    emisor: solicitudOriginal
      ? {
        nombre: solicitudOriginal.emisor.nombre,
        cuit: solicitudOriginal.identidad.cuit,
        domicilio: solicitudOriginal.emisor.domicilio,
      }
      : fuente.club,
    receptor: solicitudOriginal
      ? {
        nombre: solicitudOriginal.receptor.nombre,
        documento: solicitudOriginal.detalle.DocNro,
        ...(solicitudOriginal.receptor.domicilio
          ? { domicilio: solicitudOriginal.receptor.domicilio }
          : {}),
      }
      : fuente.socio,
    fiscal: null,
  };
}
/** Canonical public content only; credentials and mutable PDF pointers never enter this key. */
function canonico(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonico).join(",") + "]";
  const row = value as Record<string, unknown>;
  return "{" +
    Object.keys(row).sort().map((key) =>
      JSON.stringify(key) + ":" + canonico(row[key])
    ).join(",") + "}";
}
export async function rutaDocumento(modelo: ModeloDocumento): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonico({ plantilla: 4, contenido: modelo })),
    ),
  );
  const digest = [...hash].map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `comprobantes/${modelo.comprobanteId}/${modelo.version}/${digest}.pdf`;
}
export class GenerarPdfComprobanteUseCase {
  constructor(
    private repo: RepositorioDocumentos,
    private generador: PuertoGeneradorPdf,
  ) {}
  async ejecutar(comprobanteId: unknown): Promise<ResultadoDocumento> {
    if (typeof comprobanteId !== "string" || !uuid.test(comprobanteId)) {
      throw new DocumentoError("Identificador de comprobante inválido.", 400);
    }
    const fuente = await this.repo.leerFuente(comprobanteId);
    if (!fuente) {
      throw new DocumentoError(
        "No se encontró un comprobante disponible para esta cuenta.",
        404,
      );
    }
    const modelo = modeloDocumento(fuente),
      storagePath = await rutaDocumento(modelo);
    const bytes = await this.generador.generar(modelo);
    if (
      bytes.length < 100 || bytes.length > 10485760 ||
      new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
    ) {
      throw new DocumentoError(
        "No se pudo generar un PDF válido. El cobro permanece registrado.",
        503,
      );
    }
    await this.repo.guardar(storagePath, bytes);
    // Short SQL compare-and-set after rendering/upload; no transaction spans those I/O operations.
    await this.repo.confirmarReferencia(fuente, modelo.version, storagePath);
    return {
      comprobanteId,
      version: modelo.version,
      storagePath,
      url: await this.repo.firmar(storagePath),
      expiresIn: TTL_ARCHIVO_SEGUNDOS,
      nombreArchivo: `comprobante-${comprobanteId}-${modelo.version}.pdf`,
    };
  }
}

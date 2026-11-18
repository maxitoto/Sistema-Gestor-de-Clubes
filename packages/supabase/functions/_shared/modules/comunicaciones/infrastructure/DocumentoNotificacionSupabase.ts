import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdjuntoPdf } from "@core/index.ts";
import { BUCKET_ARCHIVOS } from "@modules/archivos/index.ts";
import {
  DocumentoError,
  type FuenteDocumento,
  GeneradorPdf,
  modeloDocumento,
  rutaDocumento,
} from "@modules/fiscal/index.ts";
import type {
  IntencionCorreo,
  PuertoDocumentoNotificacion,
} from "../application/PuertoNotificaciones.ts";
const PATH =
  /^comprobantes\/[0-9a-f-]{36}\/(provisional|autorizado)\/[0-9a-f]{64}\.pdf$/;
export class DocumentoNotificacionSupabase
  implements PuertoDocumentoNotificacion {
  constructor(
    private db: SupabaseClient,
    private generador = new GeneradorPdf(),
  ) {}
  private async renderizar(
    fuente: FuenteDocumento,
    version: string,
    pathEsperado: string | null,
  ) {
    const modelo = modeloDocumento(fuente);
    if (modelo.version !== version) {
      throw new DocumentoError(
        "La versión documental no corresponde a la intención.",
      );
    }
    const path = await rutaDocumento(modelo);
    if (!PATH.test(path) || (pathEsperado !== null && pathEsperado !== path)) {
      throw new DocumentoError("La referencia documental cambió.");
    }
    const bytes = await this.generador.generar(modelo);
    if (
      bytes.length < 100 || bytes.length > 10485760 ||
      new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
    ) throw new DocumentoError("No se pudo generar el comprobante adjunto.");
    const bucket = this.db.storage.from(BUCKET_ARCHIVOS);
    const saved = await bucket.upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "600",
    });
    if (saved.error) {
      const existing = await bucket.download(path);
      if (existing.error || !existing.data) {
        throw new DocumentoError("No se pudo recuperar el PDF privado.", 503);
      }
      const actual = new Uint8Array(await existing.data.arrayBuffer());
      if (
        actual.length !== bytes.length ||
        !actual.every((b, i) => b === bytes[i])
      ) {
        throw new DocumentoError(
          "El archivo existente no coincide con su versión inmutable.",
        );
      }
    }
    return {
      path,
      bytes,
      nombre: `${
        modelo.tipoDocumento === "nota_credito"
          ? "nota-de-credito"
          : "comprobante"
      }-${modelo.version}.pdf`,
    };
  }
  async generar(i: IntencionCorreo): Promise<string> {
    if (!i.fuente_documento || !i.version_documento) {
      throw new DocumentoError("La intención no tiene una fuente documental.");
    }
    return (await this.renderizar(
      i.fuente_documento,
      i.version_documento,
      i.documento_path,
    )).path;
  }
  /** Recupera también un objeto ausente desde la misma fuente; nunca consulta el estado actual. */
  async adjunto(
    destinatarioId: string,
    reserva: string,
  ): Promise<AdjuntoPdf | null> {
    const { data, error } = await this.db.rpc("leer_documento_correo", {
      p_destinatario_id: destinatarioId,
      p_reserva_id: reserva,
    });
    if (error) {
      throw new DocumentoError("No se pudo comprobar el adjunto privado.", 503);
    }
    if (data === null) return null;
    if (
      !data || typeof data !== "object" ||
      typeof data.storagePath !== "string" ||
      typeof data.nombreArchivo !== "string" || !data.fuenteDocumento ||
      !["provisional", "autorizado"].includes(data.versionDocumento)
    ) throw new DocumentoError("La referencia privada no es válida.");
    const result = await this.renderizar(
      data.fuenteDocumento as FuenteDocumento,
      data.versionDocumento,
      data.storagePath,
    );
    if (result.nombre !== data.nombreArchivo) {
      throw new DocumentoError(
        "El nombre del adjunto no corresponde a su documento.",
      );
    }
    return {
      bytes: result.bytes,
      nombre: result.nombre,
      tipo: "application/pdf",
    };
  }
}

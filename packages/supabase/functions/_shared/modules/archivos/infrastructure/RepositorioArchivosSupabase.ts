import type { createEdgeClient, createServiceClient } from "@core/index.ts";
import {
  ArchivoError,
  BUCKET_ARCHIVOS,
  type CargaArchivo,
  type IdentidadArchivo,
  TTL_ARCHIVO_SEGUNDOS,
} from "../domain/archivo.ts";
import type { RepositorioArchivos } from "../application/ArchivosService.ts";
type Humano = ReturnType<typeof createEdgeClient>;
type Tecnico = ReturnType<typeof createServiceClient>;
const fields = {
  "socio-foto": {
    table: "socios",
    path: "foto_storage_path",
    legacy: "foto_url",
  },
  "club-logo": { table: "club", path: "logo_storage_path", legacy: "logo_url" },
  "gasto-evidencia": {
    table: "gastos",
    path: "evidencia_storage_path",
    legacy: "evidencia_url",
  },
};
function databaseError(error: { code?: string; message?: string }) {
  const permission = ["42501", "28000"].includes(error.code ?? "");
  const business = ["P0001", "23514", "23503"].includes(error.code ?? "");
  throw new ArchivoError(
    permission
      ? "No tenés permiso para realizar esta operación."
      : business
      ? "El archivo o el estado del registro ya no permite esta operación. Recargá los datos."
      : "No se pudo completar la operación de archivos.",
    permission ? 403 : business ? 409 : 503,
  );
}
export class RepositorioArchivosSupabase implements RepositorioArchivos {
  constructor(
    private human: Humano,
    private technical: Tecnico,
    private actorId: string,
  ) {}
  async autorizar(identidad: IdentidadArchivo) {
    const { error } = await this.human.rpc("archivo_autorizar_carga", {
      p_tipo: identidad.tipo,
      p_entidad_id: identidad.entidadId,
    });
    if (error) databaseError(error);
  }
  async guardar(path: string, bytes: Uint8Array, mime: string) {
    const { error } = await this.technical.storage.from(BUCKET_ARCHIVOS).upload(
      path,
      bytes,
      { contentType: mime, upsert: false, cacheControl: "600" },
    );
    if (error) {
      throw new ArchivoError(
        "No se pudo cargar el archivo. No se modificó el registro.",
        503,
      );
    }
  }
  async registrar(identidad: IdentidadArchivo, archivo: CargaArchivo) {
    const { error } = await this.technical.rpc("archivo_registrar_validado", {
      p_tipo: identidad.tipo,
      p_entidad_id: identidad.entidadId,
      p_actor_id: this.actorId,
      p_storage_path: archivo.storagePath,
      p_mime: archivo.tipoMime,
      p_tamano: archivo.tamano,
    });
    if (error) databaseError(error);
  }
  async asociar(identidad: IdentidadArchivo, path: string) {
    const config = fields[identidad.tipo];
    // Human JWT reaches the same column grants, row policies and date/state triggers as any other edit.
    const { data, error } = await this.human.from(config.table).update({
      [config.path]: path,
    }).eq("id", identidad.entidadId).select("id").maybeSingle();
    if (error) databaseError(error);
    if (!data) {
      throw new ArchivoError(
        "El registro no está disponible para asociar el archivo.",
        404,
      );
    }
  }
  async leer(identidad: IdentidadArchivo) {
    const config = fields[identidad.tipo];
    const { data, error } = await this.human.from(config.table).select(
      `${config.path},${config.legacy}`,
    ).eq("id", identidad.entidadId).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new ArchivoError("Registro no encontrado.", 404);
    const row = data as unknown as Record<string, unknown>;
    return {
      path: typeof row[config.path] === "string"
        ? row[config.path] as string
        : null,
      legacy: typeof row[config.legacy] === "string"
        ? row[config.legacy] as string
        : null,
    };
  }
  async firmar(path: string) {
    const { data, error } = await this.technical.storage.from(BUCKET_ARCHIVOS)
      .createSignedUrl(path, TTL_ARCHIVO_SEGUNDOS);
    if (error || !data?.signedUrl) {
      throw new ArchivoError(
        "No se pudo obtener una lectura temporal del archivo.",
        503,
      );
    }
    const url = new URL(data.signedUrl);
    const publicBase = Deno.env.get("ARCHIVOS_PUBLIC_BASE_URL");
    // Local edge runtime uses an internal gateway; only the public origin is substituted.
    if (!publicBase) {
      throw new ArchivoError(
        "Falta configurar el acceso público de archivos.",
        503,
      );
    }
    const external = new URL(publicBase);
    if (
      !["http:", "https:"].includes(external.protocol) || external.username ||
      external.password || external.pathname !== "/" || external.search ||
      external.hash
    ) {
      throw new ArchivoError(
        "La configuración pública de archivos no es válida.",
        503,
      );
    }
    url.protocol = external.protocol;
    url.host = external.host;
    return url.toString();
  }
  async reservarDescarte(identidad: IdentidadArchivo, path: string) {
    const { error } = await this.technical.rpc("archivo_reservar_descarte", {
      p_tipo: identidad.tipo,
      p_entidad_id: identidad.entidadId,
      p_actor_id: this.actorId,
      p_storage_path: path,
    });
    if (error) databaseError(error);
  }
  async borrar(path: string) {
    const { error } = await this.technical.storage.from(BUCKET_ARCHIVOS).remove(
      [path],
    );
    if (error) {
      throw new ArchivoError(
        "No se pudo descartar el archivo sin asociar. Podés reintentar el descarte.",
        503,
      );
    }
  }
  async finalizarDescarte(path: string) {
    const { error } = await this.technical.rpc("archivo_finalizar_descarte", {
      p_actor_id: this.actorId,
      p_storage_path: path,
    });
    if (error) databaseError(error);
  }
}

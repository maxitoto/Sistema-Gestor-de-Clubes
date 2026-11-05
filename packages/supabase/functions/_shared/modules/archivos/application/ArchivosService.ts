import {
  ArchivoError,
  type ArchivoValidado,
  type CargaArchivo,
  type IdentidadArchivo,
  prefijoArchivo,
  validarRutaArchivo,
} from "../domain/archivo.ts";
export interface RepositorioArchivos {
  autorizar(identidad: IdentidadArchivo): Promise<void>;
  guardar(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  registrar(identidad: IdentidadArchivo, archivo: CargaArchivo): Promise<void>;
  asociar(identidad: IdentidadArchivo, path: string): Promise<void>;
  leer(
    identidad: IdentidadArchivo,
  ): Promise<{ path: string | null; legacy: string | null }>;
  firmar(path: string): Promise<string>;
  reservarDescarte(identidad: IdentidadArchivo, path: string): Promise<void>;
  borrar(path: string): Promise<void>;
  finalizarDescarte(path: string): Promise<void>;
}
export class ArchivosService {
  constructor(
    private repository: RepositorioArchivos,
    private validate: (
      tipo: IdentidadArchivo["tipo"],
      bytes: Uint8Array,
      mime: string,
    ) => Promise<ArchivoValidado>,
    private uuid = () => crypto.randomUUID(),
  ) {}
  async subir(
    identidad: IdentidadArchivo,
    bytes: Uint8Array,
    mime: string,
  ): Promise<CargaArchivo> {
    await this.repository.autorizar(identidad);
    const archivo = await this.validate(identidad.tipo, bytes, mime);
    const storagePath = `${
      prefijoArchivo(identidad.tipo, identidad.entidadId)
    }${this.uuid()}.${archivo.extension}`;
    await this.repository.guardar(storagePath, bytes, archivo.tipoMime);
    try {
      await this.repository.registrar(identidad, { ...archivo, storagePath });
    } catch {
      // Never disclose a path before the validated-object record exists.
      try {
        await this.repository.borrar(storagePath);
      } catch {
        /* Unassociated server-created orphan; no business record was changed. */
      }
      throw new ArchivoError(
        "No se pudo completar la carga del archivo. Volvé a intentarlo.",
        503,
      );
    }
    return { storagePath, tipoMime: archivo.tipoMime, tamano: archivo.tamano };
  }
  async asociar(identidad: IdentidadArchivo, path: unknown) {
    const storagePath = validarRutaArchivo(identidad, path);
    await this.repository.asociar(identidad, storagePath);
    return { storagePath };
  }
  async leer(identidad: IdentidadArchivo) {
    const record = await this.repository.leer(identidad);
    if (!record.path) {
      return { url: record.legacy, storagePath: null, legacy: !!record.legacy };
    }
    const path = validarRutaArchivo(identidad, record.path);
    return {
      url: await this.repository.firmar(path),
      storagePath: path,
      legacy: false,
    };
  }
  async descartar(identidad: IdentidadArchivo, path: unknown) {
    const storagePath = validarRutaArchivo(identidad, path);
    await this.repository.reservarDescarte(identidad, storagePath);
    await this.repository.borrar(storagePath);
    await this.repository.finalizarDescarte(storagePath);
  }
}

export const BUCKET_ARCHIVOS = "club-archivos";
export const TTL_ARCHIVO_SEGUNDOS = 600;
export const LIMITE_IMAGEN = 5 * 1024 * 1024;
export const LIMITE_EVIDENCIA = 10 * 1024 * 1024;
export type TipoArchivo = "socio-foto" | "club-logo" | "gasto-evidencia";
export interface IdentidadArchivo {
  tipo: TipoArchivo;
  entidadId: string;
}
export interface ArchivoValidado {
  tipoMime: string;
  extension: string;
  tamano: number;
}
export interface CargaArchivo
  extends Pick<ArchivoValidado, "tipoMime" | "tamano"> {
  storagePath: string;
}
export class ArchivoError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}
export const esUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function identidadArchivo(
  tipo: unknown,
  entidadId: unknown,
): IdentidadArchivo {
  if (
    !["socio-foto", "club-logo", "gasto-evidencia"].includes(String(tipo)) ||
    !esUuid(entidadId)
  ) {
    throw new ArchivoError("Tipo o identificador de archivo inválido.");
  }
  return { tipo: tipo as TipoArchivo, entidadId: entidadId.toLowerCase() };
}
export function prefijoArchivo(tipo: TipoArchivo, entidadId: string): string {
  const base = {
    "socio-foto": "socios",
    "club-logo": "club",
    "gasto-evidencia": "gastos",
  };
  return `${base[tipo]}/${entidadId}/`;
}
export function validarRutaArchivo(
  identidad: IdentidadArchivo,
  path: unknown,
): string {
  if (
    typeof path !== "string" ||
    !path.startsWith(prefijoArchivo(identidad.tipo, identidad.entidadId)) ||
    !/^[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|pdf)$/.test(path) ||
    (identidad.tipo !== "gasto-evidencia" && path.endsWith(".pdf"))
  ) {
    throw new ArchivoError(
      "La referencia del archivo no pertenece a este registro.",
    );
  }
  return path;
}

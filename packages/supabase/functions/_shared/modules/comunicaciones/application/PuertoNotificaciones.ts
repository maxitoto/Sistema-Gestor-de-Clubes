import type {
  FuenteDocumento,
  VersionDocumento,
} from "@modules/fiscal/index.ts";
export type IntencionCorreo = {
  id: string;
  reserva: string;
  evento: string;
  operacion_id: string;
  version_documento: VersionDocumento | null;
  destinatario_snapshot: string | null;
  fuente_documento: FuenteDocumento | null;
  documento_path: string | null;
};
export interface RepositorioNotificaciones {
  reclamar(limite: number): Promise<IntencionCorreo[]>;
  confirmarDocumento(id: string, reserva: string, path: string): Promise<void>;
  encolar(id: string, reserva: string): Promise<void>;
  registrarFallo(id: string, reserva: string, codigo: string): Promise<void>;
}
export interface PuertoDocumentoNotificacion {
  generar(intencion: IntencionCorreo): Promise<string>;
}

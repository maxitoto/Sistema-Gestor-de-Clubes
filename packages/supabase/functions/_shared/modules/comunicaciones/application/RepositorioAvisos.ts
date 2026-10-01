import type { SolicitudCorreo } from "../domain/email_domain.ts";

export type ResultadoAviso = {
  id: string;
  estado: "procesando";
  encolados: number;
  excluidos: number;
};

export interface RepositorioAvisos {
  encolar(solicitud: SolicitudCorreo): Promise<ResultadoAviso>;
}

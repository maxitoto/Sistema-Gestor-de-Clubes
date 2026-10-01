import { validarSolicitud } from "../domain/email_domain.ts";
import type { RepositorioAvisos } from "./RepositorioAvisos.ts";

export class EnviarAvisoUseCase {
  constructor(private socioRepo: RepositorioAvisos) {}
  execute(solicitud: unknown) {
    return this.socioRepo.encolar(validarSolicitud(solicitud));
  }
}

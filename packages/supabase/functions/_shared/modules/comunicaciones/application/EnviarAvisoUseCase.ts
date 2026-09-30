import { validarSolicitud } from "../domain/email_domain.ts";
import { SocioRepository } from "../infrastructure/SocioRepository.ts";

export class EnviarAvisoUseCase {
  constructor(private socioRepo: SocioRepository) {}
  execute(solicitud: unknown) {
    return this.socioRepo.encolar(validarSolicitud(solicitud));
  }
}

import { extraerEmails, formatearCuerpoCorreo } from "../domain/email_domain.ts";
import { SocioRepository } from "../infrastructure/SocioRepository.ts";
import { sendEmail } from "@core/mailer.ts";

export class EnviarAvisoUseCase {
  constructor(private socioRepo: SocioRepository) {}

  async execute(asunto: string, cuerpo: string, sociosIds: string[]) {
    if (!sociosIds || sociosIds.length === 0) {
      throw new Error("Debes seleccionar al menos un socio.");
    }

    // 1. Obtener datos (Infraestructura)
    const socios = await this.socioRepo.obtenerSociosActivos(sociosIds);
    if (socios.length === 0) {
      throw new Error("Ninguno de los socios seleccionados es válido para recibir correos.");
    }

    // 2. Aplicar reglas de negocio (Dominio)
    const listaEmails = extraerEmails(socios);
    if (listaEmails.length === 0) {
      throw new Error("No hay correos electrónicos válidos en la selección.");
    }
    
    const htmlFinal = formatearCuerpoCorreo(cuerpo);

    // 3. Ejecutar acción secundaria (Infraestructura externa)
    await sendEmail(listaEmails, asunto, htmlFinal);

    return { success: true, enviados: listaEmails.length };
  }
}
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@core/index.ts";
import type {
  IntencionCorreo,
  RepositorioNotificaciones,
} from "../application/PuertoNotificaciones.ts";
import { uuidValido } from "../domain/email_domain.ts";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("La intención de correo no es válida.", 503);
  }
  return value as Record<string, unknown>;
}
export class RepositorioNotificacionesSupabase
  implements RepositorioNotificaciones {
  constructor(private db: SupabaseClient) {}
  private async llamar(nombre: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(nombre, args);
    if (error) {
      throw new AppError(
        "No se pudo confirmar la preparación de la notificación.",
        503,
      );
    }
    return data as unknown;
  }
  async reclamar(limite: number): Promise<IntencionCorreo[]> {
    const value = await this.llamar("reclamar_intenciones_correo", {
      p_limite: limite,
    });
    if (!Array.isArray(value) || value.length > 10) {
      throw new AppError("El lote de notificaciones no es válido.", 503);
    }
    return value.map((value) => {
      const i = object(value);
      if (
        !uuidValido(i.id) || !uuidValido(i.reserva) ||
        !uuidValido(i.operacion_id) || typeof i.evento !== "string" ||
        i.evento.length > 100 ||
        ![null, "provisional", "autorizado"].includes(
          i.version_documento as string | null,
        ) ||
        !(i.fuente_documento === null ||
          typeof i.fuente_documento === "object") ||
        !(i.documento_path === null || typeof i.documento_path === "string") ||
        !(i.destinatario_snapshot === null ||
          typeof i.destinatario_snapshot === "string")
      ) throw new AppError("La intención persistida no es válida.", 503);
      return {
        id: i.id,
        reserva: i.reserva,
        operacion_id: i.operacion_id,
        evento: i.evento,
        version_documento: i.version_documento,
        fuente_documento: i.fuente_documento,
        destinatario_snapshot: i.destinatario_snapshot,
        documento_path: i.documento_path,
      } as IntencionCorreo;
    });
  }
  async confirmarDocumento(id: string, reserva: string, path: string) {
    await this.llamar("confirmar_documento_intencion", {
      p_id: id,
      p_reserva: reserva,
      p_path: path,
    });
  }
  async encolar(id: string, reserva: string) {
    await this.llamar("encolar_intencion_correo", {
      p_id: id,
      p_reserva: reserva,
    });
  }
  async registrarFallo(id: string, reserva: string, codigo: string) {
    await this.llamar("registrar_fallo_intencion", {
      p_id: id,
      p_reserva: reserva,
      p_codigo: codigo,
    });
  }
}

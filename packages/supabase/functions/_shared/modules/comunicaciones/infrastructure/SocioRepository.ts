import type { SupabaseClient } from "@supabase/supabase-js";
import type { SolicitudCorreo } from "../domain/email_domain.ts";
import { AppError } from "@core/errors.ts";

export class SocioRepository {
  constructor(private db: SupabaseClient) {}

  async encolar(solicitud: SolicitudCorreo) {
    // El JWT humano llega a la RPC SECURITY DEFINER, que verifica de nuevo el perfil activo.
    const { data: id, error } = await this.db.rpc("crear_comunicacion", {
      p_solicitud: solicitud,
    });
    if (error) {
      if (error.code === "P0001" || error.code === "22P02") {
        throw new AppError(error.message, 400);
      }
      throw new AppError(
        "No se pudo guardar el envío. Reintente conservando la misma solicitud.",
        503,
      );
    }
    const { data, error: detalleError } = await this.db.from(
      "email_destinatarios",
    )
      .select("estado_envio").eq("email_log_id", id);
    if (detalleError || !data) {
      throw new AppError(
        "Envío guardado; no se pudo consultar su estado. Reintente con la misma solicitud.",
        503,
      );
    }
    return {
      id: String(id),
      estado: "procesando" as const,
      encolados: data.filter((x) => x.estado_envio !== "excluido").length,
      excluidos: data.filter((x) => x.estado_envio === "excluido").length,
    };
  }
}

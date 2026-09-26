import { SupabaseClient } from "@supabase/supabase-js";
import { SocioDestinatario } from "../domain/email_domain.ts";

export class SocioRepository {
  constructor(private db: SupabaseClient) {}

  /**
   * Destinatarios válidos para un envío (CU-07.2):
   * - Regla 3: `email_invalido = false` es exclusión DURA: ni el checkbox de
   *   alerta de deuda la levanta (un rebote duro = dirección inexistente).
   * - Regla 1: `acepta_comunicaciones = true` es el filtro por defecto; solo
   *   se levanta con `incluirDesuscriptos = true` (checkbox de CU-07.2).
   * - Solo socios activos reciben envíos masivos.
   */
  async obtenerSociosActivos(
    ids: string[],
    incluirDesuscriptos = false,
  ): Promise<SocioDestinatario[]> {
    let query = this.db
      .from("socios")
      .select("id, email, nombre")
      .in("id", ids)
      .eq("estado", "activo")
      .eq("email_invalido", false);

    if (!incluirDesuscriptos) {
      query = query.eq("acepta_comunicaciones", true);
    }

    const { data, error } = await query;
    if (error) throw new Error("Error consultando socios en la base de datos.");
    return data || [];
  }
}

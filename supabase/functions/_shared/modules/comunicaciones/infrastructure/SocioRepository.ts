import { SupabaseClient } from "@supabase/supabase-js";
import { SocioDestinatario } from "../domain/email_domain.ts";

export class SocioRepository {
  constructor(private db: SupabaseClient) {}

  async obtenerSociosActivos(ids: string[]): Promise<SocioDestinatario[]> {
    const { data, error } = await this.db
      .from("socios")
      .select("id, email, nombre")
      .in("id", ids)
      .eq("estado", "activo")
      .eq("acepta_comunicaciones", true)
      .eq("email_invalido", false);

    if (error) throw new Error("Error consultando socios en la base de datos.");
    return data || [];
  }
}
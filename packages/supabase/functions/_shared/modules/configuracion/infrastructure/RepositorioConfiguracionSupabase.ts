import type { SupabaseClient } from "@supabase/supabase-js";
import type { RepositorioConfiguracion } from "../application/ConfiguracionService.ts";
import {
  CLUB_ID,
  ConfiguracionError,
  type ParejaCifrada,
} from "../domain/credenciales.ts";

export class RepositorioConfiguracionSupabase
  implements RepositorioConfiguracion {
  constructor(private technical: SupabaseClient) {}
  async leer(): Promise<ParejaCifrada | null> {
    const { data, error } = await this.technical.from("club").select(
      "certificado_arca,certificado_key,certificado_vencimiento",
    ).eq("id", CLUB_ID).single();
    if (error) {
      throw new ConfiguracionError(
        "No se pudo consultar la configuración fiscal.",
        503,
      );
    }
    if (
      !data.certificado_arca && !data.certificado_key &&
      !data.certificado_vencimiento
    ) return null;
    if (
      typeof data.certificado_arca !== "string" ||
      typeof data.certificado_key !== "string" ||
      typeof data.certificado_vencimiento !== "string"
    ) {
      throw new ConfiguracionError(
        "La pareja fiscal guardada está incompleta. Requiere revisión técnica.",
        409,
      );
    }
    return {
      certificado_arca: data.certificado_arca,
      certificado_key: data.certificado_key,
      certificado_vencimiento: data.certificado_vencimiento,
    };
  }
  async reemplazar(pareja: ParejaCifrada): Promise<void> {
    // Una sola sentencia UPDATE: pareja y vencimiento se confirman o revierten juntos.
    const { data, error } = await this.technical.from("club").update(pareja).eq(
      "id",
      CLUB_ID,
    ).select("id").single();
    if (error || data?.id !== CLUB_ID) {
      throw new ConfiguracionError(
        "No se pudo guardar la pareja fiscal. Se conserva el material anterior.",
        503,
      );
    }
  }
}

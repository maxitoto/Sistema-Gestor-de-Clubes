// Encapsula la consulta y la RPC

import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@core/index.ts";
import type { ComprobanteReapertura } from "../domain/reapertura.ts";
import type { RepositorioFiscal } from "../application/RepositorioFiscal.ts";

export class RepositorioFiscalSupabase implements RepositorioFiscal {
  constructor(private db: SupabaseClient) {}

  async buscarParaReapertura(
    comprobanteId: string,
  ): Promise<ComprobanteReapertura | null> {
    const { data, error } = await this.db
      .from("comprobantes")
      .select("id, estado_fiscal, numero_solicitado")
      .eq("id", comprobanteId)
      .maybeSingle<ComprobanteReapertura>();

    if (error) {
      console.error("Error al consultar comprobante fiscal", error.code);
      throw new AppError(
        "No se pudo consultar el comprobante. Reintente.",
        503,
      );
    }

    return data;
  }

  async reabrir(comprobanteId: string): Promise<void> {
    const { error } = await this.db.rpc("reabrir_regularizacion_fiscal", {
      p_comprobante_id: comprobanteId,
    });

    if (!error) return;

    if (error.code === "P0001") {
      throw new AppError(error.message, 409);
    }

    console.error("Error al reabrir regularización fiscal", error.code);
    throw new AppError(
      "No se pudo reabrir la regularización fiscal. Reintente.",
      503,
    );
  }
}
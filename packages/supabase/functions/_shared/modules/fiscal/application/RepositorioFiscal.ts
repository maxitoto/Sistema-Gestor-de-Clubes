// declara las operaciones de persistencia que necesita el caso de uso. Permite probar la coordinación sin conectarse a Supabase
import type { ComprobanteReapertura } from "../domain/reapertura.ts";

export interface RepositorioFiscal {
  buscarParaReapertura(
    comprobanteId: string,
  ): Promise<ComprobanteReapertura | null>;

  reabrir(comprobanteId: string): Promise<void>;
}
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  leerCredencialesTecnicas,
  RepositorioConfiguracionSupabase,
} from "@modules/configuracion/index.ts";
import {
  exigirArcaExterno,
  leerConfiguracionArca,
} from "./configuracion-arca.ts";
import { WsaaClient } from "./arca/WsaaClient.ts";
import { WsfeClient } from "./arca/WsfeClient.ts";
import { CacheTicketWsaaSupabase } from "./arca/CacheTicketWsaaSupabase.ts";
/** Sólo compone después de comprobar gate; leer credenciales ocurre dentro de WSAA. */
export function crearPuertoArca(
  db: SupabaseClient,
  env: { get(name: string): string | undefined },
) {
  const config = leerConfiguracionArca(env);
  exigirArcaExterno(config);
  const master = env.get("FISCAL_MASTER_KEY") ?? "";
  return new WsfeClient(
    config,
    new WsaaClient(
      config,
      () =>
        leerCredencialesTecnicas(
          new RepositorioConfiguracionSupabase(db),
          master,
        ),
      new CacheTicketWsaaSupabase(db),
      master,
    ),
  );
}
export function arcaExternoHabilitado(
  env: { get(name: string): string | undefined },
) {
  try {
    return leerConfiguracionArca(env).habilitado;
  } catch {
    return false;
  }
}

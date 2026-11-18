import { createServiceClient } from "@core/index.ts";
import {
  crearPuertoArca,
  ProcesarPendientesFiscalesUseCase,
  RegularizarComprobanteUseCase,
  RepositorioRegularizacionFiscalSupabase,
} from "@modules/fiscal/index.ts";
import { crearAppFiscalWorker, validarSecretoFiscal } from "./app.ts";
const secreto = validarSecretoFiscal(Deno.env);
const app = crearAppFiscalWorker({
  secreto,
  procesar: async () => {
    const db = createServiceClient(),
      repo = new RepositorioRegularizacionFiscalSupabase(db);
    return await new ProcesarPendientesFiscalesUseCase(
      repo,
      (id) =>
        new RegularizarComprobanteUseCase(repo, crearPuertoArca(db, Deno.env))
          .ejecutar(id, "automatico"),
    ).ejecutar();
  },
});
Deno.serve(app.fetch);

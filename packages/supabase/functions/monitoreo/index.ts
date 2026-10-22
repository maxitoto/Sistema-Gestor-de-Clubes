// functions/monitoreo/index.ts

// Compone la fábrica técnica, el repositorio y el caso de uso. La autorización real sigue siendo requireRol(admin). Sólo este archivo llama a Deno.serve; crear el repositorio no consulta la base.

import { createServiceClient, requireRol } from "@core/index.ts";
import {
  ReabrirRegularizacionUseCase,
  RepositorioFiscalSupabase,
} from "@modules/fiscal/index.ts";
import { crearAppMonitoreo } from "./app.ts";

const repositorio = new RepositorioFiscalSupabase(createServiceClient());
const reabrir = new ReabrirRegularizacionUseCase(repositorio);

const app = crearAppMonitoreo({
  autorizar: async (c) => {
    await requireRol(c, ["admin"]);
  },
  reabrir,
});

Deno.serve(app.fetch);
// functions/comunicaciones/index.ts
import { Hono } from "jsr:@hono/hono@^4";
import { cors } from "jsr:@hono/hono@^4/cors";
import { createEdgeClient } from "@core/supabase.ts";
import { SocioRepository } from "@modules/comunicaciones/infrastructure/SocioRepository.ts";
import { EnviarAvisoUseCase } from "@modules/comunicaciones/application/EnviarAvisoUseCase.ts";

// Le indicas el prefijo una sola vez; el resto de tus endpoints son relativos
const app = new Hono().basePath("/comunicaciones");

app.use("*", cors());

app.post("/enviar-aviso", async (c) => {
  const { asunto, cuerpo, sociosIds } = await c.req.json();
  const supabase = createEdgeClient(c.req.raw);

  const repo = new SocioRepository(supabase);
  const useCase = new EnviarAvisoUseCase(repo);
  const result = await useCase.execute(asunto, cuerpo, sociosIds);

  return c.json(result);
});

app.get("/plantillas", (c) => {
  return c.json({ templates: [] });
});

Deno.serve(app.fetch);
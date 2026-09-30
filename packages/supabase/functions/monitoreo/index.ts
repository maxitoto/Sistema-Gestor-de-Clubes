// functions/monitoreo/index.ts
import { createClient } from "@supabase/supabase-js";
import { Hono } from "jsr:@hono/hono@^4";
import { cors } from "jsr:@hono/hono@^4/cors";
import { requireRol } from "@core/auth.ts";
import { errorResponse, jsonResponse } from "@core/cors.ts";
import { AppError } from "@core/errors.ts";

const app = new Hono().basePath("/monitoreo");
app.use("*", cors());

app.onError((err, _c) => {
  const status = err instanceof AppError ? err.statusCode : 500;
  return errorResponse(err.message, status);
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// CU-05.7 paso 5 — Reapertura de regularización fiscal (solo Admin)
app.post("/reabrir", async (c) => {
  await requireRol(c, ["admin"]);

  const { comprobanteId } = await c.req.json();
  if (!comprobanteId) return errorResponse("Falta comprobanteId", 400);

  const { data: comp } = await admin
    .from("comprobantes")
    .select("id, estado_fiscal, numero_solicitado")
    .eq("id", comprobanteId)
    .single();
  if (!comp) return errorResponse("El comprobante no existe", 404);
  if (comp.estado_fiscal !== "fallido") {
    return errorResponse("El comprobante no esta en estado fallido", 409);
  }

  // Integracion pendiente: nunca reabrir un intento previo sin conciliarlo.
  if (comp.numero_solicitado !== null) {
    return errorResponse(
      "Reapertura no disponible: falta conciliar el intento fiscal anterior. " +
        "No se modifico el comprobante.",
      501,
    );
  }

  const { error } = await admin.rpc("reabrir_regularizacion_fiscal", {
    p_comprobante_id: comp.id,
  });

  if (error) {
    return errorResponse(error.message, 409);
  }

  return jsonResponse({ reabierto: true });
});

// CU-05.7 paso 4 — Reintento manual: pendiente del cliente SOAP real
app.post("/forzar", async (c) => {
  await requireRol(c, ["admin"]);
  return errorResponse(
    "Reintento manual no implementado: pendiente del cliente SOAP de ARCA (RF05/RF06)",
    501,
  );
});

Deno.serve(app.fetch);

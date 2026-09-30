import { requireRol } from "@core/auth.ts";
import { AppError } from "@core/errors.ts";
import { corsHeaders, errorResponse, jsonResponse } from "@core/cors.ts";

// I-26: respuesta honesta mientras se implementa el adaptador fiscal.
// No registra un cobro, no simula una autorización y no expone secretos.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Método no permitido", 405);
  }
  try {
    await requireRol({ req: { raw: req } }, ["admin", "responsable"]);
    return jsonResponse({
      error: "La integración fiscal todavía no está implementada.",
      code: "ARCA_NOT_IMPLEMENTED",
    }, 501);
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    console.error("Error al verificar el acceso a ARCA");
    return errorResponse("No se pudo verificar el acceso. Reintente.", 503);
  }
});

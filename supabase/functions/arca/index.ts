import { createEdgeClient } from "@core/supabase.ts";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
} from "@core/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);

  try {
    const supabase = createEdgeClient(req);

    // hola mundo

    return jsonResponse({ message: "hola mundo" });

    return errorResponse("Ruta no encontrada", 404);
  } catch (error) {
    console.error("Error en comunicaciones:", error);

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Error interno del servidor",
      500,
    );
  }
});
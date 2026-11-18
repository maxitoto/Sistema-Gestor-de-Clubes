import {
  AppError,
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requiredEnv,
  requireRol,
} from "@core/index.ts";
import {
  ConfiguracionError,
  ConfiguracionService,
  leerCamposFormularioFiscal,
  RepositorioConfiguracionSupabase,
} from "@modules/configuracion/index.ts";

async function leerFormulario(req: Request): Promise<FormData> {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data;")) {
    throw new ConfiguracionError("Se requieren los archivos CRT y KEY.", 415);
  }
  const max = 110_000;
  if (Number(req.headers.get("content-length")) > max) {
    throw new ConfiguracionError("Los archivos son demasiado grandes.", 413);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new ConfiguracionError("Faltan los archivos.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        throw new ConfiguracionError(
          "Los archivos son demasiado grandes.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return await new Response(body, {
      headers: { "content-type": req.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new ConfiguracionError("No se pudieron leer los archivos.");
  }
}
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
    });
  }
  try {
    await requireRol({ req: { raw: req } }, ["admin"]);
    const path = new URL(req.url).pathname.split("/configuracion").at(-1);
    if (path !== "/fiscal") {
      return errorResponse("Ruta de configuración no permitida.", 404);
    }
    // El cliente técnico se construye únicamente después de autorizar al Administrador activo.
    const service = new ConfiguracionService(
      new RepositorioConfiguracionSupabase(createServiceClient()),
      () => requiredEnv("FISCAL_MASTER_KEY"),
    );
    if (req.method === "GET") return jsonResponse(await service.estado());
    if (req.method === "POST") {
      const form = await leerFormulario(req);
      const campos = leerCamposFormularioFiscal(form);
      const result = await service.guardar(
        await campos.certificado.text(),
        await campos.clave.text(),
        campos.vencimiento,
        campos.entorno,
      );
      return jsonResponse(result);
    }
    return errorResponse("Método de configuración no permitido.", 405);
  } catch (error) {
    if (error instanceof ConfiguracionError || error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    return errorResponse("No se pudo completar la operación fiscal.", 503);
  }
}
Deno.serve(handleRequest);

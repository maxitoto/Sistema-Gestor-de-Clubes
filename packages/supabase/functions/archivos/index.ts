import {
  AppError,
  corsHeaders,
  createEdgeClient,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireRol,
} from "@core/index.ts";
import {
  ArchivoError,
  ArchivosService,
  identidadArchivo,
  LIMITE_EVIDENCIA,
  RepositorioArchivosSupabase,
  validarBytes,
} from "@modules/archivos/index.ts";

async function boundedBody(req: Request, max: number): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length")) > max) {
    throw new ArchivoError("Solicitud demasiado grande.", 413);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new ArchivoError("Falta el archivo o la solicitud.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new ArchivoError("Solicitud demasiado grande.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}
async function smallJson(req: Request) {
  if (req.headers.get("content-type")?.split(";")[0] !== "application/json") {
    throw new ArchivoError("Se requiere JSON.", 415);
  }
  try {
    const value = JSON.parse(
      new TextDecoder().decode(await boundedBody(req, 4096)),
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error();
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ArchivoError) throw error;
    throw new ArchivoError("Solicitud inválida.");
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
    const actor = await requireRol({ req: { raw: req } }, [
      "admin",
      "responsable",
    ]);
    const service = new ArchivosService(
      new RepositorioArchivosSupabase(
        createEdgeClient(req),
        createServiceClient(),
        actor.id,
      ),
      validarBytes,
    );
    const url = new URL(req.url),
      path = url.pathname.split("/archivos").at(-1) ?? "";
    if (path === "/leer" && req.method === "GET") {
      if (
        [...url.searchParams.keys()].some((key) =>
          !["tipo", "entidadId"].includes(key)
        )
      ) throw new ArchivoError("Parámetro no permitido.");
      return jsonResponse(
        await service.leer(
          identidadArchivo(
            url.searchParams.get("tipo"),
            url.searchParams.get("entidadId"),
          ),
        ),
      );
    }
    if (path === "/subir" && req.method === "POST") {
      if (
        !req.headers.get("content-type")?.startsWith("multipart/form-data;")
      ) throw new ArchivoError("Se requiere un archivo.", 415);
      const body = await boundedBody(req, LIMITE_EVIDENCIA + 65536);
      let form: FormData;
      try {
        form = await new Response(body, {
          headers: { "Content-Type": req.headers.get("content-type") ?? "" },
        }).formData();
      } catch {
        throw new ArchivoError("El formulario de archivo no es válido.");
      }
      if (
        [...form.keys()].length !== 3 ||
        ["tipo", "entidadId", "archivo"].some((key) =>
          form.getAll(key).length !== 1
        )
      ) throw new ArchivoError("Campos de archivo inválidos.");
      const identidad = identidadArchivo(
        form.get("tipo"),
        form.get("entidadId"),
      );
      const file = form.get("archivo");
      if (!(file instanceof File)) throw new ArchivoError("Falta el archivo.");
      return jsonResponse(
        await service.subir(
          identidad,
          new Uint8Array(await file.arrayBuffer()),
          file.type,
        ),
        201,
      );
    }
    if (["/asociar", "/descartar"].includes(path) && req.method === "POST") {
      const value = await smallJson(req);
      if (
        Object.keys(value).sort().join(",") !== "entidadId,storagePath,tipo"
      ) throw new ArchivoError("Campos de archivo inválidos.");
      const identidad = identidadArchivo(value.tipo, value.entidadId);
      if (path === "/asociar") {
        return jsonResponse(
          await service.asociar(identidad, value.storagePath),
        );
      }
      await service.descartar(identidad, value.storagePath);
      return jsonResponse({ descartado: true });
    }
    return errorResponse("Ruta o método de archivos no permitido.", 404);
  } catch (error) {
    if (error instanceof ArchivoError || error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    return errorResponse("No se pudo completar la operación de archivos.", 503);
  }
}
Deno.serve(handleRequest);

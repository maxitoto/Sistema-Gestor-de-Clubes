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
  RepositorioUsuariosSupabase,
  UsuarioError,
  UsuariosService,
  uuid,
  validarSolicitud,
} from "@modules/usuarios/index.ts";
async function jsonPequeno(req: Request) {
  if (req.headers.get("content-type")?.split(";")[0] !== "application/json") {
    throw new UsuarioError("Se requiere JSON.", 415);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new UsuarioError("Falta la solicitud.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        throw new UsuarioError("Solicitud demasiado grande.", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new UsuarioError("Solicitud inválida.");
  }
}
export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
    });
  }
  try {
    const actor = await requireRol({ req: { raw: req } }, ["admin"]);
    const service = new UsuariosService(
      new RepositorioUsuariosSupabase(
        createEdgeClient(req),
        createServiceClient(),
        actor.id,
      ),
    );
    const url = new URL(req.url),
      path = url.pathname.split("/usuarios").at(-1) ?? "";
    if (req.method === "POST" && ["", "/"].includes(path)) {
      return jsonResponse(
        await service.ejecutar(validarSolicitud(await jsonPequeno(req))),
      );
    }
    if (req.method === "GET" && ["/operacion", "/estado"].includes(path)) {
      const key = path === "/operacion" ? "operacionId" : "usuarioId";
      if (
        [...url.searchParams.keys()].join(",") !== key ||
        url.searchParams.getAll(key).length !== 1
      ) throw new UsuarioError("Filtro no permitido.");
      const id = uuid(url.searchParams.get(key));
      return jsonResponse(
        path === "/operacion"
          ? await service.leer(id)
          : await service.estado(id),
      );
    }
    return errorResponse("Ruta o método no permitido.", 404);
  } catch (error) {
    if (error instanceof UsuarioError || error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    return errorResponse(
      "No se pudo confirmar la gestión. Consultá el estado antes de reintentar.",
      503,
    );
  }
}
Deno.serve(handleRequest);

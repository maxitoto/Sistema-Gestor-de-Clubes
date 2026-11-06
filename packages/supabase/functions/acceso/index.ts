import { corsHeaders, errorResponse, jsonResponse } from "@core/index.ts";
import { ejecutarAcceso, UsuarioError } from "@modules/usuarios/index.ts";
export async function handleRequest(
  req: Request,
) {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return errorResponse("Método no permitido.", 405);
  try {
    if (req.headers.get("content-type")?.split(";")[0] !== "application/json") {
      throw new UsuarioError("Se requiere JSON.", 415);
    }
    const reader = req.body?.getReader();
    if (!reader) throw new UsuarioError("Falta la solicitud.");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
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
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new UsuarioError("Solicitud inválida.");
    }
    const peer = req.headers.get("x-real-ip")?.trim() ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip")?.trim() ||
      "127.0.0.1";
    if (peer.length > 64 || !/^[a-fA-F0-9:.]+$/.test(peer)) {
      throw new UsuarioError("No se pudo verificar el origen de acceso.", 503);
    }
    return jsonResponse(await ejecutarAcceso(value, peer));
  } catch (error) {
    if (error instanceof UsuarioError) {
      return errorResponse(error.message, error.statusCode);
    }
    return errorResponse("No se pudo completar la solicitud de acceso.", 503);
  }
}
Deno.serve(handleRequest);

import { corsHeaders, errorResponse, jsonResponse } from "@core/index.ts";
import {
  CredencialError,
  ejecutarCredencial,
  validarCredencial,
} from "@modules/credenciales/index.ts";
export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    });
  }
  try {
    if (req.method !== "POST") {
      throw new CredencialError("Método no permitido.", 405);
    }
    if (req.headers.get("content-type")?.split(";")[0] !== "application/json") {
      throw new CredencialError("Se requiere JSON.", 415);
    }
    const peer = req.headers.get("x-real-ip")?.trim() ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip")?.trim() ||
      "127.0.0.1";
    if (peer.length > 64 || !/^[a-fA-F0-9:.]+$/.test(peer)) {
      throw new CredencialError(
        "No se pudo verificar el origen de acceso.",
        503,
      );
    }
    const reader = req.body?.getReader();
    if (!reader) throw new CredencialError("Falta la solicitud.");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          throw new CredencialError("Solicitud demasiado grande.", 413);
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
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new CredencialError("Solicitud inválida.");
    }
    const path = new URL(req.url).pathname.split("/credenciales/").at(-1) ?? "";
    const input = validarCredencial(path, body);
    return jsonResponse(await ejecutarCredencial(req, input, peer));
  } catch (error) {
    if (error instanceof CredencialError) {
      return errorResponse(error.message, error.statusCode);
    }
    return errorResponse(
      "No pudimos confirmar la operación. Intentá ingresar con la contraseña nueva antes de repetirla.",
      503,
    );
  }
}
Deno.serve(handleRequest);

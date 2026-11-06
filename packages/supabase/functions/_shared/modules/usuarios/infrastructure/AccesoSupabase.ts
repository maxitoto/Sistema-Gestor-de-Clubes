import { authLocal } from "./authLocal.ts";
import { createServiceClient } from "@core/index.ts";
import { emailNormalizado, UsuarioError } from "../domain/usuario.ts";
export const MENSAJE_RECUPERACION =
  "Si existe una cuenta habilitada, recibirá un enlace para restablecer la contraseña.";
async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function validarAcceso(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UsuarioError("Solicitud inválida.");
  }
  const b = value as Record<string, unknown>;
  if (b.operacion !== "login" && b.operacion !== "recuperar") {
    throw new UsuarioError("Operación no permitida.");
  }
  const keys = b.operacion === "login"
    ? ["operacion", "email", "password"]
    : ["operacion", "email"];
  if (
    Object.keys(b).length !== keys.length ||
    Object.keys(b).some((k) => !keys.includes(k))
  ) throw new UsuarioError("Campos no permitidos.");
  const email = emailNormalizado(b.email);
  if (
    b.operacion === "login" &&
    (typeof b.password !== "string" || b.password.length > 1024 || !b.password)
  ) throw new UsuarioError("Ingresá una contraseña válida.");
  return {
    operacion: b.operacion,
    email,
    password: typeof b.password === "string" ? b.password : "",
  };
}
export async function ejecutarAcceso(value: unknown, peer: string) {
  const body = validarAcceso(value), client = createServiceClient();
  const [ip, email] = await Promise.all([hash(peer), hash(body.email)]);
  const { data: permitido, error: limitError } = await client.rpc(
    "acceso_limitar",
    { p_tipo: body.operacion, p_ip_hash: ip, p_email_hash: email },
  );
  if (limitError) {
    console.error("acceso_limitar no disponible", { code: limitError.code });
    throw new UsuarioError(
      "No se pudo verificar el límite. Reintentá más tarde.",
      503,
    );
  }
  if (permitido !== true) {
    throw new UsuarioError(
      "Alcanzaste el límite de solicitudes. Esperá antes de volver a intentar.",
      429,
    );
  }
  if (body.operacion === "login") {
    const { data, error } = await authLocal().signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error || !data.session) {
      throw new UsuarioError("No se pudo iniciar sesión con esos datos.", 401);
    }
    return { session: data.session };
  }
  const { data: perfil, error } = await client.from("usuarios").select(
    "id,estado",
  ).eq("email", body.email).maybeSingle();
  if (error) {
    throw new UsuarioError(
      "No se pudo solicitar el enlace. Reintentá más tarde.",
      503,
    );
  }
  if (perfil?.estado === "activo") {
    const rawCallback = Deno.env.get("AUTH_REDIRECT_URL")?.trim() ||
      "http://localhost:5173/establecer-contrasena";
    let callback: URL;
    try {
      callback = new URL(rawCallback);
    } catch {
      throw new UsuarioError(
        "El callback de autenticación no está configurado.",
        503,
      );
    }
    if (
      !["http:", "https:"].includes(callback.protocol) ||
      callback.pathname !== "/establecer-contrasena"
    ) {
      throw new UsuarioError(
        "El callback de autenticación no está configurado.",
        503,
      );
    }
    // La respuesta se mantiene genérica incluso si el correo falla o el usuario no existe.
    await authLocal().resetPasswordForEmail(body.email, {
      redirectTo: callback.href,
    }).catch(() => undefined);
  }
  return { mensaje: MENSAJE_RECUPERACION };
}

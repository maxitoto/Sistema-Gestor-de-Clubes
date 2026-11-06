import { AuthClient } from "@supabase/supabase-js";
import {
  createEdgeClient,
  createServiceClient,
  requiredEnv,
} from "@core/index.ts";
import {
  CredencialError,
  type SolicitudCredencial,
} from "../domain/solicitud.ts";
function authInterno() {
  const url = Deno.env.get("ACCESO_AUTH_URL")?.trim() ||
    `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/auth/v1`;
  return new AuthClient({
    url,
    headers: { apikey: requiredEnv("SUPABASE_ANON_KEY") },
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
  });
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
async function exigirActivo(id: string) {
  const { data, error } = await createServiceClient().from("usuarios").select(
    "id,rol,estado",
  ).eq("id", id).maybeSingle();
  if (error) {
    throw new CredencialError(
      "No se pudo verificar la cuenta. Reintentá más tarde.",
      503,
    );
  }
  if (
    !data || data.estado !== "activo" ||
    !["admin", "responsable"].includes(data.rol)
  ) {
    throw new CredencialError(
      "La cuenta no está habilitada. Comunicate con el administrador.",
      403,
    );
  }
}
export async function ejecutarCredencial(
  req: Request,
  input: SolicitudCredencial,
  peer: string,
) {
  const auth = authInterno();
  let identity: string | null = null;
  try {
    if (input.tipo === "cambiar") {
      const { data, error } = await createEdgeClient(req).auth.getUser();
      if (error || !data.user?.id || !data.user.email) {
        throw new CredencialError("Volvé a iniciar sesión.", 401);
      }
      identity = data.user.id;
      await exigirActivo(identity);
      const { data: permitido, error: limitError } = await createServiceClient()
        .rpc("acceso_limitar", {
          p_tipo: "login",
          p_ip_hash: await hash(peer),
          p_email_hash: await hash(data.user.email.toLowerCase()),
        });
      if (limitError) {
        throw new CredencialError(
          "No se pudo comprobar el límite de acceso.",
          503,
        );
      }
      if (permitido !== true) {
        throw new CredencialError(
          "Alcanzaste el límite de solicitudes. Esperá antes de volver a intentar.",
          429,
        );
      }
      // Verificación real por Auth: el GoTrue instalado ignora current_password
      // en PUT /user; no se confía en ese parámetro ni en validación de interfaz.
      const verified = await auth.signInWithPassword({
        email: data.user.email,
        password: input.currentPassword,
      });
      if (
        verified.error || !verified.data.session ||
        verified.data.user?.id !== identity
      ) throw new CredencialError("La contraseña actual no es correcta.", 403);
    } else {
      const verified = await auth.verifyOtp({
        token_hash: input.token_hash,
        type: input.type,
      });
      if (verified.error || !verified.data.session || !verified.data.user?.id) {
        throw new CredencialError(
          "El enlace venció, ya fue utilizado o no es válido. Solicitá uno nuevo.",
          403,
        );
      }
      identity = verified.data.user.id;
    }
    await exigirActivo(identity);
    const { data, error } = await auth.updateUser({ password: input.password });
    if (error) {
      if (error.code === "same_password") {
        throw new CredencialError(
          "Elegí una contraseña diferente de la actual.",
          422,
        );
      }
      if (error.code === "weak_password") {
        throw new CredencialError(
          "La contraseña no cumple los requisitos de seguridad.",
          422,
        );
      }
      throw new CredencialError(
        "No pudimos confirmar el cambio. Intentá ingresar con la contraseña nueva antes de repetirlo.",
        503,
      );
    }
    if (data.user?.id !== identity) {
      throw new CredencialError(
        "No pudimos verificar el cambio. Intentá ingresar con la contraseña nueva.",
        503,
      );
    }
    return { actualizado: true };
  } finally {
    // Las sesiones de verificación viven sólo en memoria del servidor y nunca
    // se devuelven al navegador. Se revoca el refresh de esta sesión efímera.
    await auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}

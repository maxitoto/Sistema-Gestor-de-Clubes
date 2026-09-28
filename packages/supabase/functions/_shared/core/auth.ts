// functions/_shared/core/auth.ts
import { AppError, UnauthorizedError } from "./errors.ts";
import { createEdgeClient } from "./supabase.ts";

type Contexto = { req: { raw: Request } };

export async function requireRol(c: Contexto, roles: string[]) {
  const client = createEdgeClient(c.req.raw);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) {
    throw new UnauthorizedError("No autenticado");
  }
  const { data: perfil, error: perfilError } = await client
    .from("usuarios")
    .select("id, rol, estado")
    .eq("id", user.id)
    .maybeSingle();
  if (perfilError) {
    throw new AppError("No se pudo verificar el acceso. Reintente.", 503);
  }
  if (!perfil || perfil.estado !== "activo" || !roles.includes(perfil.rol)) {
    throw new AppError("Acceso denegado", 403);
  }
  return perfil;
}

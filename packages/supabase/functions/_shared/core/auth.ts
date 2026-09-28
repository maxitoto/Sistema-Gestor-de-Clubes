// functions/_shared/core/auth.ts
import { UnauthorizedError } from "./errors.ts";
import { createEdgeClient } from "./supabase.ts";

type Contexto = { req: { raw: Request } };

/** verify_jwt=true garantiza token válido; acá se mapea a perfil y se chequea rol. */
export async function requireRol(c: Contexto, roles: string[]) {
  const client = createEdgeClient(c.req.raw);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new UnauthorizedError("No autenticado", 401);
  const { data: perfil } = await client
    .from("usuarios").select("rol").eq("id", user.id).single();
  if (!perfil || !roles.includes(perfil.rol)) {
    throw new UnauthorizedError("Rol insuficiente", 403);
  }
  return perfil;
}

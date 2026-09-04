import { createClient } from "@supabase/supabase-js";

// Creamos un cliente que usa el token del usuario que hace la petición
export function createEdgeClient(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authHeader } },
    }
  );
}
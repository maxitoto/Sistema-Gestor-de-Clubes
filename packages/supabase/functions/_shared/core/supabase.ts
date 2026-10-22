import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "./env.ts";

// Creamos un cliente que usa el token del usuario que hace la petición
export function createEdgeClient(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false }
    },
  );
}

export function createServiceClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
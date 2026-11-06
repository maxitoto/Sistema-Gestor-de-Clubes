import { AuthClient } from "@supabase/supabase-js";
import { requiredEnv } from "@core/index.ts";
export function authLocal() {
  const url = Deno.env.get("ACCESO_AUTH_URL")?.trim() ||
    `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/auth/v1`;
  return new AuthClient({
    url,
    headers: {
      apikey: requiredEnv("SUPABASE_ANON_KEY"),
      Authorization: `Bearer ${requiredEnv("SUPABASE_ANON_KEY")}`,
    },
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  });
}

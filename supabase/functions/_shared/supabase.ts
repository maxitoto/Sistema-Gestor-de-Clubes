import { createClient } from 'jsr:@supabase/supabase-js@2';

// Función fábrica que ya inyecta el token del usuario que hace la petición
export const getSupabaseClient = (authHeader: string | null) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan credenciales de entorno de Supabase');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader ?? '' } },
  });
};
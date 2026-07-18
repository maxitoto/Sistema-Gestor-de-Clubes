import { createClient } from '@supabase/supabase-js'
import { type Database } from '#types/model'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan las variables de entorno de Supabase. Revisa tu archivo .env");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
// src/shared/utils/supabaseClient.ts

import { createClient } from '@supabase/supabase-js';
import type { Database } from '#shared/types/model';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Faltan las variables de entorno de Supabase. Revisa tu archivo .env');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

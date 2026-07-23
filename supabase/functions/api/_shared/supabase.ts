import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Context } from 'hono';

export const getSupabaseClient = (authHeader: string) => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: {
          Authorization: authHeader || '', 
        },
      },
    }
  );
};
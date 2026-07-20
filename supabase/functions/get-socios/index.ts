import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  console.log("--- Función get-socios iniciada ---");

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Variables de entorno no encontradas. ¿Estás pasando --env-file?");
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { 
      global: { headers: { Authorization: authHeader } } 
    });

    console.log("Cliente creado, consultando base de datos...");

    const { data, error } = await supabaseClient
      .from('socios')
      .select('id, dni, nombre, apellido, estado');

    if (error) {
        console.error("Error de Supabase:", error); // Esto saldrá en tu terminal
        throw error;
    }

    console.log("Consulta exitosa, enviando respuesta.");
    return new Response(JSON.stringify({ socios: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error("Error en Catch:", message); // Esto saldrá en tu terminal
    
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
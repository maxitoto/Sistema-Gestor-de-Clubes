import { createEdgeClient } from "@infrastructure/supabase.ts";
import { sendEmail } from "@infrastructure/mailer.ts";
import { extraerEmails, formatearCuerpoCorreo } from "@domine/email_domain.ts";

Deno.serve(async (req) => {
  // Manejo de CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createEdgeClient(req);
    
    // 1. Ahora recibimos la lista explícita de IDs desde React
    const { asunto, cuerpo, sociosIds } = await req.json();

    if (!sociosIds || sociosIds.length === 0) {
      throw new Error("Debes seleccionar al menos un socio.");
    }

    // 2. Buscamos SOLO a los socios que el admin eligió, 
    // pero validando que sigan activos y acepten correos (por seguridad)
    const { data: socios, error } = await supabase
      .from("socios")
      .select("id, email, nombre")
      .in("id", sociosIds)
      .eq("estado", "activo")
      .eq("acepta_comunicaciones", true)
      .eq("email_invalido", false);

    if (error) throw error;
    if (!socios || socios.length === 0) {
      throw new Error("Ninguno de los socios seleccionados es válido para recibir correos.");
    }

    // 3. Procesamiento puro (Dominio)
    const listaEmails = extraerEmails(socios);
    const htmlFinal = formatearCuerpoCorreo(cuerpo);

    // 4. Despachar correos (Infraestructura)
    await sendEmail(listaEmails, asunto, htmlFinal);

    return new Response(
      JSON.stringify({ success: true, enviados: listaEmails.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
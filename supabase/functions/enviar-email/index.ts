// Importamos NodeMailer usando el prefijo npm: (Deno lo soporta nativamente)
import nodemailer from "npm:nodemailer";

// Configuramos la conexión a nuestro Mailpit local
const transporter = nodemailer.createTransport({
  host: "host.docker.internal", // Se comunica con tu computadora desde el contenedor
  port: 54325,
  secure: false,
  ignoreTLS: true, 
});

// Cabeceras CORS estándar requeridas para llamar desde React
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // 1. Manejo del preflight de CORS (Navegador)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Extraemos los datos enviados desde React
    const { nombre, apellido, dni } = await req.json();

    // 3. Enviamos el correo electrónico
    const info = await transporter.sendMail({
      from: '"Club Los Andes" <admin@clublosandes.com>',
      to: "socio_nuevo@ejemplo.com", // En un entorno real, pedirías el email en el formulario
      subject: "¡Bienvenido al Club Los Andes!",
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>¡Hola ${nombre} ${apellido}!</h2>
          <p>Tu registro como socio en el Club Los Andes con DNI <b>${dni}</b> se ha procesado correctamente.</p>
          <p>¡Te esperamos en las instalaciones!</p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true, info }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
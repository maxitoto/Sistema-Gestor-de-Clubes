import { createApp } from '../_shared/server.ts';
import nodemailer from "npm:nodemailer";

const app = createApp('enviar-email');

const transporter = nodemailer.createTransport({
  host: "host.docker.internal",
  port: 54325,
  secure: false,
  ignoreTLS: true,
});

app.post('/', async (c) => {

  const { nombre, apellido, dni } = await c.req.json();

  if (!nombre || !apellido || !dni) {
    return c.json({ error: 'Faltan datos (nombre, apellido, dni)' }, 400);
  }

  const info = await transporter.sendMail({
    from: '"Club Los Andes" <admin@clublosandes.com>',
    to: "socio_nuevo@ejemplo.com", 
    subject: "¡Bienvenido al Club Los Andes!",
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>¡Hola ${nombre} ${apellido}!</h2>
        <p>Tu registro como socio en el Club Los Andes con DNI <b>${dni}</b> se ha procesado correctamente.</p>
        <p>¡Te esperamos en las instalaciones!</p>
      </div>
    `,
  });

  return c.json({ success: true, info }, 200);
});

export default app;
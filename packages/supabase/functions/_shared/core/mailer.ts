import nodemailer from "nodemailer";

export async function sendEmail(to: string[], subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: "host.docker.internal",
    port: 54325,                  
    secure: false,                
    ignoreTLS: true,              
  });

  try {
    const info = await transporter.sendMail({
      from: '"Club Los Andes" <notificaciones@clublosandes.com>',
      to: to.join(", "),          
      subject: subject,
      html: html,
    });
    
    console.log("¡Correo interceptado localmente! ID:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error al enviar al SMTP local:", error);
    throw new Error("Falló la conexión con Mailpit/Inbucket local.");
  }
}
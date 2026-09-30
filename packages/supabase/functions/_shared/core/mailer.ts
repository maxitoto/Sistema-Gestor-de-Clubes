import nodemailer from "nodemailer";
import { requiredEnv } from "./mail-admin.ts";

export type MensajeIndividual = {
  destinatarioId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};
export class EnvioFallido extends Error {
  constructor(public readonly incierto: boolean, message: string) {
    super(message);
  }
}

export function mailProvider(): "resend" | "mailpit" {
  const value = requiredEnv("MAIL_PROVIDER");
  if (value !== "resend" && value !== "mailpit") {
    throw new Error("MAIL_PROVIDER inválido.");
  }
  return value;
}

export function validarConfiguracionCorreo() {
  const provider = mailProvider();
  requiredEnv("MAIL_FROM");
  if (provider === "resend") requiredEnv("RESEND_API_KEY");
  else {
    requiredEnv("SMTP_HOST");
    requiredEnv("SMTP_PORT");
  }
  const base = new URL(requiredEnv("MAIL_PUBLIC_BASE_URL"));
  if (provider === "resend" && base.protocol !== "https:") {
    throw new Error("La URL pública de correo debe usar HTTPS.");
  }
  if (requiredEnv("MAIL_UNSUBSCRIBE_SECRET").length < 32) {
    throw new Error("Secreto de baja demasiado corto.");
  }
  return provider;
}

// Un mensaje tiene exactamente un destinatario. No se expone una lista en To/CC.
export async function sendEmail(message: MensajeIndividual): Promise<string> {
  const from = requiredEnv("MAIL_FROM");
  if (/[\r\n]/.test(message.to + message.subject + from)) {
    throw new EnvioFallido(false, "Cabecera inválida.");
  }
  if (mailProvider() === "resend") {
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `club/correo/${message.destinatarioId}`,
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
    } catch {
      throw new EnvioFallido(
        true,
        "No se pudo confirmar la aceptación por Resend.",
      );
    }
    if (!response.ok) {
      // Un 5xx, 408 o 409 puede ocultar una aceptación; no se reenvía a ciegas.
      throw new EnvioFallido(
        response.status >= 500 || [408, 409].includes(response.status),
        `Resend respondió HTTP ${response.status}.`,
      );
    }
    const result = await response.json().catch(() => null);
    if (!result || typeof result.id !== "string") {
      throw new EnvioFallido(
        true,
        "Resend no devolvió un identificador verificable.",
      );
    }
    return result.id;
  }
  const transport = nodemailer.createTransport({
    host: requiredEnv("SMTP_HOST"),
    port: Number(requiredEnv("SMTP_PORT")),
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    const result = await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: `<${message.destinatarioId}@correo.club.local>`,
    });
    if (!result.accepted?.length) {
      throw new EnvioFallido(false, "Mailpit rechazó el destinatario.");
    }
    return result.messageId;
  } catch (error) {
    if (error instanceof EnvioFallido) throw error;
    throw new EnvioFallido(
      true,
      "No se pudo confirmar la aceptación por Mailpit.",
    );
  } finally {
    transport.close();
  }
}

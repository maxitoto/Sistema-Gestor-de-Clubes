import nodemailer from "nodemailer";
import { Buffer } from "node:buffer";
import { requiredEnv } from "./env.ts";

export type AdjuntoPdf = {
  bytes: Uint8Array;
  nombre: string;
  tipo: "application/pdf";
};
export type MensajeIndividual = {
  destinatarioId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  adjuntos?: AdjuntoPdf[];
};
export class EnvioFallido extends Error {
  constructor(public readonly incierto: boolean, message: string) {
    super(message);
  }
}

/** Sólo bytes PDF internos; nunca una URL o ruta suministrada por el operador. */
export function validarAdjuntosPdf(
  adjuntos: AdjuntoPdf[] | undefined,
): AdjuntoPdf[] {
  if (adjuntos === undefined) return [];
  if (!Array.isArray(adjuntos) || adjuntos.length > 1) {
    throw new EnvioFallido(
      false,
      "Sólo se admite un comprobante PDF por mensaje.",
    );
  }
  for (const a of adjuntos) {
    if (
      !a || Object.keys(a).sort().join(",") !== "bytes,nombre,tipo" ||
      !(a.bytes instanceof Uint8Array) || a.tipo !== "application/pdf" ||
      typeof a.nombre !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}\.pdf$/.test(a.nombre) ||
      a.nombre.includes("..") || a.bytes.length < 100 ||
      a.bytes.length > 10485760 ||
      new TextDecoder().decode(a.bytes.subarray(0, 5)) !== "%PDF-"
    ) {
      throw new EnvioFallido(false, "El adjunto privado no es un PDF válido.");
    }
  }
  return adjuntos;
}
export function adjuntosResend(adjuntos: AdjuntoPdf[] | undefined) {
  return validarAdjuntosPdf(adjuntos).map((a) => ({
    filename: a.nombre,
    content: Buffer.from(a.bytes).toString("base64"),
  }));
}

export function mailProvider(): "resend" | "mailpit" {
  const value = requiredEnv("MAIL_PROVIDER");
  if (value !== "resend" && value !== "mailpit") {
    throw new Error("MAIL_PROVIDER inválido.");
  }
  return value;
}

export function validarUrlBajaOpcional(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("La URL pública de baja es inválida.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsed.hostname,
  );
  if (
    (parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && loopback)) ||
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    parsed.pathname !== "/desuscribir"
  ) {
    throw new Error(
      "La URL pública de baja debe usar HTTPS (o loopback local) y terminar en /desuscribir.",
    );
  }
  return parsed.toString();
}

export function urlBaseBajaCorreo(): string {
  const custom = validarUrlBajaOpcional(
    Deno.env.get("MAIL_UNSUBSCRIBE_BASE_URL"),
  );
  if (custom) return custom;
  return requiredEnv("MAIL_PUBLIC_BASE_URL").replace(/\/$/, "") +
    "/desuscribir";
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
  validarUrlBajaOpcional(Deno.env.get("MAIL_UNSUBSCRIBE_BASE_URL"));
  if (requiredEnv("MAIL_UNSUBSCRIBE_SECRET").length < 32) {
    throw new Error("Secreto de baja demasiado corto.");
  }
  return provider;
}

/** EDNS sólo puede ocurrir antes de abrir el canal SMTP; DATA/timeout siguen siendo inciertos. */
export function falloPrevioMailpit(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error &&
    error.code === "EDNS";
}
// Un mensaje tiene exactamente un destinatario. No se expone una lista en To/CC.
export async function sendEmail(message: MensajeIndividual): Promise<string> {
  const from = requiredEnv("MAIL_FROM");
  const adjuntos = validarAdjuntosPdf(message.adjuntos);
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
          ...(adjuntos.length ? { attachments: adjuntosResend(adjuntos) } : {}),
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
  let transport: ReturnType<typeof nodemailer.createTransport>;
  try {
    transport = nodemailer.createTransport({
      host: requiredEnv("SMTP_HOST"),
      port: Number(requiredEnv("SMTP_PORT")),
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
  } catch {
    throw new EnvioFallido(
      false,
      "No se pudo iniciar el transporte local de correo.",
    );
  }
  try {
    const result = await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: adjuntos.map((a) => ({
        filename: a.nombre,
        content: Buffer.from(a.bytes),
        contentType: a.tipo,
        contentDisposition: "attachment",
      })),
      disableFileAccess: true,
      disableUrlAccess: true,
      messageId: `<${message.destinatarioId}@correo.club.local>`,
    });
    if (!result.accepted?.length) {
      throw new EnvioFallido(false, "Mailpit rechazó el destinatario.");
    }
    if (typeof result.messageId !== "string" || !result.messageId) {
      throw new EnvioFallido(
        true,
        "Mailpit no devolvió una referencia verificable de aceptación.",
      );
    }
    return result.messageId;
  } catch (error) {
    if (error instanceof EnvioFallido) throw error;
    if (falloPrevioMailpit(error)) {
      throw new EnvioFallido(
        false,
        "No se pudo resolver el destino local de correo.",
      );
    }
    throw new EnvioFallido(
      true,
      "No se pudo confirmar la aceptación por Mailpit.",
    );
  } finally {
    try {
      transport.close();
    } catch { /* La limpieza no borra una aceptación ya confirmada. */ }
  }
}

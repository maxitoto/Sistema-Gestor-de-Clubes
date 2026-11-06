import { Buffer } from "node:buffer";
import {
  createPrivateKey,
  randomBytes,
  sign,
  verify,
  X509Certificate,
} from "node:crypto";

export class ConfiguracionError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}
export const CLUB_ID = "00000000-0000-0000-0000-000000000000";
export interface ParejaCifrada {
  certificado_arca: string;
  certificado_key: string;
  certificado_vencimiento: string;
}
export interface ParejaValidada {
  certificado: string;
  clave: string;
  vencimiento: string;
}
export interface EstadoFiscal {
  configurado: boolean;
  vencimiento: string | null;
  diasRestantes: number | null;
  alerta: "sin_cargar" | "vigente" | "por_vencer" | "vencido";
  entorno: "homologacion";
}
export function validarPareja(
  certificado: string,
  clave: string,
  vencimiento?: string,
  ahora = new Date(),
): ParejaValidada {
  if (
    certificado.length > 65_536 || clave.length > 32_768 ||
    (vencimiento !== undefined &&
      (typeof vencimiento !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)))
  ) {
    throw new ConfiguracionError(
      "Los archivos o la fecha de vencimiento no son válidos.",
    );
  }
  // Un único certificado y una única clave PEM no cifrada; nunca aceptar una cadena o datos concatenados.
  if (
    !/^\s*-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----\s*$/
      .test(certificado) ||
    !/^\s*-----BEGIN (RSA )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+-----END (RSA )?PRIVATE KEY-----\s*$/
      .test(clave)
  ) {
    throw new ConfiguracionError(
      "Se requiere un certificado CRT PEM y su clave RSA PEM sin contraseña.",
    );
  }
  try {
    const cert = new X509Certificate(certificado);
    const key = createPrivateKey(clave);
    if (
      key.asymmetricKeyType !== "rsa" ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
      cert.publicKey.asymmetricKeyType !== "rsa"
    ) {
      throw new ConfiguracionError(
        "La pareja debe utilizar RSA de al menos 2048 bits.",
      );
    }
    const challenge = randomBytes(32);
    if (
      !verify(
        "sha256",
        challenge,
        cert.publicKey,
        sign("sha256", challenge, key),
      )
    ) {
      throw new ConfiguracionError(
        "El certificado y la clave no corresponden a la misma pareja.",
      );
    }
    const desde = new Date(cert.validFrom), hasta = new Date(cert.validTo);
    if (
      !Number.isFinite(desde.getTime()) || !Number.isFinite(hasta.getTime()) ||
      desde > ahora || hasta <= ahora
    ) {
      throw new ConfiguracionError(
        "El certificado todavía no es válido o ya venció.",
      );
    }
    const vencimientoCertificado = hasta.toISOString().slice(0, 10);
    // La fuente es notAfter. La fecha legada, si viene, sólo se contrasta.
    if (vencimiento !== undefined && vencimientoCertificado !== vencimiento) {
      throw new ConfiguracionError(
        "El vencimiento ingresado no coincide con el certificado (fecha UTC).",
      );
    }
    return {
      certificado: certificado.trim() + "\n",
      clave: key.export({ type: "pkcs8", format: "pem" }).toString(),
      vencimiento: vencimientoCertificado,
    };
  } catch (error) {
    if (error instanceof ConfiguracionError) throw error;
    throw new ConfiguracionError(
      "No se pudo leer el certificado o su clave. Revise los archivos PEM.",
    );
  }
}
function bytesBase64(value: string): Uint8Array {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) throw new Error("base64");
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  if (Buffer.from(bytes).toString("base64") !== value) {
    throw new Error("base64");
  }
  return bytes;
}
export async function importarClaveMaestra(base64: string): Promise<CryptoKey> {
  try {
    const bytes = bytesBase64(base64);
    if (bytes.length !== 32) throw new Error("length");
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    throw new ConfiguracionError(
      "La custodia fiscal no está configurada. Contacte al administrador técnico.",
      503,
    );
  }
}
const aad = (clubId: string, campo: string) =>
  new TextEncoder().encode(JSON.stringify(["v1", clubId, campo]));
export async function cifrarCampo(
  plaintext: string,
  key: CryptoKey,
  clubId: string,
  campo: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(clubId, campo), tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `v1.${Buffer.from(iv).toString("base64")}.${
    Buffer.from(cifrado).toString("base64")
  }`;
}
export async function descifrarCampo(
  sobre: string,
  key: CryptoKey,
  clubId: string,
  campo: string,
): Promise<string> {
  try {
    const parts = sobre.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") throw new Error("version");
    const iv = bytesBase64(parts[1]), data = bytesBase64(parts[2]);
    if (iv.length !== 12 || data.length < 17) throw new Error("length");
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: aad(clubId, campo),
        tagLength: 128,
      },
      key,
      data,
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw new ConfiguracionError(
      "No se pudo abrir el material fiscal protegido.",
      503,
    );
  }
}
export function estadoFiscal(
  pareja: ParejaCifrada | null,
  ahora = new Date(),
): EstadoFiscal {
  if (!pareja) {
    return {
      configurado: false,
      vencimiento: null,
      diasRestantes: null,
      alerta: "sin_cargar",
      entorno: "homologacion",
    };
  }
  const diasRestantes = Math.ceil(
    (Date.parse(`${pareja.certificado_vencimiento}T00:00:00Z`) -
      Date.parse(`${ahora.toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000,
  );
  return {
    configurado: true,
    vencimiento: pareja.certificado_vencimiento,
    diasRestantes,
    alerta: diasRestantes < 0
      ? "vencido"
      : diasRestantes <= 30
      ? "por_vencer"
      : "vigente",
    entorno: "homologacion",
  };
}

// @deno-types="npm:@types/node-forge@1.3.14"
import forge from "node-forge";
import { Buffer } from "node:buffer";
import { X509Certificate } from "node:crypto";
import type { CacheTicketWsaa } from "../../application/CacheTicketWsaa.ts";
import {
  type ConfiguracionArca,
  exigirArcaExterno,
} from "../configuracion-arca.ts";
import { enviarSoap, type RedArca } from "./transporte.ts";
import {
  analizarXml,
  etiqueta,
  hijo,
  opcional,
  SOAP_NS,
  sobreSoap,
  texto,
  WSAA_NS,
} from "./xml.ts";
export interface CredencialArca {
  certificado: string;
  clave: string;
  vencimiento: string;
}
export interface TicketAcceso {
  token: string;
  sign: string;
  vencimiento: string;
  generacion: string;
}
export class ArcaAccesoError extends Error {
  constructor(
    public readonly codigo: string,
    message: string,
    public readonly reintentable = false,
  ) {
    super(message);
    this.name = "ArcaAccesoError";
  }
}
export interface DependenciasWsaa {
  red: RedArca;
  ahora: () => Date;
  uniqueId: () => number;
}
const enCurso = new Map<string, Promise<TicketAcceso>>();
function bytesBase64(value: string): Uint8Array<ArrayBuffer> {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) throw new Error("Base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("Base64");
  return new Uint8Array(bytes);
}
async function claveMaestra(value: string): Promise<CryptoKey> {
  const bytes = bytesBase64(value);
  if (bytes.length !== 32) {
    throw new ArcaAccesoError(
      "WSAA_CUSTODIA_NO_CONFIGURADA",
      "Falta la clave maestra de custodia del backend.",
    );
  }
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
const aad = (key: string) =>
  new TextEncoder().encode(JSON.stringify(["wsaa-ticket-v1", key]));
export async function cifrarTicketWsaa(
  ticket: TicketAcceso,
  key: string,
  master: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(key), tagLength: 128 },
    await claveMaestra(master),
    new TextEncoder().encode(JSON.stringify(ticket)),
  );
  return `v1.${Buffer.from(iv).toString("base64")}.${
    Buffer.from(data).toString("base64")
  }`;
}
const diagnosticosRespuestaWsaa = {
  WSAA_RESPUESTA_SOAP_INVALIDA:
    "La respuesta de WSAA no tiene una estructura SOAP válida. Revisar el transporte y el contrato del adaptador.",
  WSAA_RESPUESTA_HTTP_INVALIDA:
    "WSAA devolvió un estado HTTP no exitoso sin un rechazo SOAP interpretable. Revisar disponibilidad y diagnóstico técnico.",
  WSAA_RETORNO_INVALIDO:
    "WSAA no devolvió loginCmsReturn con la estructura y el namespace esperados. Revisar compatibilidad SOAP del adaptador.",
  WSAA_TA_XML_INVALIDO:
    "El contenido devuelto por WSAA no es un ticket de acceso XML válido. Revisar compatibilidad del adaptador.",
  WSAA_TA_CABECERA_INVALIDA:
    "El ticket WSAA no contiene una cabecera válida. Revisar compatibilidad del adaptador.",
  WSAA_TA_IDENTIFICADOR_INVALIDO:
    "El ticket WSAA no contiene un identificador entero sin signo de32bits válido. No se guardó el ticket; revisar el contrato del adaptador.",
  WSAA_TA_ORIGEN_NO_VERIFICABLE:
    "El origen del ticket WSAA no coincide con el servicio de homologación esperado. Revisar ambiente y contrato del adaptador.",
  WSAA_TA_DESTINO_NO_COINCIDE:
    "El destinatario del ticket WSAA no coincide con el certificado cargado. No se guardó el ticket; revisar identidad y pareja.",
  WSAA_TA_CREDENCIALES_INVALIDAS:
    "El ticket WSAA no contiene credenciales válidas. No se guardó el ticket; revisar compatibilidad del adaptador.",
  WSAA_TA_VIGENCIA_INVALIDA:
    "El ticket WSAA tiene fechas inválidas o fuera del margen admitido. Sincronizar el reloj del backend y revisar el contrato de vigencia.",
} as const;
type DiagnosticoRespuestaWsaa = keyof typeof diagnosticosRespuestaWsaa;
function errorRespuestaWsaa(etapa: DiagnosticoRespuestaWsaa): ArcaAccesoError {
  return new ArcaAccesoError(etapa, diagnosticosRespuestaWsaa[etapa]);
}
function interpretarRespuestaWsaa<T>(
  etapa: DiagnosticoRespuestaWsaa,
  interpretar: () => T,
): T {
  try {
    return interpretar();
  } catch (error) {
    if (error instanceof ArcaAccesoError) throw error;
    throw errorRespuestaWsaa(etapa);
  }
}
function validarTicket(value: unknown, now: Date): TicketAcceso {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errorRespuestaWsaa("WSAA_TA_CREDENCIALES_INVALIDAS");
  }
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !== "generacion,sign,token,vencimiento" ||
    typeof row.token !== "string" || typeof row.sign !== "string" ||
    row.token.length < 1 || row.sign.length < 1 || row.token.length > 16384 ||
    row.sign.length > 16384 ||
    (/\s/.test(row.token + row.sign) ||
      Array.from(row.token + row.sign).some((char) =>
        char.charCodeAt(0) < 32
      )) ||
    typeof row.vencimiento !== "string" || typeof row.generacion !== "string"
  ) throw errorRespuestaWsaa("WSAA_TA_CREDENCIALES_INVALIDAS");
  const exp = Date.parse(row.vencimiento),
    gen = Date.parse(row.generacion),
    time = now.getTime();
  if (
    !Number.isFinite(exp) || !Number.isFinite(gen) || exp <= time + 60_000 ||
    gen > time + 60_000 || exp <= gen || exp > time + 24 * 60 * 60_000
  ) throw errorRespuestaWsaa("WSAA_TA_VIGENCIA_INVALIDA");
  return {
    token: row.token,
    sign: row.sign,
    vencimiento: new Date(exp).toISOString(),
    generacion: new Date(gen).toISOString(),
  };
}
export async function descifrarTicketWsaa(
  sobre: string,
  key: string,
  master: string,
  now: Date,
): Promise<TicketAcceso> {
  try {
    if (sobre.length > 65536) throw new Error("size");
    const parts = sobre.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") throw new Error("version");
    const iv = bytesBase64(parts[1]), data = bytesBase64(parts[2]);
    if (iv.length !== 12 || data.length < 17) throw new Error("envelope");
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad(key), tagLength: 128 },
      await claveMaestra(master),
      data,
    );
    return validarTicket(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)),
      now,
    );
  } catch {
    throw new ArcaAccesoError(
      "WSAA_CACHE_NO_VERIFICABLE",
      "No se pudo verificar el ticket fiscal protegido; requiere revisión técnica.",
    );
  }
}
export function crearTraWsaa(now: Date, id: number): string {
  if (
    !Number.isSafeInteger(id) || id < 0 || id > 0xffffffff ||
    !Number.isFinite(now.getTime())
  ) {
    throw new ArcaAccesoError(
      "WSAA_RELOJ_INVALIDO",
      "No se pudo preparar un reloj e identidad de autenticación válidos.",
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>${
    etiqueta("uniqueId", id)
  }${
    etiqueta("generationTime", new Date(now.getTime() - 60_000).toISOString())
  }${
    etiqueta(
      "expirationTime",
      new Date(now.getTime() + 10 * 60_000).toISOString(),
    )
  }</header><service>wsfe</service></loginTicketRequest>`;
}
export function firmarTraWsaa(
  xml: string,
  credencial: CredencialArca,
  now: Date,
): string {
  try {
    const certificate = forge.pki.certificateFromPem(credencial.certificado),
      key = forge.pki.privateKeyFromPem(credencial.clave);
    const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
    if (
      !publicKey.n || !publicKey.e || !publicKey.n.equals(key.n) ||
      !publicKey.e.equals(key.e) || publicKey.n.bitLength() < 2048 ||
      certificate.validity.notBefore > now ||
      certificate.validity.notAfter <= now
    ) throw new Error("certificate");
    const signed = forge.pkcs7.createSignedData();
    signed.content = forge.util.createBuffer(xml, "utf8");
    signed.addCertificate(certificate);
    // WSAA1.2.2 especifica CMS attached SignedData SHA1+RSA. No se usa para otros fines.
    signed.addSigner({
      key,
      certificate,
      digestAlgorithm: forge.pki.oids.sha1,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: now.toISOString() },
      ],
    });
    signed.sign();
    return forge.util.encode64(forge.asn1.toDer(signed.toAsn1()).getBytes());
  } catch {
    throw new ArcaAccesoError(
      "WSAA_CERTIFICADO_INVALIDO",
      "No se pudo firmar el TRA con una pareja RSA vigente y correspondiente.",
    );
  }
}
function destinatarioCoincide(dn: string, certificado: string): boolean {
  try {
    if (dn.length > 4096) return false;
    const fragments: string[] = [];
    let current = "", escaped = false, quoted = false;
    for (const character of dn) {
      if (escaped) {
        current += "\\" + character;
        escaped = false;
      } else if (character === "\\") escaped = true;
      else if (character === '"') quoted = !quoted;
      else if ((character === "," || character === "+") && !quoted) {
        fragments.push(current);
        current = "";
      } else current += character;
    }
    if (escaped || quoted) return false;
    fragments.push(current);
    const aliases: Record<string, string> = {
      cn: "2.5.4.3",
      c: "2.5.4.6",
      o: "2.5.4.10",
      ou: "2.5.4.11",
      serialnumber: "2.5.4.5",
      st: "2.5.4.8",
      l: "2.5.4.7",
      emailaddress: "1.2.840.113549.1.9.1",
    };
    const received = fragments.map((fragment) => {
      const equals = fragment.indexOf("=");
      if (equals < 1) throw new Error();
      const raw = fragment.slice(0, equals).trim().toLowerCase();
      const type = aliases[raw] ?? raw.replace(/^oid\./, "");
      const value = fragment.slice(equals + 1).trim().replace(
        /(?:\\[0-9a-f]{2})+/gi,
        (part) =>
          Buffer.from(part.replaceAll("\\", ""), "hex").toString("utf8"),
      ).replace(/\\(.)/g, "$1");
      return type + "=" + value.trim().toLowerCase();
    }).sort();
    const expected = forge.pki.certificateFromPem(certificado).subject
      .attributes.map((attribute) =>
        attribute.type + "=" + String(attribute.value).trim().toLowerCase()
      ).sort();
    return JSON.stringify(received) === JSON.stringify(expected);
  } catch {
    return false;
  }
}
function faultWsaa(xml: string): ArcaAccesoError {
  let code = "";
  try {
    const root = analizarXml(xml);
    if (root.nombre !== "Envelope" || root.espacio !== SOAP_NS) {
      throw new Error();
    }
    const fault = hijo(hijo(root, "Body", SOAP_NS), "Fault", SOAP_NS);
    const node = opcional(fault, "faultcode", "") ??
      opcional(fault, "faultcode", SOAP_NS);
    // Sólo QName acotado y códigos exactos del manual WSAA1.2.2. No leer
    // faultstring ni devolver texto remoto, DN, CUIT, token o firma.
    const raw = node?.texto ?? "";
    if (raw.length <= 128) {
      code =
        raw.match(/^(?:[A-Za-z_][A-Za-z0-9_.-]*:)?([A-Za-z0-9_.]+)$/)?.[1] ??
          "";
    }
  } catch { /* No revelar el SOAP recibido. */ }
  const conocidos: Record<string, [string, string, boolean?]> = {
    "coe.notAuthorized": [
      "WSAA_NO_AUTORIZADO",
      "Asociar el certificado de homologación al servicio wsfe y a la CUIT representada.",
    ],
    "coe.alreadyAuthenticated": [
      "WSAA_TICKET_EXISTENTE",
      "ARCA informa un ticket vigente no recuperado. Revisar la cache compartida antes de solicitar otro.",
    ],
    "cms.bad": [
      "WSAA_CMS_INVALIDO",
      "WSAA rechazó el formato del CMS firmado. Revisar la construcción del CMS del backend.",
    ],
    "cms.bad.base64": [
      "WSAA_CMS_BASE64_INVALIDO",
      "WSAA rechazó la codificación Base64 del CMS. Revisar la serialización del backend.",
    ],
    "cms.cert.notFound": [
      "WSAA_CERTIFICADO_AUSENTE_EN_CMS",
      "WSAA no encontró el certificado en el CMS. Revisar que la firma incluya el certificado correspondiente.",
    ],
    "cms.sign.invalid": [
      "WSAA_FIRMA_INVALIDA",
      "WSAA rechazó la firma del CMS. Revisar la pareja y la construcción de la firma del backend.",
    ],
    "cms.cert.expired": [
      "WSAA_CERTIFICADO_VENCIDO",
      "Renovar y cargar el certificado de homologación vencido.",
    ],
    "cms.cert.invalid": [
      "WSAA_CERTIFICADO_AUN_NO_VIGENTE",
      "WSAA informa que el certificado todavía no está vigente. Revisar notBefore y sincronizar el reloj del backend.",
    ],
    "cms.cert.untrusted": [
      "WSAA_CERTIFICADO_NO_CONFIABLE",
      "WSAA no confía en el certificado recibido. Revisar que sea el certificado emitido por WSASS para homologación y su cadena.",
    ],
    "xml.bad": [
      "WSAA_TRA_INVALIDO",
      "WSAA rechazó el XML del TRA. Revisar su estructura y codificación en el backend.",
    ],
    "xml.source.invalid": [
      "WSAA_TRA_ORIGEN_INVALIDO",
      "WSAA rechazó el origen del TRA. Revisar la identidad declarada y su correspondencia con el certificado.",
    ],
    "xml.destination.invalid": [
      "WSAA_TRA_DESTINO_INVALIDO",
      "WSAA rechazó el destino del TRA. Revisar la configuración de homologación y el contrato del backend.",
    ],
    "xml.version.notSupported": [
      "WSAA_TRA_VERSION_NO_SOPORTADA",
      "WSAA no admite la versión del TRA enviado. Revisar el contrato del backend.",
    ],
    "xml.generationTime.invalid": [
      "WSAA_RELOJ_INVALIDO",
      "WSAA rechazó la fecha de generación del TRA. Sincronizar el reloj del backend antes de volver a autenticar.",
    ],
    "xml.expirationTime.expired": [
      "WSAA_RELOJ_INVALIDO",
      "WSAA recibió un TRA vencido. Sincronizar el reloj del backend y revisar el intervalo del TRA.",
    ],
    "xml.expirationTime.invalid": [
      "WSAA_RELOJ_INVALIDO",
      "WSAA rechazó el vencimiento del TRA. Sincronizar el reloj del backend y revisar el intervalo del TRA.",
    ],
    "wsn.notFound": [
      "WSAA_SERVICIO_NO_ENCONTRADO",
      "WSAA no encontró el servicio solicitado. Revisar que el TRA solicite wsfe en homologación.",
    ],
    "wsn.unavailable": [
      "WSAA_NO_DISPONIBLE",
      "El servicio solicitado no está disponible en WSAA. Esperar al menos60segundos antes de reintentar.",
      true,
    ],
    "wsaa.unavailable": [
      "WSAA_NO_DISPONIBLE",
      "WSAA no está disponible. Esperar al menos60segundos antes de reintentar.",
      true,
    ],
    "wsaa.internalError": [
      "WSAA_NO_DISPONIBLE",
      "WSAA informó un error interno. Esperar al menos60segundos antes de reintentar.",
      true,
    ],
  };
  const conocido = Object.hasOwn(conocidos, code) ? conocidos[code] : undefined;
  if (conocido) return new ArcaAccesoError(...conocido);
  return new ArcaAccesoError(
    "WSAA_RECHAZO_NO_CLASIFICADO",
    "WSAA devolvió un rechazo SOAP no clasificado. Revisar el diagnóstico técnico antes de reintentar; no se guardó un ticket.",
  );
}
export class WsaaClient {
  private deps: DependenciasWsaa;
  constructor(
    private config: ConfiguracionArca,
    private leerCredenciales: () => Promise<CredencialArca>,
    private cache: CacheTicketWsaa,
    private masterKey: string,
    deps: Partial<DependenciasWsaa> = {},
  ) {
    this.deps = {
      red: fetch,
      ahora: () => new Date(),
      uniqueId: () => crypto.getRandomValues(new Uint32Array(1))[0],
      ...deps,
    };
  }
  async obtener(): Promise<TicketAcceso> {
    exigirArcaExterno(this.config);
    const credencial = await this.leerCredenciales();
    let fingerprint: string;
    try {
      fingerprint = new X509Certificate(credencial.certificado).fingerprint256;
    } catch {
      throw new ArcaAccesoError(
        "WSAA_CERTIFICADO_INVALIDO",
        "No se pudo leer el certificado de homologación.",
      );
    }
    const raw = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        [this.config.ambiente, this.config.servicio, fingerprint].join("|"),
      ),
    );
    const key = Buffer.from(raw).toString("hex");
    const current = enCurso.get(key);
    if (current) return await current;
    const attempt = this.adquirir(key, credencial);
    enCurso.set(key, attempt);
    try {
      return await attempt;
    } finally {
      if (enCurso.get(key) === attempt) enCurso.delete(key);
    }
  }
  private async adquirir(
    key: string,
    credencial: CredencialArca,
  ): Promise<TicketAcceso> {
    const owner = crypto.randomUUID(),
      entry = await this.cache.adquirir(key, owner);
    if (entry.tipo === "en_curso") {
      throw new ArcaAccesoError(
        "WSAA_EN_CURSO",
        "Otra ejecución obtiene el ticket fiscal. Consultar nuevamente después; no se solicitó otro TA.",
        true,
      );
    }
    if (entry.tipo === "vigente") {
      const ticket = await descifrarTicketWsaa(
        entry.sobre,
        key,
        this.masterKey,
        this.deps.ahora(),
      );
      if (Date.parse(ticket.vencimiento) !== Date.parse(entry.vencimiento)) {
        throw new ArcaAccesoError(
          "WSAA_CACHE_NO_VERIFICABLE",
          "El vencimiento del ticket protegido no coincide.",
        );
      }
      return ticket;
    }
    const now = this.deps.ahora(),
      id = this.deps.uniqueId(),
      tra = crearTraWsaa(now, id),
      cms = firmarTraWsaa(tra, credencial, now);
    let response: { status: number; xml: string };
    try {
      response = await enviarSoap(
        this.config,
        this.config.wsaaUrl,
        "",
        sobreSoap("loginCms", etiqueta("in0", cms), WSAA_NS),
        this.deps.red,
      );
    } catch {
      throw new ArcaAccesoError(
        "WSAA_NO_DISPONIBLE",
        "No se obtuvo el ticket de acceso. La reserva compartida conserva un intervalo de60segundos.",
        true,
      );
    }
    const body = interpretarRespuestaWsaa(
      "WSAA_RESPUESTA_SOAP_INVALIDA",
      () => {
        const root = analizarXml(response.xml);
        if (root.nombre !== "Envelope" || root.espacio !== SOAP_NS) {
          throw new Error();
        }
        return hijo(root, "Body", SOAP_NS);
      },
    );
    const fault = interpretarRespuestaWsaa(
      "WSAA_RESPUESTA_SOAP_INVALIDA",
      () => opcional(body, "Fault", SOAP_NS),
    );
    if (fault) throw faultWsaa(response.xml);
    if (response.status !== 200) {
      throw errorRespuestaWsaa("WSAA_RESPUESTA_HTTP_INVALIDA");
    }
    const result = interpretarRespuestaWsaa("WSAA_RETORNO_INVALIDO", () => {
      if (body.hijos.length !== 1) throw new Error();
      return texto(
        hijo(body, "loginCmsResponse", WSAA_NS),
        "loginCmsReturn",
        WSAA_NS,
      );
    });
    const inner = interpretarRespuestaWsaa("WSAA_TA_XML_INVALIDO", () => {
      const parsed = analizarXml(result, 65536);
      if (parsed.nombre !== "loginTicketResponse" || parsed.espacio !== "") {
        throw new Error();
      }
      return parsed;
    });
    const header = interpretarRespuestaWsaa(
      "WSAA_TA_CABECERA_INVALIDA",
      () => hijo(inner, "header"),
    );
    const ticketId = interpretarRespuestaWsaa(
      "WSAA_TA_IDENTIFICADOR_INVALIDO",
      () => texto(header, "uniqueId"),
    );
    // El TA tiene su propio uniqueId: no se exige eco del TRA. El manual
    // WSAA1.2.2 muestra TRA4325399 → TA383953094 (págs6/9). Validar unsignedInt;
    // identidad, servicio de origen y vigencia se verifican por separado debajo.
    const ticketNumber = Number(ticketId);
    if (
      !/^\+?[0-9]+$/.test(ticketId) || !Number.isSafeInteger(ticketNumber) ||
      ticketNumber < 0 || ticketNumber > 0xffffffff
    ) {
      throw errorRespuestaWsaa("WSAA_TA_IDENTIFICADOR_INVALIDO");
    }
    const origin = interpretarRespuestaWsaa(
      "WSAA_TA_ORIGEN_NO_VERIFICABLE",
      () => texto(header, "source"),
    );
    if (!/(?:^|[,/])\s*cn\s*=\s*wsaahomo\s*(?:[,/]|$)/i.test(origin)) {
      throw errorRespuestaWsaa("WSAA_TA_ORIGEN_NO_VERIFICABLE");
    }
    const destination = interpretarRespuestaWsaa(
      "WSAA_TA_DESTINO_NO_COINCIDE",
      () => texto(header, "destination"),
    );
    if (!destinatarioCoincide(destination, credencial.certificado)) {
      throw errorRespuestaWsaa("WSAA_TA_DESTINO_NO_COINCIDE");
    }
    const dates = interpretarRespuestaWsaa("WSAA_TA_VIGENCIA_INVALIDA", () => ({
      vencimiento: texto(header, "expirationTime"),
      generacion: texto(header, "generationTime"),
    }));
    const ticket = interpretarRespuestaWsaa(
      "WSAA_TA_CREDENCIALES_INVALIDAS",
      () => {
        const credentials = hijo(inner, "credentials");
        return validarTicket({
          token: texto(credentials, "token"),
          sign: texto(credentials, "sign"),
          ...dates,
        }, this.deps.ahora());
      },
    );
    // Ningún rechazo ni incompatibilidad de respuesta persiste el TA.
    const encrypted = await cifrarTicketWsaa(ticket, key, this.masterKey);
    await this.cache.guardar(
      key,
      owner,
      entry.version,
      encrypted,
      ticket.vencimiento,
    );
    return ticket;
  }
}

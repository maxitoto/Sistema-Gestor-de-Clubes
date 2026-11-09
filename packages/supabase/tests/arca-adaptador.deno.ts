// deno-lint-ignore-file require-await
// Los dobles async del transporte conservan la firma Promise del puerto.
// Tests Deno2.2.7 con XML y certificados sintéticos. La red de negocio no está autorizada.
import { Buffer } from "node:buffer";
import { X509Certificate } from "node:crypto";
import type {
  AdquisicionTicketWsaa,
  CacheTicketWsaa,
} from "../functions/_shared/modules/fiscal/application/CacheTicketWsaa.ts";
import { autorizacionCoincide } from "../functions/_shared/modules/fiscal/application/PuertoArca.ts";
import {
  claveSerieFiscal,
  validarIdentidadFiscal,
} from "../functions/_shared/modules/fiscal/domain/identidad-fiscal.ts";
import {
  serializarSolicitudFiscal,
  validarSolicitudFiscal,
} from "../functions/_shared/modules/fiscal/domain/solicitud-fiscal.ts";
import { leerConfiguracionArca } from "../functions/_shared/modules/fiscal/infrastructure/configuracion-arca.ts";
import { CacheTicketWsaaSupabase } from "../functions/_shared/modules/fiscal/infrastructure/arca/CacheTicketWsaaSupabase.ts";
import {
  ArcaAccesoError,
  cifrarTicketWsaa,
  crearTraWsaa,
  descifrarTicketWsaa,
  firmarTraWsaa,
  type TicketAcceso,
  WsaaClient,
} from "../functions/_shared/modules/fiscal/infrastructure/arca/WsaaClient.ts";
import {
  clasificarConsultaWsfe,
  clasificarSolicitudWsfe,
  solicitudWsfeXml,
  WsfeClient,
} from "../functions/_shared/modules/fiscal/infrastructure/arca/WsfeClient.ts";
import {
  analizarXml,
  decimalSoap,
  escaparXml,
  hijo,
  sobreSoap,
  texto,
  WSAA_NS,
} from "../functions/_shared/modules/fiscal/infrastructure/arca/xml.ts";
const here = new URL("./fixtures/arca/", import.meta.url);
const raw = await Deno.readTextFile(new URL("solicitud-sintetica.json", here));
const snapshot = validarSolicitudFiscal(JSON.parse(raw));
const approved = await Deno.readTextFile(
    new URL("autorizacion-sintetica.xml", here),
  ),
  rejected = await Deno.readTextFile(new URL("rechazo-sintetico.xml", here)),
  consult = await Deno.readTextFile(new URL("consulta-sintetica.xml", here)),
  absent = await Deno.readTextFile(new URL("consulta-no-encontrado.xml", here));
async function generarFixturesCertificados() {
  const dir = await Deno.makeTempDir({ prefix: "club-cert-" });
  try {
    const crtPath = `${dir}/certificado.crt`;
    const keyPath = `${dir}/certificado.key`;
    const otherKeyPath = `${dir}/otro.key`;
    const reqOut = await new Deno.Command("/usr/bin/openssl", {
      args: [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-keyout",
        keyPath,
        "-out",
        crtPath,
        "-days",
        "365",
        "-nodes",
        "-subj",
        "/C=AR/O=Club Sintetico/CN=wsfe-sintetico/serialNumber=CUIT 20123456786",
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (reqOut.code !== 0) {
      throw new Error("No se pudo generar el certificado sintético de prueba.");
    }
    const genOut = await new Deno.Command("/usr/bin/openssl", {
      args: ["genrsa", "-out", otherKeyPath, "2048"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (genOut.code !== 0) {
      throw new Error("No se pudo generar la clave privada alternativa.");
    }
    return {
      certificado: await Deno.readTextFile(crtPath),
      clave: await Deno.readTextFile(keyPath),
      otraClave: await Deno.readTextFile(otherKeyPath),
    };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
const { certificado, clave, otraClave } = await generarFixturesCertificados();
const cred = {
  certificado,
  clave,
  vencimiento: new Date(new X509Certificate(certificado).validTo).toISOString()
    .slice(0, 10),
};
const now = new Date(), master = Buffer.alloc(32, 123).toString("base64");
const config = leerConfiguracionArca({
  get: (name) =>
    ({
      ARCA_ENVIRONMENT: "homologacion",
      ARCA_EXTERNAL_ENABLED: "true",
    } as Record<string, string>)[name],
});
const ticket: TicketAcceso = {
  token: "TOKEN_SOLO_SINTETICO",
  sign: "SIGN_SOLO_SINTETICO",
  generacion: new Date(now.getTime() - 1000).toISOString(),
  vencimiento: new Date(now.getTime() + 3600000).toISOString(),
};
function assert(value: unknown, message = "Aserción fallida"): asserts value {
  if (!value) throw new Error(message);
}
function eq(a: unknown, b: unknown): void {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === "object"
      ? Object.fromEntries(
        Object.entries(x).sort(([a], [b]) => a.localeCompare(b)).map((
          [k, v],
        ) => [k, sort(v)]),
      )
      : x;
  assert(
    JSON.stringify(sort(a)) === JSON.stringify(sort(b)),
    "Los valores no coinciden.",
  );
}
function throws(fn: () => unknown) {
  let failed = false;
  try {
    fn();
  } catch {
    failed = true;
  }
  assert(failed);
}
async function rejects(fn: () => Promise<unknown>, code?: string) {
  let error: unknown;
  try {
    await fn();
  } catch (value) {
    error = value;
  }
  assert(error instanceof Error);
  if (code) assert(error instanceof ArcaAccesoError && error.codigo === code);
}
const red = (
  fn: (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => Promise<Response>,
) => fn as typeof fetch;
class MemoryCache implements CacheTicketWsaa {
  constructor(private clock: () => Date = () => now) {}
  entry: { sobre: string; vencimiento: string } | null = null;
  owner = "";
  version = 0;
  locked = false;
  async adquirir(_key: string, owner: string): Promise<AdquisicionTicketWsaa> {
    if (
      this.entry &&
      Date.parse(this.entry.vencimiento) > this.clock().getTime() + 60000
    ) return { tipo: "vigente", ...this.entry };
    if (this.locked) return { tipo: "en_curso" };
    this.locked = true;
    this.owner = owner;
    return { tipo: "adquirido", version: ++this.version };
  }
  async guardar(
    _key: string,
    owner: string,
    version: number,
    sobre: string,
    vencimiento: string,
  ) {
    assert(this.owner === owner && this.version === version);
    this.entry = { sobre, vencimiento };
    this.locked = false;
  }
}
function ta(
  id = "42",
  expiration = ticket.vencimiento,
  generation = ticket.generacion,
  destination = new X509Certificate(certificado).subject.replaceAll("\n", ","),
): string {
  const inner =
    `<loginTicketResponse version="1.0"><header><source>cn=wsaahomo,o=afip,c=ar</source><destination>${
      escaparXml(destination)
    }</destination><uniqueId>${id}</uniqueId><generationTime>${generation}</generationTime><expirationTime>${expiration}</expirationTime></header><credentials><token>${ticket.token}</token><sign>${ticket.sign}</sign></credentials></loginTicketResponse>`;
  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><loginCmsResponse xmlns="${WSAA_NS}"><loginCmsReturn>${
    escaparXml(inner)
  }</loginCmsReturn></loginCmsResponse></s:Body></s:Envelope>`;
}
const tests: { nombre: string; correcto: boolean }[] = [];
function test(nombre: string, fn: () => void | Promise<void>) {
  Deno.test(nombre, async () => {
    await fn();
    tests.push({ nombre, correcto: true });
  });
}
test("configuración ausente/productiva/flag inválido falla cerrada", () => {
  throws(() => leerConfiguracionArca({ get: () => undefined }));
  throws(() =>
    leerConfiguracionArca({
      get: (n) => n === "ARCA_ENVIRONMENT" ? "produccion" : undefined,
    })
  );
  throws(() =>
    leerConfiguracionArca({
      get: (n) => n === "ARCA_ENVIRONMENT" ? "homologacion" : "yes",
    })
  );
  eq(
    leerConfiguracionArca({
      get: (n) => n === "ARCA_ENVIRONMENT" ? "homologacion" : undefined,
    }).habilitado,
    false,
  );
});
test("identidad cerrada y serie distinguen ambiente y tipo numérico", () => {
  eq(claveSerieFiscal(snapshot.identidad), "20123456786:homologacion:4:11");
  throws(() =>
    validarIdentidadFiscal({
      ...snapshot.identidad,
      tipoComprobante: "factura",
    })
  );
  throws(() =>
    validarIdentidadFiscal({ ...snapshot.identidad, url: "http://otro" })
  );
});
test("snapshot canónico rechaza Auth, importes incoherentes y moneda libre", () => {
  eq(validarSolicitudFiscal(snapshot), snapshot);
  throws(() => validarSolicitudFiscal({ ...snapshot, Auth: { Token: "no" } }));
  throws(() =>
    validarSolicitudFiscal({
      ...snapshot,
      detalle: { ...snapshot.detalle, ImpTotal: "1000.01" },
    })
  );
  throws(() =>
    validarSolicitudFiscal({
      ...snapshot,
      detalle: { ...snapshot.detalle, MonCotiz: 1 },
    })
  );
  eq(
    serializarSolicitudFiscal(snapshot),
    serializarSolicitudFiscal({
      ...snapshot,
      detalle: { ...snapshot.detalle },
    }),
  );
});
test("bases e IVA y servicios deben conciliar y fecharse", () => {
  throws(() =>
    validarSolicitudFiscal({
      ...snapshot,
      detalle: { ...snapshot.detalle, Concepto: 2 },
    })
  );
  throws(() =>
    validarSolicitudFiscal({
      ...snapshot,
      detalle: {
        ...snapshot.detalle,
        ImpNeto: "826.45",
        ImpIVA: "173.55",
        Iva: [{ Id: 5, BaseImp: "800.00", Importe: "173.55" }],
      },
    })
  );
});
test("árbol XML preserva namespaces, texto y entidades escapadas", () => {
  const root = analizarXml(
    '<a:r xmlns:a="urn:x"><a:c>&lt;dato&gt; &amp;</a:c></a:r>',
  );
  eq(root.espacio, "urn:x");
  eq(texto(root, "c"), "<dato> &");
  throws(() => analizarXml('<!DOCTYPE a [<!ENTITY x "boom">]><a>&x;</a>'));
  throws(() => analizarXml("<a>"));
  throws(() => hijo(analizarXml("<r><a/><a/></r>"), "a"));
});
test("decimal SOAP no redondea ni acepta exponentes de modo silencioso", () => {
  eq(decimalSoap("1000", 2), "1000.00");
  eq(decimalSoap("1.0000000", 6), "1.000000");
  throws(() => decimalSoap("1.001", 2));
  throws(() => decimalSoap("1E3", 2));
});
test("solicitud SOAP ordenada sólo contiene datos fiscales, no metadata ni Auth", () => {
  const xml = solicitudWsfeXml(snapshot);
  assert(xml.includes("<CantReg>1</CantReg>"));
  assert(xml.includes("<CondicionIVAReceptorId>5</CondicionIVAReceptorId>"));
  assert(!xml.includes("TOKEN") && !xml.includes(snapshot.emisor.nombre));
});
test("autorización válida con observaciones es atribuida a request exacto", () => {
  const result = clasificarSolicitudWsfe(approved, snapshot);
  assert(result.tipo === "autorizado");
  assert(autorizacionCoincide(snapshot, result.autorizacion));
  eq(result.observaciones[0].codigo, "10017");
  eq(result.autorizacion.vencimiento, "2026-11-03");
});
test("CAE erróneo o identidad/número/fecha incongruentes quedan desconocidos", () => {
  for (
    const xml of [
      approved.replace("12345678901234", "x"),
      approved.replace("12345678901234", "00000000000000"),
      approved.replace("<PtoVta>4", "<PtoVta>5"),
      approved.replace("<CbteDesde>17", "<CbteDesde>18"),
      approved.replace("<CbteFch>20261024", "<CbteFch>20261025"),
    ]
  ) eq(clasificarSolicitudWsfe(xml, snapshot).tipo, "desconocido");
});
test("rechazo explícito se distingue de error genérico HTTP200/Fault/incompleto", () => {
  eq(clasificarSolicitudWsfe(rejected, snapshot).tipo, "rechazado");
  for (
    const xml of [
      "<x/>",
      sobreSoap(
        "FECAESolicitarResponse",
        "<Errors><Err><Code>500</Code><Msg>fallo</Msg></Err></Errors>",
      ),
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>x</faultcode></s:Fault></s:Body></s:Envelope>',
    ]
  ) eq(clasificarSolicitudWsfe(xml, snapshot).tipo, "desconocido");
});
test("consulta completa se compara con importes, receptor y condiciónIVA", () => {
  const result = clasificarConsultaWsfe(consult, snapshot.identidad, "17");
  assert(result.tipo === "encontrado");
  assert(autorizacionCoincide(snapshot, result.autorizacion));
  const changed = structuredClone(result.autorizacion);
  changed.detalle.CondicionIVAReceptorId = 4;
  assert(!autorizacionCoincide(snapshot, changed));
  changed.detalle.CondicionIVAReceptorId = 5;
  changed.detalle.FchServDesde = "20261001";
  assert(!autorizacionCoincide(snapshot, changed));
});
test("consulta602 única confirma ausencia; otra error o datos incompletos ambiguos", () => {
  eq(
    clasificarConsultaWsfe(absent, snapshot.identidad, "17").tipo,
    "no_encontrado",
  );
  eq(
    clasificarConsultaWsfe(
      absent.replace("602", "600"),
      snapshot.identidad,
      "17",
    ).tipo,
    "ambiguo",
  );
  eq(
    clasificarConsultaWsfe(
      consult.replace("<CondicionIVAReceptorId>5</CondicionIVAReceptorId>", ""),
      snapshot.identidad,
      "17",
    ).tipo,
    "ambiguo",
  );
  eq(clasificarConsultaWsfe(consult, snapshot.identidad, "18").tipo, "ambiguo");
});
test("CMS attached contiene TRA exacto y firma real verificada por OpenSSL", async () => {
  const tra = crearTraWsaa(now, 42), cms = firmarTraWsaa(tra, cred, now);
  const dir = await Deno.makeTempDir({
    prefix: "club-cms-",
  });
  try {
    const input = dir + "/tra.der";
    await Deno.writeFile(input, Buffer.from(cms, "base64"));
    const out = await new Deno.Command("/usr/bin/openssl", {
      args: ["cms", "-verify", "-inform", "DER", "-in", input, "-noverify"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    eq(out.code, 0);
    eq(new TextDecoder().decode(out.stdout), tra);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
  throws(() => firmarTraWsaa(tra, { ...cred, clave: otraClave }, now));
});
test("cacheTA AESGCM usa IV distintos, AAD y vencimiento verificados", async () => {
  const key = "a".repeat(64),
    a = await cifrarTicketWsaa(ticket, key, master),
    b = await cifrarTicketWsaa(ticket, key, master);
  assert(a !== b && !a.includes(ticket.token));
  eq(await descifrarTicketWsaa(a, key, master, now), ticket);
  await rejects(
    () => descifrarTicketWsaa(a, "b".repeat(64), master, now),
    "WSAA_CACHE_NO_VERIFICABLE",
  );
  await rejects(
    () =>
      descifrarTicketWsaa(a, key, master, new Date(now.getTime() + 4000000)),
    "WSAA_CACHE_NO_VERIFICABLE",
  );
});
test("WSAA usa lease compartida, singleflight y reutiliza ticket cifrado", async () => {
  let calls = 0;
  const cache = new MemoryCache(),
    network = red(async (input, init) => {
      eq(String(input), config.wsaaUrl);
      assert(String(init?.body).includes("<in0>"));
      calls++;
      await Promise.resolve();
      return new Response(ta(), { status: 200 });
    });
  const make = () =>
    new WsaaClient(config, () => Promise.resolve(cred), cache, master, {
      red: network,
      ahora: () => now,
      uniqueId: () => 42,
    });
  const [a, b] = await Promise.all([make().obtener(), make().obtener()]);
  eq(a, b);
  eq(calls, 1);
  eq(await make().obtener(), ticket);
  eq(calls, 1);
  assert(cache.entry?.sobre && !cache.entry.sobre.includes(ticket.token));
});
// Manual WSAA1.2.2: TRA4325399 y su TA383953094; no hay garantía de eco.
test("WSAA acepta identificador propio del TA del ejemplo oficial y reutiliza cache", async () => {
  const cache = new MemoryCache();
  let calls = 0;
  const client = new WsaaClient(
    config,
    () => Promise.resolve(cred),
    cache,
    master,
    {
      red: red(async () => {
        calls++;
        return new Response(ta("383953094"));
      }),
      ahora: () => now,
      uniqueId: () => 4325399,
    },
  );
  eq(await client.obtener(), ticket);
  assert(cache.entry?.sobre && !cache.entry.sobre.includes(ticket.token));
  eq(await client.obtener(), ticket);
  eq(calls, 1);
});
test("WSAA gate detiene antes de leer credenciales o llamar red", async () => {
  let reads = 0, network = 0;
  const disabled = { ...config, habilitado: false };
  await rejects(() =>
    new WsaaClient(
      disabled,
      () => {
        reads++;
        return Promise.resolve(cred);
      },
      new MemoryCache(),
      master,
      {
        red: red(async () => {
          network++;
          return new Response("");
        }),
      },
    ).obtener()
  );
  eq([reads, network], [0, 0]);
});
test("lease ajena o TA vencido/mal atribuido no autorizan ni reintentan red ciega", async () => {
  let network = 0;
  const locked = new MemoryCache();
  locked.locked = true;
  await rejects(
    () =>
      new WsaaClient(config, () => Promise.resolve(cred), locked, master, {
        red: red(async () => {
          network++;
          return new Response("");
        }),
        ahora: () => now,
      }).obtener(),
    "WSAA_EN_CURSO",
  );
  eq(network, 0);
  for (
    const xml of [
      ta("42", ticket.vencimiento, ticket.generacion, "CN=Otro receptor"),
      ta("42", new Date(now.getTime() - 1000).toISOString()),
    ]
  ) {
    await rejects(() =>
      new WsaaClient(
        config,
        () => Promise.resolve(cred),
        new MemoryCache(),
        master,
        {
          red: red(async () => new Response(xml)),
          ahora: () => now,
          uniqueId: () => 42,
        },
      ).obtener()
    );
  }
});
test("WSAAfault de asociación produce error accionable sin reflejar cuerpo", async () => {
  const xml =
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>coe.notAuthorized</faultcode><faultstring>TOKEN_NO_REFLEJAR</faultstring></s:Fault></s:Body></s:Envelope>';
  await rejects(
    () =>
      new WsaaClient(
        config,
        () => Promise.resolve(cred),
        new MemoryCache(),
        master,
        {
          red: red(async () => new Response(xml, { status: 500 })),
          ahora: () => now,
          uniqueId: () => 42,
        },
      ).obtener(),
    "WSAA_NO_AUTORIZADO",
  );
});
async function errorRespuestaSintetica(xml: string, status = 200) {
  const cache = new MemoryCache();
  let calls = 0;
  let captured: unknown;
  try {
    await new WsaaClient(config, () => Promise.resolve(cred), cache, master, {
      red: red(async () => {
        calls++;
        return new Response(xml, { status });
      }),
      ahora: () => now,
      uniqueId: () => 42,
    }).obtener();
  } catch (error) {
    captured = error;
  }
  assert(captured instanceof ArcaAccesoError);
  eq(calls, 1);
  eq(cache.entry, null);
  assert(cache.locked, "La reserva no se libera para reintentar a ciegas");
  const diagnostic = captured.message + JSON.stringify(captured);
  for (
    const privateValue of [
      ticket.token,
      ticket.sign,
      "NO_REFLEJAR",
      "CN=Otro receptor",
    ]
  ) {
    assert(
      !diagnostic.includes(privateValue),
      "El diagnóstico no expone texto remoto",
    );
  }
  return captured;
}
function faultSintetico(code: string) {
  return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>' +
    escaparXml(code) + "</faultcode><faultstring>NO_REFLEJAR " + ticket.token +
    " " + ticket.sign +
    "</faultstring></s:Fault></s:Body></s:Envelope>";
}
const faultCases: [string, string, boolean?][] = [
  ["coe.notAuthorized", "WSAA_NO_AUTORIZADO"],
  ["coe.alreadyAuthenticated", "WSAA_TICKET_EXISTENTE"],
  ["cms.bad", "WSAA_CMS_INVALIDO"],
  ["cms.bad.base64", "WSAA_CMS_BASE64_INVALIDO"],
  ["cms.cert.notFound", "WSAA_CERTIFICADO_AUSENTE_EN_CMS"],
  ["cms.sign.invalid", "WSAA_FIRMA_INVALIDA"],
  ["cms.cert.expired", "WSAA_CERTIFICADO_VENCIDO"],
  ["cms.cert.invalid", "WSAA_CERTIFICADO_AUN_NO_VIGENTE"],
  ["cms.cert.untrusted", "WSAA_CERTIFICADO_NO_CONFIABLE"],
  ["xml.bad", "WSAA_TRA_INVALIDO"],
  ["xml.source.invalid", "WSAA_TRA_ORIGEN_INVALIDO"],
  ["xml.destination.invalid", "WSAA_TRA_DESTINO_INVALIDO"],
  ["xml.version.notSupported", "WSAA_TRA_VERSION_NO_SOPORTADA"],
  ["xml.generationTime.invalid", "WSAA_RELOJ_INVALIDO"],
  ["xml.expirationTime.expired", "WSAA_RELOJ_INVALIDO"],
  ["xml.expirationTime.invalid", "WSAA_RELOJ_INVALIDO"],
  ["wsn.notFound", "WSAA_SERVICIO_NO_ENCONTRADO"],
  ["wsn.unavailable", "WSAA_NO_DISPONIBLE", true],
  ["wsaa.unavailable", "WSAA_NO_DISPONIBLE", true],
  ["wsaa.internalError", "WSAA_NO_DISPONIBLE", true],
];
for (const [remoteCode, publicCode, retryable = false] of faultCases) {
  test(
    "WSAA clasifica fault oficial " + remoteCode + " sin reflejar texto remoto",
    async () => {
      for (const prefix of ["", "ns1:"]) {
        const error = await errorRespuestaSintetica(
          faultSintetico(prefix + remoteCode),
          500,
        );
        eq(error.codigo, publicCode);
        eq(error.reintentable, retryable);
      }
    },
  );
}
test("WSAA fault desconocido, QName malformado y coincidencias parciales no se clasifican como autorización", async () => {
  for (
    const code of [
      "NO_REFLEJAR",
      "inventado.coe.notAuthorized",
      "coe.notAuthorized.NO_REFLEJAR",
      "ns1:ns2:coe.notAuthorized",
      "x".repeat(129),
      "wsaa.inventado",
    ]
  ) {
    const error = await errorRespuestaSintetica(faultSintetico(code), 500);
    eq(error.codigo, "WSAA_RECHAZO_NO_CLASIFICADO");
    eq(error.reintentable, false);
  }
});
const responseCases: [string, string, string, number?][] = [
  ["XML inválido", "NO_REFLEJAR <mal>", "WSAA_RESPUESTA_SOAP_INVALIDA"],
  ["Envelope ajeno", "<r/>", "WSAA_RESPUESTA_SOAP_INVALIDA"],
  ["HTTP fallido sin Fault", ta(), "WSAA_RESPUESTA_HTTP_INVALIDA", 503],
  [
    "namespace de retorno ajeno",
    ta().replace('xmlns="' + WSAA_NS + '"', 'xmlns="urn:ajeno"'),
    "WSAA_RETORNO_INVALIDO",
  ],
  [
    "retorno sin namespace",
    ta().replace("<loginCmsReturn>", '<loginCmsReturn xmlns="">'),
    "WSAA_RETORNO_INVALIDO",
  ],
  [
    "retorno ausente",
    ta().replaceAll("loginCmsReturn", "otroRetorno"),
    "WSAA_RETORNO_INVALIDO",
  ],
  [
    "raíz de ticket ajena",
    ta().replaceAll("loginTicketResponse", "otroTicket"),
    "WSAA_TA_XML_INVALIDO",
  ],
  [
    "cabecera ausente",
    ta().replaceAll("header", "cabeceraAjena"),
    "WSAA_TA_CABECERA_INVALIDA",
  ],
  ["identificador negativo", ta("-1"), "WSAA_TA_IDENTIFICADOR_INVALIDO"],
  [
    "identificador fuera de rango",
    ta("4294967296"),
    "WSAA_TA_IDENTIFICADOR_INVALIDO",
  ],
  ["identificador fraccionario", ta("42.5"), "WSAA_TA_IDENTIFICADOR_INVALIDO"],
  ["identificador exponencial", ta("4.2e1"), "WSAA_TA_IDENTIFICADOR_INVALIDO"],
  [
    "identificador no numérico",
    ta("NO_REFLEJAR"),
    "WSAA_TA_IDENTIFICADOR_INVALIDO",
  ],
  ["identificador vacío", ta(""), "WSAA_TA_IDENTIFICADOR_INVALIDO"],
  ["identificador con separador", ta("4 2"), "WSAA_TA_IDENTIFICADOR_INVALIDO"],
  ["identificador hexadecimal", ta("0x2a"), "WSAA_TA_IDENTIFICADOR_INVALIDO"],
  ["identificador infinito", ta("Infinity"), "WSAA_TA_IDENTIFICADOR_INVALIDO"],
  [
    "identificador ausente",
    ta().replace("&lt;uniqueId&gt;42&lt;/uniqueId&gt;", ""),
    "WSAA_TA_IDENTIFICADOR_INVALIDO",
  ],
  [
    "identificador duplicado",
    ta().replace(
      "&lt;uniqueId&gt;42&lt;/uniqueId&gt;",
      "&lt;uniqueId&gt;42&lt;/uniqueId&gt;&lt;uniqueId&gt;43&lt;/uniqueId&gt;",
    ),
    "WSAA_TA_IDENTIFICADOR_INVALIDO",
  ],
  [
    "origen ajeno",
    ta().replace("cn=wsaahomo", "cn=NO_REFLEJAR"),
    "WSAA_TA_ORIGEN_NO_VERIFICABLE",
  ],
  [
    "destinatario ajeno",
    ta("42", ticket.vencimiento, ticket.generacion, "CN=Otro receptor"),
    "WSAA_TA_DESTINO_NO_COINCIDE",
  ],
  [
    "credenciales ausentes",
    ta().replaceAll("credentials", "otrosDatos"),
    "WSAA_TA_CREDENCIALES_INVALIDAS",
  ],
  [
    "token vacío",
    ta().replace(ticket.token, ""),
    "WSAA_TA_CREDENCIALES_INVALIDAS",
  ],
  [
    "token con espacios",
    ta().replace(ticket.token, "NO_REFLEJAR token"),
    "WSAA_TA_CREDENCIALES_INVALIDAS",
  ],
  [
    "ticket vencido",
    ta("42", new Date(now.getTime() - 1000).toISOString()),
    "WSAA_TA_VIGENCIA_INVALIDA",
  ],
  [
    "ticket futuro",
    ta(
      "42",
      ticket.vencimiento,
      new Date(now.getTime() + 120000).toISOString(),
    ),
    "WSAA_TA_VIGENCIA_INVALIDA",
  ],
];
for (const [name, xml, expected, status = 200] of responseCases) {
  test("WSAA informa etapa segura: " + name, async () => {
    const error = await errorRespuestaSintetica(xml, status);
    eq(error.codigo, expected);
    eq(error.reintentable, false);
  });
}
test("WSAA acepta unsignedInt límite y formas decimales válidas sin exigir eco", async () => {
  for (const id of ["0", "4294967295", "+0042", "0000000042"]) {
    const cache = new MemoryCache();
    const actual = await new WsaaClient(
      config,
      () => Promise.resolve(cred),
      cache,
      master,
      {
        red: red(async () => new Response(ta(id))),
        ahora: () => now,
        uniqueId: () => 4325399,
      },
    ).obtener();
    eq(actual, ticket);
    assert(cache.entry?.sobre && !cache.entry.sobre.includes(ticket.token));
  }
});
test("WSAA acepta prefijo explícito equivalente al namespace calificado del WSDL", async () => {
  const xml = ta()
    .replace(
      '<loginCmsResponse xmlns="' + WSAA_NS + '">',
      '<n:loginCmsResponse xmlns:n="' + WSAA_NS + '">',
    )
    .replace("<loginCmsReturn>", "<n:loginCmsReturn>")
    .replace("</loginCmsReturn>", "</n:loginCmsReturn>")
    .replace("</loginCmsResponse>", "</n:loginCmsResponse>");
  const cache = new MemoryCache();
  const actual = await new WsaaClient(
    config,
    () => Promise.resolve(cred),
    cache,
    master,
    {
      red: red(async () => new Response(xml)),
      ahora: () => now,
      uniqueId: () => 42,
    },
  ).obtener();
  eq(actual, ticket);
  assert(cache.entry?.sobre && !cache.entry.sobre.includes(ticket.token));
});
test("WSFE distingue caída posterior a posibleenvío y falla previaWSAA", async () => {
  let sends = 0;
  const port = new WsfeClient(
    config,
    { obtener: () => Promise.resolve(ticket) },
    red(async () => {
      sends++;
      throw new Error("caída");
    }),
  );
  eq((await port.solicitar(snapshot)).tipo, "desconocido");
  eq(sends, 1);
  const noAccess = new WsfeClient(
    config,
    {
      obtener: () =>
        Promise.reject(new ArcaAccesoError("WSAA_NO_AUTORIZADO", "sin acceso")),
    },
    red(async () => {
      sends++;
      return new Response("");
    }),
  );
  eq((await noAccess.solicitar(snapshot)).tipo, "transitorio");
  eq(sends, 1);
});
test("RPC cache usa únicamente argumentos técnicos cerrados y fences", async () => {
  const seen: unknown[] = [];
  const repo = new CacheTicketWsaaSupabase({
    rpc: (name, args) => {
      seen.push([name, args]);
      return Promise.resolve({
        data: name === "adquirir_ticket_wsaa"
          ? { tipo: "adquirido", version: 3 }
          : null,
        error: null,
      });
    },
  });
  eq(await repo.adquirir("a".repeat(64), "id"), {
    tipo: "adquirido",
    version: 3,
  });
  await repo.guardar("a".repeat(64), "id", 3, "v1.sobre", ticket.vencimiento);
  eq((seen[1] as unknown[])[0], "guardar_ticket_wsaa");
});
test("renovación TA usa expiración informada y reserva nueva sin renovar cada consulta", async () => {
  let clock = new Date(now), calls = 0;
  const cache = new MemoryCache(() => clock);
  const network = red(async () => {
    calls++;
    return new Response(
      ta(
        "42",
        new Date(clock.getTime() + 3600000).toISOString(),
        new Date(clock.getTime() - 1000).toISOString(),
      ),
    );
  });
  const make = () =>
    new WsaaClient(config, () => Promise.resolve(cred), cache, master, {
      red: network,
      ahora: () => clock,
      uniqueId: () => 42,
    });
  await make().obtener();
  await make().obtener();
  eq(calls, 1);
  clock = new Date(clock.getTime() + 3601000);
  const fresh = await make().obtener();
  eq(calls, 2);
  eq(Date.parse(fresh.vencimiento), clock.getTime() + 3600000);
});
test("cache cifrada inválida no provoca una renovación automática ni expone tokens", async () => {
  let sends = 0;
  const cache = new MemoryCache();
  cache.entry = { sobre: "v1.inválida", vencimiento: ticket.vencimiento };
  await rejects(
    () =>
      new WsaaClient(config, () => Promise.resolve(cred), cache, master, {
        ahora: () => now,
        red: red(async () => {
          sends++;
          return new Response("");
        }),
      }).obtener(),
    "WSAA_CACHE_NO_VERIFICABLE",
  );
  eq(sends, 0);
});
test("transportes con respuesta desmedida, HTTPfallido o namespacefalso quedan desconocidos", async () => {
  const tiny = { ...config, maxResponseBytes: 32 };
  const large = new WsfeClient(
    tiny,
    { obtener: () => Promise.resolve(ticket) },
    red(async () =>
      new Response("x".repeat(100), { headers: { "Content-Length": "100" } })
    ),
  );
  eq((await large.solicitar(snapshot)).tipo, "desconocido");
  eq(clasificarSolicitudWsfe(approved, snapshot, 500).tipo, "desconocido");
  eq(
    clasificarSolicitudWsfe(
      approved.replaceAll("http://ar.gov.afip.dif.FEV1/", "urn:otro"),
      snapshot,
    ).tipo,
    "desconocido",
  );
});
test("último autorizado y puntos de venta se obtienen por SOAP de homologación con token sólo en red", async () => {
  const port = new WsfeClient(
    config,
    { obtener: () => Promise.resolve(ticket) },
    red(async (input, init) => {
      eq(String(input), config.wsfeUrl);
      assert(String(init?.body).includes(ticket.token));
      const action = String(new Headers(init?.headers).get("SOAPAction"));
      if (action.includes("FECompUltimoAutorizado")) {
        return new Response(
          '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult><PtoVta>4</PtoVta><CbteTipo>11</CbteTipo><CbteNro>16</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></s:Body></s:Envelope>',
        );
      }
      return new Response(
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult><ResultGet><PtoVenta><Nro>4</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja></FchBaja></PtoVenta></ResultGet></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse></s:Body></s:Envelope>',
      );
    }),
  );
  eq(await port.obtenerUltimoAutorizado(snapshot.identidad), {
    tipo: "obtenido",
    numero: "16",
  });
  const diagnosis = await port.diagnosticar(snapshot.identidad.cuit);
  eq(diagnosis.puntosVenta, [{
    numero: 4,
    emisionTipo: "CAE",
    bloqueado: false,
    bajaFecha: null,
  }]);
  assert(!JSON.stringify(diagnosis).includes(ticket.token));
});
function respuestaPuntosVenta(body: string): string {
  return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FEParamGetPtosVentaResponse xmlns="' +
    "http://ar.gov.afip.dif.FEV1/" + '"><FEParamGetPtosVentaResult>' + body +
    "</FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse></s:Body></s:Envelope>";
}
function erroresPuntosVenta(codes: string[]): string {
  return "<Errors>" +
    codes.map((code) =>
      "<Err><Code>" + escaparXml(code) + "</Code><Msg>NO_REFLEJAR " +
      ticket.token + " " + ticket.sign + "</Msg></Err>"
    ).join("") + "</Errors>";
}
async function falloPuntosVenta(
  xml: string,
  status = 200,
): Promise<ArcaAccesoError> {
  let error: unknown, sends = 0, reads = 0;
  try {
    await new WsfeClient(
      config,
      {
        obtener: () => {
          reads++;
          return Promise.resolve(ticket);
        },
      },
      red(async () => {
        sends++;
        return new Response(xml, { status });
      }),
    ).diagnosticar(snapshot.identidad.cuit);
  } catch (value) {
    error = value;
  }
  assert(error instanceof ArcaAccesoError);
  eq([reads, sends], [1, 1]);
  assert(error.message.length < 700);
  for (
    const secret of [
      ticket.token,
      ticket.sign,
      "NO_REFLEJAR",
      snapshot.identidad.cuit,
    ]
  ) assert(!(error.message + JSON.stringify(error)).includes(secret));
  return error;
}
for (
  const [codes, expected] of [
    [["600"], "WSFE_AUTENTICACION_NO_CONFIRMADA"],
    [["601"], "WSFE_CUIT_NO_AUTORIZADA"],
    [["500"], "WSFE_PUNTOS_VENTA_ERROR_INTERNO"],
    [["501"], "WSFE_PUNTOS_VENTA_ERROR_INTERNO"],
    [["502"], "WSFE_PUNTOS_VENTA_ERROR_INTERNO"],
    [["602", "600"], "WSFE_AUTENTICACION_NO_CONFIRMADA"],
    [["602", "601"], "WSFE_CUIT_NO_AUTORIZADA"],
    [["602", "99999999"], "WSFE_PUNTOS_VENTA_RECHAZADOS"],
    [["602", "500"], "WSFE_PUNTOS_VENTA_ERROR_INTERNO"],
    [["99999999"], "WSFE_PUNTOS_VENTA_RECHAZADOS"],
  ] as [string[], string][]
) {
  test(
    "PV conserva códigos propios sin atribuir todo a WSASS: " + codes.join(","),
    async () => {
      const error = await falloPuntosVenta(
        respuestaPuntosVenta(erroresPuntosVenta(codes)),
      );
      eq(error.codigo, expected);
      for (const code of codes) assert(error.message.includes(code));
    },
  );
}
test("PV602 con datos o HTTPfallido no se convierte en éxito", async () => {
  const data =
    "<ResultGet><PtoVenta><Nro>1</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado></PtoVenta></ResultGet>";
  eq(
    (await falloPuntosVenta(
      respuestaPuntosVenta(data + erroresPuntosVenta(["602"])),
    )).codigo,
    "WSFE_PUNTOS_VENTA_RESPUESTA_CONTRADICTORIA",
  );
  eq(
    (await falloPuntosVenta(
      respuestaPuntosVenta(erroresPuntosVenta(["602"])),
      503,
    )).codigo,
    "WSFE_PUNTOS_VENTA_HTTP_NO_EXITOSO",
  );
});
test("PV602 válido sólo informa ausencia de listado y conserva secretos privados", async () => {
  for (
    const body of [
      erroresPuntosVenta(["602"]),
      "<ResultGet/>" + erroresPuntosVenta(["602"]),
      erroresPuntosVenta(["602", "602"]) +
      "<Events><Evt><Code>1</Code><Msg>NO_REFLEJAR</Msg></Evt></Events>",
    ]
  ) {
    let reads = 0, sends = 0;
    const result = await new WsfeClient(
      config,
      {
        obtener: () => {
          reads++;
          return Promise.resolve(ticket);
        },
      },
      red(async () => {
        sends++;
        return new Response(respuestaPuntosVenta(body));
      }),
    )
      .diagnosticar(snapshot.identidad.cuit);
    eq(result, {
      autenticado: true,
      ambiente: "homologacion",
      servicio: "wsfe",
      puntosVenta: [],
      ausenciaDatos: "602",
    });
    eq([reads, sends], [1, 1]);
    for (
      const secret of [
        ticket.token,
        ticket.sign,
        snapshot.identidad.cuit,
        "NO_REFLEJAR",
      ]
    ) {
      assert(!JSON.stringify(result).includes(secret));
    }
  }
});
test("PV602 nunca habilita consulta de serie desde HTTP500 ni SOAP malformado", async () => {
  eq(
    (await falloPuntosVenta(
      respuestaPuntosVenta(erroresPuntosVenta(["602"])),
      500,
    )).codigo,
    "WSFE_PUNTOS_VENTA_HTTP_NO_EXITOSO",
  );
  for (
    const body of [
      erroresPuntosVenta(["602"]) +
      "<Events><Evt><Code>INVALIDO</Code></Evt></Events>",
      erroresPuntosVenta(["602"]) + "<ResultGet/><ResultGet/>",
      erroresPuntosVenta(["602"]) + "<Otro/>",
    ]
  ) {
    eq(
      (await falloPuntosVenta(respuestaPuntosVenta(body))).codigo,
      "WSFE_PUNTOS_VENTA_RESPUESTA_INVALIDA",
    );
  }
});
test("PV limita mensaje incluso con treinta códigos desconocidos", async () => {
  const codes = Array.from({ length: 30 }, (_, i) => String(99999900 + i));
  const error = await falloPuntosVenta(
    respuestaPuntosVenta(erroresPuntosVenta(codes)),
  );
  assert(error.message.length < 700);
  for (const code of codes) assert(error.message.includes(code));
});
test("PV HTTPfallido sinErrors tiene diagnóstico distinto", async () => {
  eq(
    (await falloPuntosVenta(respuestaPuntosVenta("<ResultGet/>"), 503)).codigo,
    "WSFE_PUNTOS_VENTA_HTTP_NO_EXITOSO",
  );
});
for (
  const [name, xml] of [
    ["XML inválido", "NO_REFLEJAR <mal>"],
    [
      "namespace ajeno",
      respuestaPuntosVenta("").replaceAll(
        "http://ar.gov.afip.dif.FEV1/",
        "urn:ajeno",
      ),
    ],
    ["hijo ajeno", respuestaPuntosVenta("<AlgoAjeno/>")],
    ["ResultGet duplicado", respuestaPuntosVenta("<ResultGet/><ResultGet/>")],
    ["texto inesperado", respuestaPuntosVenta("NO_REFLEJAR")],
    ["fila ajena", respuestaPuntosVenta("<ResultGet><Otro/></ResultGet>")],
    [
      "Bloqueado inválido",
      respuestaPuntosVenta(
        "<ResultGet><PtoVenta><Nro>1</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>X</Bloqueado></PtoVenta></ResultGet>",
      ),
    ],
    [
      "FchBaja inválida",
      respuestaPuntosVenta(
        "<ResultGet><PtoVenta><Nro>1</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>20260231</FchBaja></PtoVenta></ResultGet>",
      ),
    ],
    [
      "Nro inválido",
      respuestaPuntosVenta(
        "<ResultGet><PtoVenta><Nro>0</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado></PtoVenta></ResultGet>",
      ),
    ],
    [
      "código inválido",
      respuestaPuntosVenta(erroresPuntosVenta(["NO_REFLEJAR"])),
    ],
    [
      "Events inválido",
      respuestaPuntosVenta(
        "<Events><Evt><Code>NO_REFLEJAR</Code></Evt></Events>",
      ),
    ],
  ] as [string, string][]
) {
  test("PV malformación queda error seguro: " + name, async () => {
    eq(
      (await falloPuntosVenta(xml)).codigo,
      "WSFE_PUNTOS_VENTA_RESPUESTA_INVALIDA",
    );
  });
}
test("PV lista vacía cumple WSDL con ResultGet opcional y eventos informativos", async () => {
  for (
    const body of [
      "",
      "<ResultGet/>",
      "<ResultGet/><Errors/>",
      "<Events><Evt><Code>1</Code><Msg>NO_REFLEJAR</Msg></Evt></Events>",
    ]
  ) {
    const result = await new WsfeClient(config, {
      obtener: () => Promise.resolve(ticket),
    }, red(async () => new Response(respuestaPuntosVenta(body)))).diagnosticar(
      snapshot.identidad.cuit,
    );
    eq(result, {
      autenticado: true,
      ambiente: "homologacion",
      servicio: "wsfe",
      puntosVenta: [],
    });
    assert(!JSON.stringify(result).includes("NO_REFLEJAR"));
  }
});
test("PV diagnostica dos veces reutilizando TA cifrado sin segundoLogin", async () => {
  const cache = new MemoryCache();
  let logins = 0, consultas = 0;
  const wsaa = new WsaaClient(
    config,
    () => Promise.resolve(cred),
    cache,
    master,
    {
      ahora: () => now,
      uniqueId: () => 4325399,
      red: red(async () => {
        logins++;
        return new Response(ta("383953094"));
      }),
    },
  );
  const client = new WsfeClient(
    config,
    wsaa,
    red(async () => {
      consultas++;
      return new Response(respuestaPuntosVenta("<ResultGet/>"));
    }),
  );
  await client.diagnosticar(snapshot.identidad.cuit);
  await client.diagnosticar(snapshot.identidad.cuit);
  eq([logins, consultas], [1, 2]);
  assert(cache.entry?.sobre && !cache.entry.sobre.includes(ticket.token));
});
test("PV conserva errores WSAA/configuración y separa transporte", async () => {
  let sends = 0;
  const wsaaError = new ArcaAccesoError(
    "WSAA_TICKET_EXISTENTE",
    "Mensaje fijo",
  );
  const wsaaPort = new WsfeClient(
    config,
    { obtener: () => Promise.reject(wsaaError) },
    red(async () => {
      sends++;
      return new Response("");
    }),
  );
  await rejects(
    () => wsaaPort.diagnosticar(snapshot.identidad.cuit),
    "WSAA_TICKET_EXISTENTE",
  );
  eq(sends, 0);
  const gate = new WsfeClient({ ...config, habilitado: false }, {
    obtener: () => {
      sends++;
      return Promise.resolve(ticket);
    },
  });
  await rejects(() => gate.diagnosticar(snapshot.identidad.cuit));
  eq(sends, 0);
  await rejects(
    () =>
      new WsfeClient(
        config,
        { obtener: () => Promise.resolve(ticket) },
        red(async () => {
          throw new Error("NO_REFLEJAR");
        }),
      ).diagnosticar(snapshot.identidad.cuit),
    "WSFE_PUNTOS_VENTA_NO_DISPONIBLE",
  );
});
test("mensajes remotos arbitrarios no se reflejan en evidencia ni resultados", () => {
  const input = rejected.replace(
    "Dato sintético rechazado",
    ticket.token + " " + ticket.sign + " TEXTO_NO_REFLEJAR",
  );
  const result = clasificarSolicitudWsfe(input, snapshot);
  assert(
    !JSON.stringify(result).includes(ticket.token) &&
      !JSON.stringify(result).includes(ticket.sign),
  );
});
test("configuración adulterada no habilita endpoints distintos del ambiente cerrado", async () => {
  let reads = 0, sends = 0;
  const changed = structuredClone(config);
  Object.defineProperty(changed, "wsfeUrl", {
    value: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  });
  const port = new WsfeClient(
    changed,
    {
      obtener: () => {
        reads++;
        return Promise.resolve(ticket);
      },
    },
    red(async () => {
      sends++;
      return new Response(approved);
    }),
  );
  await rejects(() => port.solicitar(snapshot));
  eq([reads, sends], [0, 0]);
});
test("TA destinado a otra pareja se rechaza antes de usarlo o guardarlo", async () => {
  const cache = new MemoryCache();
  const xml = ta(
    "42",
    ticket.vencimiento,
    ticket.generacion,
    "CN=Otro receptor",
  );
  await rejects(() =>
    new WsaaClient(config, () => Promise.resolve(cred), cache, master, {
      red: red(async () => new Response(xml)),
      ahora: () => now,
      uniqueId: () => 42,
    }).obtener()
  );
  eq(cache.entry, null);
});

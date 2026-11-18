// deno-lint-ignore-file require-await
// Fixtures sólo sintéticas; no credenciales, base ni red real.
import { AppError } from "@core/index.ts";
import {
  ArcaConfiguracionError,
  ConsultarSerieFiscalUseCase,
  leerConfiguracionArca,
  type PuertoArca,
  WsfeClient,
} from "@modules/fiscal/index.ts";
import {
  arcaHandler as produccionHandler,
  crearArcaHandler,
} from "../functions/arca/app.ts";
const arcaHandler = (req: Request, deps: DependenciasConsultaSerie) =>
  crearArcaHandler(deps)(req);
import type { DependenciasConsultaSerie } from "../functions/arca/consulta-serie.ts";
import type { ResultadoUltimoArca } from "../functions/_shared/modules/fiscal/domain/resultado-arca.ts";
function assert(value: unknown, message = "Aserción fallida"): asserts value {
  if (!value) throw new Error(message);
}
function eq(a: unknown, b: unknown) {
  assert(JSON.stringify(a) === JSON.stringify(b), "Valores distintos");
}
function fixture(
  result: ResultadoUltimoArca = { tipo: "obtenido", numero: "0" },
) {
  const calls: string[] = [];
  let identity: unknown;
  const forbidden = async () => {
    calls.push("PROHIBIDO");
    throw new Error("No debe ejecutarse");
  };
  const port: PuertoArca = {
    obtenerUltimoAutorizado: async (id) => {
      calls.push("ultimo");
      identity = id;
      return result;
    },
    diagnosticar: forbidden,
    solicitar: forbidden,
    consultar: forbidden,
  };
  const deps: DependenciasConsultaSerie = {
    autorizar: async (roles) => {
      eq(roles, ["admin"]);
      calls.push("admin");
    },
    leerClub: async () => {
      calls.push("club");
      return { cuit: "20-00000000-1", punto_venta: 1 };
    },
    crearPuerto: () => {
      calls.push("puerto");
      return port;
    },
  };
  return { calls, deps, identity: () => identity, port };
}
function req(
  body = '{"tipoComprobante":11}',
  path = "/arca/diagnostico/serie",
  headers: Record<string, string> = {},
) {
  return new Request("http://localhost" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
const publicKeys = [
  "ambiente",
  "codigos",
  "operacion",
  "puntoVentaConfigurado",
  "resultado",
  "servicio",
  "tipoComprobante",
  "ultimoAutorizado",
];
for (
  const path of [
    "/arca/diagnostico/serie",
    "/functions/v1/arca/diagnostico/serie",
  ]
) {
  Deno.test(
    "serie aislada enruta " + path + " y preserva cero sin emitir",
    async () => {
      const f = fixture();
      const response = await arcaHandler(req(undefined, path), f.deps);
      eq(response.status, 200);
      const body = await response.json();
      eq(Object.keys(body).sort(), publicKeys);
      eq(body, {
        ambiente: "homologacion",
        servicio: "wsfe",
        operacion: "FECompUltimoAutorizado",
        puntoVentaConfigurado: 1,
        tipoComprobante: 11,
        resultado: "obtenido",
        ultimoAutorizado: "0",
        codigos: [],
      });
      eq(f.identity(), {
        cuit: "20000000001",
        puntoVenta: 1,
        tipoComprobante: 11,
        ambiente: "homologacion",
      });
      eq(f.calls, ["admin", "club", "puerto", "ultimo"]);
    },
  );
}
for (const status of [401, 403]) {
  Deno.test(
    "serie exige Admin activo antes de leer club/crear cliente: " + status,
    async () => {
      const f = fixture();
      f.deps.autorizar = async (roles) => {
        eq(roles, ["admin"]);
        throw new AppError("Sin permiso", status);
      };
      const response = await arcaHandler(req(), f.deps);
      eq(response.status, status);
      eq(f.calls, []);
    },
  );
}
for (
  const body of [
    "{}",
    "[]",
    "null",
    "{",
    '{"tipoComprobante":"11"}',
    '{"tipoComprobante":0}',
    '{"tipoComprobante":1000}',
    '{"tipoComprobante":1.1}',
    '{"tipoComprobante":true}',
    '{"tipoComprobante":11,"cuit":"20000000001"}',
    '{"tipoComprobante":11,"puntoVenta":2}',
    '{"tipoComprobante":11,"ambiente":"produccion"}',
    '{"tipoComprobante":11,"tipoComprobante":1}',
    '{"tipoComprobante":11,"\u0074ipoComprobante":1}',
  ]
) {
  Deno.test("serie rechaza cuerpo cerrado inválido " + body, async () => {
    const f = fixture();
    const response = await arcaHandler(req(body), f.deps);
    eq(response.status, 400);
    eq(f.calls, ["admin"]);
  });
}
Deno.test("serie limita bytes declarados y reales sin leer club", async () => {
  for (
    const [body, headers] of [['{"tipoComprobante":11}', {
      "content-length": "2049",
    }], [" ".repeat(2049) + '{"tipoComprobante":11}', {}]] as const
  ) {
    const f = fixture();
    const response = await arcaHandler(req(body, undefined, headers), f.deps);
    eq(response.status, 413);
    eq(f.calls, ["admin"]);
  }
  const f = fixture();
  const response = await arcaHandler(
    req(undefined, undefined, { "content-type": "text/plain" }),
    f.deps,
  );
  eq(response.status, 415);
  eq(f.calls, ["admin"]);
});
for (const method of ["GET", "DELETE", "PUT"]) {
  Deno.test("serie no ejecuta por método " + method, async () => {
    const f = fixture();
    const response = await arcaHandler(
      new Request("http://localhost/arca/diagnostico/serie", { method }),
      f.deps,
    );
    eq(response.status, 405);
    eq(f.calls, []);
  });
}
Deno.test("preflight de serie no crea cliente ni consulta", async () => {
  const f = fixture();
  const response = await arcaHandler(
    new Request("http://localhost/arca/diagnostico/serie", {
      method: "OPTIONS",
    }),
    f.deps,
  );
  eq(response.status, 200);
  eq(f.calls, []);
});
for (const number of ["1", "42", "999999999999"]) {
  Deno.test(
    "serie conserva número canónico " + number + " sin tomar el siguiente",
    async () => {
      const f = fixture({ tipo: "obtenido", numero: number });
      const response = await arcaHandler(req(), f.deps);
      const body = await response.json();
      eq(body.ultimoAutorizado, number);
      eq(body.resultado, "obtenido");
      eq(f.calls, ["admin", "club", "puerto", "ultimo"]);
    },
  );
}
for (
  const number of [
    "",
    "00",
    "01",
    "-1",
    "+1",
    "1.0",
    "1e2",
    "1000000000000",
    "RAW_SECRET",
  ]
) {
  Deno.test(
    "serie no inventa cero ante numeración no confiable " + number,
    async () => {
      const f = fixture({ tipo: "obtenido", numero: number });
      const response = await arcaHandler(req(), f.deps);
      const body = await response.json();
      eq(body.resultado, "no_disponible");
      eq(body.ultimoAutorizado, null);
      eq(body.codigos[0].codigo, "WSFE_SERIE_NO_CONFIRMADA");
      assert(!JSON.stringify(body).includes("RAW_SECRET"));
    },
  );
}
for (
  const code of [
    "600",
    "601",
    "602",
    "11002",
    "12345",
    "WSAA_TICKET_EXISTENTE",
    "ARCA_ULTIMO_NO_CONFIRMADO",
  ]
) {
  Deno.test(
    "serie conserva código seguro " + code + " con mensaje propio",
    async () => {
      const f = fixture({
        tipo: "no_disponible",
        codigos: [{ codigo: code, mensaje: "RAW_SECRET token/sign CUIT" }],
      });
      const response = await arcaHandler(req(), f.deps);
      const body = await response.json();
      eq(response.status, 200);
      eq(body.resultado, "no_disponible");
      eq(body.ultimoAutorizado, null);
      eq(body.codigos[0].codigo, code);
      assert(body.codigos[0].mensaje.length <= 512);
      assert(!JSON.stringify(body).includes("RAW_SECRET"));
      eq(Object.keys(body).sort(), publicKeys);
      eq(f.calls, ["admin", "club", "puerto", "ultimo"]);
    },
  );
}
Deno.test("serie descarta códigos arbitrarios, exceso y propiedades privadas", async () => {
  for (
    const codigos of [
      [{ codigo: "RAW_SECRET", mensaje: "RAW_SECRET" }],
      Array.from(
        { length: 31 },
        () => ({ codigo: "11002", mensaje: "RAW_SECRET" }),
      ),
    ]
  ) {
    const f = fixture({ tipo: "no_disponible", codigos });
    const response = await arcaHandler(req(), f.deps);
    const body = await response.json();
    eq(body.codigos[0].codigo, "WSFE_SERIE_NO_CONFIRMADA");
    assert(!JSON.stringify(body).includes("RAW_SECRET"));
  }
  const f = fixture(
    {
      ...{ tipo: "obtenido" as const, numero: "0" },
      token: "RAW_SECRET",
      sign: "RAW_SECRET",
      cuit: "RAW_SECRET",
    } as ResultadoUltimoArca,
  );
  const response = await arcaHandler(req(), f.deps);
  assert(!JSON.stringify(await response.json()).includes("RAW_SECRET"));
});
Deno.test("serie no usa CUIT/PV coercionados o inválidos de configuración", async () => {
  for (
    const club of [
      { cuit: null, punto_venta: 1 },
      { cuit: "RAW_SECRET", punto_venta: 1 },
      { cuit: "20-00000000-1", punto_venta: "1" },
      { cuit: "20-00000000-1", punto_venta: 0 },
    ]
  ) {
    let calls = 0;
    const service = new ConsultarSerieFiscalUseCase({
      obtenerUltimoAutorizado: async () => {
        calls++;
        return { tipo: "obtenido", numero: "0" };
      },
    });
    let rejected = false;
    try {
      await service.ejecutar(club, 11);
    } catch {
      rejected = true;
    }
    assert(rejected);
    eq(calls, 0);
  }
});
Deno.test("serie conserva gate cerrado y mensajes sin referencias a cobros", async () => {
  const f = fixture();
  f.deps.crearPuerto = () => {
    throw new ArcaConfiguracionError("RAW_SECRET");
  };
  const response = await arcaHandler(req(), f.deps);
  eq(response.status, 503);
  const text = JSON.stringify(await response.json());
  assert(!text.includes("RAW_SECRET"));
  assert(!text.includes("cobro"));
  assert(text.includes("No se solicitó CAE"));
  assert(!f.calls.includes("ultimo"));
});

Deno.test("serie respeta gate deshabilitado antes de WSAA y red reales", async () => {
  let authCalls = 0, networkCalls = 0;
  const config = leerConfiguracionArca({
    get: (key) =>
      ({
        ARCA_ENVIRONMENT: "homologacion",
        ARCA_EXTERNAL_ENABLED: "false",
      } as Record<string, string>)[key],
  });
  const port = new WsfeClient(config, {
    obtener: async () => {
      authCalls++;
      throw new Error("No debe solicitar TA");
    },
  }, async () => {
    networkCalls++;
    throw new Error("No debe consultar red");
  });
  const f = fixture();
  f.deps.crearPuerto = () => port;
  const response = await arcaHandler(req(), f.deps);
  const body = await response.json();
  eq(body.resultado, "no_disponible");
  eq(body.ultimoAutorizado, null);
  eq(authCalls, 0);
  eq(networkCalls, 0);
});
Deno.test("serie rechaza MIME que sólo empieza con application/json", async () => {
  const f = fixture();
  const response = await arcaHandler(
    req(undefined, undefined, {
      "content-type": "application/json-malformado",
    }),
    f.deps,
  );
  eq(response.status, 415);
  eq(f.calls, ["admin"]);
});

Deno.test("serie integrada SOAP: cero, rechazo11002 y respuesta de otra serie", async () => {
  const config = leerConfiguracionArca({
    get: (key) =>
      ({
        ARCA_ENVIRONMENT: "homologacion",
        ARCA_EXTERNAL_ENABLED: "true",
      } as Record<string, string>)[key],
  });
  for (const mode of ["cero", "rechazo", "otra-serie"]) {
    let calls = 0;
    const port = new WsfeClient(config, {
      obtener: async () => ({
        token: "SOLO_SINTETICO",
        sign: "SOLO_SINTETICO",
        generacion: "2026-01-01T00:00:00Z",
        vencimiento: "2026-01-01T01:00:00Z",
      }),
    }, async (input, init) => {
      calls++;
      eq(String(input), config.wsfeUrl);
      const sent = String(init?.body);
      assert(sent.includes("<FECompUltimoAutorizado"));
      assert(sent.includes("<PtoVta>1</PtoVta>"));
      assert(sent.includes("<CbteTipo>11</CbteTipo>"));
      assert(!sent.includes("FEParamGetPtosVenta"));
      assert(!sent.includes("FECAESolicitar"));
      const data = mode === "rechazo"
        ? "<Errors><Err><Code>11002</Code><Msg>RAW_SECRET</Msg></Err></Errors>"
        : `<PtoVta>1</PtoVta><CbteTipo>${
          mode === "otra-serie" ? 6 : 11
        }</CbteTipo><CbteNro>0</CbteNro>`;
      const xml =
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult>${data}</FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></s:Body></s:Envelope>`;
      return new Response(xml);
    });
    const f = fixture();
    f.deps.crearPuerto = () => port;
    const response = await arcaHandler(req(), f.deps);
    const body = await response.json();
    eq(calls, 1);
    assert(!JSON.stringify(body).includes("RAW_SECRET"));
    assert(!JSON.stringify(body).includes("SOLO_SINTETICO"));
    if (mode === "cero") {
      eq(body.resultado, "obtenido");
      eq(body.ultimoAutorizado, "0");
      eq(body.codigos, []);
    } else {
      eq(body.resultado, "no_disponible");
      eq(body.ultimoAutorizado, null);
      eq(
        body.codigos[0].codigo,
        mode === "rechazo" ? "11002" : "ARCA_ULTIMO_NO_CONFIRMADO",
      );
    }
  }
});

Deno.test("callback público mantiene un único argumento y no confunde ServeHandlerInfo con dependencias", async () => {
  eq(produccionHandler.length, 1);
  const f = fixture();
  const runtimeHandler = crearArcaHandler(f.deps) as (
    req: Request,
    info: unknown,
  ) => Promise<Response>;
  const response = await runtimeHandler(req(), {
    remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 },
  });
  eq(response.status, 200);
  eq(f.calls, ["admin", "club", "puerto", "ultimo"]);
});

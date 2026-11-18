import { describe, expect, test } from "bun:test";
import {
  ErrorConfiguracionFiscalLocal,
  INTERVALO_FISCAL_LOCAL_MS,
  MAX_RESPUESTA_BYTES,
  calcularSiguienteEsperaMs,
  ejecutarProcesadorFiscalLocal,
  leerConfiguracionFiscalLocal,
  parsearArgsFiscalLocal,
  procesarFiscalUnaVez,
} from "../scripts/procesar-fiscal-local.ts";

const SECRETO_VALIDO = "s".repeat(32);
const UUID_EJECUCION = "00000000-0000-4000-8000-000000000001";

function crearResumen(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    ejecucionId: UUID_EJECUCION,
    evaluados: 0,
    iniciados: 0,
    recuperados: 0,
    autorizados: 0,
    rechazados: 0,
    pendientes: 0,
    expirados: 0,
    omitidos: 0,
    errores: [],
    hayMas: false,
    ...parcial,
  };
}

describe("configuración local del invocador fiscal", () => {
  test("acepta FISCAL_PUBLIC_BASE_URL válida sobre loopback sin depender de ARCHIVOS_PUBLIC_BASE_URL", () => {
    const ipv4 = leerConfiguracionFiscalLocal({
      FISCAL_PUBLIC_BASE_URL: "http://127.0.0.1:54321/functions/v1/fiscal-worker",
      FISCAL_WORKER_SECRET: SECRETO_VALIDO,
      ARCHIVOS_PUBLIC_BASE_URL: "http://host.docker.internal:54321",
    });
    expect(ipv4).toEqual({
      urlPendientes:
        "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
      secreto: SECRETO_VALIDO,
    });

    const ipv6 = leerConfiguracionFiscalLocal({
      FISCAL_PUBLIC_BASE_URL: "http://[::1]:54321/functions/v1/fiscal-worker/",
      FISCAL_WORKER_SECRET: SECRETO_VALIDO,
    });
    expect(ipv6.urlPendientes).toBe(
      "http://[::1]:54321/functions/v1/fiscal-worker/procesar-pendientes",
    );

    const localhostPuerto = leerConfiguracionFiscalLocal({
      FISCAL_PUBLIC_BASE_URL: "http://localhost:55432/functions/v1/fiscal-worker",
      FISCAL_WORKER_SECRET: SECRETO_VALIDO,
    });
    expect(localhostPuerto.urlPendientes).toBe(
      "http://localhost:55432/functions/v1/fiscal-worker/procesar-pendientes",
    );
  });

  test("rechaza URL ausente, remota, https, credenciales, query o rutas distintas", () => {
    expect(() =>
      leerConfiguracionFiscalLocal({
        FISCAL_WORKER_SECRET: SECRETO_VALIDO,
      }),
    ).toThrow(ErrorConfiguracionFiscalLocal);

    const basesInvalidas = [
      "",
      "https://proyecto.supabase.co/functions/v1/fiscal-worker",
      "http://10.0.0.15:54321/functions/v1/fiscal-worker",
      "http://user:pass@127.0.0.1:54321/functions/v1/fiscal-worker",
      "http://127.0.0.1:54321/functions/v1/fiscal-worker?x=1",
      "http://127.0.0.1:54321",
      "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
      "http://127.0.0.1:54321/functions/v1/arca",
      "no-es-url",
    ];
    for (const base of basesInvalidas) {
      expect(() =>
        leerConfiguracionFiscalLocal({
          FISCAL_WORKER_SECRET: SECRETO_VALIDO,
          FISCAL_PUBLIC_BASE_URL: base,
        }),
      ).toThrow(ErrorConfiguracionFiscalLocal);
    }
  });

  test("exige secreto >= 32 chars sin espacios extremos, saltos ni reutilización", () => {
    expect(() =>
      leerConfiguracionFiscalLocal({
        FISCAL_PUBLIC_BASE_URL:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker",
      }),
    ).toThrow(ErrorConfiguracionFiscalLocal);
    expect(() =>
      leerConfiguracionFiscalLocal({
        FISCAL_PUBLIC_BASE_URL:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker",
        FISCAL_WORKER_SECRET: "corto",
      }),
    ).toThrow(ErrorConfiguracionFiscalLocal);
    expect(() =>
      leerConfiguracionFiscalLocal({
        FISCAL_PUBLIC_BASE_URL:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker",
        FISCAL_WORKER_SECRET: ` ${SECRETO_VALIDO}`,
      }),
    ).toThrow(ErrorConfiguracionFiscalLocal);
    expect(() =>
      leerConfiguracionFiscalLocal({
        FISCAL_PUBLIC_BASE_URL:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker",
        FISCAL_WORKER_SECRET: `${SECRETO_VALIDO} `,
      }),
    ).toThrow(ErrorConfiguracionFiscalLocal);
    expect(() =>
      leerConfiguracionFiscalLocal({
        FISCAL_PUBLIC_BASE_URL:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker",
        FISCAL_WORKER_SECRET: `${SECRETO_VALIDO}\n`,
      }),
    ).toThrow(ErrorConfiguracionFiscalLocal);
    expect(() =>
      leerConfiguracionFiscalLocal({
        FISCAL_PUBLIC_BASE_URL:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker",
        FISCAL_WORKER_SECRET: SECRETO_VALIDO,
        MAIL_WORKER_SECRET: SECRETO_VALIDO,
      }),
    ).toThrow(ErrorConfiguracionFiscalLocal);
    expect(() =>
      leerConfiguracionFiscalLocal({
        FISCAL_PUBLIC_BASE_URL:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker",
        FISCAL_WORKER_SECRET: SECRETO_VALIDO,
        SUPABASE_SERVICE_ROLE_KEY: SECRETO_VALIDO,
      }),
    ).toThrow(ErrorConfiguracionFiscalLocal);
  });

  test("parsearArgsFiscalLocal admite --once y rechaza flags desconocidos", () => {
    expect(parsearArgsFiscalLocal([])).toEqual({ once: false });
    expect(parsearArgsFiscalLocal(["--once"])).toEqual({ once: true });
    expect(() => parsearArgsFiscalLocal(["--otro"])).toThrow(
      ErrorConfiguracionFiscalLocal,
    );
  });
});

describe("invocación única al worker fiscal local", () => {
  test("envía POST vacío con x-fiscal-worker-secret y redirect error", async () => {
    let recibidoUrl = "";
    let recibidoInit: RequestInit | undefined;

    const res = await procesarFiscalUnaVez(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        fetcher: async (input, init) => {
          recibidoUrl = String(input);
          recibidoInit = init;
          return new Response(
            JSON.stringify(
              crearResumen({
                evaluados: 2,
                autorizados: 1,
                errores: [{ comprobanteId: "1", codigo: "TEMP" }],
              }),
            ),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      },
    );

    expect(recibidoUrl).toBe(
      "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
    );
    expect(recibidoInit?.method).toBe("POST");
    expect(recibidoInit?.body).toBeUndefined();
    expect(recibidoInit?.redirect).toBe("error");
    expect(
      (recibidoInit?.headers as Record<string, string>)["x-fiscal-worker-secret"],
    ).toBe(SECRETO_VALIDO);

    expect(res).toEqual({
      ok: true,
      status: 200,
      resumen: {
        ejecucionId: UUID_EJECUCION,
        evaluados: 2,
        iniciados: 0,
        recuperados: 0,
        autorizados: 1,
        rechazados: 0,
        pendientes: 0,
        expirados: 0,
        omitidos: 0,
        errores: 1,
        hayMas: false,
      },
    });
  });

  test("no expone cuerpos HTTP arbitrarios en errores y conserva ejecucionId válido en 503", async () => {
    const res503 = await procesarFiscalUnaVez(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        fetcher: async () =>
          new Response(
            JSON.stringify({
              ejecucionId: UUID_EJECUCION,
              error: `Dato sensible o secreto ${SECRETO_VALIDO}`,
            }),
            { status: 503 },
          ),
      },
    );

    expect(res503).toEqual({
      ok: false,
      status: 503,
      codigo: "HTTP_503",
      ejecucionId: UUID_EJECUCION,
      detalle: "El worker fiscal respondió con estado HTTP 503.",
    });

    const resInvalida = await procesarFiscalUnaVez(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        fetcher: async () =>
          new Response(JSON.stringify({ ejecucionId: "no-uuid" }), {
            status: 200,
          }),
      },
    );
    expect(resInvalida).toMatchObject({
      ok: false,
      status: 200,
      codigo: "RESPUESTA_INVALIDA",
      ejecucionId: null,
    });

    const resGigante = await procesarFiscalUnaVez(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        fetcher: async () =>
          new Response(" ".repeat(MAX_RESPUESTA_BYTES), { status: 200 }),
      },
    );
    expect(resGigante).toMatchObject({
      ok: false,
      status: 200,
      codigo: "RESPUESTA_INVALIDA",
    });
  });

  test("ante timeout o fallo de red devuelve INVOCACION_NO_CONFIRMADA sin exponer mensajes crudos", async () => {
    const resTimeout = await procesarFiscalUnaVez(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        timeoutMs: 15,
        fetcher: (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      },
    );

    expect(resTimeout).toMatchObject({
      ok: false,
      status: null,
      codigo: "INVOCACION_NO_CONFIRMADA",
      ejecucionId: null,
    });

    const resRed = await procesarFiscalUnaVez(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        fetcher: async () => Promise.reject(new Error(`fallo ${SECRETO_VALIDO}`)),
      },
    );
    expect(resRed).toEqual({
      ok: false,
      status: null,
      codigo: "INVOCACION_NO_CONFIRMADA",
      ejecucionId: null,
      detalle:
        "Error de transporte o invocación no confirmada al contactar al worker fiscal.",
    });
  });
});

describe("cadencia anclada y bucle del invocador fiscal local", () => {
  test("calcularSiguienteEsperaMs ancla al intervalo sin ráfagas tras retraso o salto", () => {
    expect(
      calcularSiguienteEsperaMs(1_250, 1_000, INTERVALO_FISCAL_LOCAL_MS),
    ).toEqual({
      esperaMs: 59_750,
      siguienteAnclaMs: 61_000,
    });
    expect(
      calcularSiguienteEsperaMs(136_000, 61_000, INTERVALO_FISCAL_LOCAL_MS),
    ).toEqual({
      esperaMs: 45_000,
      siguienteAnclaMs: 181_000,
    });
  });

  test("modo --once registra resumen sanitizado y refleja estado en exit code", async () => {
    const logs: string[] = [];
    const errores: string[] = [];

    const okCode = await ejecutarProcesadorFiscalLocal(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        once: true,
        ahora: () => 1_700_000_000_000,
        log: (l) => logs.push(l),
        errorLog: (l) => errores.push(l),
        fetcher: async () =>
          new Response(JSON.stringify(crearResumen()), { status: 200 }),
      },
    );

    expect(okCode).toBe(0);
    expect(logs.length).toBe(1);
    expect(errores.length).toBe(0);
    expect(logs[0]).not.toContain(SECRETO_VALIDO);

    const failCode = await ejecutarProcesadorFiscalLocal(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        once: true,
        ahora: () => 1_700_000_000_000,
        log: (l) => logs.push(l),
        errorLog: (l) => errores.push(l),
        fetcher: async () =>
          Promise.reject(new Error(`fallo ${SECRETO_VALIDO}`)),
      },
    );

    expect(failCode).toBe(1);
    expect(errores.length).toBe(1);
    expect(errores[0]).not.toContain(SECRETO_VALIDO);
    expect(errores[0]).toContain("INVOCACION_NO_CONFIRMADA");
  });

  test("bucle continuo tolera despertar temprano, omite logs ociosos y respeta cancelación", async () => {
    const logs: string[] = [];
    const esperas: number[] = [];
    const controller = new AbortController();
    let ahoraMs = 1_000;
    let tick = 0;
    let primerDespertarTemprano = true;

    const code = await ejecutarProcesadorFiscalLocal(
      {
        urlPendientes:
          "http://127.0.0.1:54321/functions/v1/fiscal-worker/procesar-pendientes",
        secreto: SECRETO_VALIDO,
      },
      {
        once: false,
        intervaloMs: 60_000,
        ahora: () => ahoraMs,
        signal: controller.signal,
        log: (l) => logs.push(l),
        errorLog: (l) => logs.push(l),
        fetcher: async () => {
          tick += 1;
          ahoraMs += tick === 1 ? 500 : 75_000;
          return new Response(
            JSON.stringify(
              tick === 2
                ? crearResumen({ evaluados: 1, autorizados: 1 })
                : crearResumen(),
            ),
            { status: 200 },
          );
        },
        esperar: async (ms) => {
          esperas.push(ms);
          if (primerDespertarTemprano) {
            primerDespertarTemprano = false;
            ahoraMs += ms - 10;
            return;
          }
          ahoraMs += ms;
          if (tick >= 2) controller.abort();
        },
      },
    );

    expect(code).toBe(0);
    expect(tick).toBe(2);
    expect(esperas).toEqual([59_500, 10, 45_000]);
    expect(logs.length).toBe(3);
    expect(logs[1]).toContain('"autorizados":1');
  });
});

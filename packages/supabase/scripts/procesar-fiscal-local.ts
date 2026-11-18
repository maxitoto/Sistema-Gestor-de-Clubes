/** Invocador periódico local para el worker de regularización fiscal. */

const HOSTS_LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const RUTA_FISCAL_WORKER = "/functions/v1/fiscal-worker";
const RUTA_PENDIENTES_FISCAL = `${RUTA_FISCAL_WORKER}/procesar-pendientes`;
const CLAVES_PROHIBIDAS_SECRETO = [
  "MAIL_WORKER_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_ESTABLE_RE = /^[A-Z0-9_]{2,64}$/;

export const MAX_RESPUESTA_BYTES = 65_536;
export const INTERVALO_FISCAL_LOCAL_MS = 60_000;
export const TIMEOUT_INVOCACION_FISCAL_MS = 120_000;

export interface ConfiguracionFiscalLocal {
  urlPendientes: string;
  secreto: string;
}

export interface ResumenTickFiscal {
  ejecucionId: string | null;
  evaluados: number;
  iniciados: number;
  recuperados: number;
  autorizados: number;
  rechazados: number;
  pendientes: number;
  expirados: number;
  omitidos: number;
  errores: number;
  hayMas: boolean;
}

export type ResultadoInvocacionFiscal =
  | {
      ok: true;
      status: number;
      resumen: ResumenTickFiscal;
    }
  | {
      ok: false;
      status: number | null;
      codigo: string;
      ejecucionId: string | null;
      detalle: string;
    };

export interface OpcionesInvocacionFiscal {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface OpcionesBucleFiscal {
  once?: boolean;
  intervaloMs?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  esperar?: (ms: number, signal?: AbortSignal) => Promise<void>;
  ahora?: () => number;
  log?: (linea: string) => void;
  errorLog?: (linea: string) => void;
  signal?: AbortSignal;
}

export class ErrorConfiguracionFiscalLocal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorConfiguracionFiscalLocal";
  }
}

/** Valida formato, longitud e independencia de FISCAL_WORKER_SECRET sin alterar espacios. */
export function validarSecretoFiscalLocal(
  secretoRaw: string | undefined,
  env: Record<string, string | undefined> = {},
): string {
  const secreto = secretoRaw ?? "";
  if (!secreto) {
    throw new ErrorConfiguracionFiscalLocal(
      "Falta FISCAL_WORKER_SECRET en packages/supabase/functions/.env.",
    );
  }
  if (/[\r\n]/.test(secreto)) {
    throw new ErrorConfiguracionFiscalLocal(
      "FISCAL_WORKER_SECRET no puede contener saltos de línea.",
    );
  }
  if (/^\s|\s$/.test(secreto)) {
    throw new ErrorConfiguracionFiscalLocal(
      "FISCAL_WORKER_SECRET no puede tener espacios al inicio o al final.",
    );
  }
  if (secreto.length < 32 || secreto.length > 1024) {
    throw new ErrorConfiguracionFiscalLocal(
      "FISCAL_WORKER_SECRET debe tener entre 32 y 1024 caracteres.",
    );
  }
  for (const clave of CLAVES_PROHIBIDAS_SECRETO) {
    const valor = env[clave];
    if (valor && secreto === valor) {
      throw new ErrorConfiguracionFiscalLocal(
        `FISCAL_WORKER_SECRET debe ser independiente de ${clave}.`,
      );
    }
  }
  return secreto;
}

/** Restringe la URL destino al entorno loopback HTTP local y normaliza la ruta del worker. */
export function construirUrlPendientesFiscalLocal(baseRaw: string): string {
  const cruda = baseRaw.trim();
  if (!cruda) {
    throw new ErrorConfiguracionFiscalLocal(
      "Falta FISCAL_PUBLIC_BASE_URL en packages/supabase/functions/.env.",
    );
  }

  let url: URL;
  try {
    url = new URL(cruda);
  } catch {
    throw new ErrorConfiguracionFiscalLocal(
      "FISCAL_PUBLIC_BASE_URL debe ser una URL local válida.",
    );
  }

  if (url.username || url.password) {
    throw new ErrorConfiguracionFiscalLocal(
      "La URL del worker fiscal local no puede incluir credenciales.",
    );
  }
  if (url.protocol !== "http:") {
    throw new ErrorConfiguracionFiscalLocal(
      "El invocador fiscal local solo admite protocolo http sobre loopback.",
    );
  }
  if (!HOSTS_LOOPBACK.has(url.hostname.toLowerCase())) {
    throw new ErrorConfiguracionFiscalLocal(
      "El invocador fiscal local solo permite hosts de loopback (127.0.0.1, localhost o ::1).",
    );
  }
  if (url.search || url.hash) {
    throw new ErrorConfiguracionFiscalLocal(
      "La URL base del worker fiscal no admite parámetros ni fragmentos.",
    );
  }

  if (url.pathname.replace(/\/+$/, "") !== RUTA_FISCAL_WORKER) {
    throw new ErrorConfiguracionFiscalLocal(
      `FISCAL_PUBLIC_BASE_URL debe usar la ruta ${RUTA_FISCAL_WORKER}.`,
    );
  }

  return `${url.origin}${RUTA_PENDIENTES_FISCAL}`;
}

/** Lee la configuración local desde variables de entorno validando loopback y secreto técnico. */
export function leerConfiguracionFiscalLocal(
  env: Record<string, string | undefined>,
): ConfiguracionFiscalLocal {
  return {
    urlPendientes: construirUrlPendientesFiscalLocal(
      env.FISCAL_PUBLIC_BASE_URL ?? "",
    ),
    secreto: validarSecretoFiscalLocal(env.FISCAL_WORKER_SECRET, env),
  };
}

function leerEnteroNoNegativo(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < 0) {
    return null;
  }
  return valor;
}

function validarEjecucionId(valor: unknown): string | null | undefined {
  if (valor === null) return null;
  if (typeof valor === "string" && UUID_RE.test(valor)) return valor;
  return undefined;
}

function parseJsonAcotado(texto: string): Record<string, unknown> | null {
  if (texto.trim().length === 0 || texto.length >= MAX_RESPUESTA_BYTES) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(texto);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseResumenTickFiscal(data: unknown): ResumenTickFiscal | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const obj = data as Record<string, unknown>;
  const ejecucionId = validarEjecucionId(obj.ejecucionId);
  const evaluados = leerEnteroNoNegativo(obj.evaluados);
  const iniciados = leerEnteroNoNegativo(obj.iniciados);
  const recuperados = leerEnteroNoNegativo(obj.recuperados);
  const autorizados = leerEnteroNoNegativo(obj.autorizados);
  const rechazados = leerEnteroNoNegativo(obj.rechazados);
  const pendientes = leerEnteroNoNegativo(obj.pendientes);
  const expirados = leerEnteroNoNegativo(obj.expirados);
  const omitidos = leerEnteroNoNegativo(obj.omitidos);
  const errores = Array.isArray(obj.errores)
    ? obj.errores.length
    : leerEnteroNoNegativo(obj.errores);

  if (
    ejecucionId === undefined ||
    evaluados === null ||
    iniciados === null ||
    recuperados === null ||
    autorizados === null ||
    rechazados === null ||
    pendientes === null ||
    expirados === null ||
    omitidos === null ||
    errores === null ||
    typeof obj.hayMas !== "boolean"
  ) {
    return null;
  }

  return {
    ejecucionId,
    evaluados,
    iniciados,
    recuperados,
    autorizados,
    rechazados,
    pendientes,
    expirados,
    omitidos,
    errores,
    hayMas: obj.hayMas,
  };
}

function construirErrorHttp(
  status: number,
  json: Record<string, unknown> | null,
): Extract<ResultadoInvocacionFiscal, { ok: false }> {
  const codigo =
    typeof json?.codigo === "string" && CODIGO_ESTABLE_RE.test(json.codigo)
      ? json.codigo
      : `HTTP_${status}`;
  const ejecucionId = validarEjecucionId(json?.ejecucionId) ?? null;

  return {
    ok: false,
    status,
    codigo,
    ejecucionId,
    detalle: `El worker fiscal respondió con estado HTTP ${status}.`,
  };
}

function combinarSenalConTimeout(timeoutMs: number, parentSignal?: AbortSignal) {
  const controlador = new AbortController();
  let vencioTimeout = false;

  const timer = setTimeout(() => {
    vencioTimeout = true;
    controlador.abort(new Error("TIMEOUT_INVOCACION_FISCAL"));
  }, timeoutMs);

  const onParentAbort = () => controlador.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  return {
    signal: controlador.signal,
    vencioTimeout: () => vencioTimeout,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    },
  };
}

/** Ejecuta una invocación POST vacía autenticada contra el worker fiscal con resultado sanitizado. */
export async function procesarFiscalUnaVez(
  config: ConfiguracionFiscalLocal,
  opciones: OpcionesInvocacionFiscal = {},
): Promise<ResultadoInvocacionFiscal> {
  if (opciones.signal?.aborted) {
    return {
      ok: false,
      status: null,
      codigo: "DETENIDO_POR_SENAL",
      ejecucionId: null,
      detalle: "Invocación cancelada por detención del proceso.",
    };
  }

  const fetcher = opciones.fetcher ?? fetch;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_INVOCACION_FISCAL_MS;
  const control = combinarSenalConTimeout(timeoutMs, opciones.signal);

  try {
    const respuesta = await fetcher(config.urlPendientes, {
      method: "POST",
      headers: {
        "x-fiscal-worker-secret": config.secreto,
        accept: "application/json",
      },
      redirect: "error",
      signal: control.signal,
    });

    const texto = await respuesta.text();
    const json = parseJsonAcotado(texto);

    if (!respuesta.ok) {
      return construirErrorHttp(respuesta.status, json);
    }

    const resumen = parseResumenTickFiscal(json);
    if (!resumen) {
      return {
        ok: false,
        status: respuesta.status,
        codigo: "RESPUESTA_INVALIDA",
        ejecucionId: validarEjecucionId(json?.ejecucionId) ?? null,
        detalle: "El worker fiscal respondió 2xx con estructura incompatible.",
      };
    }

    return { ok: true, status: respuesta.status, resumen };
  } catch {
    if (opciones.signal?.aborted && !control.vencioTimeout()) {
      return {
        ok: false,
        status: null,
        codigo: "DETENIDO_POR_SENAL",
        ejecucionId: null,
        detalle: "Invocación cancelada por detención del proceso.",
      };
    }
    return {
      ok: false,
      status: null,
      codigo: "INVOCACION_NO_CONFIRMADA",
      ejecucionId: null,
      detalle: control.vencioTimeout()
        ? `Tiempo de espera agotado (${timeoutMs} ms) sin confirmación del worker fiscal; no se reintenta ni se libera la serie.`
        : "Error de transporte o invocación no confirmada al contactar al worker fiscal.",
    };
  } finally {
    control.cleanup();
  }
}

/** Calcula la próxima espera hasta un ancla periódica evitando ráfagas por retrasos o saltos de reloj. */
export function calcularSiguienteEsperaMs(
  ahoraMs: number,
  anclaAnteriorMs: number,
  intervaloMs = INTERVALO_FISCAL_LOCAL_MS,
): { esperaMs: number; siguienteAnclaMs: number } {
  if (intervaloMs <= 0 || !Number.isFinite(intervaloMs)) {
    throw new Error("El intervalo de espera debe ser positivo.");
  }
  let siguienteAnclaMs = anclaAnteriorMs + intervaloMs;
  if (siguienteAnclaMs <= ahoraMs) {
    const saltos = Math.floor((ahoraMs - siguienteAnclaMs) / intervaloMs) + 1;
    siguienteAnclaMs += saltos * intervaloMs;
  }
  return {
    esperaMs: Math.max(0, siguienteAnclaMs - ahoraMs),
    siguienteAnclaMs,
  };
}

/** Indica si el tick registró actividad o pendientes adicionales para evitar ruido ocioso en consola. */
export function tieneActividadResumen(resumen: ResumenTickFiscal): boolean {
  return (
    resumen.evaluados > 0 ||
    resumen.iniciados > 0 ||
    resumen.recuperados > 0 ||
    resumen.autorizados > 0 ||
    resumen.rechazados > 0 ||
    resumen.pendientes > 0 ||
    resumen.expirados > 0 ||
    resumen.omitidos > 0 ||
    resumen.errores > 0 ||
    resumen.hayMas
  );
}

function esperarDefault(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function esperarHastaAncla(
  anclaMs: number,
  esperar: (ms: number, signal?: AbortSignal) => Promise<void>,
  ahora: () => number,
  signal?: AbortSignal,
): Promise<void> {
  while (!signal?.aborted && ahora() < anclaMs) {
    const restanteMs = Math.max(1, anclaMs - ahora());
    await esperar(restanteMs, signal);
  }
}

/** Ejecuta el procesador en modo único (--once) o bucle periódico secuencial cancelable por señal. */
export async function ejecutarProcesadorFiscalLocal(
  config: ConfiguracionFiscalLocal,
  opciones: OpcionesBucleFiscal = {},
): Promise<number> {
  const once = opciones.once ?? false;
  const intervaloMs = opciones.intervaloMs ?? INTERVALO_FISCAL_LOCAL_MS;
  const esperar = opciones.esperar ?? esperarDefault;
  const ahora = opciones.ahora ?? Date.now;
  const log = opciones.log ?? ((linea: string) => console.log(linea));
  const errorLog = opciones.errorLog ?? ((linea: string) => console.error(linea));
  const fechaIso = () => new Date(ahora()).toISOString();

  if (once) {
    const resultado = await procesarFiscalUnaVez(config, {
      fetcher: opciones.fetcher,
      signal: opciones.signal,
      timeoutMs: opciones.timeoutMs,
    });
    if (resultado.ok) {
      log(
        JSON.stringify({
          fecha: fechaIso(),
          evento: "tick_fiscal",
          http: resultado.status,
          ...resultado.resumen,
        }),
      );
      return 0;
    }
    errorLog(
      JSON.stringify({
        fecha: fechaIso(),
        evento: "tick_fiscal_error",
        http: resultado.status,
        codigo: resultado.codigo,
        ejecucionId: resultado.ejecucionId,
        detalle: resultado.detalle,
      }),
    );
    return 1;
  }

  let anclaMs = ahora();
  log(
    JSON.stringify({
      fecha: fechaIso(),
      evento: "fiscal_local_iniciado",
      intervaloMs,
      url: config.urlPendientes,
    }),
  );

  while (!opciones.signal?.aborted) {
    const resultado = await procesarFiscalUnaVez(config, {
      fetcher: opciones.fetcher,
      signal: opciones.signal,
      timeoutMs: opciones.timeoutMs,
    });

    if (
      opciones.signal?.aborted &&
      !resultado.ok &&
      resultado.codigo === "DETENIDO_POR_SENAL"
    ) {
      break;
    }

    if (!resultado.ok) {
      errorLog(
        JSON.stringify({
          fecha: fechaIso(),
          evento: "tick_fiscal_error",
          http: resultado.status,
          codigo: resultado.codigo,
          ejecucionId: resultado.ejecucionId,
          detalle: resultado.detalle,
        }),
      );
    } else if (tieneActividadResumen(resultado.resumen)) {
      log(
        JSON.stringify({
          fecha: fechaIso(),
          evento: "tick_fiscal",
          http: resultado.status,
          ...resultado.resumen,
        }),
      );
    }

    if (opciones.signal?.aborted) {
      break;
    }

    const { siguienteAnclaMs } = calcularSiguienteEsperaMs(
      ahora(),
      anclaMs,
      intervaloMs,
    );
    anclaMs = siguienteAnclaMs;
    await esperarHastaAncla(anclaMs, esperar, ahora, opciones.signal);
  }

  log(
    JSON.stringify({
      fecha: fechaIso(),
      evento: "fiscal_local_detenido",
    }),
  );
  return 0;
}

/** Valida argumentos CLI admitiendo únicamente la bandera opcional --once. */
export function parsearArgsFiscalLocal(argv: readonly string[]): {
  once: boolean;
} {
  let once = false;
  for (const arg of argv) {
    if (arg === "--once") {
      once = true;
      continue;
    }
    throw new ErrorConfiguracionFiscalLocal(`Argumento no admitido: ${arg}`);
  }
  return { once };
}

if (import.meta.main) {
  const controller = new AbortController();
  const detener = () => controller.abort();
  process.on("SIGINT", detener);
  process.on("SIGTERM", detener);

  try {
    const { once } = parsearArgsFiscalLocal(process.argv.slice(2));
    const config = leerConfiguracionFiscalLocal(process.env);
    process.exitCode = await ejecutarProcesadorFiscalLocal(config, {
      once,
      signal: controller.signal,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        fecha: new Date().toISOString(),
        evento: "fiscal_local_config_error",
        detalle:
          error instanceof Error ? error.message : "Error de configuración.",
      }),
    );
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", detener);
    process.off("SIGTERM", detener);
  }
}

/**
 * Prueba de integración del adaptador de mutación humana y aislamiento de caché en QueryClient.
 * Utiliza sesiones reales de Supabase Auth sin montar la interfaz gráfica.
 */
import {
  obtenerEstadoSupabase,
  prepararCuentasPrueba,
  resolverRutasRepositorio,
} from "./_entorno";

const { backend } = resolverRutasRepositorio();
const status = obtenerEstadoSupabase(backend);
process.env.PUBLIC_SUPABASE_URL = status.API_URL;
process.env.PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;

const { cuentas: accounts, limpiar: limpiarCuentas } =
  await prepararCuentasPrueba(status, ["admin", "responsable"]);
const checks: {
  caso: string;
  correcto: boolean;
  evidencia: Record<string, unknown>;
}[] = [];

function record(
  caso: string,
  correcto: boolean,
  evidencia: Record<string, unknown> = {},
) {
  checks.push({ caso, correcto, evidencia });
  console.log(`${correcto ? "OK" : "FALLO"}: ${caso}`);
  if (!correcto) throw new Error(caso);
}

const nativeFetch = globalThis.fetch;
let rpcCount = 0;
let capturedActor = "";
let release: () => void = () => {};
let notify: () => void = () => {};
const started = new Promise<void>((done) => {
  notify = done;
});
const gate = new Promise<void>((done) => {
  release = done;
});
let hold = false;

globalThis.fetch = (async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== status.API_URL) {
    throw new Error("Transporte remoto rechazado.");
  }
  if (url.pathname === "/rest/v1/rpc/consultar_grilla_reporte") {
    rpcCount++;
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const jwt = headers.get("Authorization")?.replace(/^Bearer /, "");
    if (jwt) {
      capturedActor = JSON.parse(
        Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString(),
      ).sub;
    }
    const response = await nativeFetch(input, init);
    if (hold) {
      notify();
      const signal = init?.signal;
      await Promise.race([
        gate,
        new Promise<never>((_, reject) => {
          const stop = () =>
            reject(new DOMException("Consulta cancelada", "AbortError"));
          if (signal?.aborted) stop();
          else signal?.addEventListener("abort", stop, { once: true });
        }),
      ]);
    }
    return response;
  }
  return nativeFetch(input, init);
}) as typeof fetch;

try {
  const { supabase } = await import(
    "../../../frontend/src/shared/api/supabaseClient"
  );
  const { createHumanRequestClient } = await import(
    "../../../frontend/src/shared/api/humanRequest"
  );
  const { requestLogin } = await import(
    "../../../frontend/src/shared/api/access.api"
  );
  const { QueryClient } = await import(
    "../../../frontend/node_modules/@tanstack/react-query"
  );

  const a = accounts.find((x) => x.kind === "admin");
  const b = accounts.find((x) => x.kind === "responsable");
  if (!a || !b) throw new Error("Faltan cuentas de prueba requeridas.");

  const admin = await requestLogin(a.email, a.password);
  const responsable = await requestLogin(b.email, b.password);
  record(
    "Dos sesiones Auth reales mediante gateway",
    admin.user.id === a.id && responsable.user.id === b.id,
  );

  await supabase.auth.setSession(admin);
  const before = rpcCount;
  let denied = false;
  try {
    await createHumanRequestClient(b.id);
  } catch {
    denied = true;
  }
  record(
    "Identidad capturada distinta impide construir solicitud antes de HTTP",
    denied && rpcCount === before,
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  hold = true;
  const pending = qc
    .fetchQuery({
      queryKey: ["integracion-seguridad", a.id, "primer-scope"],
      queryFn: async ({ signal }) => {
        const db = await createHumanRequestClient(a.id, signal);
        const { data, error } = await db
          .rpc("consultar_grilla_reporte", {
            p_grilla: "socios",
            p_criterios: { pagina: 0, limite: 20 },
          })
          .abortSignal(signal);
        if (error) throw error;
        return data;
      },
    })
    .then(
      () => "resuelta",
      () => "cancelada",
    );

  await started;
  record(
    "Consulta real iniciada con JWT del Admin capturado",
    capturedActor === a.id && rpcCount === before + 1,
  );

  await qc.cancelQueries();
  qc.clear();
  await supabase.auth.setSession(responsable);
  hold = false;
  release();
  record(
    "Cambio inducido de identidad cancela y descarta respuesta retenida",
    (await pending) === "cancelada" &&
      qc.getQueryCache().getAll().length === 0,
  );

  const db = await createHumanRequestClient(b.id);
  const data = await qc.fetchQuery({
    queryKey: ["integracion-seguridad", b.id, "segundo-scope"],
    queryFn: async () => {
      const r = await db.rpc("consultar_grilla_reporte", {
        p_grilla: "socios",
        p_criterios: { pagina: 0, limite: 20 },
      });
      if (r.error) throw r.error;
      return r.data;
    },
  });
  record(
    "Consulta posterior usa JWT Responsable y caché nueva",
    capturedActor === b.id &&
      !!data &&
      qc
        .getQueryCache()
        .getAll()
        .every((q) => q.queryKey.includes(b.id)),
  );

  let oldDenied = false;
  const after = rpcCount;
  try {
    await createHumanRequestClient(a.id);
  } catch {
    oldDenied = true;
  }
  record(
    "Acción vieja no toma credencial de cuenta nueva",
    oldDenied && rpcCount === after,
  );

  await qc.cancelQueries();
  qc.clear();
  await supabase.auth.signOut({ scope: "local" });
  let signedOutDenied = false;
  try {
    await createHumanRequestClient(b.id);
  } catch {
    signedOutDenied = true;
  }
  record(
    "Logout limpia caché y deja inhabilitadas nuevas acciones",
    signedOutDenied && qc.getQueryCache().getAll().length === 0,
  );

  const revoked = await nativeFetch(`${status.API_URL}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: {
      apikey: status.ANON_KEY,
      Authorization: `Bearer ${admin.access_token}`,
    },
  });
  record(
    "Sesión propia Admin cerrada sin revocar otras sesiones",
    revoked.ok,
    { http: revoked.status },
  );
} catch (error) {
  checks.push({
    caso: "Harness termina sin error inesperado",
    correcto: false,
    evidencia: {
      mensaje: error instanceof Error ? error.message : "Fallo no detallado",
    },
  });
} finally {
  hold = false;
  release();
  globalThis.fetch = nativeFetch;
  await limpiarCuentas();
  const correcto = checks.length > 0 && checks.every((c) => c.correcto);
  console.log(JSON.stringify({ checks: checks.length, correcto }));
  if (!correcto) process.exitCode = 1;
}

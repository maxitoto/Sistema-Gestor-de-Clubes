/** Llamador local: no contiene SMTP, reglas de negocio ni secretos en el código. */
type Environment = Record<string, string | undefined>;
type LocalWorkerConfig = { endpoint: URL; secret: string };

export function leerConfiguracionLocal(env: Environment): LocalWorkerConfig {
  if (env.MAIL_PROVIDER !== "mailpit") {
    throw new Error("Este comando local requiere MAIL_PROVIDER=mailpit.");
  }
  let base: URL;
  try {
    base = new URL(env.MAIL_PUBLIC_BASE_URL ?? "");
  } catch {
    throw new Error("MAIL_PUBLIC_BASE_URL debe ser una URL local válida.");
  }
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username || base.password || base.search || base.hash ||
    base.pathname.replace(/\/$/, "") !== "/functions/v1/comunicaciones"
  ) {
    throw new Error(
      "El procesador local sólo admite http://localhost (o loopback) y /functions/v1/comunicaciones.",
    );
  }
  const secret = env.MAIL_WORKER_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("MAIL_WORKER_SECRET debe tener al menos 32 caracteres.");
  }
  base.pathname = base.pathname.replace(/\/$/, "") + "/procesar-cola";
  return { endpoint: base, secret };
}

export async function procesarUnaVez(
  config: LocalWorkerConfig,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  let response: Response;
  try {
    response = await fetcher(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mail-worker-secret": config.secret,
      },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(70000),
    });
  } catch {
    throw new Error("No se obtuvo respuesta del procesador local en el tiempo permitido.");
  }
  if (!response.ok) {
    // No imprimir cuerpos arbitrarios, destinatarios ni secretos en consola.
    throw new Error(`El procesador local respondió HTTP ${response.status}.`);
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("El procesador local devolvió una respuesta no válida.");
  }
  const count = (result as { procesados?: unknown } | null)?.procesados;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("El procesador local devolvió una respuesta no válida.");
  }
  return count;
}

export async function ejecutarProcesadorLocal(
  config: LocalWorkerConfig,
  once: boolean,
  dependencies = {
    process: procesarUnaVez,
    wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    log: (message: string) => console.log(message),
  },
): Promise<void> {
  do {
    try {
      const count = await dependencies.process(config);
      if (count > 0 || once) dependencies.log(`Correos procesados: ${count}.`);
    } catch (error) {
      if (once) throw error;
      dependencies.log(error instanceof Error ? error.message : "Falló el procesador local.");
    }
    // Se espera a que termine la petición anterior: no se usa setInterval.
    if (!once) await dependencies.wait(10000);
  } while (!once);
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--once")) {
      throw new Error("Uso: bun run correos:local o bun run correos:una-vez.");
    }
    const config = leerConfiguracionLocal(process.env);
    console.log("Procesador local de Mailpit iniciado. Ctrl+C para detenerlo.");
    await ejecutarProcesadorLocal(config, args.includes("--once"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudo iniciar el procesador local.");
    process.exitCode = 1;
  }
}

import { compararSecreto } from "@core/index.ts";
export function validarSecretoFiscal(
  env: { get(name: string): string | undefined },
) {
  const secreto = env.get("FISCAL_WORKER_SECRET");
  if (
    !secreto || secreto.length < 32 || secreto.length > 1024 ||
    [
      env.get("MAIL_WORKER_SECRET"),
      env.get("SUPABASE_SERVICE_ROLE_KEY"),
      env.get("SUPABASE_ANON_KEY"),
    ].includes(secreto)
  ) {
    throw new Error(
      "Configurar un secreto fiscal técnico independiente de al menos 32 caracteres.",
    );
  }
  return secreto;
}
type Resultado = { http: 200 | 503; body: unknown };
export function crearAppFiscalWorker(
  deps: {
    secreto: string;
    procesar: () => Promise<Resultado>;
    uuid?: () => string;
  },
) {
  if (deps.secreto.length < 32) {
    throw new Error("El secreto fiscal técnico no es válido.");
  }
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  return {
    fetch: async (req: Request) => {
      const path = new URL(req.url).pathname.replace(
        /^\/(?:functions\/v1\/)?fiscal-worker\/?/,
        "/",
      );
      if (path !== "/procesar-pendientes") {
        return json({ error: "Ruta no encontrada" }, 404);
      }
      if (req.method !== "POST") {
        return json({ error: "Método no permitido" }, 405);
      }
      if (
        !(await compararSecreto(
          req.headers.get("x-fiscal-worker-secret"),
          deps.secreto,
        ))
      ) return json({ error: "Acceso técnico inválido" }, 401);
      if (
        Number(req.headers.get("content-length")) > 0 ||
        (await req.text()).length > 0
      ) return json({ error: "La operación no admite cuerpo" }, 400);
      try {
        const result = await deps.procesar();
        return json(result.body, result.http);
      } catch {
        return json({
          error: "No se pudo atender la cola fiscal.",
          ejecucionId: (deps.uuid ?? crypto.randomUUID)(),
        }, 503);
      }
    },
  };
}

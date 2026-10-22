// Reúne rutas, CORS, validación HTTP y respuestas. Recibe dependencias para poder probar HTTP sin ejecutar Deno.serve. La autorización ocurre antes de analizar el cuerpo; el preflight se atiende antes de exigir autenticación. Los resultados fiscales conservan sus estados 404/409/501/200
import { Hono } from "jsr:@hono/hono@^4";
import type { Context } from "jsr:@hono/hono@^4";
import { cors } from "jsr:@hono/hono@^4/cors";
import type { ContentfulStatusCode } from "jsr:@hono/hono@^4/utils/http-status";
import { AppError } from "@core/index.ts";
import type { ResultadoReapertura } from "@modules/fiscal/index.ts";

type DependenciasMonitoreo = {
  autorizar: (c: Context) => Promise<void>;
  reabrir: {
    execute(comprobanteId: string): Promise<ResultadoReapertura>;
  };
};

const uuidValido =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function leerComprobanteId(c: Context): Promise<string> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError("JSON inválido.", 400);
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("Solicitud inválida.", 400);
  }

  const comprobanteId = (raw as Record<string, unknown>).comprobanteId;
  if (
    comprobanteId === undefined || comprobanteId === null ||
    comprobanteId === ""
  ) {
    throw new AppError("Falta comprobanteId", 400);
  }
  if (typeof comprobanteId !== "string" || !uuidValido.test(comprobanteId)) {
    throw new AppError("comprobanteId debe ser un UUID válido.", 400);
  }
  return comprobanteId;
}

export function crearAppMonitoreo(deps: DependenciasMonitoreo): Hono {
  const app = new Hono().basePath("/monitoreo");

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["POST", "OPTIONS"],
      allowHeaders: [
        "authorization",
        "x-client-info",
        "apikey",
        "content-type",
      ],
    }),
  );

  app.onError((err, c) => {
    if (
      err instanceof AppError &&
      Number.isInteger(err.statusCode) &&
      err.statusCode >= 400 && err.statusCode <= 599
    ) {
      return c.json(
        { error: err.message },
        err.statusCode as ContentfulStatusCode,
      );
    }

    console.error("Error inesperado en Monitoreo", err.name);
    return c.json({ error: "Ocurrió un error interno. Reintente." }, 500);
  });

  app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));

  app.post("/reabrir", async (c) => {
    await deps.autorizar(c);
    const comprobanteId = await leerComprobanteId(c);
    const resultado = await deps.reabrir.execute(comprobanteId);

    switch (resultado.tipo) {
      case "no_encontrado":
        return c.json({ error: "El comprobante no existe" }, 404);
      case "no_fallido":
        return c.json(
          { error: "El comprobante no esta en estado fallido" },
          409,
        );
      case "conciliacion_pendiente":
        return c.json(
          {
            error:
              "Reapertura no disponible: falta conciliar el intento fiscal anterior. " +
              "No se modifico el comprobante.",
          },
          501,
        );
      case "reabierto":
        return c.json({ reabierto: true }, 200);
    }
  });

  app.post("/forzar", async (c) => {
    await deps.autorizar(c);
    return c.json(
      {
        error:
          "Reintento manual no implementado: pendiente del cliente SOAP de ARCA (RF05/RF06)",
      },
      501,
    );
  });

  return app;
}
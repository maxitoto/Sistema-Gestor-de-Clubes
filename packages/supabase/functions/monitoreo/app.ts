import { Hono } from "jsr:@hono/hono@^4";
import type { Context } from "jsr:@hono/hono@^4";
import { cors } from "jsr:@hono/hono@^4/cors";
import { AppError } from "@core/index.ts";
import {
  ArcaConfiguracionError,
  ContratoFiscalError,
} from "@modules/fiscal/index.ts";
type Query = {
  page: number;
  pageSize: number;
  estado: string | null;
  tipo: string | null;
  busqueda: string | null;
  desde: string | null;
  hasta: string | null;
};
type Resultado = { resultado: string; advertencia: string | null };
type DependenciasMonitoreo = {
  autorizar: (c: Context, accion: "lectura" | "admin") => Promise<void>;
  listar: (c: Context, q: Query) => Promise<unknown>;
  accion: (
    c: Context,
    nombre: "forzar" | "reabrir" | "resolver" | "registrar-externo",
    id: string,
  ) => Promise<Resultado>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function dia(value: string | null) {
  if (value === null) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T12:00:00Z")) ||
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value
  ) throw new AppError("Fecha inválida.", 400);
  return value;
}
function query(c: Context): Query {
  const p = new URL(c.req.url).searchParams;
  const allowed = ["page", "pageSize", "estado", "tipo", "q", "desde", "hasta"];
  if (
    [...p.keys()].some((k) => !allowed.includes(k)) ||
    allowed.some((k) => p.getAll(k).length > 1)
  ) throw new AppError("Filtros no admitidos.", 400);
  const page = Number(p.get("page") ?? "1"),
    pageSize = Number(p.get("pageSize") ?? "20");
  if (
    !Number.isSafeInteger(page) || page < 1 || page > 100000 ||
    ![20, 50, 100].includes(pageSize)
  ) throw new AppError("Paginación inválida.", 400);
  const estado = p.get("estado"), tipo = p.get("tipo");
  if (
    estado &&
      !["todos", "pendiente_cae", "anulacion_pendiente", "fallido"].includes(
        estado,
      ) || tipo && !["todos", "factura", "nota_credito"].includes(tipo)
  ) throw new AppError("Filtro fiscal inválido.", 400);
  const busqueda = p.get("q")?.trim() || null;
  if (busqueda && busqueda.length > 100) {
    throw new AppError("Búsqueda demasiado larga.", 400);
  }
  const desde = dia(p.get("desde")), hasta = dia(p.get("hasta"));
  if (desde && hasta && desde > hasta) {
    throw new AppError("El rango de fechas no es válido.", 400);
  }
  return {
    page,
    pageSize,
    estado: estado === "todos" ? null : estado,
    tipo: tipo === "todos" ? null : tipo,
    busqueda,
    desde,
    hasta,
  };
}
async function leerId(c: Context) {
  if (
    !c.req.header("content-type")?.toLowerCase().startsWith("application/json")
  ) throw new AppError("El cuerpo debe ser JSON.", 415);
  if (Number(c.req.header("content-length")) > 2048) {
    throw new AppError("Solicitud demasiado grande.", 413);
  }
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > 2048) {
    throw new AppError("Solicitud demasiado grande.", 413);
  }
  let row: unknown;
  try {
    row = JSON.parse(text);
  } catch {
    throw new AppError("JSON inválido.", 400);
  }
  if (
    !row || typeof row !== "object" || Array.isArray(row) ||
    Object.keys(row).length !== 1 || !("comprobanteId" in row) ||
    typeof row.comprobanteId !== "string" || !UUID.test(row.comprobanteId)
  ) {
    throw new AppError(
      "La operación admite únicamente un identificador válido de comprobante.",
      400,
    );
  }
  return row.comprobanteId.toLowerCase();
}
export function crearAppMonitoreo(deps: DependenciasMonitoreo) {
  const app = new Hono().basePath("/monitoreo");
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: [
        "authorization",
        "x-client-info",
        "apikey",
        "content-type",
      ],
    }),
  );
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message }, err.statusCode as 400);
    }
    if (err instanceof ArcaConfiguracionError) {
      return c.json({
        error:
          "La conexión de homologación requiere completar su configuración y habilitación. No se solicitó otra emisión.",
        code: err.codigo,
      }, 503);
    }
    if (err instanceof ContratoFiscalError) {
      return c.json({ error: err.message }, 409);
    }
    console.error("No se confirmó acción de Monitoreo", err.name);
    return c.json({
      error: "No se pudo confirmar la operación fiscal. Consultá su estado.",
    }, 503);
  });
  app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));
  app.get("/", async (c) => {
    await deps.autorizar(c, "lectura");
    return c.json(await deps.listar(c, query(c)));
  });
  for (
    const nombre of [
      "forzar",
      "reabrir",
      "resolver",
      "registrar-externo",
    ] as const
  ) {
    app.post("/" + nombre, async (c) => {
      await deps.autorizar(c, "admin");
      const result = await deps.accion(c, nombre, await leerId(c));
      return c.json(
        result,
        result.resultado === "no_encontrado"
          ? 404
          : result.resultado === "bloqueado" ||
              result.resultado === "sin_cambios"
          ? 409
          : 200,
      );
    });
  }
  app.all("*", (c) => c.json({ error: "Método no permitido" }, 405));
  return app;
}

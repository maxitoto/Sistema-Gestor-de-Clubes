import {
  AppError,
  corsHeaders,
  createEdgeClient,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireRol,
} from "@core/index.ts";
import { RepositorioArchivosSupabase } from "@modules/archivos/index.ts";

import {
  ArcaAccesoError,
  ArcaConfiguracionError,
  arcaExternoHabilitado,
  ContratoFiscalError,
  crearPuertoArca,
  DocumentoError,
  EmitirComprobanteUseCase,
  estadoFiscalPublico,
  GeneradorPdf,
  GenerarPdfComprobanteUseCase,
  RepositorioDocumentosSupabase,
  RepositorioIntentosFiscalesSupabase,
} from "@modules/fiscal/index.ts";
import {
  type DependenciasConsultaSerie,
  resolverConsultaSerie,
} from "./consulta-serie.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function leerId(req: Request): Promise<string> {
  if (
    !req.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) throw new AppError("El cuerpo debe ser JSON.", 415);
  const declared = Number(req.headers.get("content-length"));
  if (declared > 2048) throw new AppError("Solicitud demasiado grande.", 413);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 2048) {
    throw new AppError("Solicitud demasiado grande.", 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AppError("Solicitud inválida.", 400);
  }
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !("comprobanteId" in body) ||
    typeof body.comprobanteId !== "string" || !UUID.test(body.comprobanteId)
  ) {
    throw new AppError(
      "La operación admite únicamente un identificador de comprobante válido.",
      400,
    );
  }
  return body.comprobanteId.toLowerCase();
}
/** Configuración y cliente técnico sólo se construyen después de verificar JWT/rol activos. */
export function arcaHandler(req: Request): Promise<Response> {
  return manejarArca(req);
}
/** Inyección acotada para probar la consulta; no ocupa el argumento info de Deno.serve. */
export function crearArcaHandler(consultaSerieDeps: DependenciasConsultaSerie) {
  return (req: Request): Promise<Response> =>
    manejarArca(req, consultaSerieDeps);
}
async function manejarArca(
  req: Request,
  consultaSerieDeps?: DependenciasConsultaSerie,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }
  if (!["GET", "POST"].includes(req.method)) {
    return errorResponse("Método no permitido", 405);
  }
  let consultaSerie = false;
  try {
    const path = new URL(req.url).pathname.replace(
      /^\/(?:functions\/v1\/)?arca\/?/,
      "/",
    );
    if (path === "/diagnostico/serie") {
      consultaSerie = true;
      return await resolverConsultaSerie(
        req,
        consultaSerieDeps ?? {
          autorizar: (roles) => requireRol({ req: { raw: req } }, roles),
          leerClub: async () => {
            const { data: club, error } = await createServiceClient().from(
              "club",
            )
              .select("cuit,punto_venta")
              .eq("id", "00000000-0000-0000-0000-000000000000").single();
            if (error || !club) {
              throw new AppError(
                "No se pudo leer la configuración institucional.",
                503,
              );
            }
            return club;
          },
          crearPuerto: () => crearPuertoArca(createServiceClient(), Deno.env),
        },
      );
    }
    const diagnostico = path === "/diagnostico";
    const actor = await requireRol(
      { req: { raw: req } },
      diagnostico ? ["admin"] : ["admin", "responsable"],
    );
    const human = createEdgeClient(req), technical = createServiceClient();
    const repo = new RepositorioIntentosFiscalesSupabase(technical, actor.id);
    const externo = () => arcaExternoHabilitado(Deno.env);
    const port = () => crearPuertoArca(technical, Deno.env);
    if (diagnostico && req.method === "POST") {
      const { data: club, error } = await technical.from("club").select(
        "cuit,punto_venta",
      ).eq("id", "00000000-0000-0000-0000-000000000000").single();
      if (error || !club) {
        throw new AppError(
          "No se pudo leer la configuración institucional.",
          503,
        );
      }
      const result = await port().diagnosticar(
        String(club.cuit).replace(/-/g, ""),
      );
      const pv = result.puntosVenta.find((item) =>
        item.numero === club.punto_venta
      );
      return jsonResponse({
        ...result,
        puntoVentaConfigurado: club.punto_venta,
        puntoVentaDisponible: Boolean(
          pv && pv.emisionTipo === "CAE" && !pv.bloqueado && !pv.bajaFecha,
        ),
      });
    }
    const match = path.match(/^\/comprobantes\/([^/]+)$/);
    const id = req.method === "GET" && match
      ? match[1].toLowerCase()
      : req.method === "POST" && ["/emitir", "/pdf"].includes(path)
      ? await leerId(req)
      : null;
    if (!id) return errorResponse("Ruta fiscal no encontrada", 404);
    if (!UUID.test(id)) {
      throw new AppError("Identificador de comprobante inválido.", 400);
    }
    const permit = await human.from("comprobantes").select("id").eq("id", id)
      .maybeSingle();
    if (permit.error) {
      throw new AppError("No se pudo verificar el acceso al comprobante.", 503);
    }
    if (!permit.data) throw new AppError("No se encontró el comprobante.", 404);
    if (req.method === "GET") {
      const ctx = await repo.leerContexto(id);
      if (!ctx) throw new AppError("No se encontró el comprobante.", 404);
      return jsonResponse(estadoFiscalPublico(ctx, externo()));
    }
    if (path === "/pdf") {
      const archivos = new RepositorioArchivosSupabase(
        human,
        technical,
        actor.id,
      );
      const documentos = new RepositorioDocumentosSupabase(
        human,
        technical,
        async (storagePath) => {
          const current = await requireRol({ req: { raw: req } }, [
            "admin",
            "responsable",
          ]);
          if (current.id !== actor.id) {
            throw new AppError("La sesión cambió.", 401);
          }
          const check = await human.from("comprobantes").select("id").eq(
            "id",
            id,
          ).maybeSingle();
          if (check.error || !check.data) {
            throw new AppError(
              "No se pudo confirmar el permiso de descarga.",
              403,
            );
          }
          return archivos.firmar(storagePath);
        },
      );
      return jsonResponse(
        await new GenerarPdfComprobanteUseCase(documentos, new GeneradorPdf())
          .ejecutar(id),
      );
    }
    const previo = await repo.leerContexto(id);
    if (previo?.ejecucion) await requireRol({ req: { raw: req } }, ["admin"]);
    const result = await new EmitirComprobanteUseCase(repo, port()).ejecutar(
      id,
    );
    const ctx = await repo.leerContexto(id);
    if (!ctx) {
      throw new AppError("No se pudo consultar el resultado persistido.", 503);
    }
    return jsonResponse({
      ...estadoFiscalPublico(ctx, externo()),
      resultado: result.resultado,
      advertencia: result.advertencia,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.statusCode);
    }
    if (error instanceof DocumentoError) {
      return errorResponse(error.message, error.statusCode);
    }
    if (error instanceof ContratoFiscalError) {
      return errorResponse(error.message, 409);
    }
    if (error instanceof ArcaAccesoError) {
      return jsonResponse(
        { error: error.message, code: error.codigo },
        error.reintentable ? 503 : 409,
      );
    }
    if (error instanceof ArcaConfiguracionError) {
      return jsonResponse({
        error: consultaSerie
          ? "La consulta de serie requiere configurar y habilitar homologación. No se solicitó CAE."
          : "La integración de homologación requiere completar su configuración y habilitación. El cobro no se modificó.",
        code: error.codigo,
      }, 503);
    }
    console.error(
      "No se confirmó la operación fiscal/documental",
      error instanceof Error ? error.name : "Error",
    );
    return errorResponse(
      consultaSerie
        ? "No se pudo confirmar la consulta de serie. No se solicitó CAE."
        : "No se pudo confirmar la operación. Consultá el resultado; el cobro sigue registrado.",
      503,
    );
  }
}

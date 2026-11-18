import {
  AppError,
  createEdgeClient,
  createServiceClient,
  requireRol,
} from "@core/index.ts";
import {
  arcaExternoHabilitado,
  crearPuertoArca,
  ReabrirRegularizacionVerificadaUseCase,
  RegularizarComprobanteUseCase,
  RepositorioRegularizacionFiscalSupabase,
  ResolverAnulacionUseCase,
} from "@modules/fiscal/index.ts";
import { crearAppMonitoreo } from "./app.ts";
const app = crearAppMonitoreo({
  autorizar: async (c, accion) => {
    const actor = await requireRol(
      c,
      accion === "lectura" ? ["admin", "responsable"] : ["admin"],
    );
    c.set("actorFiscal", actor.id);
  },
  listar: async (c, q) => {
    const db = createEdgeClient(c.req.raw);
    const { data, error } = await db.rpc("consultar_monitoreo_fiscal", {
      p_page: q.page,
      p_page_size: q.pageSize,
      p_estado: q.estado,
      p_tipo: q.tipo,
      p_busqueda: q.busqueda,
      p_desde: q.desde,
      p_hasta: q.hasta,
    });
    if (error) {
      throw new AppError("No se pudo consultar el monitoreo fiscal.", 503);
    }
    return { ...data, externoHabilitado: arcaExternoHabilitado(Deno.env) };
  },
  accion: async (c, nombre, id) => {
    const actorId = c.get("actorFiscal") as string;
    const db = createServiceClient(),
      repo = new RepositorioRegularizacionFiscalSupabase(db, actorId),
      port = () => crearPuertoArca(db, Deno.env);
    if (nombre === "forzar") {
      const result = await new RegularizarComprobanteUseCase(repo, port())
        .ejecutar(id, "manual");
      return { resultado: result.resultado, advertencia: result.advertencia };
    }
    if (nombre === "resolver") {
      const result = await new ResolverAnulacionUseCase(repo, port).ejecutar(
        id,
        actorId,
      );
      return { resultado: result.resultado, advertencia: result.advertencia };
    }
    if (nombre === "registrar-externo") {
      const ctx = await repo.leerContexto(id);
      if (ctx?.comprobante.estado_fiscal === "anulacion_pendiente") {
        const result = await new ResolverAnulacionUseCase(repo, port)
          .ejecutar(id, actorId);
        return { resultado: result.resultado, advertencia: result.advertencia };
      }
    }
    const result = await new ReabrirRegularizacionVerificadaUseCase(repo, port)
      .ejecutar(id, actorId, nombre === "registrar-externo");
    return { resultado: result.resultado, advertencia: result.advertencia };
  },
});
Deno.serve(app.fetch);

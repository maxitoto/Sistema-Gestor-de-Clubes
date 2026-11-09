import { construirSolicitudFiscal } from "../domain/construir-solicitud.ts";
import {
  autorizacionCoincide,
  type PuertoArca,
  type ResultadoSolicitudArca,
} from "./PuertoArca.ts";
import type { RepositorioIntentosFiscales } from "./RepositorioIntentosFiscales.ts";
import {
  ConciliarIntentoUseCase,
  type ResultadoEmisionLocal,
  salidaEjecucion,
} from "./ConciliarIntentoUseCase.ts";

export class EmitirComprobanteUseCase {
  constructor(
    private repo: RepositorioIntentosFiscales,
    private arca: PuertoArca,
    private uuid = () => crypto.randomUUID(),
    private ahora = () => new Date(),
  ) {}
  async ejecutar(
    comprobanteId: string,
    modo: "inicial" | "manual" | "automatico" = "inicial",
  ): Promise<ResultadoEmisionLocal> {
    const ctx = await this.repo.leerContexto(comprobanteId);
    if (!ctx) {
      return {
        resultado: "bloqueado",
        advertencia: "No se encontró el comprobante.",
        ejecucion: null,
      };
    }
    if (
      !((ctx.pago.estado === "completado" &&
        ctx.comprobante.tipo === "factura") ||
        (ctx.pago.estado === "anulado" &&
          ctx.comprobante.tipo === "nota_credito"))
    ) {
      return {
        resultado: "bloqueado",
        advertencia:
          "Este documento requiere resolución administrativa; no se puede emitir por este recorrido.",
        ejecucion: ctx.ejecucion,
      };
    }
    if (
      ctx.comprobante.estado_fiscal === "valido" ||
      (ctx.comprobante.tipo === "nota_credito" &&
        ctx.comprobante.estado_fiscal === "anulado" && ctx.comprobante.cae)
    ) {
      return {
        resultado: "autorizado",
        advertencia: null,
        ejecucion: ctx.ejecucion,
      };
    }
    const recuperable = ctx.ejecucion &&
      ["adquirida", "preparada", "posible_envio", "desconocido", "incidencia"]
        .includes(ctx.ejecucion.estado);
    // Toda ejecución nueva valida fuentes antes de adquirir/red; '1' no reserva numeración.
    if (!recuperable && (modo !== "inicial" || !ctx.ejecucion)) {
      construirSolicitudFiscal(ctx, "1", this.ahora());
    }
    const acquired = await this.repo.iniciar(
      comprobanteId,
      recuperable ? "conciliacion" : modo,
      recuperable ? ctx.ejecucion!.id : this.uuid(),
    );
    if (acquired.estado === "en_curso") {
      return {
        resultado: "en_proceso",
        advertencia:
          "Hay una operación fiscal en curso. Consultá su resultado.",
        ejecucion: acquired.ejecucion,
      };
    }
    if (acquired.estado === "finalizada" && acquired.ejecucion) {
      return salidaEjecucion(acquired.ejecucion);
    }
    if (
      !acquired.ejecucion ||
      ["no_elegible", "pendiente_configuracion"].includes(acquired.estado)
    ) {
      return {
        resultado: "bloqueado",
        advertencia: acquired.motivo ??
          "La operación requiere revisión de configuración.",
        ejecucion: acquired.ejecucion,
      };
    }
    let execution = acquired.ejecucion;
    if (acquired.estado === "conciliacion" || execution.posibleEnvio) {
      return new ConciliarIntentoUseCase(this.repo, this.arca).ejecutar(
        execution,
      );
    }
    let diagnosis;
    try {
      diagnosis = await this.arca.diagnosticar(execution.identidad.cuit);
    } catch {
      diagnosis = null;
    }
    if (
      !diagnosis || diagnosis.autenticado !== true ||
      diagnosis.ambiente !== "homologacion" || diagnosis.servicio !== "wsfe" ||
      (diagnosis.ausenciaDatos !== undefined &&
        (diagnosis.ausenciaDatos !== "602" ||
          diagnosis.puntosVenta.length !== 0))
    ) {
      return salidaEjecucion(
        await this.repo.confirmar(execution.id, execution.version, {
          tipo: "transitorio",
          codigos: [{
            codigo: "ACCESO_NO_CONFIRMADO",
            mensaje:
              "No se pudo confirmar acceso a homologación y punto de venta; no se solicitó CAE.",
          }],
        }),
      );
    }
    const pv = diagnosis.puntosVenta.find((p) =>
      p.numero === execution.identidad.puntoVenta
    );
    const consultarSinListado =
      execution.identidad.ambiente === "homologacion" &&
      diagnosis.ausenciaDatos === "602" && diagnosis.puntosVenta.length === 0;
    if (
      !consultarSinListado &&
      (!pv || pv.emisionTipo !== "CAE" || pv.bloqueado || pv.bajaFecha)
    ) {
      return salidaEjecucion(
        await this.repo.confirmar(execution.id, execution.version, {
          tipo: "transitorio",
          codigos: [{
            codigo: "PUNTO_VENTA_NO_DISPONIBLE",
            mensaje:
              "El punto de venta no está disponible para solicitar CAE; no se emitió.",
          }],
        }),
      );
    }
    let last;
    try {
      last = await this.arca.obtenerUltimoAutorizado(execution.identidad);
    } catch {
      last = { tipo: "no_disponible" as const, codigos: [] };
    }
    if (last.tipo !== "obtenido") {
      return salidaEjecucion(
        await this.repo.confirmar(execution.id, execution.version, {
          tipo: "transitorio",
          codigos: [{
            codigo: "ULTIMO_NO_DISPONIBLE",
            mensaje:
              "No se pudo consultar el último autorizado; no se solicitó CAE.",
          }],
        }),
      );
    }
    if (!/^(0|[1-9]\d{0,11})$/.test(last.numero)) {
      throw new Error("La consulta de numeración no es válida.");
    }
    const next = (BigInt(last.numero) + 1n).toString();
    if (execution.solicitud && execution.numero !== next) {
      return new ConciliarIntentoUseCase(this.repo, this.arca).ejecutar(
        execution,
      );
    }
    if (!execution.solicitud) {
      const fresh = await this.repo.leerContexto(comprobanteId);
      if (!fresh) throw new Error("El comprobante dejó de estar disponible.");
      const request = construirSolicitudFiscal(fresh, next, this.ahora());
      execution = await this.repo.preparar(
        execution.id,
        execution.version,
        next,
        request,
      );
    }
    if (!execution.solicitud) {
      throw new Error("No se confirmó la solicitud persistida.");
    }
    execution = await this.repo.marcarEnvio(execution.id, execution.version);
    // Después de este commit durable, toda excepción puede ocultar una autorización remota.
    let result: ResultadoSolicitudArca;
    try {
      result = await this.arca.solicitar(execution.solicitud!);
      if (
        result.tipo === "autorizado" &&
        !autorizacionCoincide(execution.solicitud!, result.autorizacion)
      ) {
        result = {
          tipo: "desconocido",
          codigos: [{
            codigo: "AUTORIZACION_INCOMPATIBLE",
            mensaje: "La respuesta no coincide con la solicitud persistida.",
          }],
        };
      }
      if (result.tipo === "transitorio") {
        result = {
          tipo: "desconocido",
          codigos: [{
            codigo: "ENVIO_SIN_CONFIRMACION",
            mensaje:
              "No se obtuvo un resultado concluyente después de habilitar el envío.",
          }],
        };
      }
    } catch {
      result = {
        tipo: "desconocido",
        codigos: [{
          codigo: "ENVIO_SIN_RESPUESTA",
          mensaje:
            "El resultado externo puede existir. Consultá antes de continuar.",
        }],
      };
    }
    return salidaEjecucion(
      await this.repo.confirmar(execution.id, execution.version, result),
    );
  }
}

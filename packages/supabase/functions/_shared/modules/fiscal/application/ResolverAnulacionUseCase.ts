import type { RepositorioRegularizacionFiscal } from "./RepositorioRegularizacionFiscal.ts";
import {
  autorizacionCoincide,
  type PuertoArca,
  type ResultadoSolicitudArca,
} from "./PuertoArca.ts";
import { salidaEjecucion } from "./ConciliarIntentoUseCase.ts";
export class ResolverAnulacionUseCase {
  constructor(
    private repo: RepositorioRegularizacionFiscal,
    private puerto: PuertoArca | (() => PuertoArca),
  ) {}
  async ejecutar(id: string, actorId: string) {
    const ctx = await this.repo.leerContexto(id);
    if (
      !ctx || ctx.pago.estado !== "anulado" ||
      ctx.comprobante.tipo !== "factura" ||
      ctx.comprobante.estado_fiscal !== "anulacion_pendiente"
    ) {
      return {
        resultado: "bloqueado" as const,
        advertencia: "El documento no requiere resolución de anulación.",
      };
    }
    if (ctx.comprobante.cae && ctx.notaCreditoId) {
      return {
        resultado: "resuelto" as const,
        advertencia:
          "La anulación financiera está confirmada y espera su Nota de Crédito.",
      };
    }
    const old = ctx.ejecucion;
    // SQL revisa toda la historia y el fence; la ausencia de identidad actual no
    // basta para asumir que nunca se envió. Este cierre probado es sólo local.
    if (
      old && (await this.repo.resolverSinEnvio(
        id,
        old.id,
        old.version,
        actorId,
      )).resuelto
    ) {
      return {
        resultado: "resuelto" as const,
        advertencia:
          "La anulación documental está confirmada: no hubo ningún intento habilitado para envío. El estado financiero se conserva.",
      };
    }
    if (!old?.numero || !old.solicitud) {
      return {
        resultado: "bloqueado" as const,
        advertencia:
          "Falta una identidad fiscal verificable. Registrar la incidencia según la guía sin liberar otra emisión.",
      };
    }
    // Crear el puerto recién cuando hace falta consultar conserva el bloqueo
    // de homologación sin impedir un cierre local demostrado por la base.
    const arca = typeof this.puerto === "function"
      ? this.puerto()
      : this.puerto;
    // R es terminal: consultar su identidad conservada no adquiere ni modifica otra reserva.
    if (old.estado === "rechazado") {
      let found;
      try {
        found = await arca.consultar(old.identidad, old.numero);
      } catch {
        found = null;
      }
      if (
        found?.tipo === "encontrado" && old.posibleEnvio &&
        autorizacionCoincide(old.solicitud, found.autorizacion)
      ) {
        return salidaEjecucion(
          await this.repo.registrarAutorizacion(
            id,
            old.id,
            old.version,
            {
              tipo: "autorizado",
              autorizacion: found.autorizacion,
              observaciones: found.observaciones,
            },
            actorId,
          ),
        );
      }
      if (found?.tipo === "no_encontrado") {
        const result = await this.repo.resolverRechazoAnulado(
          id,
          old.id,
          old.version,
          actorId,
        );
        return {
          resultado: result.resuelto
            ? "resuelto" as const
            : "sin_cambios" as const,
          advertencia: result.resuelto
            ? "La anulación financiera y documental están confirmadas; el rechazo no requiere Nota de Crédito."
            : "El documento cambió y no se modificó su estado.",
        };
      }
      return {
        resultado: "sin_cambios" as const,
        advertencia:
          "La consulta no confirmó el documento ni una ausencia compatible con el rechazo. Se conserva la incidencia.",
      };
    }
    const acquired = await this.repo.iniciar(id, "conciliacion", old.id);
    const e = acquired.ejecucion;
    if (acquired.estado === "en_curso" || !e) {
      return {
        resultado: "en_proceso" as const,
        advertencia: "Existe una resolución en curso; consultá el estado.",
      };
    }
    if (!e.numero || !e.solicitud) {
      return {
        resultado: "bloqueado" as const,
        advertencia: "No se conservó la solicitud fiscal para conciliar.",
      };
    }
    let found;
    try {
      found = await arca.consultar(e.identidad, e.numero);
    } catch {
      found = null;
    }
    const resultado: ResultadoSolicitudArca =
      found?.tipo === "encontrado" && e.posibleEnvio &&
        autorizacionCoincide(e.solicitud, found.autorizacion)
        ? {
          tipo: "autorizado",
          autorizacion: found.autorizacion,
          observaciones: found.observaciones,
        }
        : {
          tipo: "desconocido",
          codigos: [{
            codigo: found?.tipo === "encontrado"
              ? "CONSULTA_INCOMPATIBLE"
              : "AUSENCIA_NO_CONCLUYENTE",
            mensaje:
              "La consulta no permite cerrar la incertidumbre del envío original.",
          }],
        };
    return salidaEjecucion(
      await this.repo.resolverAnulacion(e.id, e.version, resultado, actorId),
    );
  }
}

import type { RepositorioRegularizacionFiscal } from "./RepositorioRegularizacionFiscal.ts";
import { autorizacionCoincide, type PuertoArca } from "./PuertoArca.ts";
import { salidaEjecucion } from "./ConciliarIntentoUseCase.ts";
/** Una coincidencia reconoce el documento; ausencia sólo habilita reapertura si SQL prueba envío terminado. */
export class ReabrirRegularizacionVerificadaUseCase {
  constructor(
    private repo: RepositorioRegularizacionFiscal,
    private puerto: () => PuertoArca,
  ) {}
  async ejecutar(id: string, actorId: string, soloConsultar = false) {
    const ctx = await this.repo.leerContexto(id);
    if (!ctx) {
      return {
        resultado: "no_encontrado" as const,
        advertencia: "El comprobante no existe.",
      };
    }
    const eligible = (ctx.comprobante.tipo === "factura" &&
      ctx.pago.estado === "completado") ||
      (ctx.comprobante.tipo === "nota_credito" &&
        ctx.pago.estado === "anulado" &&
        ctx.origen?.estado_fiscal === "anulacion_pendiente");
    if (!eligible) {
      return {
        resultado: "bloqueado" as const,
        advertencia:
          "Este documento no es elegible; el estado financiero se conserva.",
      };
    }
    if (ctx.comprobante.estado_fiscal !== "fallido" && !soloConsultar) {
      return {
        resultado: "bloqueado" as const,
        advertencia: "La reapertura sólo corresponde a documentos fallidos.",
      };
    }
    const old = ctx.ejecucion;
    if (old?.numero && old.solicitud) {
      let found;
      try {
        found = await this.puerto().consultar(old.identidad, old.numero);
      } catch (error) {
        if (error instanceof Error && error.name === "ArcaConfiguracionError") {
          throw error;
        }
        found = null;
      }
      if (
        found?.tipo === "encontrado" && old.posibleEnvio &&
        autorizacionCoincide(old.solicitud, found.autorizacion)
      ) {
        if (old.estado === "rechazado") {
          return salidaEjecucion(
            await this.repo.registrarAutorizacion(id, old.id, old.version, {
              tipo: "autorizado",
              autorizacion: found.autorizacion,
              observaciones: found.observaciones,
            }, actorId),
          );
        }
        const acquired = await this.repo.iniciar(id, "conciliacion", old.id);
        if (acquired.estado === "en_curso" || !acquired.ejecucion) {
          return {
            resultado: "en_proceso" as const,
            advertencia:
              "Existe una conciliación en curso; consultá el estado.",
          };
        }
        const current = acquired.ejecucion;
        if (
          !current.posibleEnvio || !current.solicitud ||
          !autorizacionCoincide(current.solicitud, found.autorizacion)
        ) {
          return {
            resultado: "sin_cambios" as const,
            advertencia:
              "La ejecución cambió y no se atribuyó la autorización.",
          };
        }
        return salidaEjecucion(
          await this.repo.confirmar(current.id, current.version, {
            tipo: "autorizado",
            autorizacion: found.autorizacion,
            observaciones: found.observaciones,
          }),
        );
      }
      if (
        soloConsultar || found?.tipo !== "no_encontrado" ||
        (old.posibleEnvio && old.estado !== "rechazado")
      ) {
        return {
          resultado: "sin_cambios" as const,
          advertencia:
            "La consulta no confirmó una autorización exacta ni una ausencia que permita reabrir. No se modificó el documento.",
        };
      }
    } else if (
      old?.posibleEnvio || ctx.comprobante.numero_solicitado ||
      ctx.comprobante.solicitud_fiscal || soloConsultar
    ) {
      return {
        resultado: "sin_cambios" as const,
        advertencia:
          "Falta una identidad o evidencia suficiente. Conservar la incidencia y seguir el procedimiento administrativo.",
      };
    }
    if (old && !old.posibleEnvio && old.cerradoEn === null) {
      const result = await this.repo.reabrirSinEnvio(
        id,
        old.id,
        old.version,
        actorId,
      );
      return {
        resultado: result.reabierto
          ? "reabierto" as const
          : "sin_cambios" as const,
        advertencia: result.reabierto
          ? "Se invalidó la ejecución que nunca habilitó envío y se abrió una ventana nueva."
          : "No se modificó el comprobante.",
      };
    }
    const result = await this.repo.reabrirVerificado(
      id,
      old?.id ?? null,
      old?.version ?? null,
      actorId,
    );
    return {
      resultado: result.reabierto
        ? "reabierto" as const
        : "sin_cambios" as const,
      advertencia: result.reabierto
        ? "Se inició una nueva ventana de regularización sin modificar dinero."
        : "No se modificó el comprobante.",
    };
  }
}

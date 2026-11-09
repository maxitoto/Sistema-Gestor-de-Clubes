import {
  autorizacionCoincide,
  type PuertoArca,
  type ResultadoSolicitudArca,
} from "./PuertoArca.ts";
import type { RepositorioIntentosFiscales } from "./RepositorioIntentosFiscales.ts";
import type { EjecucionFiscal } from "../domain/intento-fiscal.ts";
export interface ResultadoEmisionLocal {
  resultado:
    | "autorizado"
    | "rechazado"
    | "pendiente"
    | "en_proceso"
    | "bloqueado";
  advertencia: string | null;
  ejecucion: EjecucionFiscal | null;
}
export function salidaEjecucion(e: EjecucionFiscal): ResultadoEmisionLocal {
  if (e.estado === "autorizado") {
    return { resultado: "autorizado", advertencia: null, ejecucion: e };
  }
  if (e.estado === "rechazado") {
    return {
      resultado: "rechazado",
      advertencia:
        "La autorización fiscal fue rechazada. El estado financiero se conserva.",
      ejecucion: e,
    };
  }
  return {
    resultado: "pendiente",
    advertencia:
      "La documentación fiscal continúa pendiente. Consultá el resultado sin repetir operaciones financieras.",
    ejecucion: e,
  };
}
/** Una consulta ambigua o ausencia no prueba que un envío anterior haya terminado. */
export class ConciliarIntentoUseCase {
  constructor(
    private repo: RepositorioIntentosFiscales,
    private arca: PuertoArca,
  ) {}
  async ejecutar(ejecucion: EjecucionFiscal): Promise<ResultadoEmisionLocal> {
    if (!ejecucion.numero || !ejecucion.solicitud) {
      return {
        resultado: "bloqueado",
        advertencia:
          "El intento no tiene una solicitud persistida que permita conciliar.",
        ejecucion,
      };
    }
    let found;
    try {
      found = await this.arca.consultar(ejecucion.identidad, ejecucion.numero);
    } catch {
      found = null;
    }
    // Una autorización externa anterior a nuestro primer envío no se atribuye automáticamente.
    if (!ejecucion.posibleEnvio) {
      return salidaEjecucion(
        await this.repo.registrarIncidencia(
          ejecucion.id,
          ejecucion.version,
          found?.tipo === "encontrado"
            ? "numero_ocupado"
            : "ausencia_no_concluyente",
        ),
      );
    }
    const result: ResultadoSolicitudArca = found?.tipo === "encontrado" &&
        autorizacionCoincide(ejecucion.solicitud, found.autorizacion)
      ? {
        tipo: "autorizado",
        autorizacion: found.autorizacion,
        observaciones: found.observaciones,
      }
      : {
        tipo: "desconocido",
        codigos: [{
          codigo: found?.tipo === "encontrado"
            ? "IDENTIDAD_INCOMPATIBLE"
            : found?.tipo === "no_encontrado"
            ? "AUSENCIA_SIN_CIERRE"
            : "CONSULTA_AMBIGUA",
          mensaje:
            "La consulta no permite atribuir una autorización exacta a este intento.",
        }],
      };
    return salidaEjecucion(
      await this.repo.confirmar(ejecucion.id, ejecucion.version, result),
    );
  }
}

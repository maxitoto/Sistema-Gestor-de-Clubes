// Consulta, evalúa los bloqueos y solicita la reapertura. Devuelve categorías de resultado

import { obtenerBloqueoReapertura } from "../domain/reapertura.ts";
import type { RepositorioFiscal } from "./RepositorioFiscal.ts";

export type ResultadoReapertura =
  | { tipo: "reabierto" }
  | { tipo: "no_encontrado" }
  | { tipo: "no_fallido" }
  | { tipo: "conciliacion_pendiente" };

export class ReabrirRegularizacionUseCase {
  constructor(private repositorio: RepositorioFiscal) {}

  async execute(comprobanteId: string): Promise<ResultadoReapertura> {
    const comprobante = await this.repositorio.buscarParaReapertura(
      comprobanteId,
    );

    if (!comprobante) {
      return { tipo: "no_encontrado" };
    }

    const bloqueo = obtenerBloqueoReapertura(comprobante);
    if (bloqueo !== null) {
      return { tipo: bloqueo };
    }

    await this.repositorio.reabrir(comprobante.id);
    return { tipo: "reabierto" };
  }
}
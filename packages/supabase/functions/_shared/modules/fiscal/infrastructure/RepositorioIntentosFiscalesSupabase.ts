import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@core/index.ts";
import type { RepositorioIntentosFiscales } from "../application/RepositorioIntentosFiscales.ts";
import type { ResultadoSolicitudArca } from "../application/PuertoArca.ts";
import {
  type ModoEjecucionFiscal,
  type MotivoIncidenciaFiscal,
  parseAdquisicionFiscal,
  parseContextoFiscal,
  parseEjecucionFiscal,
} from "../domain/intento-fiscal.ts";
import type { SolicitudFiscal } from "../domain/solicitud-fiscal.ts";
export class RepositorioIntentosFiscalesSupabase
  implements RepositorioIntentosFiscales {
  constructor(private db: SupabaseClient, private actorVerificado?: string) {}
  private async rpc(
    nombre: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await this.db.rpc(nombre, args);
    if (error) {
      if (error.code === "42501") {
        throw new AppError(
          "No tenés permiso para confirmar esta operación fiscal.",
          403,
        );
      }
      if (["40001", "P0001", "22023", "23505"].includes(error.code)) {
        throw new AppError(
          "La operación fiscal cambió o requiere revisión. Consultá el resultado antes de continuar.",
          409,
        );
      }
      console.error("No se confirmó persistencia fiscal", error.code);
      throw new AppError(
        "No se pudo confirmar el estado fiscal. Consultá el resultado antes de reintentar.",
        503,
      );
    }
    return data;
  }
  async leerContexto(comprobanteId: string) {
    return parseContextoFiscal(
      await this.rpc("leer_contexto_fiscal", {
        p_comprobante_id: comprobanteId,
      }),
    );
  }
  async consultar(comprobanteId: string) {
    const value = await this.rpc("consultar_ejecucion_fiscal", {
      p_comprobante_id: comprobanteId,
    });
    return value === null ? null : parseEjecucionFiscal(value);
  }
  async iniciar(
    comprobanteId: string,
    modo: ModoEjecucionFiscal,
    ejecucionId: string,
  ) {
    return parseAdquisicionFiscal(
      await this.rpc("iniciar_ejecucion_fiscal", {
        p_comprobante_id: comprobanteId,
        p_modo: modo,
        p_ejecucion_id: ejecucionId,
      }),
    );
  }
  async preparar(
    ejecucionId: string,
    version: string,
    numero: string,
    solicitud: SolicitudFiscal,
  ) {
    return parseEjecucionFiscal(
      await this.rpc("preparar_solicitud_fiscal", {
        p_ejecucion_id: ejecucionId,
        p_version: version,
        p_numero: numero,
        p_solicitud: solicitud,
      }),
    );
  }
  async marcarEnvio(ejecucionId: string, version: string) {
    return parseEjecucionFiscal(
      await this.rpc("marcar_envio_fiscal", {
        p_ejecucion_id: ejecucionId,
        p_version: version,
      }),
    );
  }
  async registrarIncidencia(
    ejecucionId: string,
    version: string,
    motivo: MotivoIncidenciaFiscal,
  ) {
    return parseEjecucionFiscal(
      await this.rpc("registrar_incidencia_fiscal", {
        p_ejecucion_id: ejecucionId,
        p_version: version,
        p_motivo: motivo,
      }),
    );
  }
  async confirmar(
    ejecucionId: string,
    version: string,
    resultado: ResultadoSolicitudArca,
  ) {
    return parseEjecucionFiscal(
      await this.rpc("confirmar_resultado_fiscal", {
        p_ejecucion_id: ejecucionId,
        p_version: version,
        p_resultado: resultado,
      }),
    );
  }
}

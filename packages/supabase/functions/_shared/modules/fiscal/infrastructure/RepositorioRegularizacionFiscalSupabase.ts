import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@core/index.ts";
import type { RepositorioRegularizacionFiscal } from "../application/RepositorioRegularizacionFiscal.ts";
import type { ResultadoSolicitudArca } from "../application/PuertoArca.ts";
import { objetoCerrado } from "../domain/identidad-fiscal.ts";
import {
  type ModoEjecucionFiscal,
  parseAdquisicionFiscal,
  parseEjecucionFiscal,
} from "../domain/intento-fiscal.ts";
import { RepositorioIntentosFiscalesSupabase } from "./RepositorioIntentosFiscalesSupabase.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class RepositorioRegularizacionFiscalSupabase
  extends RepositorioIntentosFiscalesSupabase
  implements RepositorioRegularizacionFiscal {
  constructor(private local: SupabaseClient, private actorId?: string) {
    super(local, actorId);
  }
  override async iniciar(
    id: string,
    modo: ModoEjecucionFiscal,
    ejecucion: string,
  ) {
    if (this.actorId && (modo === "manual" || modo === "conciliacion")) {
      return parseAdquisicionFiscal(
        await this.llamar("iniciar_ejecucion_fiscal_administrativa", {
          p_comprobante_id: id,
          p_modo: modo,
          p_ejecucion_id: ejecucion,
          p_actor_id: this.actorId,
        }),
      );
    }
    return super.iniciar(id, modo, ejecucion);
  }
  private async llamar(nombre: string, args: Record<string, unknown>) {
    const { data, error } = await this.local.rpc(nombre, args);
    if (error) {
      throw new AppError(
        "No se confirmó la operación fiscal. Consultá su estado.",
        ["P0001", "40001", "22023", "23505"].includes(error.code) ? 409 : 503,
      );
    }
    return data as unknown;
  }
  async listarCandidatos(limite: number) {
    const value = objetoCerrado(
      await this.llamar("listar_candidatos_fiscales", { p_limite: limite }),
      ["candidatos", "hayMas"],
    );
    if (
      !Array.isArray(value.candidatos) || value.candidatos.length > 10 ||
      typeof value.hayMas !== "boolean"
    ) throw new AppError("La cola fiscal no es válida.", 503);
    const candidatos = value.candidatos.map((v) => {
      const c = objetoCerrado(v, [
        "comprobanteId",
        "recuperable",
        "fechaElegible",
      ]);
      if (
        typeof c.comprobanteId !== "string" || !UUID.test(c.comprobanteId) ||
        typeof c.recuperable !== "boolean" ||
        typeof c.fechaElegible !== "string" ||
        !Number.isFinite(Date.parse(c.fechaElegible))
      ) throw new AppError("El candidato fiscal no es válido.", 503);
      return {
        comprobanteId: c.comprobanteId,
        recuperable: c.recuperable,
        fechaElegible: c.fechaElegible,
      };
    });
    return { candidatos, hayMas: value.hayMas };
  }
  async expirar(id: string) {
    const value = objetoCerrado(
      await this.llamar("expirar_comprobante_fiscal", { p_comprobante_id: id }),
      ["expirado"],
    );
    if (typeof value.expirado !== "boolean") {
      throw new AppError("La expiración no se confirmó.", 503);
    }
    return { expirado: value.expirado };
  }
  async resolverAnulacion(
    id: string,
    version: string,
    resultado: ResultadoSolicitudArca,
    actorId: string,
  ) {
    return parseEjecucionFiscal(
      await this.llamar("resolver_anulacion_fiscal", {
        p_ejecucion_id: id,
        p_version: version,
        p_resultado: resultado,
        p_actor_id: actorId,
      }),
    );
  }
  async resolverSinEnvio(
    id: string,
    execution: string,
    version: string,
    actorId: string,
  ) {
    const value = objetoCerrado(
      await this.llamar("resolver_anulacion_sin_envio_fiscal", {
        p_comprobante_id: id,
        p_ejecucion_id: execution,
        p_version: version,
        p_actor_id: actorId,
      }),
      ["resuelto"],
    );
    if (typeof value.resuelto !== "boolean") {
      throw new AppError("La resolución local no se confirmó.", 503);
    }
    return { resuelto: value.resuelto };
  }
  async resolverRechazoAnulado(
    id: string,
    execution: string,
    version: string,
    actorId: string,
  ) {
    const value = objetoCerrado(
      await this.llamar("resolver_rechazo_anulado_fiscal", {
        p_comprobante_id: id,
        p_ejecucion_id: execution,
        p_version: version,
        p_actor_id: actorId,
      }),
      ["resuelto"],
    );
    if (typeof value.resuelto !== "boolean") {
      throw new AppError("La resolución no se confirmó.", 503);
    }
    return { resuelto: value.resuelto };
  }
  async reabrirVerificado(
    id: string,
    execution: string | null,
    version: string | null,
    actorId: string,
  ) {
    const value = objetoCerrado(
      await this.llamar("reabrir_verificado_fiscal", {
        p_comprobante_id: id,
        p_ejecucion_id: execution,
        p_version: version,
        p_actor_id: actorId,
      }),
      ["reabierto"],
    );
    if (typeof value.reabierto !== "boolean") {
      throw new AppError("La reapertura no se confirmó.", 503);
    }
    return { reabierto: value.reabierto };
  }
  async reabrirSinEnvio(
    id: string,
    execution: string,
    version: string,
    actorId: string,
  ) {
    const value = objetoCerrado(
      await this.llamar("reabrir_sin_envio_fiscal", {
        p_comprobante_id: id,
        p_ejecucion_id: execution,
        p_version: version,
        p_actor_id: actorId,
      }),
      ["reabierto"],
    );
    if (typeof value.reabierto !== "boolean") {
      throw new AppError("La reapertura no se confirmó.", 503);
    }
    return { reabierto: value.reabierto };
  }
  async registrarAutorizacion(
    id: string,
    execution: string,
    version: string,
    resultado: ResultadoSolicitudArca,
    actorId: string,
  ) {
    return parseEjecucionFiscal(
      await this.llamar("registrar_autorizacion_verificada_fiscal", {
        p_comprobante_id: id,
        p_ejecucion_id: execution,
        p_version: version,
        p_resultado: resultado,
        p_actor_id: actorId,
      }),
    );
  }
}

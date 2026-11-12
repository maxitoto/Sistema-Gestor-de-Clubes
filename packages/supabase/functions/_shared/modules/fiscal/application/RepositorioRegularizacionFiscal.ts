import type { RepositorioIntentosFiscales } from "./RepositorioIntentosFiscales.ts";
import type { ResultadoSolicitudArca } from "./PuertoArca.ts";
import type { EjecucionFiscal } from "../domain/intento-fiscal.ts";
export interface CandidatoFiscal {
  comprobanteId: string;
  recuperable: boolean;
  fechaElegible: string;
}
export interface RepositorioRegularizacionFiscal
  extends RepositorioIntentosFiscales {
  listarCandidatos(
    limite: number,
  ): Promise<{ candidatos: CandidatoFiscal[]; hayMas: boolean }>;
  expirar(comprobanteId: string): Promise<{ expirado: boolean }>;
  resolverAnulacion(
    ejecucionId: string,
    version: string,
    resultado: ResultadoSolicitudArca,
    actorId: string,
  ): Promise<EjecucionFiscal>;
  resolverSinEnvio(
    comprobanteId: string,
    ejecucionId: string,
    version: string,
    actorId: string,
  ): Promise<{ resuelto: boolean }>;
  resolverRechazoAnulado(
    comprobanteId: string,
    ejecucionId: string,
    version: string,
    actorId: string,
  ): Promise<{ resuelto: boolean }>;
  reabrirVerificado(
    comprobanteId: string,
    ejecucionId: string | null,
    version: string | null,
    actorId: string,
  ): Promise<{ reabierto: boolean }>;
  reabrirSinEnvio(
    comprobanteId: string,
    ejecucionId: string,
    version: string,
    actorId: string,
  ): Promise<{ reabierto: boolean }>;
  registrarAutorizacion(
    comprobanteId: string,
    ejecucionId: string,
    version: string,
    resultado: ResultadoSolicitudArca,
    actorId: string,
  ): Promise<EjecucionFiscal>;
}

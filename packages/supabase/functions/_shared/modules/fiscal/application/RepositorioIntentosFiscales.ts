import type { ResultadoSolicitudArca } from "./PuertoArca.ts";
import type {
  AdquisicionFiscal,
  ContextoFiscal,
  EjecucionFiscal,
  ModoEjecucionFiscal,
  MotivoIncidenciaFiscal,
} from "../domain/intento-fiscal.ts";
import type { SolicitudFiscal } from "../domain/solicitud-fiscal.ts";
/** Cada operación es una transacción corta; ninguna mantiene locks durante red. */
export interface RepositorioIntentosFiscales {
  leerContexto(comprobanteId: string): Promise<ContextoFiscal | null>;
  consultar(comprobanteId: string): Promise<EjecucionFiscal | null>;
  iniciar(
    comprobanteId: string,
    modo: ModoEjecucionFiscal,
    ejecucionId: string,
  ): Promise<AdquisicionFiscal>;
  preparar(
    ejecucionId: string,
    version: string,
    numero: string,
    solicitud: SolicitudFiscal,
  ): Promise<EjecucionFiscal>;
  marcarEnvio(ejecucionId: string, version: string): Promise<EjecucionFiscal>;
  registrarIncidencia(
    ejecucionId: string,
    version: string,
    motivo: MotivoIncidenciaFiscal,
  ): Promise<EjecucionFiscal>;
  confirmar(
    ejecucionId: string,
    version: string,
    resultado: ResultadoSolicitudArca,
  ): Promise<EjecucionFiscal>;
}

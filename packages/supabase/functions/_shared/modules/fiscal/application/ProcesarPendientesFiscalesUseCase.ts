import type { RepositorioRegularizacionFiscal } from "./RepositorioRegularizacionFiscal.ts";
import type { ResultadoEmisionLocal } from "./ConciliarIntentoUseCase.ts";
export class ProcesarPendientesFiscalesUseCase {
  constructor(
    private repo: RepositorioRegularizacionFiscal,
    private procesarUno: (id: string) => Promise<ResultadoEmisionLocal>,
    private uuid = () => crypto.randomUUID(),
    private reloj = () => performance.now(),
    private presupuestoMs = 25000,
  ) {}
  async ejecutar() {
    const ejecucionId = this.uuid(), inicio = this.reloj();
    const out = {
      ejecucionId,
      evaluados: 0,
      iniciados: 0,
      recuperados: 0,
      autorizados: 0,
      rechazados: 0,
      pendientes: 0,
      expirados: 0,
      omitidos: 0,
      errores: [] as { comprobanteId: string; codigo: string }[],
      hayMas: false,
    };
    let lote;
    try {
      lote = await this.repo.listarCandidatos(10);
    } catch {
      return {
        http: 503 as const,
        body: { ...out, error: "No se pudo consultar la cola fiscal." },
      };
    }
    out.hayMas = lote.hayMas;
    for (let index = 0; index < lote.candidatos.length; index++) {
      if (this.reloj() - inicio >= this.presupuestoMs) {
        out.hayMas = true;
        break;
      }
      const candidato = lote.candidatos[index]!;
      out.evaluados++;
      try {
        const expiracion = await this.repo.expirar(candidato.comprobanteId);
        if (expiracion.expirado) out.expirados++;
        if (expiracion.expirado && !candidato.recuperable) continue;
        const before = await this.repo.consultar(candidato.comprobanteId);
        const result = await this.procesarUno(candidato.comprobanteId);
        if (
          result.resultado === "en_proceso" || result.resultado === "bloqueado"
        ) {
          out.omitidos++;
          continue;
        }
        if (result.ejecucion) {
          if (before?.id === result.ejecucion.id) out.recuperados++;
          else out.iniciados++;
        }
        if (result.resultado === "autorizado") out.autorizados++;
        else if (result.resultado === "rechazado") out.rechazados++;
        else out.pendientes++;
      } catch (error) {
        out.pendientes++;
        out.errores.push({
          comprobanteId: candidato.comprobanteId,
          codigo:
            error instanceof Error && error.name === "ArcaConfiguracionError"
              ? "CONFIGURACION_PENDIENTE"
              : "OPERACION_NO_CONFIRMADA",
        });
      }
    }
    return { http: 200 as const, body: out };
  }
}

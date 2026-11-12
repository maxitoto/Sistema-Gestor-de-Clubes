import type { PuertoArca } from "./PuertoArca.ts";
import { EmitirComprobanteUseCase } from "./EmitirComprobanteUseCase.ts";
import type { RepositorioRegularizacionFiscal } from "./RepositorioRegularizacionFiscal.ts";
import type { ResultadoEmisionLocal } from "./ConciliarIntentoUseCase.ts";
export class RegularizarComprobanteUseCase {
  constructor(
    private repo: RepositorioRegularizacionFiscal,
    private arca: PuertoArca,
    private uuid = () => crypto.randomUUID(),
    private ahora = () => new Date(),
  ) {}
  async ejecutar(
    id: string,
    modo: "manual" | "automatico" = "manual",
  ): Promise<ResultadoEmisionLocal> {
    await this.repo.expirar(id);
    return new EmitirComprobanteUseCase(
      this.repo,
      this.arca,
      this.uuid,
      this.ahora,
    ).ejecutar(id, modo);
  }
}

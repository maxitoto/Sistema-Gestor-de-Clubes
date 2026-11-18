export type AdquisicionTicketWsaa =
  | { tipo: "vigente"; sobre: string; vencimiento: string }
  | { tipo: "adquirido"; version: number }
  | { tipo: "en_curso" };
export interface CacheTicketWsaa {
  adquirir(clave: string, propietario: string): Promise<AdquisicionTicketWsaa>;
  guardar(
    clave: string,
    propietario: string,
    version: number,
    sobre: string,
    vencimiento: string,
  ): Promise<void>;
}

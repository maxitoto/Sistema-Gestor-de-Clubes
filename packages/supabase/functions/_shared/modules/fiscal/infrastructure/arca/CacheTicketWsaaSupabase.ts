import type {
  AdquisicionTicketWsaa,
  CacheTicketWsaa,
} from "../../application/CacheTicketWsaa.ts";
interface ClienteCache {
  rpc(
    nombre: string,
    datos: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
export class CacheTicketWsaaSupabase implements CacheTicketWsaa {
  constructor(private cliente: ClienteCache) {}
  async adquirir(
    clave: string,
    propietario: string,
  ): Promise<AdquisicionTicketWsaa> {
    const { data, error } = await this.cliente.rpc("adquirir_ticket_wsaa", {
      p_clave: clave,
      p_propietario: propietario,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("No se pudo adquirir el ticket fiscal compartido.");
    }
    const row = data as Record<string, unknown>;
    if (
      row.tipo === "vigente" && typeof row.sobre === "string" &&
      typeof row.vencimiento === "string"
    ) {
      return {
        tipo: "vigente",
        sobre: row.sobre,
        vencimiento: row.vencimiento,
      };
    }
    if (
      row.tipo === "adquirido" && Number.isSafeInteger(row.version) &&
      Number(row.version) > 0
    ) return { tipo: "adquirido", version: Number(row.version) };
    if (row.tipo === "en_curso") return { tipo: "en_curso" };
    throw new Error("El resultado del ticket fiscal compartido no es válido.");
  }
  async guardar(
    clave: string,
    propietario: string,
    version: number,
    sobre: string,
    vencimiento: string,
  ): Promise<void> {
    const { error } = await this.cliente.rpc("guardar_ticket_wsaa", {
      p_clave: clave,
      p_propietario: propietario,
      p_version: version,
      p_sobre: sobre,
      p_vencimiento: vencimiento,
    });
    if (error) {
      throw new Error(
        "No se confirmó la persistencia del ticket fiscal compartido.",
      );
    }
  }
}

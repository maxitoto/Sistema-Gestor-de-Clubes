import type { IdentidadFiscal } from "../domain/identidad-fiscal.ts";
import type { SolicitudFiscal } from "../domain/solicitud-fiscal.ts";
import type {
  AutorizacionArca,
  DiagnosticoArca,
  ResultadoConsultaArca,
  ResultadoSolicitudArca,
  ResultadoUltimoArca,
} from "../domain/resultado-arca.ts";
export type {
  AutorizacionArca,
  CodigoArca,
  DiagnosticoArca,
  ResultadoConsultaArca,
  ResultadoSolicitudArca,
  ResultadoUltimoArca,
} from "../domain/resultado-arca.ts";
/** No contiene credenciales. Sólo se solicita después de congelar la ejecución durable. */
export interface PuertoArca {
  obtenerUltimoAutorizado(
    identidad: IdentidadFiscal,
  ): Promise<ResultadoUltimoArca>;
  consultar(
    identidad: IdentidadFiscal,
    numero: string,
  ): Promise<ResultadoConsultaArca>;
  solicitar(solicitud: SolicitudFiscal): Promise<ResultadoSolicitudArca>;
  diagnosticar(cuit: string): Promise<DiagnosticoArca>;
}
export function autorizacionCoincide(
  s: SolicitudFiscal,
  a: AutorizacionArca,
): boolean {
  const d = s.detalle, i = s.identidad;
  return a.identidad.cuit === i.cuit && a.identidad.ambiente === i.ambiente &&
    a.identidad.puntoVenta === i.puntoVenta &&
    a.identidad.tipoComprobante === i.tipoComprobante &&
    a.numero === d.CbteDesde && a.fecha === d.CbteFch &&
    a.docTipo === d.DocTipo && a.docNro === d.DocNro &&
    a.concepto === d.Concepto && a.moneda === d.MonId &&
    a.cotizacion === d.MonCotiz && a.importeTotal === d.ImpTotal &&
    a.importeNeto === d.ImpNeto && a.importeNoGravado === d.ImpTotConc &&
    a.importeExento === d.ImpOpEx && a.importeIva === d.ImpIVA &&
    a.importeTributos === d.ImpTrib &&
    JSON.stringify(ordenar(a.detalle)) === JSON.stringify(ordenar(d));
}

function ordenar(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(ordenar)
    : value && typeof value === "object"
    ? Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map((
        [k, v],
      ) => [k, ordenar(v)]),
    )
    : value;
}

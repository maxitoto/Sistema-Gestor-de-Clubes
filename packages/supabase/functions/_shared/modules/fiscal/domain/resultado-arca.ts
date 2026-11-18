import type { IdentidadFiscal } from "./identidad-fiscal.ts";
import type { DetalleFiscal } from "./solicitud-fiscal.ts";
export interface CodigoArca {
  codigo: string;
  mensaje: string;
}
export interface AutorizacionArca {
  identidad: IdentidadFiscal;
  numero: string;
  cae: string;
  vencimiento: string;
  fecha: string;
  docTipo: number;
  docNro: string;
  concepto: number;
  moneda: string;
  cotizacion: string;
  importeTotal: string;
  importeNeto: string;
  importeNoGravado: string;
  importeExento: string;
  importeIva: string;
  importeTributos: string;
  detalle: DetalleFiscal;
}
export type ResultadoSolicitudArca =
  | {
    tipo: "autorizado";
    autorizacion: AutorizacionArca;
    observaciones: CodigoArca[];
  }
  | { tipo: "rechazado"; codigos: CodigoArca[] }
  | { tipo: "transitorio"; codigos: CodigoArca[] }
  | { tipo: "desconocido"; codigos: CodigoArca[] };
export type ResultadoConsultaArca =
  | {
    tipo: "encontrado";
    autorizacion: AutorizacionArca;
    observaciones: CodigoArca[];
  }
  | { tipo: "no_encontrado"; codigos: CodigoArca[] }
  | { tipo: "ambiguo"; codigos: CodigoArca[] };
export type ResultadoUltimoArca = { tipo: "obtenido"; numero: string } | {
  tipo: "no_disponible";
  codigos: CodigoArca[];
};
export interface DiagnosticoArca {
  autenticado: true;
  ambiente: "homologacion";
  servicio: "wsfe";
  /** Sólo HTTP200/SOAP válido con602 exclusivo y listado ausente/vacío. No valida un PV. */
  ausenciaDatos?: "602";
  puntosVenta: {
    numero: number;
    emisionTipo: string;
    bloqueado: boolean;
    bajaFecha: string | null;
  }[];
}

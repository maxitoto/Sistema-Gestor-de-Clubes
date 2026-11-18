import type { SolicitudFiscal } from "../domain/solicitud-fiscal.ts";
export type VersionDocumento = "provisional" | "autorizado";
export class DocumentoError extends Error {
  constructor(message: string, public statusCode = 409) {
    super(message);
  }
}
export interface FuenteDocumento {
  comprobanteId: string;
  pagoId: string;
  tipo: string;
  estadoFiscal: string;
  puntoVenta: number;
  numero: string | null;
  cae: string | null;
  vencimiento: string | null;
  solicitud: unknown;
  actualizadoEn: string | null;
  pago: { estado: string; importe: string; fecha: string; medio: string };
  club: { nombre: string; cuit: string; domicilio: string };
  socio: { nombre: string; documento: string };
  concepto: string;
  periodo: string;
  anulacion?: { fecha: string; motivo: string };
  original?: {
    id: string;
    pagoId: string;
    numero: string | null;
    puntoVenta: number;
    tipoFiscal: number | null;
    cuit: string | null;
    cae: string | null;
    solicitud: unknown;
  };
}
export interface ModeloDocumento {
  tipoDocumento?: "factura" | "nota_credito";
  estadoDocumento?: string;
  anulacion?: { fecha: string; motivo: string };
  original?: {
    id: string;
    numero: string;
    puntoVenta: number;
    tipoFiscal: number;
    cuit: string;
  };
  version: VersionDocumento;
  comprobanteId: string;
  pagoId: string;
  emisor: { nombre: string; cuit: string; domicilio: string };
  receptor: { nombre: string; documento: string; domicilio?: string };
  concepto: string;
  periodo: string;
  importe: string;
  moneda: string;
  fechaCobro: string;
  medioPago: string;
  fiscal: null | {
    solicitud: SolicitudFiscal;
    numero: string;
    cae: string;
    vencimiento: string;
  };
}
export interface PuertoGeneradorPdf {
  generar(modelo: ModeloDocumento): Promise<Uint8Array>;
}
export interface RepositorioDocumentos {
  leerFuente(comprobanteId: string): Promise<FuenteDocumento | null>;
  guardar(path: string, bytes: Uint8Array): Promise<void>;
  confirmarReferencia(
    fuente: FuenteDocumento,
    version: VersionDocumento,
    path: string,
  ): Promise<void>;
  firmar(path: string): Promise<string>;
}
export interface ResultadoDocumento {
  comprobanteId: string;
  version: VersionDocumento;
  storagePath: string;
  url: string;
  expiresIn: number;
  nombreArchivo: string;
}

export {
	consultarSerieFiscal,
	diagnosticarFiscal,
	emitirComprobante,
	generarPdfComprobante,
	getEstadoComprobante,
} from './api/fiscal.api';
export type {
	CodigoConsultaSerieFiscal,
	ResultadoConsultaSerieFiscal,
} from './model/consultaSerieFiscalContract';
export type {
	PuntoVentaHomologacion,
	ResultadoDiagnosticoFiscal,
} from './model/diagnosticoFiscalContract';
export type { DocumentoComprobante, EstadoFiscalComprobante } from './model/fiscalContract';

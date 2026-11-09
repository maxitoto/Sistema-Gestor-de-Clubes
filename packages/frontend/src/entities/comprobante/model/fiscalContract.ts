export interface EstadoFiscalComprobante {
	tipoDocumento?: 'factura' | 'nota_credito';
	comprobanteOrigenId?: string | null;
	notaCreditoId?: string | null;
	comprobanteId: string;
	pagoId: string;
	cobroConfirmado: boolean;
	estadoFiscal: string;
	numero: string | null;
	cae: string | null;
	vencimiento: string | null;
	operacion: string | null;
	emisionDisponible: boolean;
	aviso: string | null;
	pdfVersion: 'provisional' | 'autorizado' | null;
}
export interface DocumentoComprobante {
	comprobanteId: string;
	version: 'provisional' | 'autorizado';
	storagePath: string;
	url: string;
	expiresIn: number;
	nombreArchivo: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nullable = (v: unknown) => v === null || typeof v === 'string';
type CamposFiscal = keyof EstadoFiscalComprobante | keyof DocumentoComprobante;
type FilaFiscal = { [K in CamposFiscal]?: unknown };
function row(value: unknown): FilaFiscal {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('La respuesta documental no es válida.');
	}
	return value as FilaFiscal;
}
export function parseEstadoFiscal(value: unknown, id: string): EstadoFiscalComprobante {
	const v = row(value);
	if (
		v.comprobanteId !== id ||
		!UUID.test(id) ||
		typeof v.pagoId !== 'string' ||
		!UUID.test(v.pagoId) ||
		typeof v.cobroConfirmado !== 'boolean' ||
		typeof v.estadoFiscal !== 'string' ||
		!['valido', 'pendiente_cae', 'anulacion_pendiente', 'anulado', 'fallido'].includes(
			v.estadoFiscal,
		) ||
		typeof v.emisionDisponible !== 'boolean' ||
		![v.numero, v.cae, v.vencimiento, v.operacion, v.aviso].every(nullable) ||
		![null, 'provisional', 'autorizado'].includes(v.pdfVersion as string | null)
	) {
		throw new Error('La respuesta no corresponde al comprobante solicitado. Consultá nuevamente.');
	}
	if (
		v.operacion !== null &&
		![
			'adquirida',
			'preparada',
			'posible_envio',
			'desconocido',
			'autorizado',
			'rechazado',
			'transitorio',
			'incidencia',
		].includes(String(v.operacion))
	) {
		throw new Error('El estado del intento no es válido.');
	}
	if (
		(v.estadoFiscal === 'valido' || v.pdfVersion === 'autorizado' || v.cae !== null) &&
		(typeof v.numero !== 'string' ||
			!/^[1-9]\d{0,11}$/.test(v.numero) ||
			typeof v.cae !== 'string' ||
			!/^\d{14}$/.test(v.cae) ||
			/^0+$/.test(v.cae) ||
			typeof v.vencimiento !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(v.vencimiento) ||
			!Number.isFinite(new Date(`${v.vencimiento}T12:00:00Z`).getTime()) ||
			new Date(`${v.vencimiento}T12:00:00Z`).toISOString().slice(0, 10) !== v.vencimiento)
	) {
		throw new Error('La autorización persistida está incompleta.');
	}
	if (
		v.tipoDocumento !== undefined ||
		v.comprobanteOrigenId !== undefined ||
		v.notaCreditoId !== undefined
	) {
		if (
			!['factura', 'nota_credito'].includes(String(v.tipoDocumento)) ||
			![v.comprobanteOrigenId, v.notaCreditoId].every(
				(value) => value === null || (typeof value === 'string' && UUID.test(value)),
			) ||
			v.comprobanteOrigenId === id ||
			v.notaCreditoId === id ||
			(v.tipoDocumento === 'factura' && v.comprobanteOrigenId !== null) ||
			(v.tipoDocumento === 'nota_credito' &&
				(v.comprobanteOrigenId === null || v.notaCreditoId !== null))
		) {
			throw new Error('La relación documental no es válida.');
		}
	}
	return v as unknown as EstadoFiscalComprobante;
}
export function parseDocumentoComprobante(
	value: unknown,
	id: string,
	base: string,
): DocumentoComprobante {
	const v = row(value);
	if (
		v.comprobanteId !== id ||
		!UUID.test(id) ||
		!['provisional', 'autorizado'].includes(String(v.version)) ||
		typeof v.storagePath !== 'string' ||
		!new RegExp(`^comprobantes/${id}/${v.version}/[0-9a-f]{64}\\.pdf$`).test(v.storagePath) ||
		typeof v.url !== 'string' ||
		v.expiresIn !== 600 ||
		typeof v.nombreArchivo !== 'string' ||
		v.nombreArchivo !== `comprobante-${id}-${v.version}.pdf`
	) {
		throw new Error('No se pudo verificar la identidad del PDF.');
	}
	const url = new URL(v.url),
		origin = new URL(base);
	if (
		url.origin !== origin.origin ||
		url.username ||
		url.password ||
		url.pathname !== `/storage/v1/object/sign/club-archivos/${v.storagePath}` ||
		url.hash !== '' ||
		url.searchParams.getAll('token').length !== 1 ||
		!(url.searchParams.get('token') ?? '').trim()
	) {
		throw new Error('El enlace no pertenece al almacenamiento privado del sistema.');
	}
	return v as unknown as DocumentoComprobante;
}

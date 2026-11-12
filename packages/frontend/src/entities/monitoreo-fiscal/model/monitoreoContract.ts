import { esUuidCobranza } from '#shared/types/cobranza';
export type AccionMonitoreo = 'forzar' | 'reabrir' | 'resolver' | 'registrar-externo';
export interface CriteriosMonitoreo {
	page: number;
	pageSize: 20 | 50 | 100;
	estado: 'todos' | 'pendiente_cae' | 'fallido' | 'anulacion_pendiente';
	tipo: 'todos' | 'factura' | 'nota_credito';
	q: string;
	desde: string;
	hasta: string;
}
export const criteriosMonitoreoIniciales = (): CriteriosMonitoreo => ({
	page: 1,
	pageSize: 20,
	estado: 'todos',
	tipo: 'todos',
	q: '',
	desde: '',
	hasta: '',
});
export interface FilaMonitoreo {
	comprobanteId: string;
	pagoId: string;
	socio: { id: string; nombre: string; apellido: string; dni: string; nroSocio: number };
	tipo: 'factura' | 'nota_credito';
	estadoFiscal: 'pendiente_cae' | 'fallido' | 'anulacion_pendiente';
	fechaCobro: string;
	monto: string;
	intentos: number;
	ventanaInicio: string | null;
	ventanaFin: string | null;
	proximoReintento: string | null;
	numero: string | null;
	cae: string | null;
	vencimiento: string | null;
	detalleError: string | null;
	origenId: string | null;
	ncId: string | null;
	pagoEstado: 'completado' | 'anulado';
	operacion: string | null;
	acciones: { forzar: boolean; reabrir: boolean; resolver: boolean; registrarExterno: boolean };
	bloqueo: string | null;
}
export interface ResultadoMonitoreo {
	items: FilaMonitoreo[];
	total: number;
	page: number;
	pageSize: number;
	conteos: { pendientes: number; fallidos: number; anulacionPendiente: number };
	externoHabilitado: boolean;
}
type Row = Record<string, unknown> & {
	[K in
		| keyof FilaMonitoreo
		| keyof FilaMonitoreo['socio']
		| keyof FilaMonitoreo['acciones']
		| keyof ResultadoMonitoreo
		| keyof ResultadoMonitoreo['conteos']
		| keyof ResultadoAccionFiscal]?: unknown;
};
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nullableDate = (v: unknown) => v === null || date(v);
const nullableText = (v: unknown) => v === null || typeof v === 'string';
const nullableUuid = (v: unknown) => v === null || esUuidCobranza(v);
const nonnegative = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
export function parseFilaMonitoreo(value: unknown): FilaMonitoreo {
	if (!object(value) || !object(value.socio) || !object(value.acciones)) {
		throw new Error('El monitoreo fiscal devolvió una fila inválida.');
	}
	const socio = value.socio,
		a = value.acciones;
	if (
		![value.comprobanteId, value.pagoId, socio.id].every(esUuidCobranza) ||
		![socio.nombre, socio.apellido, socio.dni].every((v) => typeof v === 'string') ||
		!Number.isSafeInteger(socio.nroSocio) ||
		Number(socio.nroSocio) < 1 ||
		!['factura', 'nota_credito'].includes(String(value.tipo)) ||
		!['pendiente_cae', 'fallido', 'anulacion_pendiente'].includes(String(value.estadoFiscal)) ||
		!date(value.fechaCobro) ||
		typeof value.monto !== 'string' ||
		!/^\d+\.\d{2}$/.test(value.monto) ||
		!Number.isSafeInteger(value.intentos) ||
		Number(value.intentos) < 0 ||
		Number(value.intentos) > 6 ||
		![value.ventanaInicio, value.ventanaFin, value.proximoReintento].every(nullableDate) ||
		![
			value.numero,
			value.cae,
			value.vencimiento,
			value.detalleError,
			value.bloqueo,
			value.operacion,
		].every(nullableText) ||
		![value.origenId, value.ncId].every(nullableUuid) ||
		!['completado', 'anulado'].includes(String(value.pagoEstado)) ||
		!['forzar', 'reabrir', 'resolver'].every((k) => typeof a[k] === 'boolean') ||
		(a.registrarExterno !== undefined && typeof a.registrarExterno !== 'boolean')
	) {
		throw new Error('La consulta fiscal no cumple su contrato.');
	}
	if (
		value.ventanaInicio !== null &&
		value.ventanaFin !== null &&
		Date.parse(value.ventanaFin as string) <= Date.parse(value.ventanaInicio as string)
	) {
		throw new Error('La ventana fiscal consultada no es coherente.');
	}
	return {
		...value,
		acciones: {
			forzar: a.forzar,
			reabrir: a.reabrir,
			resolver: a.resolver,
			registrarExterno: a.registrarExterno ?? false,
		},
	} as unknown as FilaMonitoreo;
}
export function parseResultadoMonitoreo(
	value: unknown,
	criteria: Pick<CriteriosMonitoreo, 'page' | 'pageSize'>,
): ResultadoMonitoreo {
	if (
		!object(value) ||
		!Array.isArray(value.items) ||
		!object(value.conteos) ||
		!nonnegative(value.total) ||
		value.page !== criteria.page ||
		value.pageSize !== criteria.pageSize ||
		typeof value.externoHabilitado !== 'boolean' ||
		!['pendientes', 'fallidos', 'anulacionPendiente'].every((k) =>
			nonnegative((value.conteos as Row)[k]),
		)
	) {
		throw new Error('No se pudo verificar la página de monitoreo.');
	}
	const items = value.items.map(parseFilaMonitoreo);
	if (
		items.length > criteria.pageSize ||
		items.length > Number(value.total) ||
		new Set(items.map((row) => row.comprobanteId)).size !== items.length
	) {
		throw new Error('El conteo de monitoreo no es coherente.');
	}
	return {
		items,
		total: Number(value.total),
		page: criteria.page,
		pageSize: criteria.pageSize,
		conteos: value.conteos as unknown as ResultadoMonitoreo['conteos'],
		externoHabilitado: value.externoHabilitado,
	};
}
export interface ResultadoAccionFiscal {
	resultado:
		| 'autorizado'
		| 'rechazado'
		| 'pendiente'
		| 'en_proceso'
		| 'bloqueado'
		| 'reabierto'
		| 'resuelto'
		| 'sin_cambios';
	advertencia: string | null;
}
export function parseResultadoAccionFiscal(value: unknown): ResultadoAccionFiscal {
	if (
		!object(value) ||
		![
			'autorizado',
			'rechazado',
			'pendiente',
			'en_proceso',
			'bloqueado',
			'reabierto',
			'resuelto',
			'sin_cambios',
		].includes(String(value.resultado)) ||
		!nullableText(value.advertencia)
	) {
		throw Object.assign(
			new Error(
				'No pudimos verificar el resultado de la acción fiscal. Consultá el estado antes de repetirla.',
			),
			{ responseReceived: true },
		);
	}
	return {
		resultado: value.resultado as ResultadoAccionFiscal['resultado'],
		advertencia: value.advertencia as string | null,
	};
}
export const tituloAccionFiscal = (accion: AccionMonitoreo) =>
	({
		forzar: 'Forzar regularización',
		reabrir: 'Reabrir regularización',
		resolver: 'Conciliar anulación',
		'registrar-externo': 'Consultar regularización externa',
	})[accion];
export function puedeAccionFiscal(
	row: FilaMonitoreo,
	accion: AccionMonitoreo,
	admin: boolean,
	externo: boolean,
): boolean {
	const key = accion === 'registrar-externo' ? 'registrarExterno' : accion;
	if (accion === 'resolver' && row.estadoFiscal !== 'anulacion_pendiente') {
		return false;
	}
	return admin && row.acciones[key] && (accion === 'reabrir' || accion === 'resolver' || externo);
}

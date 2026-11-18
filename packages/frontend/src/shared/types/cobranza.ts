export type VistaCobranza = 'cuotas' | 'pagos';
export interface CriteriosCobranza {
	pagina: number;
	limite: 20 | 50 | 100;
	buscar: string;
	comprobante: string;
	desde: string;
	hasta: string;
	medio: 'todos' | 'efectivo' | 'transferencia';
	estado_recibo: 'todos' | 'activo' | 'pendiente_cae' | 'fallido' | 'anulado';
	estado_cuota: 'todos' | 'pendiente' | 'pagada';
	estado_socio: 'todos' | 'activo' | 'inactivo';
	deporte_id: string;
	categoria_id: string;
	socio_id: string;
	cuota_id: string;
	pago_id: string;
	comprobante_id: string;
	periodo_mes: number | null;
	periodo_anio: number | null;
	orden: 'fecha' | 'socio' | 'periodo' | 'monto' | 'medio' | 'numero' | 'estado';
	direccion: 'asc' | 'desc';
}
export const criteriosCobranzaIniciales = (): CriteriosCobranza => ({
	pagina: 0,
	limite: 20,
	buscar: '',
	comprobante: '',
	desde: '',
	hasta: '',
	medio: 'todos',
	estado_recibo: 'todos',
	estado_cuota: 'todos',
	estado_socio: 'todos',
	deporte_id: '',
	categoria_id: '',
	socio_id: '',
	cuota_id: '',
	pago_id: '',
	comprobante_id: '',
	periodo_mes: null,
	periodo_anio: null,
	orden: 'fecha',
	direccion: 'desc',
});
export interface FilaCobranza {
	id: string;
	cuota_id: string;
	pago_id: string | null;
	comprobante_id: string | null;
	socio_id: string;
	socio_numero: number;
	socio_dni: string;
	socio_nombre: string;
	socio_apellido: string;
	socio_estado: 'activo' | 'inactivo';
	categoria_id: string;
	categoria_nombre: string;
	deporte_id: string;
	deporte_nombre: string;
	periodo_mes: number;
	periodo_anio: number;
	monto: number;
	estado_cuota: 'pendiente' | 'pagada';
	estado_pago: 'completado' | 'anulado' | null;
	estado_fiscal: 'valido' | 'pendiente_cae' | 'fallido' | 'anulado' | 'anulacion_pendiente' | null;
	etiqueta_recibo: 'activo' | 'pendiente_cae' | 'fallido' | 'anulado' | null;
	numero_comprobante: string | null;
	fecha: string | null;
	fecha_pago: string | null;
	medio: 'efectivo' | 'transferencia' | null;
	referencia: string | null;
	usuario_id: string | null;
	es_moroso: boolean;
	deuda_pendiente: number;
	cuota_en_mora: boolean;
}
export interface ResultadoCobranza {
	filas: FilaCobranza[];
	total: number;
	deuda_filtrada: string;
}
export const esUuidCobranza = (value: unknown): value is string =>
	typeof value === 'string' &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isRecord = (
	value: unknown,
): value is Record<string, unknown> & {
	[K in keyof FilaCobranza | keyof ResultadoCobranza]?: unknown;
} => !!value && typeof value === 'object' && !Array.isArray(value);
const numeric = (v: unknown) =>
	typeof v === 'number' &&
	Number.isFinite(v) &&
	v >= 0 &&
	Number.isSafeInteger(Math.round(v * 100)) &&
	Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
const decimal = (v: unknown): v is string => typeof v === 'string' && /^\d+(?:\.\d{1,2})?$/.test(v);
const nullableString = (v: unknown) => v === null || typeof v === 'string';
export function parseFilaCobranza(value: unknown): FilaCobranza {
	if (!isRecord(value)) {
		throw new Error('La consulta de cobranza devolvió una fila inválida.');
	}
	for (const name of ['id', 'cuota_id', 'socio_id', 'categoria_id', 'deporte_id']) {
		if (!esUuidCobranza(value[name])) {
			throw new Error('Identidad de cobranza inválida.');
		}
	}
	for (const name of ['pago_id', 'comprobante_id', 'usuario_id']) {
		if (value[name] !== null && !esUuidCobranza(value[name])) {
			throw new Error('Identidad vinculada inválida.');
		}
	}
	for (const name of [
		'socio_nombre',
		'socio_apellido',
		'socio_dni',
		'categoria_nombre',
		'deporte_nombre',
	]) {
		if (typeof value[name] !== 'string') {
			throw new Error('Datos de cobranza incompletos.');
		}
	}
	for (const name of ['fecha', 'fecha_pago', 'numero_comprobante', 'referencia']) {
		if (!nullableString(value[name])) {
			throw new Error('Datos de cobranza inválidos.');
		}
	}
	if (
		!Number.isSafeInteger(value.socio_numero) ||
		Number(value.socio_numero) < 1 ||
		!Number.isInteger(value.periodo_mes) ||
		Number(value.periodo_mes) < 1 ||
		Number(value.periodo_mes) > 12 ||
		!Number.isInteger(value.periodo_anio) ||
		Number(value.periodo_anio) <= 2000 ||
		!numeric(value.monto) ||
		!numeric(value.deuda_pendiente) ||
		!['activo', 'inactivo'].includes(String(value.socio_estado)) ||
		!['pendiente', 'pagada'].includes(String(value.estado_cuota)) ||
		![null, 'completado', 'anulado'].includes(value.estado_pago as string | null) ||
		![null, 'valido', 'pendiente_cae', 'fallido', 'anulado', 'anulacion_pendiente'].includes(
			value.estado_fiscal as string | null,
		) ||
		![null, 'activo', 'pendiente_cae', 'fallido', 'anulado'].includes(
			value.etiqueta_recibo as string | null,
		) ||
		![null, 'efectivo', 'transferencia'].includes(value.medio as string | null) ||
		typeof value.es_moroso !== 'boolean' ||
		typeof value.cuota_en_mora !== 'boolean'
	) {
		throw new Error('La consulta de cobranza no cumple su contrato.');
	}
	return value as unknown as FilaCobranza;
}
export function parseResultadoCobranza(value: unknown): ResultadoCobranza {
	if (
		!isRecord(value) ||
		Object.keys(value).sort().join(',') !== 'deuda_filtrada,filas,total' ||
		!Array.isArray(value.filas) ||
		!Number.isSafeInteger(value.total) ||
		Number(value.total) < 0 ||
		!decimal(value.deuda_filtrada)
	) {
		throw new Error('No se pudo verificar la consulta de cobranza.');
	}
	const filas = value.filas.map(parseFilaCobranza);
	if (filas.length > 100 || filas.length > Number(value.total)) {
		throw new Error('Conteo de cobranza incoherente.');
	}
	return { filas, total: Number(value.total), deuda_filtrada: value.deuda_filtrada };
}
export function monedaCobranza(value: number | string): string {
	const raw = typeof value === 'number' ? value.toFixed(2) : value;
	if (!decimal(raw)) {
		return 'Importe no disponible';
	}
	const [whole, cents = ''] = raw.split('.');
	return `$ ${BigInt(whole ?? '0').toLocaleString('es-AR')},${cents.padEnd(2, '0')}`;
}
export const periodoCobranza = (row: Pick<FilaCobranza, 'periodo_mes' | 'periodo_anio'>) =>
	`${String(row.periodo_mes).padStart(2, '0')}/${row.periodo_anio}`;
const formatoFechaCobranza = new Intl.DateTimeFormat('es-AR', {
	timeZone: 'America/Argentina/Buenos_Aires',
	dateStyle: 'short',
	timeStyle: 'short',
});
export const fechaCobranza = (value: string | null) =>
	value ? formatoFechaCobranza.format(new Date(value)) : 'Sin fecha registrada';
export const estadoFiscalDocumento = (estado: FilaCobranza['estado_fiscal']) =>
	estado === 'valido'
		? 'Autorizado'
		: estado === 'fallido'
			? 'Fiscal fallido'
			: estado === 'anulacion_pendiente'
				? 'Anulación fiscal pendiente'
				: estado === 'anulado'
					? 'Documento anulado'
					: estado === 'pendiente_cae'
						? 'Pendiente de CAE'
						: 'Sin documento consultable';
export const estadoFiscalCobranza = (row: FilaCobranza) =>
	row.estado_pago === 'anulado' ? 'Cobro anulado' : estadoFiscalDocumento(row.estado_fiscal);

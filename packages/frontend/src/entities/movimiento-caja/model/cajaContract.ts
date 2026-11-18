export interface CriteriosCaja {
	desde: string;
	hasta: string;
	pagina: number;
	limite: 20 | 50 | 100;
	tipo: 'todos' | 'ingreso' | 'egreso';
	metodo: 'todos' | 'efectivo' | 'transferencia';
	origen: 'todos' | 'cobro' | 'gasto';
	reversos: 'todos' | 'originales' | 'reversos';
	estado: 'todos' | 'vigente' | 'anulado';
	texto: string;
	orden: 'fecha' | 'monto' | 'concepto' | 'tipo' | 'metodo' | 'estado';
	direccion: 'asc' | 'desc';
}
export const criteriosCajaIniciales: CriteriosCaja = {
	desde: '',
	hasta: '',
	pagina: 0,
	limite: 20,
	tipo: 'todos',
	metodo: 'todos',
	origen: 'todos',
	reversos: 'todos',
	estado: 'todos',
	texto: '',
	orden: 'fecha',
	direccion: 'desc',
};
export interface MovimientoCaja {
	tipo: 'ingreso' | 'egreso';
	movimientoId: string;
	fecha: string;
	monto: string;
	metodo: 'efectivo' | 'transferencia';
	referencia: string | null;
	concepto: string;
	estado: 'activo' | 'completado' | 'anulado';
	autor: string;
	esReverso: boolean;
	origen: 'cobro' | 'gasto';
	origenId: string;
	cargadoEn: string | null;
	fechaNegocio: string | null;
}
export interface ResultadoCaja {
	version: 1;
	total: number;
	pagina: number;
	limite: 20 | 50 | 100;
	filas: MovimientoCaja[];
	totales: { ingresos: string; egresos: string; neto: string } | null;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const money = /^-?(?:0|[1-9][0-9]{0,21})\.[0-9]{2}$/;
type CajaRecord = Record<string, unknown> &
	Partial<
		Record<keyof ResultadoCaja | keyof MovimientoCaja | 'ingresos' | 'egresos' | 'neto', unknown>
	>;
const record = (value: unknown): value is CajaRecord =>
	!!value && typeof value === 'object' && !Array.isArray(value);
function keys(value: Record<string, unknown>, expected: string[]) {
	return (
		Object.keys(value).length === expected.length &&
		expected.every((key) => Object.hasOwn(value, key))
	);
}
export function fechaCajaValida(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
		new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
	);
}
function instant(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^\d{4}-\d{2}-\d{2}T/.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}
export function claveMovimientoCaja(
	row: Pick<MovimientoCaja, 'tipo' | 'movimientoId' | 'esReverso'>,
): string {
	return `${row.tipo}:${row.movimientoId}:${row.esReverso ? 'reverso' : 'original'}`;
}
export function urlOrigenCaja(row: Pick<MovimientoCaja, 'origen' | 'origenId'>): string {
	return row.origen === 'cobro'
		? `/pagos?pagoId=${encodeURIComponent(row.origenId)}`
		: `/gastos?gastoId=${encodeURIComponent(row.origenId)}`;
}
/** El importe se representa como decimal exacto; no hay sumas ni redondeo binario en cliente. */
export function formatearImporteCaja(value: string): string {
	if (!money.test(value)) {
		throw new Error('Importe no válido.');
	}
	const negative = value.startsWith('-');
	const [whole, fraction] = (negative ? value.slice(1) : value).split('.');
	return `${negative ? '-' : ''}$ ${new Intl.NumberFormat('es-AR').format(BigInt(whole ?? '0'))},${fraction}`;
}
export function interpretarCaja(
	value: unknown,
	criteria: Pick<CriteriosCaja, 'pagina' | 'limite'>,
): ResultadoCaja {
	const fail = () => {
		throw new Error('No se pudo verificar la consulta de movimientos. Actualizá los resultados.');
	};
	if (
		!record(value) ||
		!keys(value, ['version', 'total', 'pagina', 'limite', 'filas', 'totales']) ||
		value.version !== 1 ||
		typeof value.total !== 'number' ||
		!Number.isSafeInteger(value.total) ||
		value.total < 0 ||
		value.pagina !== criteria.pagina ||
		value.limite !== criteria.limite ||
		!Array.isArray(value.filas) ||
		value.filas.length > criteria.limite
	) {
		return fail();
	}
	const totals = value.totales;
	if (totals !== null) {
		if (
			!record(totals) ||
			!keys(totals, ['ingresos', 'egresos', 'neto']) ||
			!['ingresos', 'egresos', 'neto'].every(
				(key) => typeof totals[key] === 'string' && money.test(totals[key] as string),
			) ||
			String(totals.ingresos).startsWith('-') ||
			String(totals.egresos).startsWith('-')
		) {
			return fail();
		}
	}
	const seen = new Set<string>();
	for (const row of value.filas) {
		if (
			!record(row) ||
			!keys(row, [
				'tipo',
				'movimientoId',
				'fecha',
				'monto',
				'metodo',
				'referencia',
				'concepto',
				'estado',
				'autor',
				'esReverso',
				'origen',
				'origenId',
				'cargadoEn',
				'fechaNegocio',
			]) ||
			!['ingreso', 'egreso'].includes(String(row.tipo)) ||
			typeof row.movimientoId !== 'string' ||
			!uuid.test(row.movimientoId) ||
			!instant(row.fecha) ||
			typeof row.monto !== 'string' ||
			!money.test(row.monto) ||
			row.monto.startsWith('-') ||
			row.monto === '0.00' ||
			!['efectivo', 'transferencia'].includes(String(row.metodo)) ||
			(row.referencia !== null && typeof row.referencia !== 'string') ||
			typeof row.concepto !== 'string' ||
			!row.concepto ||
			!['activo', 'completado', 'anulado'].includes(String(row.estado)) ||
			typeof row.autor !== 'string' ||
			!row.autor ||
			typeof row.esReverso !== 'boolean' ||
			!['cobro', 'gasto'].includes(String(row.origen)) ||
			row.origenId !== row.movimientoId ||
			(row.cargadoEn !== null && !instant(row.cargadoEn)) ||
			(row.fechaNegocio !== null &&
				(typeof row.fechaNegocio !== 'string' || !fechaCajaValida(row.fechaNegocio)))
		) {
			return fail();
		}
		if (
			row.origen !== ((row.tipo === 'ingreso') !== row.esReverso ? 'cobro' : 'gasto') ||
			(row.esReverso && row.estado !== 'anulado') ||
			(row.origen === 'cobro' && row.estado === 'activo') ||
			(row.origen === 'gasto' && row.estado === 'completado')
		) {
			return fail();
		}
		const key = claveMovimientoCaja(row as unknown as MovimientoCaja);
		if (seen.has(key)) {
			return fail();
		}
		seen.add(key);
	}
	if (
		value.filas.length > value.total ||
		value.filas.length !==
			Math.max(0, Math.min(criteria.limite, value.total - criteria.pagina * criteria.limite))
	) {
		return fail();
	}
	return value as unknown as ResultadoCaja;
}

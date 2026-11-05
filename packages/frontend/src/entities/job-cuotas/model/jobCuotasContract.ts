export interface PeriodoCuotas {
	mes: number;
	anio: number;
}

export interface ResultadoGeneracion {
	resultado: 'generado' | 'ya_ejecutado' | 'fallido';
	job_id: string;
	periodo_mes: number;
	periodo_anio: number;
	cuotas_generadas: number;
	cuotas_omitidas: number;
	codigo_error?: string;
}

export interface JobCuotas {
	id: string;
	periodo_mes: number;
	periodo_anio: number;
	estado: 'procesando' | 'exitoso' | 'fallido';
	cuotas_generadas: number;
	cuotas_omitidas: number;
	fecha_inicio: string;
	fecha_fin: string | null;
}

type RawJob = Partial<Record<keyof ResultadoGeneracion | keyof JobCuotas, unknown>> &
	Record<string, unknown>;

function object(value: unknown): RawJob {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Respuesta de generación inválida.');
	}
	return value as RawJob;
}

function entero(value: unknown, min = 0): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

export function esPeriodoCuotas(value: unknown): value is PeriodoCuotas {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const row = value as Partial<PeriodoCuotas>;
	return entero(row.mes, 1) && row.mes <= 12 && entero(row.anio, 2001);
}

export function mismoPeriodo(left: PeriodoCuotas, right: PeriodoCuotas) {
	return left.mes === right.mes && left.anio === right.anio;
}

export function periodoCuotasDeFecha(value: unknown): PeriodoCuotas {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw new Error('No se pudo determinar el período actual del club.');
	}
	const date = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
		throw new Error('La fecha recibida no es válida.');
	}
	const periodo = { mes: Number(value.slice(5, 7)), anio: Number(value.slice(0, 4)) };
	if (!esPeriodoCuotas(periodo)) {
		throw new Error('Período de cuotas inválido.');
	}
	return periodo;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseResultadoGeneracion(value: unknown): ResultadoGeneracion {
	const row = object(value);
	const failed = row.resultado === 'fallido';
	const keys = [
		'resultado',
		'job_id',
		'periodo_mes',
		'periodo_anio',
		'cuotas_generadas',
		'cuotas_omitidas',
		...(failed ? ['codigo_error'] : []),
	];
	if (
		Object.keys(row).length !== keys.length ||
		keys.some((key) => !(key in row)) ||
		!['generado', 'ya_ejecutado', 'fallido'].includes(String(row.resultado)) ||
		typeof row.job_id !== 'string' ||
		!uuid.test(row.job_id) ||
		!esPeriodoCuotas({ mes: row.periodo_mes, anio: row.periodo_anio }) ||
		!entero(row.cuotas_generadas) ||
		!entero(row.cuotas_omitidas) ||
		(failed &&
			(typeof row.codigo_error !== 'string' ||
				!/^[0-9A-Z]{5}$/.test(row.codigo_error) ||
				row.cuotas_generadas !== 0 ||
				row.cuotas_omitidas !== 0))
	) {
		throw new Error('No se pudo interpretar el resultado de generación.');
	}
	return row as unknown as ResultadoGeneracion;
}

export function parseJobCuotas(value: unknown): JobCuotas {
	const row = object(value);
	if (
		typeof row.id !== 'string' ||
		!uuid.test(row.id) ||
		!esPeriodoCuotas({ mes: row.periodo_mes, anio: row.periodo_anio }) ||
		!['procesando', 'exitoso', 'fallido'].includes(String(row.estado)) ||
		!entero(row.cuotas_generadas) ||
		!entero(row.cuotas_omitidas) ||
		typeof row.fecha_inicio !== 'string' ||
		Number.isNaN(Date.parse(row.fecha_inicio)) ||
		(row.fecha_fin !== null &&
			(typeof row.fecha_fin !== 'string' || Number.isNaN(Date.parse(row.fecha_fin)))) ||
		(row.estado !== 'procesando' && row.fecha_fin === null) ||
		(row.estado === 'fallido' && (row.cuotas_generadas !== 0 || row.cuotas_omitidas !== 0))
	) {
		throw new Error('El registro de generación no pudo verificarse.');
	}
	return row as unknown as JobCuotas;
}

export function verificarResultadoGeneracion(result: ResultadoGeneracion, job: JobCuotas) {
	const expected = result.resultado === 'fallido' ? 'fallido' : 'exitoso';
	if (
		job.id !== result.job_id ||
		job.periodo_mes !== result.periodo_mes ||
		job.periodo_anio !== result.periodo_anio ||
		job.estado !== expected ||
		job.cuotas_generadas !== result.cuotas_generadas ||
		job.cuotas_omitidas !== result.cuotas_omitidas
	) {
		throw new Error('El resultado no coincide con la corrida guardada.');
	}
	return job;
}

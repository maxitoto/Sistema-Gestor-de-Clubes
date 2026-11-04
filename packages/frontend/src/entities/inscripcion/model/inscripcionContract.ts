import type { Database, Tables } from '#shared/types';

export type IdentidadInscripcion = {
	socioId: Tables<'socios'>['id'];
	categoriaId: Tables<'categorias'>['id'];
};
export type PrevisualizacionInscripcion =
	Database['public']['Functions']['previsualizar_inscripcion']['Returns'][number];
export type CargoPeriodo = Database['public']['Functions']['cuotas_del_periodo']['Returns'][number];
export type InscripcionPersistida = Tables<'inscripciones'>;
export type CuotaPersistida = Tables<'cuotas'>;
export type ConfirmacionInscripcion = {
	inscripcion_id: InscripcionPersistida['id'];
	cuota_id: CuotaPersistida['id'];
	cuota_creada: boolean;
	monto_cuota: CuotaPersistida['monto'];
	estado_cuota: CuotaPersistida['estado'];
};
export type PeriodoInscripcion = { mes: number; anio: number };
export type VistaPreviaInscripcion = {
	fecha: string;
	periodo: PeriodoInscripcion;
	detalle: PrevisualizacionInscripcion | null;
	cargos: CargoPeriodo[];
};
export type ResultadoInscripcion = {
	origen: 'confirmada' | 'recuperada';
	inscripcion: InscripcionPersistida;
	cuota: CuotaPersistida;
	cuotaCreada: boolean | null;
};
export type RecuperacionInscripcion =
	| { estado: 'ausente' }
	| { estado: 'incompleta' }
	| { estado: 'recuperada'; resultado: ResultadoInscripcion };

export class RespuestaInscripcionIncierta extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
	);
}

export function parseConfirmacionInscripcion(value: unknown): ConfirmacionInscripcion {
	const claves = ['inscripcion_id', 'cuota_id', 'cuota_creada', 'monto_cuota', 'estado_cuota'];
	if (
		!isRecord(value) ||
		Object.keys(value).length !== claves.length ||
		!claves.every((clave) => Object.hasOwn(value, clave))
	) {
		throw new RespuestaInscripcionIncierta('No se pudo validar la respuesta de inscripción.');
	}
	const { inscripcion_id, cuota_id, cuota_creada, monto_cuota, estado_cuota } = value;
	if (
		!isUuid(inscripcion_id) ||
		!isUuid(cuota_id) ||
		typeof cuota_creada !== 'boolean' ||
		typeof monto_cuota !== 'number' ||
		!Number.isFinite(monto_cuota) ||
		monto_cuota < 0 ||
		(estado_cuota !== 'pendiente' && estado_cuota !== 'pagada')
	) {
		throw new RespuestaInscripcionIncierta('No se pudo validar la respuesta de inscripción.');
	}
	return { inscripcion_id, cuota_id, cuota_creada, monto_cuota, estado_cuota };
}

export function periodoDeFecha(fecha: string): PeriodoInscripcion {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
		throw new RespuestaInscripcionIncierta('El servidor no devolvió una fecha válida.');
	}
	const date = new Date(`${fecha}T12:00:00Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fecha) {
		throw new RespuestaInscripcionIncierta('El servidor no devolvió una fecha válida.');
	}
	return { anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)) };
}

export function comprobarRecuperacion(
	identidad: IdentidadInscripcion,
	inscripcion: InscripcionPersistida | null,
	cuota: CuotaPersistida | null,
): RecuperacionInscripcion {
	if (!inscripcion) {
		return { estado: 'ausente' };
	}
	if (
		inscripcion.socio_id !== identidad.socioId ||
		inscripcion.categoria_id !== identidad.categoriaId ||
		inscripcion.estado !== 'activa'
	) {
		throw new RespuestaInscripcionIncierta(
			'La inscripción consultada no coincide con la selección.',
		);
	}
	if (!cuota) {
		return { estado: 'incompleta' };
	}
	const periodo = periodoDeFecha(inscripcion.fecha_alta);
	if (
		cuota.socio_id !== identidad.socioId ||
		cuota.categoria_id !== identidad.categoriaId ||
		cuota.periodo_mes !== periodo.mes ||
		cuota.periodo_anio !== periodo.anio
	) {
		throw new RespuestaInscripcionIncierta(
			'La cuota consultada no coincide con el período del alta.',
		);
	}
	return {
		estado: 'recuperada',
		resultado: { origen: 'recuperada', inscripcion, cuota, cuotaCreada: null },
	};
}

export function mismaVistaPrevia(a: VistaPreviaInscripcion, b: VistaPreviaInscripcion): boolean {
	return (
		a.fecha === b.fecha &&
		JSON.stringify(a.detalle) === JSON.stringify(b.detalle) &&
		JSON.stringify(a.cargos) === JSON.stringify(b.cargos)
	);
}

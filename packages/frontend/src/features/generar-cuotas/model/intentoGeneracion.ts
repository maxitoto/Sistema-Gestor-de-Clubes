import { type JobCuotas, mismoPeriodo, type PeriodoCuotas } from '#entities/job-cuotas';

export interface IntentoGeneracion {
	usuarioId: string;
	periodo: PeriodoCuotas;
	iniciadoEn: string;
	// Ausentes en tickets anteriores; no se infiere una identidad desconocida.
	baselineJobId?: string | null;
	baselineJobEstado?: JobCuotas['estado'] | null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseIntentoGeneracion(
	value: unknown,
	usuarioId: string,
): IntentoGeneracion | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	const row = value as Partial<IntentoGeneracion>;
	const p = row.periodo;
	if (
		row.usuarioId !== usuarioId ||
		typeof row.iniciadoEn !== 'string' ||
		Number.isNaN(Date.parse(row.iniciadoEn)) ||
		!p ||
		!Number.isSafeInteger(p.mes) ||
		p.mes < 1 ||
		p.mes > 12 ||
		!Number.isSafeInteger(p.anio) ||
		p.anio <= 2000
	) {
		return null;
	}
	const hasBaseline = Object.hasOwn(row, 'baselineJobId');
	if (
		hasBaseline &&
		!(
			row.baselineJobId === null ||
			(typeof row.baselineJobId === 'string' && uuid.test(row.baselineJobId))
		)
	) {
		return null;
	}
	if (
		Object.hasOwn(row, 'baselineJobEstado') &&
		!(
			row.baselineJobEstado === null ||
			['procesando', 'exitoso', 'fallido'].includes(String(row.baselineJobEstado))
		)
	) {
		return null;
	}
	if (row.baselineJobId === null && row.baselineJobEstado != null) {
		return null;
	}
	return {
		usuarioId,
		periodo: { mes: p.mes, anio: p.anio },
		iniciadoEn: row.iniciadoEn,
		...(hasBaseline ? { baselineJobId: row.baselineJobId } : {}),
		...(Object.hasOwn(row, 'baselineJobEstado')
			? { baselineJobEstado: row.baselineJobEstado }
			: {}),
	};
}

export type ResolucionGeneracion =
	| { estado: 'recuperado'; job: JobCuotas }
	| { estado: 'procesando' | 'ausente' | 'ambiguo' };

/** Nunca atribuye un fallo histórico al intento ni elige entre dos corridas plausibles. */
export function resolverRecuperacionGeneracion(
	ticket: IntentoGeneracion,
	periodoActual: PeriodoCuotas,
	rows: readonly (JobCuotas | null)[],
): ResolucionGeneracion {
	const relevant = [
		...new Map(
			rows
				.filter(
					(row): row is JobCuotas =>
						Boolean(row) &&
						(mismoPeriodo(
							{ mes: row?.periodo_mes ?? 0, anio: row?.periodo_anio ?? 0 },
							ticket.periodo,
						) ||
							mismoPeriodo(
								{ mes: row?.periodo_mes ?? 0, anio: row?.periodo_anio ?? 0 },
								periodoActual,
							)),
				)
				.map((row) => [row.id, row]),
		).values(),
	];
	if (!relevant.length) {
		return { estado: 'ausente' };
	}
	const inicio = Date.parse(ticket.iniciadoEn);
	const hasBaseline = Object.hasOwn(ticket, 'baselineJobId');
	const eligible = relevant.filter((row) => {
		// Un éxito mensual es resultado autoritativo, aunque otra corrida lo haya iniciado antes.
		if (row.estado === 'exitoso') {
			return true;
		}
		if (row.id === ticket.baselineJobId) {
			return ticket.baselineJobEstado === 'procesando';
		}
		// Un ticket antiguo sin baseline sólo puede recuperar un éxito inequívoco.
		return hasBaseline && Date.parse(row.fecha_inicio) >= inicio;
	});
	const terminal = eligible.filter((row) => row.estado !== 'procesando');
	const processing = eligible.some((row) => row.estado === 'procesando');
	if (terminal.length === 1 && !processing) {
		return { estado: 'recuperado', job: terminal[0] as JobCuotas };
	}
	if (!terminal.length && processing) {
		return { estado: 'procesando' };
	}
	return { estado: 'ambiguo' };
}

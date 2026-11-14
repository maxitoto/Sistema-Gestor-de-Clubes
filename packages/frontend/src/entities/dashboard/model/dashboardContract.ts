export interface PeriodoDashboard {
	mes: number;
	anio: number;
}
export interface MesDashboard extends PeriodoDashboard {
	ingresosOriginales: string;
	egresosOriginales: string;
	neto: string;
}
export interface Dashboard {
	version: 1;
	zona: 'America/Argentina/Buenos_Aires';
	consultadoEn: string;
	periodo: PeriodoDashboard & { desde: string; hasta: string };
	actuales: {
		sociosActivos: number;
		sociosMorosos: number;
		deudaTotal: string;
		emailsInvalidos: number;
	};
	finanzas: {
		ingresosOriginales: string;
		egresosOriginales: string;
		neto: string;
		movimientos: number;
	};
	meses: MesDashboard[];
	morosidadPorDeporte: {
		deporteId: string;
		deporte: string;
		cuotasMorosas: number;
		deudaMorosa: string;
	}[];
	alertas: {
		emailsInvalidos: number;
		comprobantesPendientes: number;
		comprobantesFallidos: number;
		anulacionesPendientes: number;
		certificado: {
			estado: 'ausente' | 'vencido' | 'proximo' | 'vigente';
			vencimiento: string | null;
			diasRestantes: number | null;
		};
		ultimoJob: {
			id: string;
			periodoMes: number;
			periodoAnio: number;
			estado: 'procesando' | 'exitoso' | 'fallido';
			cuotasGeneradas: number;
			cuotasOmitidas: number;
			fechaInicio: string;
			fechaFin: string | null;
		} | null;
	};
}
const ZONA = 'America/Argentina/Buenos_Aires';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const invalid = () =>
	new Error('No pudimos verificar los datos del dashboard. Actualizá para volver a consultar.');
type RawDashboard = Partial<
	Record<
		| keyof Dashboard
		| keyof Dashboard['periodo']
		| keyof Dashboard['actuales']
		| keyof Dashboard['finanzas']
		| keyof MesDashboard
		| keyof Dashboard['morosidadPorDeporte'][number]
		| keyof Dashboard['alertas']
		| keyof Dashboard['alertas']['certificado']
		| keyof NonNullable<Dashboard['alertas']['ultimoJob']>,
		unknown
	>
> &
	Record<string, unknown>;
function object(value: unknown): RawDashboard {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw invalid();
	}
	return value as RawDashboard;
}
function count(value: unknown) {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw invalid();
	}
	return value;
}
function text(value: unknown) {
	if (typeof value !== 'string' || !value.trim()) {
		throw invalid();
	}
	return value;
}
function date(value: unknown) {
	const raw = text(value);
	const v = /^\d{5}-/.test(raw) ? `+0${raw}` : raw;
	if (
		!/^(?:\d{4}|[+]\d{6})-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(v) ||
		!Number.isFinite(Date.parse(v))
	) {
		throw invalid();
	}
	return v;
}
function money(value: unknown, signed = false) {
	if (
		typeof value !== 'string' ||
		!(signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(value) ||
		!Number.isSafeInteger(Math.round(Number(value) * 100))
	) {
		throw invalid();
	}
	return value;
}
function uuid(value: unknown) {
	const v = text(value);
	if (!UUID.test(v)) {
		throw invalid();
	}
	return v;
}
export function periodoDashboardValido(value: PeriodoDashboard) {
	return (
		Number.isInteger(value.mes) &&
		value.mes >= 1 &&
		value.mes <= 12 &&
		Number.isInteger(value.anio) &&
		value.anio >= 2001 &&
		value.anio <= 9999
	);
}
export function periodoDashboardActual(now = new Date()): PeriodoDashboard {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: ZONA,
		year: 'numeric',
		month: 'numeric',
	}).formatToParts(now);
	return {
		mes: Number(parts.find((x) => x.type === 'month')?.value),
		anio: Number(parts.find((x) => x.type === 'year')?.value),
	};
}
export function diasPeriodoDashboard(periodo: PeriodoDashboard) {
	if (!periodoDashboardValido(periodo)) {
		throw new Error('Elegí un mes y año válidos.');
	}
	const start = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;
	const last = new Date(Date.UTC(periodo.anio, periodo.mes, 0)).getUTCDate();
	return { desde: `${start}-01`, hasta: `${start}-${last}` };
}
export function enlacesDashboard(periodo: PeriodoDashboard) {
	const days = diasPeriodoDashboard(periodo);
	return {
		activos: '/socios?estado=activo',
		morosos: '/socios?estadoPago=moroso',
		deuda: '/pagos?tab=cuotas&estadoCuota=pendiente',
		emailsInvalidos: '/socios?emailInvalido=true',
		pagos: `/pagos?${new URLSearchParams({ tab: 'pagos', ...days })}`,
		movimientos: `/gastos?${new URLSearchParams({ tab: 'movimientos', ...days })}`,
		fiscal: '/monitoreo-fiscal',
		configuracion: '/settings',
		cuotas: '#cuotas-mensuales',
	};
}
export function interpretarDashboard(raw: unknown, expected: PeriodoDashboard): Dashboard {
	if (!periodoDashboardValido(expected)) {
		throw invalid();
	}
	const v = object(raw),
		p = object(v.periodo),
		a = object(v.actuales),
		f = object(v.finanzas),
		l = object(v.alertas),
		c = object(l.certificado);
	if (v.version !== 1 || v.zona !== ZONA || p.mes !== expected.mes || p.anio !== expected.anio) {
		throw invalid();
	}
	const desde = date(p.desde),
		hasta = date(p.hasta);
	const target = diasPeriodoDashboard(expected),
		start = new Date(desde),
		end = new Date(hasta);
	const localBoundary = (instant: Date) => {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: ZONA,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23',
		}).formatToParts(instant);
		const get = (part: string) => parts.find((p) => p.type === part)?.value;
		return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
	};
	const lastDay = new Date(Date.UTC(expected.anio, expected.mes, 1));
	const nextDate = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-01`;
	if (
		start.getTime() >= end.getTime() ||
		localBoundary(start) !== `${target.desde} 00:00:00` ||
		localBoundary(end) !== `${nextDate} 00:00:00`
	) {
		throw invalid();
	}
	if (!Array.isArray(v.meses) || v.meses.length !== 6 || !Array.isArray(v.morosidadPorDeporte)) {
		throw invalid();
	}
	const meses = v.meses.map((item, index) => {
		const row = object(item),
			anchor = new Date(Date.UTC(expected.anio, expected.mes - 6 + index, 1));
		if (row.mes !== anchor.getUTCMonth() + 1 || row.anio !== anchor.getUTCFullYear()) {
			throw invalid();
		}
		return {
			mes: row.mes as number,
			anio: row.anio as number,
			ingresosOriginales: money(row.ingresosOriginales),
			egresosOriginales: money(row.egresosOriginales),
			neto: money(row.neto, true),
		};
	});
	const seen = new Set<string>();
	const morosidadPorDeporte = v.morosidadPorDeporte.map((item) => {
		const row = object(item),
			id = uuid(row.deporteId);
		if (seen.has(id)) {
			throw invalid();
		}
		seen.add(id);
		return {
			deporteId: id,
			deporte: text(row.deporte),
			cuotasMorosas: count(row.cuotasMorosas),
			deudaMorosa: money(row.deudaMorosa),
		};
	});
	if (!['ausente', 'vencido', 'proximo', 'vigente'].includes(String(c.estado))) {
		throw invalid();
	}
	let vencimiento: string | null = null,
		diasRestantes: number | null = null;
	if (c.estado === 'ausente') {
		if (c.vencimiento !== null || c.diasRestantes !== null) {
			throw invalid();
		}
	} else {
		vencimiento = text(c.vencimiento);
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(vencimiento) ||
			new Date(`${vencimiento}T00:00:00Z`).toISOString().slice(0, 10) !== vencimiento
		) {
			throw invalid();
		}
		if (typeof c.diasRestantes !== 'number' || !Number.isSafeInteger(c.diasRestantes)) {
			throw invalid();
		}
		diasRestantes = c.diasRestantes;
		if (
			(c.estado === 'vencido' && diasRestantes >= 0) ||
			(c.estado === 'proximo' && (diasRestantes < 0 || diasRestantes > 30)) ||
			(c.estado === 'vigente' && diasRestantes <= 30)
		) {
			throw invalid();
		}
	}
	let ultimoJob: Dashboard['alertas']['ultimoJob'] = null;
	if (l.ultimoJob !== null) {
		const j = object(l.ultimoJob),
			period = { mes: count(j.periodoMes), anio: count(j.periodoAnio) };
		if (
			!periodoDashboardValido(period) ||
			!['procesando', 'exitoso', 'fallido'].includes(String(j.estado))
		) {
			throw invalid();
		}
		ultimoJob = {
			id: uuid(j.id),
			periodoMes: period.mes,
			periodoAnio: period.anio,
			estado: j.estado as 'procesando' | 'exitoso' | 'fallido',
			cuotasGeneradas: count(j.cuotasGeneradas),
			cuotasOmitidas: count(j.cuotasOmitidas),
			fechaInicio: date(j.fechaInicio),
			fechaFin: j.fechaFin === null ? null : date(j.fechaFin),
		};
	}
	const emailsInvalidos = count(a.emailsInvalidos);
	if (count(l.emailsInvalidos) !== emailsInvalidos) {
		throw invalid();
	}
	return {
		version: 1,
		zona: ZONA,
		consultadoEn: date(v.consultadoEn),
		periodo: { ...expected, desde, hasta },
		actuales: {
			sociosActivos: count(a.sociosActivos),
			sociosMorosos: count(a.sociosMorosos),
			deudaTotal: money(a.deudaTotal),
			emailsInvalidos,
		},
		finanzas: {
			ingresosOriginales: money(f.ingresosOriginales),
			egresosOriginales: money(f.egresosOriginales),
			neto: money(f.neto, true),
			movimientos: count(f.movimientos),
		},
		meses,
		morosidadPorDeporte,
		alertas: {
			emailsInvalidos,
			comprobantesPendientes: count(l.comprobantesPendientes),
			comprobantesFallidos: count(l.comprobantesFallidos),
			anulacionesPendientes: count(l.anulacionesPendientes),
			certificado: {
				estado: c.estado as Dashboard['alertas']['certificado']['estado'],
				vencimiento,
				diasRestantes,
			},
			ultimoJob,
		},
	};
}

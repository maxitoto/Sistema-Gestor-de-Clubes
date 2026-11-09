export interface PuntoVentaHomologacion {
	numero: number;
	emisionTipo: string;
	bloqueado: boolean;
	bajaFecha: string | null;
}
export interface ResultadoDiagnosticoFiscal {
	autenticado: true;
	ambiente: 'homologacion';
	servicio: 'wsfe';
	puntosVenta: PuntoVentaHomologacion[];
	puntoVentaConfigurado: number;
	puntoVentaDisponible: boolean;
	ausenciaDatos?: '602';
}
const ERROR = 'No se pudo verificar el listado de puntos de venta de homologación.';
type FilaDiagnostico = {
	[K in keyof ResultadoDiagnosticoFiscal | keyof PuntoVentaHomologacion]?: unknown;
};
function object(value: unknown): FilaDiagnostico {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(ERROR);
	}
	return value as FilaDiagnostico;
}
function esNumeroPuntoVenta(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99_999;
}
function fechaBajaValida(value: unknown): value is string | null {
	if (value === null) {
		return true;
	}
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	const date = new Date(`${value}T12:00:00Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Conserva únicamente los campos públicos del diagnóstico de WSFE, sin credenciales. */
export function parseDiagnosticoFiscal(value: unknown): ResultadoDiagnosticoFiscal {
	const v = object(value);
	if (
		v.autenticado !== true ||
		v.ambiente !== 'homologacion' ||
		v.servicio !== 'wsfe' ||
		!esNumeroPuntoVenta(v.puntoVentaConfigurado) ||
		typeof v.puntoVentaDisponible !== 'boolean' ||
		!Array.isArray(v.puntosVenta) ||
		v.puntosVenta.length > 99_999
	) {
		throw new Error(ERROR);
	}
	if (
		v.ausenciaDatos !== undefined &&
		(v.ausenciaDatos !== '602' || v.puntosVenta.length !== 0 || v.puntoVentaDisponible)
	) {
		throw new Error(ERROR);
	}
	const numeros = new Set<number>();
	const puntosVenta = v.puntosVenta.map((value): PuntoVentaHomologacion => {
		const p = object(value);
		if (
			!esNumeroPuntoVenta(p.numero) ||
			numeros.has(p.numero) ||
			typeof p.emisionTipo !== 'string' ||
			!p.emisionTipo ||
			p.emisionTipo.length > 40 ||
			p.emisionTipo.trim() !== p.emisionTipo ||
			p.emisionTipo
				.split('')
				.some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
			typeof p.bloqueado !== 'boolean' ||
			!fechaBajaValida(p.bajaFecha)
		) {
			throw new Error(ERROR);
		}
		numeros.add(p.numero);
		return {
			numero: p.numero,
			emisionTipo: p.emisionTipo,
			bloqueado: p.bloqueado,
			bajaFecha: p.bajaFecha,
		};
	});
	const configurado = puntosVenta.find((p) => p.numero === v.puntoVentaConfigurado);
	const disponible = Boolean(
		configurado &&
			configurado.emisionTipo === 'CAE' &&
			!configurado.bloqueado &&
			!configurado.bajaFecha,
	);
	if (disponible !== v.puntoVentaDisponible) {
		throw new Error(ERROR);
	}
	return {
		autenticado: true,
		ambiente: 'homologacion',
		servicio: 'wsfe',
		puntosVenta,
		puntoVentaConfigurado: v.puntoVentaConfigurado,
		puntoVentaDisponible: v.puntoVentaDisponible,
		...(v.ausenciaDatos === '602' ? { ausenciaDatos: '602' as const } : {}),
	};
}

export type GrillaReporte = 'socios' | 'pagos' | 'gastos' | 'correos';
export interface ResultadoReporte<T> {
	filas: T[];
	total: number;
	pagina: number;
	limite: number;
	revision: string;
}
/** Comprueba la página pedida antes de entregar filas al listado o al exportador. */
export function interpretarPaginaReporte<T>(
	data: unknown,
	grilla: GrillaReporte,
	criterios: object,
	parseFila: (v: unknown) => T,
): ResultadoReporte<T> {
	const solicitud = criterios as { pagina?: unknown; limite?: unknown };
	if (
		!Number.isSafeInteger(solicitud.pagina) ||
		Number(solicitud.pagina) < 0 ||
		!Number.isSafeInteger(solicitud.limite) ||
		Number(solicitud.limite) < 1
	) {
		throw new Error('La página solicitada no es válida.');
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('La respuesta del listado no es válida.');
	}
	const x = data as {
		[K in 'version' | 'grilla' | 'filas' | 'total' | 'pagina' | 'limite' | 'revision']?: unknown;
	};
	if (
		x.version !== 1 ||
		x.grilla !== grilla ||
		!Array.isArray(x.filas) ||
		!Number.isSafeInteger(x.total) ||
		Number(x.total) < 0 ||
		!Number.isSafeInteger(x.pagina) ||
		!Number.isSafeInteger(x.limite) ||
		typeof x.revision !== 'string' ||
		!/^[0-9a-f]{32}$/.test(x.revision) ||
		x.filas.length > Number(x.limite) ||
		x.filas.length > Number(x.total)
	) {
		throw new Error('Los totales o la versión del listado no son válidos.');
	}
	if (x.pagina !== solicitud.pagina || x.limite !== solicitud.limite) {
		throw new Error('La página recibida no coincide con la consulta. Volvé a intentarlo.');
	}
	return {
		filas: x.filas.map(parseFila),
		total: Number(x.total),
		pagina: Number(x.pagina),
		limite: Number(x.limite),
		revision: x.revision,
	};
}

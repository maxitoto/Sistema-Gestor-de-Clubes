export interface IntentoInscripcion {
	version: 1;
	socioId: string;
	categoriaId: string;
	deporteId: string;
	fechaClub: string;
}

function key(userId: string, socioId: string) {
	return `club.inscripcion.pendiente.${userId}.${socioId}`;
}

export function leerIntentoInscripcion(userId: string, socioId: string): IntentoInscripcion | null {
	const text = sessionStorage.getItem(key(userId, socioId));
	if (!text) {
		return null;
	}
	const value: unknown = JSON.parse(text);
	if (
		typeof value !== 'object' ||
		value === null ||
		!('version' in value) ||
		value.version !== 1 ||
		!('socioId' in value) ||
		value.socioId !== socioId ||
		!('categoriaId' in value) ||
		typeof value.categoriaId !== 'string' ||
		!('deporteId' in value) ||
		typeof value.deporteId !== 'string' ||
		!('fechaClub' in value) ||
		typeof value.fechaClub !== 'string'
	) {
		throw new Error('No se pudo leer el seguimiento de inscripción.');
	}
	return {
		version: 1,
		socioId,
		categoriaId: value.categoriaId,
		deporteId: value.deporteId,
		fechaClub: value.fechaClub,
	};
}

export function guardarIntentoInscripcion(userId: string, intento: IntentoInscripcion) {
	sessionStorage.setItem(key(userId, intento.socioId), JSON.stringify(intento));
}

export function quitarIntentoInscripcion(userId: string, socioId: string) {
	sessionStorage.removeItem(key(userId, socioId));
}

export function requiereRecuperacionInscripcion(
	respuestaRecibida: boolean,
	error: unknown,
): boolean {
	if (respuestaRecibida || typeof error !== 'object' || !error) {
		return true;
	}
	const status = 'status' in error ? error.status : undefined;
	const code = 'code' in error ? error.code : undefined;
	const rechazo =
		(typeof status === 'number' && status >= 400 && status < 500 && status !== 408) ||
		(typeof code === 'string' && ['P0001', '42501', '23505', '23514', '23503'].includes(code));
	return !rechazo;
}

export type EstadoBajaCorreo =
	| 'confirmar'
	| 'confirmada'
	| 'ya_confirmada'
	| 'direccion_antigua'
	| 'no_disponible'
	| 'invalido'
	| 'error';

export interface ParametrosBajaCorreo {
	id: string;
	firma: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ESTADOS_VALIDOS: readonly EstadoBajaCorreo[] = [
	'confirmar',
	'confirmada',
	'ya_confirmada',
	'direccion_antigua',
	'no_disponible',
	'invalido',
	'error',
];

export const MENSAJES_BAJA_CORREO: Record<
	EstadoBajaCorreo,
	{ titulo: string; descripcion: string; severidad: 'info' | 'success' | 'warning' | 'error' }
> = {
	confirmar: {
		titulo: 'Dejar de recibir comunicaciones generales',
		descripcion:
			'Podés dejar de recibir novedades y comunicaciones generales del club. Los comprobantes y los avisos de deuda previstos pueden continuar.',
		severidad: 'info',
	},
	confirmada: {
		titulo: 'Baja confirmada',
		descripcion:
			'Ya no recibirás comunicaciones generales en la dirección correspondiente a este enlace.',
		severidad: 'success',
	},
	ya_confirmada: {
		titulo: 'La baja ya estaba confirmada',
		descripcion:
			'La dirección correspondiente a este enlace ya estaba desuscripta de comunicaciones generales.',
		severidad: 'info',
	},
	direccion_antigua: {
		titulo: 'Este enlace corresponde a una dirección anterior',
		descripcion:
			'No se modificaron tus preferencias actuales. Para gestionar la dirección actual, contactá al club.',
		severidad: 'warning',
	},
	no_disponible: {
		titulo: 'Este enlace ya no está disponible',
		descripcion:
			'No se modificaron las preferencias de correo. Contactá al club si necesitás ayuda.',
		severidad: 'warning',
	},
	invalido: {
		titulo: 'Enlace inválido',
		descripcion:
			'No se modificaron las preferencias. Usá el enlace completo recibido en el correo o contactá al club.',
		severidad: 'error',
	},
	error: {
		titulo: 'No se pudo confirmar la baja',
		descripcion: 'No recibimos confirmación del cambio. Podés volver a intentarlo con este enlace.',
		severidad: 'error',
	},
};

export function leerParametrosBaja(searchParams: URLSearchParams): ParametrosBajaCorreo | null {
	const id = searchParams.get('id')?.trim() ?? '';
	const firma = searchParams.get('firma')?.trim() ?? '';
	if (!UUID_REGEX.test(id) || !firma || firma.length > 256) {
		return null;
	}
	return { id, firma };
}

export function parseEstadoBaja(value: unknown): EstadoBajaCorreo {
	if (
		value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		'estado' in value &&
		typeof value.estado === 'string' &&
		ESTADOS_VALIDOS.includes(value.estado as EstadoBajaCorreo)
	) {
		return value.estado as EstadoBajaCorreo;
	}
	return 'error';
}

import type { Tables } from '#shared/types';
export type SocioListado = Pick<
	Tables<'socios'>,
	| 'id'
	| 'numero_socio'
	| 'nombre'
	| 'apellido'
	| 'dni'
	| 'estado'
	| 'email'
	| 'acepta_comunicaciones'
	| 'email_invalido'
>;
export interface SocioReporte extends SocioListado {
	es_moroso: boolean;
	deuda_pendiente: number;
	pendientes_count: number;
	deportes: string;
}
export interface CriteriosSocios {
	pagina: number;
	limite: number;
	buscar: string;
	estado: 'todos' | 'activo' | 'inactivo';
	deporte_id: string;
	categoria_id: string;
	estado_pago: 'todos' | 'moroso' | 'al_dia';
	email_invalido: 'todos' | 'si' | 'no';
	orden: 'apellido' | 'nombre' | 'dni' | 'numero_socio' | 'estado' | 'deuda_pendiente';
	direccion: 'asc' | 'desc';
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function criteriosSociosDesdeUrl(p: URLSearchParams): CriteriosSocios {
	const e = p.get('estado'),
		pago = p.get('estadoPago'),
		invalid = p.get('emailInvalido');
	return {
		pagina: 0,
		limite: 20,
		buscar: p.get('buscar') ?? '',
		estado:
			e === 'activo' || e === 'inactivo' || e === 'todos'
				? e
				: pago || invalid
					? 'todos'
					: 'activo',
		deporte_id: uuid.test(p.get('deporteId') ?? '') ? (p.get('deporteId') ?? '') : '',
		categoria_id: uuid.test(p.get('categoriaId') ?? '') ? (p.get('categoriaId') ?? '') : '',
		estado_pago:
			pago === 'moroso' ? 'moroso' : pago === 'al_dia' || pago === 'aldia' ? 'al_dia' : 'todos',
		email_invalido: invalid === 'true' ? 'si' : invalid === 'false' ? 'no' : 'todos',
		orden: 'apellido',
		direccion: 'asc',
	};
}
export function parseSocioReporte(v: unknown): SocioReporte {
	if (!v || typeof v !== 'object' || Array.isArray(v)) {
		throw new Error('La fila de socio no es válida.');
	}
	const x = v as { [K in keyof SocioReporte]?: unknown };
	if (
		typeof x.id !== 'string' ||
		!uuid.test(x.id) ||
		!Number.isSafeInteger(x.numero_socio) ||
		Number(x.numero_socio) < 1 ||
		typeof x.nombre !== 'string' ||
		typeof x.apellido !== 'string' ||
		typeof x.dni !== 'string' ||
		!(x.email === null || typeof x.email === 'string') ||
		!(x.estado === 'activo' || x.estado === 'inactivo') ||
		typeof x.acepta_comunicaciones !== 'boolean' ||
		typeof x.email_invalido !== 'boolean' ||
		typeof x.es_moroso !== 'boolean' ||
		typeof x.deportes !== 'string' ||
		typeof x.deuda_pendiente !== 'number' ||
		!Number.isFinite(x.deuda_pendiente) ||
		x.deuda_pendiente < 0 ||
		!Number.isSafeInteger(x.pendientes_count) ||
		Number(x.pendientes_count) < 0
	) {
		throw new Error('Los datos del socio están incompletos.');
	}
	return x as SocioReporte;
}

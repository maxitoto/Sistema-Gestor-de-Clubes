import { supabase } from '#shared/api';
import type { Tables } from '#shared/types';
export type Usuario = Pick<
	Tables<'usuarios'>,
	'id' | 'nombre' | 'apellido' | 'email' | 'rol' | 'estado'
>;
export type DatosUsuario = Pick<Usuario, 'nombre' | 'apellido' | 'email' | 'rol'>;
export type AccionUsuario = 'desactivar' | 'reactivar' | 'restablecer' | 'reenviar';
export type ComandoUsuario =
	| ({ operacion: 'crear'; operacionId: string } & DatosUsuario)
	| ({ operacion: 'editar'; usuarioId: string; operacionId: string } & DatosUsuario)
	| { operacion: AccionUsuario; usuarioId: string; operacionId: string };
export interface ResultadoUsuario {
	operacionId: string;
	usuarioId: string;
	usuario: Usuario | null;
	resultado:
		| 'completo'
		| 'enlace_pendiente'
		| 'sesiones_pendientes'
		| 'datos_pendientes'
		| 'en_proceso'
		| 'rechazado';
	mensaje: string;
	revocacionPendiente: boolean;
	puedeReenviar: boolean;
	enlaceEnviadoEn: string | null;
	actualizadoEn: string;
}
const columns = 'id,nombre,apellido,email,rol,estado';
const timed = (signal?: AbortSignal) =>
	signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
export async function getUsuarios(
	input: { page: number; pageSize: number; search: string; estado: string; rol: string },
	signal?: AbortSignal,
) {
	let q = supabase
		.from('usuarios')
		.select(columns, { count: 'exact' })
		.order('apellido')
		.order('nombre')
		.order('id');
	const term = input.search.trim();
	const quoted = JSON.stringify(`%${term.replace(/[%_]/g, '\\$&')}%`);
	if (term) {
		q = q.or(`nombre.ilike.${quoted},apellido.ilike.${quoted},email.ilike.${quoted}`);
	}
	if (input.estado === 'activo' || input.estado === 'inactivo') {
		q = q.eq('estado', input.estado);
	}
	if (input.rol === 'admin' || input.rol === 'responsable') {
		q = q.eq('rol', input.rol);
	}
	const { data, count, error } = await q
		.range(input.page * input.pageSize, (input.page + 1) * input.pageSize - 1)
		.abortSignal(timed(signal));
	if (error) {
		throw error;
	}
	return { rows: data ?? [], total: count ?? 0 };
}
function isUsuario(v: unknown): v is Usuario {
	if (!v || typeof v !== 'object') {
		return false;
	}
	const r = v as Usuario;
	return (
		typeof r.id === 'string' &&
		typeof r.nombre === 'string' &&
		typeof r.apellido === 'string' &&
		typeof r.email === 'string' &&
		['admin', 'responsable'].includes(r.rol) &&
		['activo', 'inactivo'].includes(r.estado)
	);
}
async function request(
	path: string,
	init: RequestInit,
	expectedActor: string,
	signal?: AbortSignal,
): Promise<ResultadoUsuario | null> {
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();
	if (error || !session || session.user.id !== expectedActor) {
		throw new Error('Volvé a iniciar sesión.');
	}
	const r = await fetch(`${process.env.PUBLIC_SUPABASE_URL}/functions/v1/usuarios${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${session.access_token}`,
			apikey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
			'Content-Type': 'application/json',
		},
		signal: timed(signal),
	});
	const body: unknown = await r.json();
	if (r.status === 404 && init.method === 'GET') {
		return null;
	}
	if (!r.ok) {
		const message =
			body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
				? body.error
				: 'No se pudo completar la gestión de usuarios.';
		throw Object.assign(new Error(message), { status: r.status });
	}
	if (body === null) {
		return null;
	}
	const value = body as ResultadoUsuario;
	if (
		(value.usuario !== null && !isUsuario(value.usuario)) ||
		typeof value.operacionId !== 'string' ||
		typeof value.usuarioId !== 'string' ||
		![
			'completo',
			'enlace_pendiente',
			'sesiones_pendientes',
			'datos_pendientes',
			'en_proceso',
			'rechazado',
		].includes(value.resultado) ||
		typeof value.mensaje !== 'string' ||
		typeof value.revocacionPendiente !== 'boolean' ||
		typeof value.puedeReenviar !== 'boolean'
	) {
		throw Object.assign(
			new Error('No se pudo verificar el resultado. Consultá el estado antes de repetir.'),
			{ status: 502 },
		);
	}
	return value;
}
function verificarIdentidad(result: ResultadoUsuario | null, id: string, porUsuario = false) {
	if (result && (porUsuario ? result.usuarioId : result.operacionId) !== id) {
		throw Object.assign(
			new Error('La respuesta no corresponde a este intento. Consultá nuevamente.'),
			{ status: 502 },
		);
	}
	return result;
}
export async function gestionarUsuario(
	command: ComandoUsuario,
	actorId: string,
	signal?: AbortSignal,
) {
	const result = verificarIdentidad(
		await request('', { method: 'POST', body: JSON.stringify(command) }, actorId, signal),
		command.operacionId,
	);
	if (!result) {
		throw new Error('No se pudo confirmar la cuenta.');
	}
	return result;
}
export async function getOperacionUsuario(id: string, actorId: string, signal?: AbortSignal) {
	return verificarIdentidad(
		await request(
			`/operacion?${new URLSearchParams({ operacionId: id })}`,
			{ method: 'GET' },
			actorId,
			signal,
		),
		id,
	);
}
export async function getEstadoUsuario(id: string, actorId: string, signal?: AbortSignal) {
	return verificarIdentidad(
		await request(
			`/estado?${new URLSearchParams({ usuarioId: id })}`,
			{ method: 'GET' },
			actorId,
			signal,
		),
		id,
		true,
	);
}

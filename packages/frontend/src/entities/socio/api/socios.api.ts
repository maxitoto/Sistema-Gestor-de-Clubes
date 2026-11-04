// src/modules/socios/api/socios.api.ts
import { supabase } from '#shared/api';
import type { TablesInsert } from '#shared/types';

export interface GetSociosParams {
	page: number;
	limit: number;
	searchTerm: string;
}

export async function getSocios(
	{ page, limit, searchTerm }: GetSociosParams,
	signal?: AbortSignal,
) {
	const from = (page - 1) * limit;
	let query = supabase
		.from('socios')
		.select(
			'id, numero_socio, nombre, apellido, dni, estado, email, acepta_comunicaciones, email_invalido',
			{
				count: 'exact',
			},
		)
		.order('apellido', { ascending: true })
		.order('id', { ascending: true })
		.range(from, from + limit - 1);
	if (searchTerm.trim()) {
		query = query.ilike('apellido', `%${searchTerm.trim()}%`);
	}
	const timeoutSignal = AbortSignal.timeout(10_000);
	query = query.abortSignal(signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal);
	const { data, count, error } = await query;
	if (error) {
		throw error;
	}
	return {
		socios: data ?? [],
		total: count ?? 0,
		totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
	};
}

export type SocioListado = Awaited<ReturnType<typeof getSocios>>['socios'][number];

export type CrearSocioPayload = Required<
	Pick<
		TablesInsert<'socios'>,
		| 'dni'
		| 'nombre'
		| 'apellido'
		| 'fecha_nacimiento'
		| 'email'
		| 'telefono'
		| 'direccion'
		| 'acepta_comunicaciones'
		| 'contacto_emergencia_nombre'
		| 'contacto_emergencia_telefono'
	>
>;
export type SocioCreado = SocioListado;
const socioCreadoSelect =
	'id, numero_socio, nombre, apellido, dni, estado, email, acepta_comunicaciones, email_invalido';

/** Cliente humano: whitelist explícita de columnas autorizadas, sin campos del sistema. */
export async function crearSocio(
	payload: CrearSocioPayload,
	signal?: AbortSignal,
): Promise<SocioCreado> {
	const requestSignal = signal
		? AbortSignal.any([signal, AbortSignal.timeout(20000)])
		: AbortSignal.timeout(20000);
	const { data, error, status } = await supabase
		.from('socios')
		.insert({
			dni: payload.dni,
			nombre: payload.nombre,
			apellido: payload.apellido,
			fecha_nacimiento: payload.fecha_nacimiento,
			email: payload.email,
			telefono: payload.telefono,
			direccion: payload.direccion,
			acepta_comunicaciones: payload.acepta_comunicaciones,
			contacto_emergencia_nombre: payload.contacto_emergencia_nombre,
			contacto_emergencia_telefono: payload.contacto_emergencia_telefono,
		})
		.select(socioCreadoSelect)
		.abortSignal(requestSignal)
		.single();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}

/** Reconciliar una respuesta perdida no vuelve a insertar ni atribuye autoría. */
export async function buscarSocioPorDni(
	dni: string,
	signal?: AbortSignal,
): Promise<SocioCreado | null> {
	const requestSignal = signal
		? AbortSignal.any([signal, AbortSignal.timeout(15000)])
		: AbortSignal.timeout(15000);
	const { data, error, status } = await supabase
		.from('socios')
		.select(socioCreadoSelect)
		.eq('dni', dni.trim())
		.abortSignal(requestSignal)
		.maybeSingle();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}

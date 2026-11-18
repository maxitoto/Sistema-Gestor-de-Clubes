// src/modules/socios/api/socios.api.ts
import { supabase } from '#shared/api';
import { leerGrillaReporte, type OpcionesReporte } from '#shared/api/reportes-read.api';
import type { TablesInsert } from '#shared/types';
import {
	type CriteriosSocios,
	criteriosSociosDesdeUrl,
	parseSocioReporte,
	type SocioListado,
} from '../model/sociosReporte';

export interface GetSociosParams {
	page: number;
	limit: number;
	searchTerm: string;
	estado?: CriteriosSocios['estado'];
	filtros?: Partial<CriteriosSocios> | undefined;
}
export async function getSociosReporte(
	criterios: CriteriosSocios,
	signal?: AbortSignal,
	opciones: OpcionesReporte = {},
) {
	return leerGrillaReporte('socios', criterios, parseSocioReporte, signal, opciones);
}
export async function getSocios(
	{ page, limit, searchTerm, estado = 'todos', filtros = {} }: GetSociosParams,
	signal?: AbortSignal,
) {
	const p = await getSociosReporte(
		{
			...criteriosSociosDesdeUrl(new URLSearchParams()),
			...filtros,
			pagina: page - 1,
			limite: limit,
			buscar: searchTerm,
			estado,
		},
		signal,
	);
	return { socios: p.filas, total: p.total, totalPages: Math.max(1, Math.ceil(p.total / limit)) };
}
export type { SocioListado } from '../model/sociosReporte';

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

const socioDetalleSelect =
	'id,numero_socio,dni,dni_anterior,dni_corregido_at,dni_corregido_por,nombre,apellido,fecha_nacimiento,email,telefono,direccion,foto_url,estado,acepta_comunicaciones,email_invalido,contacto_emergencia_nombre,contacto_emergencia_telefono,fecha_alta,fecha_baja,created_at,updated_at';
const signalLocal = (signal?: AbortSignal) =>
	signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);

export async function getSocio(id: string, signal?: AbortSignal) {
	const { data, error, status } = await supabase
		.from('socios')
		.select(socioDetalleSelect)
		.eq('id', id)
		.abortSignal(signalLocal(signal))
		.maybeSingle();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}
export type SocioDetalle = NonNullable<Awaited<ReturnType<typeof getSocio>>>;
export type ActualizarSocioPayload = Omit<CrearSocioPayload, 'dni'> & { dni?: string };

export async function actualizarSocio(
	id: string,
	payload: ActualizarSocioPayload,
	signal?: AbortSignal,
) {
	const { error, status } = await supabase
		.from('socios')
		.update({
			nombre: payload.nombre,
			apellido: payload.apellido,
			fecha_nacimiento: payload.fecha_nacimiento,
			email: payload.email,
			telefono: payload.telefono,
			direccion: payload.direccion,
			acepta_comunicaciones: payload.acepta_comunicaciones,
			contacto_emergencia_nombre: payload.contacto_emergencia_nombre,
			contacto_emergencia_telefono: payload.contacto_emergencia_telefono,
			...(payload.dni === undefined ? {} : { dni: payload.dni }),
		})
		.eq('id', id)
		.abortSignal(signalLocal(signal));
	if (error) {
		throw Object.assign(error, { status });
	}
}

export async function cambiarEstadoSocio(
	id: string,
	estado: 'activo' | 'inactivo',
	signal?: AbortSignal,
) {
	const { error, status } = await supabase
		.rpc(estado === 'activo' ? 'reactivar_socio' : 'baja_socio', { p_socio_id: id })
		.abortSignal(signalLocal(signal));
	if (error) {
		throw Object.assign(error, { status });
	}
}

export async function getResumenSocio(id: string, signal?: AbortSignal) {
	const { data, error } = await supabase
		.from('v_socios_estado_pago')
		.select('id,es_moroso,pendientes_count,deuda_pendiente')
		.eq('id', id)
		.abortSignal(signalLocal(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	if (!data) {
		return null;
	}
	if (
		typeof data.es_moroso !== 'boolean' ||
		typeof data.pendientes_count !== 'number' ||
		typeof data.deuda_pendiente !== 'number'
	) {
		throw new Error('No se pudo verificar el resumen de cuotas.');
	}
	return {
		esMoroso: data.es_moroso,
		cuotasPendientes: data.pendientes_count,
		deudaPendiente: data.deuda_pendiente,
	};
}

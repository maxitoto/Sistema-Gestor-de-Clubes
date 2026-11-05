import { supabase } from '#shared/api';
import type { Tables, TablesInsert } from '#shared/types';
export type Deporte = Pick<Tables<'deportes'>, 'id' | 'nombre' | 'descripcion' | 'estado'>;
export type CrearDeportePayload = Required<
	Pick<TablesInsert<'deportes'>, 'nombre' | 'descripcion'>
>;
const columnas = 'id, nombre, descripcion, estado';
const requestSignal = (signal?: AbortSignal) =>
	signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
export async function getDeportes(soloActivos = false, signal?: AbortSignal): Promise<Deporte[]> {
	let query = supabase.from('deportes').select(columnas).order('nombre').order('id');
	if (soloActivos) {
		query = query.eq('estado', 'activo');
	}
	const { data, error } = await query.abortSignal(requestSignal(signal));
	if (error) {
		throw error;
	}
	return data ?? [];
}
export async function crearDeporte(
	payload: CrearDeportePayload,
	signal?: AbortSignal,
): Promise<Deporte> {
	const { data, error, status } = await supabase
		.from('deportes')
		.insert({ nombre: payload.nombre, descripcion: payload.descripcion })
		.select(columnas)
		.abortSignal(requestSignal(signal))
		.single();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}
export async function buscarDeportePorNombre(
	payload: CrearDeportePayload,
	signal?: AbortSignal,
): Promise<Deporte | null> {
	const { data, error } = await supabase
		.from('deportes')
		.select(columnas)
		.eq('nombre', payload.nombre)
		.abortSignal(requestSignal(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	return data;
}

export async function getDeporte(id: string, signal?: AbortSignal): Promise<Deporte | null> {
	const { data, error } = await supabase
		.from('deportes')
		.select(columnas)
		.eq('id', id)
		.abortSignal(requestSignal(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	return data;
}
export async function actualizarDeporte(
	id: string,
	payload: CrearDeportePayload,
	signal?: AbortSignal,
): Promise<Deporte> {
	const { data, error, status } = await supabase
		.from('deportes')
		.update({ nombre: payload.nombre, descripcion: payload.descripcion })
		.eq('id', id)
		.select(columnas)
		.abortSignal(requestSignal(signal))
		.single();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}
export async function darDeBajaDeporte(id: string, signal?: AbortSignal): Promise<void> {
	const { error, status } = await supabase
		.rpc('baja_deporte', { p_deporte_id: id })
		.abortSignal(requestSignal(signal));
	if (error) {
		throw Object.assign(error, { status });
	}
}

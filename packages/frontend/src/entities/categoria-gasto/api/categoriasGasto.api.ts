import { createHumanRequestClient, supabase } from '#shared/api';
import type { Tables } from '#shared/types';
export type CategoriaGasto = Pick<
	Tables<'categorias_gasto'>,
	'id' | 'nombre' | 'descripcion' | 'estado'
>;
export type CategoriaGastoPayload = Pick<CategoriaGasto, 'nombre' | 'descripcion'>;
const columns = 'id,nombre,descripcion,estado';
const timed = (signal?: AbortSignal) =>
	signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
export async function getCategoriasGasto(
	soloActivas = false,
	signal?: AbortSignal,
): Promise<CategoriaGasto[]> {
	const rows: CategoriaGasto[] = [];
	let cursor: string | null = null;
	const requestSignal = timed(signal);
	while (true) {
		let q = supabase.from('categorias_gasto').select(columns).order('id').limit(1000);
		if (soloActivas) {
			q = q.eq('estado', 'activo');
		}
		if (cursor) {
			q = q.gt('id', cursor);
		}
		const { data, error } = await q.abortSignal(requestSignal);
		if (error) {
			throw error;
		}
		rows.push(...data);
		if (data.length < 1000) {
			break;
		}
		cursor = data[data.length - 1]?.id ?? null;
		if (!cursor) {
			break;
		}
	}
	return rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-AR') || a.id.localeCompare(b.id));
}
export async function getCategoriaGasto(
	id: string,
	signal?: AbortSignal,
): Promise<CategoriaGasto | null> {
	const { data, error } = await supabase
		.from('categorias_gasto')
		.select(columns)
		.eq('id', id)
		.abortSignal(timed(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	return data;
}
export async function buscarCategoriaGasto(payload: CategoriaGastoPayload, signal?: AbortSignal) {
	const { data, error } = await supabase
		.from('categorias_gasto')
		.select(columns)
		.eq('nombre', payload.nombre)
		.abortSignal(timed(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	return data;
}
export async function crearCategoriaGasto(
	payload: CategoriaGastoPayload,
	actorId: string,
	signal?: AbortSignal,
) {
	const client = await createHumanRequestClient(actorId, signal);
	const { data, error, status } = await client
		.from('categorias_gasto')
		.insert({ nombre: payload.nombre, descripcion: payload.descripcion })
		.select(columns)
		.single();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}
export async function actualizarCategoriaGasto(
	id: string,
	payload: CategoriaGastoPayload,
	actorId: string,
	signal?: AbortSignal,
) {
	const client = await createHumanRequestClient(actorId, signal);
	const { data, error, status } = await client
		.from('categorias_gasto')
		.update({ nombre: payload.nombre, descripcion: payload.descripcion })
		.eq('id', id)
		.select(columns)
		.single();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}
export async function darBajaCategoriaGasto(id: string, actorId: string, signal?: AbortSignal) {
	const client = await createHumanRequestClient(actorId, signal);
	const { data, error, status } = await client
		.from('categorias_gasto')
		.update({ estado: 'inactivo' })
		.eq('id', id)
		.eq('estado', 'activo')
		.select(columns)
		.single();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}

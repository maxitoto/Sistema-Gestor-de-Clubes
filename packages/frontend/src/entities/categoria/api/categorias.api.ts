import { supabase } from '#shared/api';
import type { Database, Tables, TablesInsert } from '#shared/types';
export type Categoria = Pick<
	Tables<'categorias'>,
	'id' | 'deporte_id' | 'nombre' | 'arancel_mensual' | 'edad_min' | 'edad_max' | 'estado'
>;
export type CrearCategoriaPayload = Required<
	Pick<
		TablesInsert<'categorias'>,
		'deporte_id' | 'nombre' | 'arancel_mensual' | 'edad_min' | 'edad_max'
	>
>;
export type CategoriaSuperpuesta = {
	categoria_id: string;
	nombre: string;
	edad_min: number | null;
	edad_max: number | null;
};
const columnas = 'id, deporte_id, nombre, arancel_mensual, edad_min, edad_max, estado';
const requestSignal = (signal?: AbortSignal) =>
	signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
export async function getCategorias(
	deporteId: string,
	soloActivas = false,
	signal?: AbortSignal,
): Promise<Categoria[]> {
	let query = supabase
		.from('categorias')
		.select(
			'id, deporte_id, nombre, arancel_mensual, edad_min, edad_max, estado, deportes!inner(estado)',
		)
		.eq('deporte_id', deporteId)
		.order('nombre')
		.order('id');
	if (soloActivas) {
		query = query.eq('estado', 'activo').eq('deportes.estado', 'activo');
	}
	const { data, error } = await query.abortSignal(requestSignal(signal));
	if (error) {
		throw error;
	}
	return (data ?? []).map(({ deportes: _deporte, ...categoria }) => categoria);
}
/** Opciones válidas de inscripción: categoría Y deporte activos filtrados en servidor. */
export function getCategoriasActivasPorDeporte(
	deporteId: string,
	signal?: AbortSignal,
): Promise<Categoria[]> {
	return getCategorias(deporteId, true, signal);
}
export async function crearCategoria(
	payload: CrearCategoriaPayload,
	signal?: AbortSignal,
): Promise<Categoria> {
	const { data, error, status } = await supabase
		.from('categorias')
		.insert({
			deporte_id: payload.deporte_id,
			nombre: payload.nombre,
			arancel_mensual: payload.arancel_mensual,
			edad_min: payload.edad_min,
			edad_max: payload.edad_max,
		})
		.select(columnas)
		.abortSignal(requestSignal(signal))
		.single();
	if (error) {
		throw Object.assign(error, { status });
	}
	return data;
}
export async function buscarCategoriaPorIdentidad(
	payload: CrearCategoriaPayload,
	signal?: AbortSignal,
): Promise<Categoria | null> {
	const { data, error } = await supabase
		.from('categorias')
		.select(columnas)
		.eq('deporte_id', payload.deporte_id)
		.eq('nombre', payload.nombre)
		.abortSignal(requestSignal(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	return data;
}
export async function consultarSuperposicion(
	payload: Pick<CrearCategoriaPayload, 'deporte_id' | 'edad_min' | 'edad_max'>,
	signal?: AbortSignal,
): Promise<CategoriaSuperpuesta[]> {
	// La función SQL acepta NULL; el generador actual omite esa nulabilidad en Args.
	const args = {
		p_deporte_id: payload.deporte_id,
		p_edad_min: payload.edad_min,
		p_edad_max: payload.edad_max,
		p_excluir_categoria: null,
	};
	const { data, error } = await supabase
		.rpc(
			'categorias_rango_superpuesto',
			args as unknown as Database['public']['Functions']['categorias_rango_superpuesto']['Args'],
		)
		.abortSignal(requestSignal(signal));
	if (error) {
		throw error;
	}
	return data ?? [];
}

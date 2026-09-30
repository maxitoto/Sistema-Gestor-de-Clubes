// src/modules/socios/api/socios.api.ts
import { supabase } from '#shared/api';

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
		.select('id, nombre, apellido, dni, estado, email, acepta_comunicaciones, email_invalido', {
			count: 'exact',
		})
		.order('apellido', { ascending: true })
		.order('id', { ascending: true })
		.range(from, from + limit - 1);
	if (searchTerm.trim()) {
		query = query.ilike('apellido', `%${searchTerm.trim()}%`);
	}
	if (signal) {
		query = query.abortSignal(signal);
	}
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

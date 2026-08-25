import { supabase } from '#utils/supabaseClient';

export interface GetSociosParams {
  page: number;
  limit: number;
  searchTerm: string;
}

export async function getSocios({ page, limit, searchTerm }: GetSociosParams) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('socios')
    .select('id, nombre, apellido, dni, estado', { count: 'exact' })
    .order('apellido', { ascending: true })
    .range(from, to);

  if (searchTerm.trim()) {
    query = query.ilike('apellido', `%${searchTerm.trim()}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  return {
    socios: data ?? [],
    total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)), // Manejando el caso 0 correctamente
  };
}
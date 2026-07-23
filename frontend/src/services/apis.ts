import { supabase } from './supabaseClient';
import type { Database, Tables, TablesInsert, TablesUpdate } from '#types/model';

// 1. El Interceptor: Separa el éxito del fracaso.
const edgeFetch = async (endpoint: string, options = {}) => {
  // "data" aquí será exactamente lo que Hono puso en c.json(data)
  const { data, error } = await supabase.functions.invoke('api/' + endpoint, options);
  
  // Si Hono lanzó un AppError (500, 404, 400), invoke lo detecta como error
  if (error) {
    if (error.context instanceof Response) {
      const json = await error.context.json();
      throw new Error(json.error || 'Error en el servidor');
    }
    throw new Error(error.message);
  }
  
  // Si todo fue bien, devolvemos los datos puros a TanStack Query
  return data;
};

// 2. Fábrica CRUD: Directa, sin lógica basura, solo declara los endpoints.
const createApi = <T extends keyof Database['public']['Tables']>(resource: T) => ({
  getAll: (): Promise<Tables<T>[]> =>
     edgeFetch(`${resource}`, { method: 'GET' }),
     
  getById: (id: string | number): Promise<Tables<T>> =>
     edgeFetch(`${resource}/${id}`, { method: 'GET' }),
     
  create: (payload: TablesInsert<T>): Promise<Tables<T>> =>
     edgeFetch(`${resource}`, { method: 'POST', body: payload }),
     
  update: (id: string | number, payload: TablesUpdate<T>): Promise<Tables<T>> =>
     edgeFetch(`${resource}/${id}`, { method: 'PATCH', body: payload }),
     
  delete: (id: string | number): Promise<void> =>
     edgeFetch(`${resource}/${id}`, { method: 'DELETE' })
});

export const api = {
  socios: createApi('socios'),
  usuarios: createApi('usuarios'),
  club: createApi('club'),
};
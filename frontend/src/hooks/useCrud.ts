// src/hooks/useApi.ts (o el nombre que prefieras)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '#services/apis';

type Resource = keyof typeof api;

// ==========================================
// HOOKS DE LECTURA (Queries)
// ==========================================

export function useGetAll<T extends Resource>(resource: T) {
  type ResponseData = Awaited<ReturnType<(typeof api)[T]['getAll']>>;

  return useQuery<ResponseData, Error>({
    queryKey: [resource],
    queryFn: () => (api[resource].getAll as () => Promise<ResponseData>)(),
  });
}

export function useGetById<T extends Resource>(resource: T, id: string | number | undefined) {
  type ResponseData = Awaited<ReturnType<(typeof api)[T]['getById']>>;

  return useQuery<ResponseData, Error>({
    queryKey: [resource, id],
    queryFn: () => 
      (api[resource].getById as (id: string | number) => Promise<ResponseData>)(id!),
    enabled: id !== undefined && id !== null, 
  });
}


// ==========================================
// HOOKS DE ESCRITURA (Mutations)
// ==========================================

export function useCreate<T extends Resource>(resource: T) {
  const queryClient = useQueryClient();
  
  // Extraemos exactamente qué pide y qué devuelve tu tabla específica
  type Payload = Parameters<typeof api[T]['create']>[0];
  type Response = Awaited<ReturnType<typeof api[T]['create']>>;

  // Le pasamos los 3 tipos a useMutation: <Respuesta, Error, Argumentos>
  return useMutation<Response, Error, Payload>({
    mutationFn: (payload) => 
      (api[resource].create as (p: Payload) => Promise<Response>)(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource] }),
  });
}

export function useUpdate<T extends Resource>(resource: T) {
  const queryClient = useQueryClient();
  
  type Payload = Parameters<typeof api[T]['update']>[1];
  type Response = Awaited<ReturnType<typeof api[T]['update']>>;

  return useMutation<Response, Error, { id: string | number; payload: Payload }>({
    mutationFn: ({ id, payload }) => 
      (api[resource].update as (id: string | number, p: Payload) => Promise<Response>)(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource] }),
  });
}

export function useDelete<T extends Resource>(resource: T) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string | number>({
    mutationFn: (id) => 
      (api[resource].delete as (id: string | number) => Promise<void>)(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource] }),
  });
}
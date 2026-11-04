import { useQuery } from '@tanstack/react-query';
import { getCategorias, getCategoriasActivasPorDeporte } from '../api/categorias.api';
export interface CategoriasQueryOptions {
	cacheScope: string;
	enabled: boolean;
	soloActivas?: boolean;
}
export function useCategorias(deporteId: string | null, options: CategoriasQueryOptions) {
	return useQuery({
		queryKey: [
			'categorias',
			options.cacheScope,
			{ deporteId, soloActivas: options.soloActivas ?? false },
		],
		queryFn: ({ signal }) => getCategorias(deporteId ?? '', options.soloActivas ?? false, signal),
		enabled: options.enabled && Boolean(deporteId),
		retry: 1,
	});
}
export function useCategoriasActivasPorDeporte(
	deporteId: string | null,
	options: Omit<CategoriasQueryOptions, 'soloActivas'>,
) {
	return useQuery({
		queryKey: ['categorias', options.cacheScope, { deporteId, soloActivas: true }],
		queryFn: ({ signal }) => getCategoriasActivasPorDeporte(deporteId ?? '', signal),
		enabled: options.enabled && Boolean(deporteId),
		retry: 1,
	});
}

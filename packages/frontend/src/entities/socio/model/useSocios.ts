// src/entities/socio/model/useSocios.ts

import { useQuery } from '@tanstack/react-query';
import { getSocios } from '../api/socios.api';

export interface UseSociosOptions {
	cacheScope?: string;
	enabled?: boolean;
	estado?: 'activo' | 'inactivo' | 'todos';
}

export function useSocios(
	page: number,
	limit: number,
	searchTerm: string,
	options?: UseSociosOptions,
) {
	return useQuery({
		queryKey: [
			'socios',
			options?.cacheScope,
			{ page, limit, searchTerm, estado: options?.estado ?? 'todos' },
		],
		queryFn: ({ signal }) =>
			getSocios({ page, limit, searchTerm, estado: options?.estado ?? 'todos' }, signal),
		enabled: options?.enabled ?? true,
		retry: 1,
	});
}

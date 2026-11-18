// src/entities/socio/model/useSocios.ts

import { useQuery } from '@tanstack/react-query';
import { getSocios } from '../api/socios.api';
import type { CriteriosSocios } from './sociosReporte';

export interface UseSociosOptions {
	cacheScope?: string;
	enabled?: boolean;
	estado?: 'activo' | 'inactivo' | 'todos';
	filtros?: Partial<CriteriosSocios>;
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
			{ page, limit, searchTerm, estado: options?.estado ?? 'todos', filtros: options?.filtros },
		],
		queryFn: ({ signal }) =>
			getSocios(
				{ page, limit, searchTerm, estado: options?.estado ?? 'todos', filtros: options?.filtros },
				signal,
			),
		enabled: options?.enabled ?? true,
		retry: 1,
	});
}

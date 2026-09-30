// src/entities/socio/model/useSocios.ts

import { useQuery } from '@tanstack/react-query';
import { getSocios } from '../api/socios.api';

export interface UseSociosOptions {
	cacheScope?: string;
	enabled?: boolean;
}

export function useSocios(
	page: number,
	limit: number,
	searchTerm: string,
	options?: UseSociosOptions,
) {
	return useQuery({
		queryKey: ['socios', options?.cacheScope, { page, limit, searchTerm }],
		queryFn: ({ signal }) => getSocios({ page, limit, searchTerm }, signal),
		enabled: options?.enabled ?? true,
	});
}

import { useQuery } from '@tanstack/react-query';
import { getDeportes } from '../api/deportes.api';
export interface DeportesQueryOptions {
	cacheScope: string;
	enabled: boolean;
	soloActivos?: boolean;
}
export function useDeportes(options: DeportesQueryOptions) {
	return useQuery({
		queryKey: ['deportes', options.cacheScope, { soloActivos: options.soloActivos ?? false }],
		queryFn: ({ signal }) => getDeportes(options.soloActivos ?? false, signal),
		enabled: options.enabled,
		retry: 1,
	});
}

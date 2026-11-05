import { useQuery } from '@tanstack/react-query';
import { getResumenSocio, getSocio } from '../api/socios.api';

export function useSocio(id: string, cacheScope: string, enabled: boolean) {
	return useQuery({
		queryKey: ['socio', cacheScope, id],
		queryFn: ({ signal }) => getSocio(id, signal),
		enabled,
		retry: 1,
	});
}
export function useResumenSocio(id: string, cacheScope: string, enabled: boolean) {
	return useQuery({
		queryKey: ['socio-deuda', cacheScope, id],
		queryFn: ({ signal }) => getResumenSocio(id, signal),
		enabled,
		retry: 1,
	});
}

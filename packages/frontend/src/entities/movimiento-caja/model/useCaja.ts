import { useQuery } from '@tanstack/react-query';
import { getCaja, getPeriodoCajaActual } from '../api/caja.api';
import type { CriteriosCaja } from './cajaContract';
export function useCaja(
	criteria: CriteriosCaja,
	options: { cacheScope: string; enabled: boolean },
) {
	return useQuery({
		queryKey: ['movimientos-caja', options.cacheScope, criteria],
		queryFn: ({ signal }) => getCaja(criteria, signal),
		enabled: options.enabled,
		retry: 1,
	});
}
export function usePeriodoCajaActual(options: { cacheScope: string; enabled: boolean }) {
	return useQuery({
		queryKey: ['periodo-caja', options.cacheScope],
		queryFn: ({ signal }) => getPeriodoCajaActual(signal),
		enabled: options.enabled,
		retry: 1,
	});
}

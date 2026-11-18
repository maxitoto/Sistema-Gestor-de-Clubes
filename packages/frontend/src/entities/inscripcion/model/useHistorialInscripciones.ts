import { useQuery } from '@tanstack/react-query';
import { getHistorialInscripciones } from '../api/inscripciones.api';

export function useHistorialInscripciones(socioId: string, cacheScope: string, enabled: boolean) {
	return useQuery({
		queryKey: ['inscripciones', cacheScope, socioId],
		queryFn: ({ signal }) => getHistorialInscripciones(socioId, signal),
		enabled,
		retry: 1,
	});
}

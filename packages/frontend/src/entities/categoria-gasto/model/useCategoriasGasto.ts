import { useQuery } from '@tanstack/react-query';
import { getCategoriasGasto } from '../api/categoriasGasto.api';
export function useCategoriasGasto({
	cacheScope,
	enabled,
	soloActivas = false,
}: {
	cacheScope: string;
	enabled: boolean;
	soloActivas?: boolean;
}) {
	return useQuery({
		queryKey: ['categorias-gasto', cacheScope, { soloActivas }],
		queryFn: ({ signal }) => getCategoriasGasto(soloActivas, signal),
		enabled,
		retry: 1,
	});
}

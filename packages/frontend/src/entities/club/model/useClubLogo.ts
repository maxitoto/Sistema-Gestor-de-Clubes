import { useQuery } from '@tanstack/react-query';
import { leerArchivo } from '#shared/api';
export function useClubLogo({
	clubId,
	cacheScope,
	enabled,
}: {
	clubId: string | undefined;
	cacheScope: string;
	enabled: boolean;
}) {
	return useQuery({
		queryKey: ['club-logo', cacheScope, clubId],
		queryFn: ({ signal }) => leerArchivo({ tipo: 'club-logo', entidadId: clubId ?? '' }, signal),
		enabled: enabled && !!clubId,
		staleTime: 8 * 60_000,
		refetchInterval: 8 * 60_000,
		retry: 1,
	});
}

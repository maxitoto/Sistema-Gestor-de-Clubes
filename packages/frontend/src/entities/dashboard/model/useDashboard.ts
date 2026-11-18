import { useQuery } from '@tanstack/react-query';
import { consultarDashboard } from '../api/dashboard.api';
import type { PeriodoDashboard } from './dashboardContract';
export function useDashboard(
	periodo: PeriodoDashboard,
	{ cacheScope, actorId, enabled }: { cacheScope: string; actorId: string; enabled: boolean },
) {
	return useQuery({
		queryKey: ['dashboard', cacheScope, periodo],
		queryFn: ({ signal }) => consultarDashboard(periodo, actorId, signal),
		enabled: enabled && Boolean(actorId),
		retry: 1,
		staleTime: 0,
		refetchOnMount: 'always',
		refetchOnWindowFocus: true,
	});
}

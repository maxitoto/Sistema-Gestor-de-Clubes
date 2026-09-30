// src/entities/club/model/useClub.ts
import { useQuery } from '@tanstack/react-query';
import { getClubConfig } from '../api/club.api';

export interface UseClubConfigOptions {
	cacheScope?: string;
	enabled?: boolean;
}

export const clubKeys = { config: ['club-config'] as const };

export function useClubConfig(options?: UseClubConfigOptions) {
	return useQuery({
		queryKey: [...clubKeys.config, options?.cacheScope],
		queryFn: ({ signal }) => getClubConfig(signal),
		enabled: options?.enabled ?? true,
	});
}

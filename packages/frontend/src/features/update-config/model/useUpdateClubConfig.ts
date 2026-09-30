// src/features/club/update-config/model/useUpdateClubConfig.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clubKeys, updateClubConfig } from '#entities/club';
import { useAuth } from '#entities/session';
import type { ClubUpdate } from '#shared/types';

export function useUpdateClubConfig() {
	const queryClient = useQueryClient();
	const { cacheScope } = useAuth();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: ClubUpdate }) =>
			updateClubConfig(id, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: [...clubKeys.config, cacheScope],
				exact: true,
			});
		},
	});
}

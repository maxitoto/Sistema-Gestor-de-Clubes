// src/features/club/update-config/model/useUpdateClubConfig.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clubKeys, updateClubConfig } from '#entities/club';
import type { ClubUpdate } from '#shared/types';

export function useUpdateClubConfig() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: ClubUpdate }) =>
			updateClubConfig(id, payload),
		onSuccess: () => {
			// Invalida la query de la entidad para que la página se refresque
			queryClient.invalidateQueries({ queryKey: clubKeys.config });
		},
	});
}

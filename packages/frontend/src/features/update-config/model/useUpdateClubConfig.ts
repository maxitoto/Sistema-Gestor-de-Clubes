import { useQueryClient } from '@tanstack/react-query';
import { getClubConfig, updateClubConfig } from '#entities/club';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';
import type { ClubConfig, ClubUpdate } from '#shared/types';

export function useUpdateClubConfig(onConfirmed: (row: ClubConfig) => void) {
	const queryClient = useQueryClient();
	const { cacheScope, profileStatus, isSigningOut, perfil } = useAuth();
	return useVerifiedMutation<{ id: string; payload: ClubUpdate }, ClubConfig>({
		cacheScope,
		enabled: profileStatus === 'ready' && !isSigningOut && perfil?.rol === 'admin',
		queryRoots: ['club-config'],
		write: ({ id, payload }, signal) => updateClubConfig(id, payload, signal),
		read: (signal) => getClubConfig(signal),
		matches: (row, { payload }) =>
			Object.entries(payload).every(([key, value]) => row[key as keyof ClubConfig] === value),
		onConfirmed: (row) => {
			queryClient.setQueryData(['club-config', cacheScope], row);
			onConfirmed(row);
		},
		describeError: (error) =>
			(error as { code?: string })?.code === '23514'
				? 'Los datos institucionales no cumplen las reglas del club.'
				: 'No pudimos guardar la configuración. Revise su conexión y los datos ingresados.',
	});
}

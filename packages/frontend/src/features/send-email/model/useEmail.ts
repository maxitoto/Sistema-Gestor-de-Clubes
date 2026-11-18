import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '#entities/session';
import { type AvisoPayload, dispararAvisoManual, getEmailTemplates } from '../api/email.api';
export function useAvisoManual() {
	const { perfil } = useAuth();
	return useMutation({
		mutationFn: ({ payload, signal }: { payload: AvisoPayload; signal?: AbortSignal }) =>
			dispararAvisoManual(payload, perfil?.id ?? '', signal),
		retry: false,
	});
}
export function useEmailTemplates() {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth();
	return useQuery({
		queryKey: ['email-templates', cacheScope],
		queryFn: ({ signal }) => getEmailTemplates(perfil?.id ?? '', signal),
		enabled: profileStatus === 'ready' && !isSigningOut,
		retry: 1,
	});
}

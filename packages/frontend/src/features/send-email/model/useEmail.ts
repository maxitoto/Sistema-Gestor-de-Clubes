// src/modules/comuniciones/model/useEmail.ts

import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '#entities/session';
import { dispararAvisoManual, getEmailTemplates } from '../api/email.api';

export function useAvisoManual() {
	return useMutation({ mutationFn: dispararAvisoManual, retry: false });
}
export function useEmailTemplates() {
	const { cacheScope, profileStatus } = useAuth();
	return useQuery({
		queryKey: ['email-templates', cacheScope],
		queryFn: ({ signal }) => getEmailTemplates(signal),
		enabled: profileStatus === 'ready',
	});
}

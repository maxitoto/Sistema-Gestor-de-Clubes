// src/pages/settings/ui/SettingsPage.tsx
import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import { useClubConfig } from '#entities/club';
import { useAuth } from '#entities/session';
import { SettingsForm } from '#features/update-config';

export function SettingsPage() {
	const { cacheScope, profileStatus } = useAuth();
	const { data, isLoading, isError, refetch } = useClubConfig({
		cacheScope,
		enabled: profileStatus === 'ready',
	});
	if (isLoading) {
		return (
			<CircularProgress
				aria-label="Cargando configuración"
				sx={{ display: 'block', mx: 'auto', mt: 4 }}
			/>
		);
	}
	if (isError || !data) {
		return (
			<Stack spacing={2} sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
				<Alert severity="error">No pudimos cargar la configuración institucional.</Alert>
				<Button onClick={() => void refetch()}>Volver a intentar</Button>
			</Stack>
		);
	}
	return <SettingsForm key={data.id} initialData={data} />;
}

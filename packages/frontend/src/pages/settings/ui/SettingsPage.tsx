import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useClubConfig } from '#entities/club';
import { useAuth } from '#entities/session';
import { UpdateClubLogo } from '#features/update-club-logo';
import { SettingsForm } from '#features/update-config';
import { UpdateFiscalCredentials } from '#features/update-fiscal-credentials';

export function SettingsPage() {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const query = useClubConfig({
		cacheScope,
		enabled: profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut,
	});
	if (query.isPending) {
		return (
			<CircularProgress
				aria-label="Cargando configuración"
				sx={{ display: 'block', mx: 'auto', mt: 4 }}
			/>
		);
	}
	if (query.isError || !query.data) {
		return (
			<Stack spacing={2}>
				<Alert severity="error">No pudimos cargar la configuración institucional.</Alert>
				<Button onClick={() => void query.refetch()}>Volver a intentar</Button>
			</Stack>
		);
	}
	return (
		<Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
			<div>
				<Typography variant="h4" component="h1">
					Configuración del club
				</Typography>
				<Typography color="text.secondary" sx={{ mt: 1 }}>
					Datos institucionales, identidad visual y credenciales fiscales.
				</Typography>
			</div>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) minmax(0,1fr)' },
					gap: 3,
					alignItems: 'start',
				}}
			>
				<Stack spacing={3} sx={{ minWidth: 0 }}>
					<SettingsForm key={`${cacheScope}:${query.data.id}`} initialData={query.data} />
					<UpdateClubLogo clubId={query.data.id} onUpdated={() => void query.refetch()} />
				</Stack>
				<Stack spacing={3}>
					<UpdateFiscalCredentials />
				</Stack>
			</Box>
		</Stack>
	);
}

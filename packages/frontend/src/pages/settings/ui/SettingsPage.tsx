import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useClubConfig } from '#entities/club';
import { useAuth } from '#entities/session';
import { DiagnosticoFiscal } from '#features/comprobante-fiscal';
import { UpdateClubLogo } from '#features/update-club-logo';
import { SettingsForm } from '#features/update-config';
import { UpdateFiscalCredentials } from '#features/update-fiscal-credentials';
import { PageHeader } from '#shared/ui';

export function SettingsPage() {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const query = useClubConfig({
		cacheScope,
		enabled: profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut,
	});
	if (query.isPending) {
		return (
			<Stack
				direction="row"
				spacing={1.5}
				role="status"
				sx={{ py: 6, justifyContent: 'center', alignItems: 'center' }}
			>
				<CircularProgress size={22} aria-label="Cargando configuración" />
				<Typography variant="body2" color="text.secondary">
					Cargando configuración del club…
				</Typography>
			</Stack>
		);
	}
	if (query.isError || !query.data) {
		return (
			<Alert
				severity="error"
				action={
					<Button size="small" color="inherit" onClick={() => void query.refetch()}>
						Reintentar
					</Button>
				}
			>
				No pudimos cargar la configuración institucional.
			</Alert>
		);
	}
	return (
		<Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
			<PageHeader
				title="Configuración del club"
				subtitle="Administrá los datos institucionales, el logo y la configuración de facturación electrónica ARCA."
			/>
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
				<Stack spacing={3} sx={{ minWidth: 0 }}>
					<UpdateFiscalCredentials />
					<DiagnosticoFiscal key={`${cacheScope}|${query.data.cuit}|${query.data.punto_venta}`} />
				</Stack>
			</Box>
		</Stack>
	);
}

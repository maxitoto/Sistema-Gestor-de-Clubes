import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../useAuth';

export function SessionStatus() {
	const { isLoading, profileStatus, message, retryProfile, logout, isSigningOut } = useAuth();
	if (isLoading || isSigningOut) {
		return (
			<Box
				role="status"
				sx={{
					minHeight: '60vh',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 2,
					p: 3,
				}}
			>
				<CircularProgress aria-label={isSigningOut ? 'Cerrando sesión' : 'Verificando acceso'} />
				<Typography variant="body2" color="text.secondary">
					{isSigningOut ? 'Cerrando sesión…' : 'Verificando tu sesión…'}
				</Typography>
			</Box>
		);
	}
	return (
		<Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', p: 3, mt: 6 }}>
			<Alert severity={profileStatus === 'inactive' ? 'warning' : 'error'}>
				{message ?? 'No pudimos habilitar el acceso a tu cuenta.'}
			</Alert>
			<Stack
				direction="row"
				spacing={1.5}
				useFlexGap
				sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}
			>
				{profileStatus === 'error' && (
					<Button variant="contained" onClick={retryProfile}>
						Volver a intentar
					</Button>
				)}
				<Button variant="outlined" onClick={() => void logout(message ?? undefined)}>
					Volver al inicio de sesión
				</Button>
			</Stack>
		</Stack>
	);
}

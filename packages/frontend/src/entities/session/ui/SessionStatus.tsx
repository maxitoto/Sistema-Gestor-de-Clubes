import { Alert, Box, Button, CircularProgress, Stack } from '@mui/material';
import { useAuth } from '../useAuth';

export function SessionStatus() {
	const { isLoading, profileStatus, message, retryProfile, logout, isSigningOut } = useAuth();
	if (isLoading || isSigningOut) {
		return (
			<Box role="status" sx={{ p: 3 }}>
				<CircularProgress aria-label={isSigningOut ? 'Cerrando sesión' : 'Verificando acceso'} />
			</Box>
		);
	}
	return (
		<Stack spacing={2} sx={{ maxWidth: 600, mx: 'auto', p: 3 }}>
			<Alert severity={profileStatus === 'inactive' ? 'warning' : 'error'}>
				{message ?? 'No se pudo habilitar el acceso a su cuenta.'}
			</Alert>
			{profileStatus === 'error' && <Button onClick={retryProfile}>Volver a intentar</Button>}
			<Button onClick={() => void logout(message ?? undefined)}>Volver al inicio de sesión</Button>
		</Stack>
	);
}

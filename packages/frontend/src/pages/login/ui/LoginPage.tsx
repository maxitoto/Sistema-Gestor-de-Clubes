// src/pages/login/ui/LoginPage.tsx

import { Alert, Box, Stack } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { SessionStatus, useAuth } from '#entities/session';
import { LoginForm } from '#features/login-by-email';

export function LoginPage() {
	const { session, profileStatus, isLoading, message, isSigningOut } = useAuth();
	if (isLoading || isSigningOut) {
		return <SessionStatus />;
	}
	if (session) {
		if (profileStatus !== 'ready') {
			return <SessionStatus />;
		}
		return <Navigate to="/dashboard" replace />;
	}
	return (
		<Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<Stack spacing={2} sx={{ width: '100%', maxWidth: 440 }}>
				{message && <Alert severity="info">{message}</Alert>}
				<LoginForm />
			</Stack>
		</Box>
	);
}

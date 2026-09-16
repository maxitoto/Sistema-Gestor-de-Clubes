// src/pages/login/ui/LoginPage.tsx

import { Box, CircularProgress } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { LoginForm } from '#/features/login-by-email';
import { useAuth } from '#entities/session';

export function LoginPage() {
	const { session, isLoading } = useAuth();

	return (
		<Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			{isLoading && <CircularProgress />}
			{!isLoading && <LoginForm />}
			{!isLoading && !session && <Navigate to="/login" replace />}
		</Box>
	);
}

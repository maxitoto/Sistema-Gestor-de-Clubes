// src/app/router/RequireAuth.tsx

import { CircularProgress } from '@mui/material';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '#entities/session';

// src/app/router/RequireAuth.tsx
export const RequireAuth = () => {
	const { session, perfil, isLoading } = useAuth();

	if (isLoading) {
		return <CircularProgress />; // muestra la rueda
	}

	if (!session) {
		return <Navigate to="/login" replace />;
	}

	if (!perfil) {
		return <CircularProgress />;
	}

	return <Outlet />;
};

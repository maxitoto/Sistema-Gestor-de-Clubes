// src/app/router/RequireAuth.tsx

import { Navigate, Outlet } from 'react-router-dom';
import { SessionStatus, useAuth } from '#entities/session';

export function RequireAuth() {
	const { session, profileStatus, isLoading, cacheScope } = useAuth();
	if (isLoading) {
		return <SessionStatus />;
	}
	if (!session) {
		return <Navigate to="/login" replace />;
	}
	if (profileStatus !== 'ready') {
		return <SessionStatus />;
	}
	return <Outlet key={cacheScope} />;
}

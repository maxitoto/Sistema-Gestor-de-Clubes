import { createBrowserRouter, Navigate } from 'react-router-dom';
import {
	DashboardPage,
	DeportesPage,
	LoginPage,
	SettingsPage,
	SocioPage,
	SociosPage,
} from '#pages';
import { AuthLayout, MainLayout } from '#widgets/layout';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';

export const routerConfig = createBrowserRouter([
	{ element: <AuthLayout />, children: [{ path: '/login', element: <LoginPage /> }] },
	{
		element: <RequireAuth />,
		children: [
			{
				element: <MainLayout />,
				children: [
					{ path: '/', element: <Navigate to="/dashboard" replace /> },
					{ path: '/dashboard', element: <DashboardPage /> },
					{ path: '/socios', element: <SociosPage /> },
					{ path: '/socios/:socioId', element: <SocioPage /> },
					{
						element: <RequireRole roles={['admin']} />,
						children: [
							{ path: '/settings', element: <SettingsPage /> },
							{ path: '/deportes', element: <DeportesPage /> },
						],
					},
				],
			},
		],
	},
	{ path: '*', element: <Navigate to="/dashboard" replace /> },
]);

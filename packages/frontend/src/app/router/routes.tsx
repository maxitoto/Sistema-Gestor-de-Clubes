import { createBrowserRouter, Navigate } from 'react-router-dom';
import { DashboardPage, LoginPage, SettingsPage, SociosPage } from '#pages';
import { AuthLayout, MainLayout } from '#widgets/layout';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';

export const routerConfig = createBrowserRouter([
	{
		element: <AuthLayout />,
		children: [{ path: '/login', element: <LoginPage /> }],
	},
	{
		element: <MainLayout />,
		children: [
			{
				element: <RequireAuth />,
				children: [
					{ path: '/', element: <Navigate to="/dashboard" replace /> },
					{ path: '/dashboard', element: <DashboardPage /> },
					{ path: '/socios', element: <SociosPage /> },
					{
						element: <RequireRole roles={['admin']} />,
						children: [{ path: '/settings', element: <SettingsPage /> }],
					},
				],
			},
		],
	},
	{ path: '*', element: <Navigate to="/dashboard" replace /> },
]);

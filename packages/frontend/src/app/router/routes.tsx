import { createBrowserRouter, Navigate } from 'react-router-dom';
import {
	DashboardPage,
	DeportesPage,
	LoginPage,
	RecoverPasswordPage,
	SetPasswordPage,
	SettingsPage,
	SocioPage,
	SociosPage,
	UsuariosPage,
} from '#pages';
import { AuthLayout, MainLayout } from '#widgets/layout';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';

export const routerConfig = createBrowserRouter([
	{
		element: <AuthLayout />,
		children: [
			{ path: '/login', element: <LoginPage /> },
			{ path: '/recuperar-contrasena', element: <RecoverPasswordPage /> },
			{ path: '/establecer-contrasena', element: <SetPasswordPage /> },
		],
	},
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
					{ path: '/cambiar-contrasena', element: <SetPasswordPage change /> },
					{
						element: <RequireRole roles={['admin']} />,
						children: [
							{ path: '/settings', element: <SettingsPage /> },
							{ path: '/deportes', element: <DeportesPage /> },
							{ path: '/usuarios', element: <UsuariosPage /> },
						],
					},
				],
			},
		],
	},
	{ path: '*', element: <Navigate to="/dashboard" replace /> },
]);

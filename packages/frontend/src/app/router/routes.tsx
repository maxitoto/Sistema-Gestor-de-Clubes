import { createBrowserRouter, Navigate } from 'react-router-dom';
import {
	ComunicacionDetallePage,
	ComunicacionesPage,
	DashboardPage,
	DeportesPage,
	DesuscribirPage,
	GastosPage,
	LoginPage,
	MonitoreoFiscalPage,
	PagosPage,
	PlantillasPage,
	RecoverPasswordPage,
	RedactarComunicacionPage,
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
			{ path: '/desuscribir', element: <DesuscribirPage /> },
		],
	},
	{
		element: <RequireAuth />,
		children: [
			{
				element: <MainLayout />,
				children: [
					{ path: '/', element: <Navigate to="/dashboard" replace /> },
					{ path: '/socios', element: <SociosPage /> },
					{ path: '/pagos', element: <PagosPage /> },
					{ path: '/comunicaciones', element: <ComunicacionesPage /> },
					{ path: '/comunicaciones/redactar', element: <RedactarComunicacionPage /> },
					{ path: '/comunicaciones/plantillas', element: <PlantillasPage /> },
					{ path: '/comunicaciones/:envioId', element: <ComunicacionDetallePage /> },
					{ path: '/monitoreo-fiscal', element: <MonitoreoFiscalPage /> },
					{ path: '/gastos', element: <GastosPage /> },
					{ path: '/socios/:socioId', element: <SocioPage /> },
					{ path: '/cambiar-contrasena', element: <SetPasswordPage change /> },
					{
						element: <RequireRole roles={['admin']} />,
						children: [
							{ path: '/dashboard', element: <DashboardPage /> },
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

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout, MainLayout } from '#widgets/layout';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';

// Centralizamos las importaciones de las páginas
import LoginPage from '#pages/login/ui/LoginPage';
import DashboardPage from '#pages/dashboard/ui/DashboardPage';
import SociosPage  from '#pages/socios/ui/SociosPage';
import SettingsPage from '#pages/settings/ui/SettingsPage';

export const routerConfig = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [ { path: '/login', element: <LoginPage /> } ],
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
            children: [ { path: '/settings', element: <SettingsPage /> } ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> }
]);
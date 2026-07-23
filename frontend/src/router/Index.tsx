import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { MainLayout } from '#components/layout/MainLayout';
import { AuthLayout } from '#components/layout/AuthLayout';

import Login  from '#pages/Login';
import Dashboard from '#pages/Dashboard';
import Socios from '#pages/Socios';
import Settings from '#pages/Settings';

export const routerConfig = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        path: '/login',
        element: <Login />,
      },
    ]
  },
{
    element: <MainLayout />,
    children: [
      // Rutas para cualquier logueado
      {
        element: <ProtectedRoute />, 
        children: [
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/socios', element: <Socios /> },
          { path: '/', element: <Navigate to="/dashboard" replace /> }
        ]
      },
      // Rutas EXCLUSIVAS para admin
      {
        element: <ProtectedRoute requiereAdmin={true} />, 
        children: [
          { path: '/settings', element: <Settings /> },
        ]
      }
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  }
]);
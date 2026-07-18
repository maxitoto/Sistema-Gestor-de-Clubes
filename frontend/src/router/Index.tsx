import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { MainLayout } from '#components/layout/MainLayout';

import Login from '#pages/Login';
import Dashboard from '#pages/Dashboard';
import Socios from '#pages/Socios';

export const routerConfig = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: '/dashboard',
            element: <Dashboard />,
          },
          {
            path: '/socios',
            element: <Socios />,
          },
          {
            path: '/',
            element: <Navigate to="/dashboard" replace />,
          }
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  }
]);
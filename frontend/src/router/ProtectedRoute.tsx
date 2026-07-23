import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '#hooks/useAuth';
import { Box, CircularProgress } from '@mui/material';

interface Props {
  requiereAdmin?: boolean;
}

export const ProtectedRoute = ({ requiereAdmin = false }: Props) => {
  const { session, perfil, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  // 1. ¿Está logueado?
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // 2. ¿Tiene permiso de admin si la ruta lo requiere?
  if (requiereAdmin && perfil?.rol !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
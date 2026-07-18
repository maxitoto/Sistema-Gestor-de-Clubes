import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '#hooks/useAuth';
import { Box, CircularProgress } from '@mui/material';

export const ProtectedRoute = () => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
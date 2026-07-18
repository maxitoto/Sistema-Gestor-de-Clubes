import { Outlet } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Button } from '@mui/material';
import { supabase } from '#services/supabaseClient';

export const MainLayout = () => {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Barra de Navegación Global */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Club Los Andes
          </Typography>
          <Button color="inherit" onClick={handleLogout}>
            Cerrar Sesión
          </Button>
        </Toolbar>
      </AppBar>

      {/* Aquí es donde React Router inyectará las diferentes páginas (Dashboard, Socios...) */}
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
};
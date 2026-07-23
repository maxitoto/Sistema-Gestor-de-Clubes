import { Outlet } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Button, IconButton } from '@mui/material';
import { supabase } from '#services/supabaseClient';
import { useContext } from 'react';
import { ThemeModeContext } from '#contexts/ThemeModoContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';

export const MainLayout = () => {
  const { toggleColorMode, mode } = useContext(ThemeModeContext);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Club Los Andes
          </Typography>
          
          <IconButton color="inherit" onClick={toggleColorMode} sx={{ mr: 2 }} aria-label={mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}>
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>

          <Button color="inherit" onClick={handleLogout}>
            Cerrar Sesión
          </Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
};
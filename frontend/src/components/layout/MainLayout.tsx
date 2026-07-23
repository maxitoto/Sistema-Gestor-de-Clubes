import { Outlet, useNavigate } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Button, IconButton } from '@mui/material';
import { supabase } from '#services/supabaseClient';
import { useContext } from 'react';
import { ThemeModeContext } from '#contexts/ThemeModoContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import SettingsIcon from '@mui/icons-material/Settings';
import { useGetAll } from '#hooks/useCrud';

export const MainLayout = () => {
  const navigate = useNavigate();
  const { toggleColorMode, mode } = useContext(ThemeModeContext);

  const { data: configuraciones } = useGetAll('club');
  const clubConfig = configuraciones?.[0];
  
  const tituloApp = clubConfig?.nombre || 'Gestor de Clubes';

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleConfig = () => {
    navigate('/settings');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            {tituloApp}
          </Typography>
          
          <IconButton color="inherit" onClick={toggleColorMode} sx={{ mr: 2 }} aria-label={mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}>
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>

          <Button color="inherit" onClick={handleLogout}>
            Cerrar Sesión
          </Button>

          <IconButton color="inherit" onClick={handleConfig} sx={{ ml: 2 }} aria-label='Configuración'>
            <SettingsIcon/>
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
};
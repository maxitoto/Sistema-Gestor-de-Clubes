import { Outlet, useNavigate } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Button, IconButton } from '@mui/material';
import { supabase } from '#utils/supabaseClient';
import { useContext } from 'react';
import { ThemeModeContext } from '#contexts/ThemeModoContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import SettingsIcon from '@mui/icons-material/Settings';
import { useQuery } from '@tanstack/react-query';

export const MainLayout = () => {
  const navigate = useNavigate();
  const { toggleColorMode, mode } = useContext(ThemeModeContext);

  // Consulta directa a la configuración del club
  const { data: clubConfig } = useQuery({
    queryKey: ['club-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('club')
        .select('*')
        .single();
      if (error) return null;
      return data;
    },
  });

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
          
          <IconButton 
            color="inherit" 
            onClick={toggleColorMode} 
            sx={{ mr: 2 }} 
            aria-label={mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
          >
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
          
          <Button color="inherit" onClick={handleLogout}>
            Cerrar Sesión
          </Button>
          
          <IconButton 
            color="inherit" 
            onClick={handleConfig} 
            sx={{ ml: 2 }} 
            aria-label='Configuración'
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
};
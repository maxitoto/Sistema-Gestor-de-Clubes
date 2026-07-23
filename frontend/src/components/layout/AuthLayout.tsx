import { Outlet } from 'react-router-dom';
import { Box, IconButton } from '@mui/material';
import { useContext } from 'react';
import { ThemeModeContext } from '#contexts/ThemeModoContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';

export const AuthLayout = () => {
  const { toggleColorMode, mode } = useContext(ThemeModeContext);

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
        <IconButton color="inherit" onClick={toggleColorMode} sx={{ mr: 2 }} aria-label={mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}>
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
      </Box>

      <Box sx={{ flexGrow: 1, display: 'flex' }}>
        <Outlet />
      </Box>
      
    </Box>
  );
};
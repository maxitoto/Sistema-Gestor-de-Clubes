// src/widgets/layout/MainLayout.tsx

import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import SettingsIcon from '@mui/icons-material/Settings';
import { AppBar, Box, Button, IconButton, Toolbar, Typography } from '@mui/material';
import { useContext } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useClubConfig } from '#entities/club';
import { useAuth } from '#entities/session';
import { ThemeModeContext } from '#shared/config/styles';

export const MainLayout = () => {
	const { logout, perfil, isSigningOut, cacheScope, profileStatus } = useAuth();
	const navigate = useNavigate();
	const { toggleColorMode, mode } = useContext(ThemeModeContext);
	const { data: clubConfig } = useClubConfig({
		cacheScope,
		enabled: profileStatus === 'ready',
	});
	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
			<AppBar position="static">
				<Toolbar sx={{ flexWrap: 'wrap', gap: 1 }}>
					<Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
						{clubConfig?.nombre || 'Gestor de Clubes'}
					</Typography>
					<IconButton
						color="inherit"
						onClick={toggleColorMode}
						aria-label={mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
					>
						{mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
					</IconButton>
					<Button color="inherit" disabled={isSigningOut} onClick={() => void logout()}>
						Cerrar Sesión
					</Button>
					{perfil?.rol === 'admin' && (
						<IconButton
							color="inherit"
							onClick={() => navigate('/settings')}
							aria-label="Configuración"
						>
							<SettingsIcon />
						</IconButton>
					)}
				</Toolbar>
			</AppBar>
			<Box component="main" sx={{ flexGrow: 1, p: { xs: 2, sm: 3 } }}>
				<Outlet />
			</Box>
		</Box>
	);
};

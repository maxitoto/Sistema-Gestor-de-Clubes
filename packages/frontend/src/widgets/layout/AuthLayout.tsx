import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useContext } from 'react';
import { Outlet } from 'react-router-dom';
import { ThemeModeContext } from '#shared/config/styles';

export const AuthLayout = () => {
	const { toggleColorMode, mode } = useContext(ThemeModeContext);

	return (
		<Box
			sx={{
				position: 'relative',
				minHeight: '100vh',
				display: 'flex',
				flexDirection: 'column',
				bgcolor: 'background.default',
			}}
		>
			<Box sx={{ position: 'absolute', top: 16, right: 16 }}>
				<Tooltip title={mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
					<IconButton
						color="inherit"
						onClick={toggleColorMode}
						aria-label={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
					>
						{mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
					</IconButton>
				</Tooltip>
			</Box>

			<Box
				sx={{
					flexGrow: 1,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					px: 2,
					py: 8,
				}}
			>
				<Outlet />
			</Box>
		</Box>
	);
};

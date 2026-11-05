import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SportsSoccerOutlinedIcon from '@mui/icons-material/SportsSoccerOutlined';
import {
	AppBar,
	Avatar,
	Box,
	Button,
	Chip,
	Divider,
	Drawer,
	IconButton,
	List,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Toolbar,
	Tooltip,
	Typography,
} from '@mui/material';
import { useContext, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useClubConfig } from '#entities/club';
import { useAuth } from '#entities/session';
import { ThemeModeContext } from '#shared/config/styles';

const sidebarWidth = 232;

export const MainLayout = () => {
	const { logout, perfil, isSigningOut, cacheScope, profileStatus } = useAuth();
	const { pathname } = useLocation();
	const { toggleColorMode, mode } = useContext(ThemeModeContext);
	const [mobileOpen, setMobileOpen] = useState(false);
	const { data: clubConfig } = useClubConfig({ cacheScope, enabled: profileStatus === 'ready' });
	const roleLabel = perfil?.rol === 'admin' ? 'Administrador' : 'Responsable';
	const navigation = [
		{ to: '/dashboard', label: 'Dashboard', icon: <DashboardOutlinedIcon /> },
		{ to: '/socios', label: 'Socios', icon: <GroupsOutlinedIcon /> },
		...(perfil?.rol === 'admin'
			? [
					{ to: '/deportes', label: 'Deportes', icon: <SportsSoccerOutlinedIcon /> },
					{ to: '/settings', label: 'Configuración', icon: <SettingsOutlinedIcon /> },
				]
			: []),
	];
	const pageTitle =
		navigation.find(
			(item) => item.to === pathname || (item.to === '/socios' && pathname.startsWith('/socios/')),
		)?.label ?? 'Gestión del club';
	const sidebar = (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<Box
				sx={{
					minHeight: 80,
					px: 2.5,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
				}}
			>
				<Typography sx={{ fontWeight: 800, fontSize: '0.9rem', lineHeight: 1.4 }}>
					{clubConfig?.nombre || 'Club Social'}
				</Typography>
				<Typography variant="caption" color="text.secondary">
					Gestión deportiva
				</Typography>
			</Box>
			<Divider />
			<List component="nav" aria-label="Navegación principal" sx={{ px: 1.25, py: 2 }}>
				{navigation.map(({ to, label, icon }) => (
					<ListItemButton
						key={to}
						component={NavLink}
						to={to}
						onClick={() => setMobileOpen(false)}
						sx={{
							mb: 0.75,
							borderRadius: 1,
							minHeight: 44,
							color: 'text.secondary',
							'&.active': {
								bgcolor: 'action.selected',
								color: 'primary.main',
								boxShadow: 'inset 0 0 0 1px currentColor',
							},
							'&.active .MuiListItemText-primary': { fontWeight: 700 },
						}}
					>
						<ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>{icon}</ListItemIcon>
						<ListItemText
							primary={label}
							slotProps={{ primary: { sx: { fontSize: '0.875rem' } } }}
						/>
					</ListItemButton>
				))}
			</List>
			<Box sx={{ mt: 'auto', p: 2 }}>
				<Chip
					label={`Rol: ${roleLabel}`}
					variant="outlined"
					sx={{ width: '100%', color: 'text.secondary', borderColor: 'divider' }}
				/>
			</Box>
		</Box>
	);
	return (
		<Box sx={{ display: 'flex', minHeight: '100vh' }}>
			<Box
				component="aside"
				aria-label="Menú del club"
				sx={{ width: { md: sidebarWidth }, flexShrink: { md: 0 } }}
			>
				<Drawer
					variant="temporary"
					open={mobileOpen}
					onClose={() => setMobileOpen(false)}
					slotProps={{ paper: { sx: { width: sidebarWidth } }, root: { keepMounted: true } }}
					sx={{ display: { xs: 'block', md: 'none' } }}
				>
					{sidebar}
				</Drawer>
				<Drawer
					variant="permanent"
					open
					slotProps={{ paper: { sx: { width: sidebarWidth, boxSizing: 'border-box' } } }}
					sx={{ display: { xs: 'none', md: 'block' } }}
				>
					{sidebar}
				</Drawer>
			</Box>
			<Box sx={{ minWidth: 0, flexGrow: 1 }}>
				<AppBar
					position="sticky"
					color="inherit"
					elevation={0}
					sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
				>
					<Toolbar
						sx={{ minHeight: { xs: 64, sm: 80 }, gap: { xs: 0.5, sm: 1.5 }, px: { xs: 2, sm: 3 } }}
					>
						<IconButton
							aria-label="Abrir menú"
							onClick={() => setMobileOpen(true)}
							sx={{ display: { md: 'none' }, mr: 0.5 }}
						>
							<MenuIcon />
						</IconButton>
						<Typography component="p" variant="h6" noWrap sx={{ flex: 1, minWidth: 0 }}>
							{pageTitle}
						</Typography>
						<Tooltip title={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
							<IconButton
								onClick={toggleColorMode}
								aria-label={mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
							>
								{mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
							</IconButton>
						</Tooltip>
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1,
								border: 1,
								borderColor: 'divider',
								borderRadius: 1,
								py: 0.75,
								px: 1,
							}}
						>
							<Avatar
								sx={{
									width: 30,
									height: 30,
									bgcolor: 'primary.main',
									color: 'primary.contrastText',
									fontSize: 12,
									borderRadius: 1,
								}}
								variant="rounded"
							>
								{perfil?.rol === 'admin' ? 'AD' : 'RE'}
							</Avatar>
							<Typography
								variant="body2"
								sx={{ display: { xs: 'none', sm: 'block' }, fontWeight: 600 }}
							>
								{roleLabel}
							</Typography>
						</Box>
						<Button
							color="inherit"
							disabled={isSigningOut}
							onClick={() => void logout()}
							startIcon={<LogoutIcon />}
							sx={{ display: { xs: 'none', sm: 'inline-flex' }, whiteSpace: 'nowrap' }}
						>
							Cerrar sesión
						</Button>
						<IconButton
							aria-label="Cerrar sesión"
							disabled={isSigningOut}
							onClick={() => void logout()}
							sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
						>
							<LogoutIcon />
						</IconButton>
					</Toolbar>
				</AppBar>
				<Box component="main" sx={{ p: { xs: 2, sm: 3, lg: 4 }, maxWidth: 1600, mx: 'auto' }}>
					<Outlet />
				</Box>
			</Box>
		</Box>
	);
};

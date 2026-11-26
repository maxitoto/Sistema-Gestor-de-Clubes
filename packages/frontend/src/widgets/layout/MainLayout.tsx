import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import MailOutlineIcon from '@mui/icons-material/EmailOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SportsSoccerOutlinedIcon from '@mui/icons-material/SportsSoccerOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import {
	AppBar,
	Avatar,
	Box,
	Chip,
	Divider,
	Drawer,
	IconButton,
	List,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Menu,
	MenuItem,
	Toolbar,
	Tooltip,
	Typography,
} from '@mui/material';
import { type ReactNode, useContext, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useClubConfig, useClubLogo } from '#entities/club';
import { useAuth } from '#entities/session';
import { ThemeModeContext } from '#shared/config/styles';

const sidebarWidth = 240;

interface NavItem {
	to: string;
	label: string;
	icon: ReactNode;
}

const STOP_WORDS = new Set([
	'club',
	'de',
	'del',
	'la',
	'las',
	'los',
	'el',
	'y',
	'social',
	'atletico',
	'atlético',
	'deportivo',
]);

function clubInitials(nombre: string | null | undefined): string {
	const clean = (nombre ?? '').trim();
	if (!clean) {
		return 'CL';
	}
	const words = clean.split(/\s+/).filter(Boolean);
	const meaningful = words.filter((word) => !STOP_WORDS.has(word.toLowerCase()));
	const source = meaningful.length >= 2 ? meaningful : words;
	if (source.length >= 2) {
		return `${source[0]?.[0] ?? ''}${source[1]?.[0] ?? ''}`.toUpperCase();
	}
	return (source[0]?.slice(0, 2) ?? 'CL').toUpperCase();
}

function userInitials(
	nombre: string | null | undefined,
	apellido: string | null | undefined,
	rol: string | undefined,
): string {
	const a = (nombre ?? '').trim()[0];
	const b = (apellido ?? '').trim()[0];
	if (a && b) {
		return `${a}${b}`.toUpperCase();
	}
	if (a) {
		return a.toUpperCase();
	}
	return rol === 'admin' ? 'AD' : 'RE';
}

function resolvePageTitle(pathname: string, navItems: readonly NavItem[]): string {
	if (pathname === '/monitoreo-fiscal') {
		return 'Cobranza / Monitoreo fiscal';
	}
	if (pathname === '/cambiar-contrasena') {
		return 'Cambiar contraseña';
	}
	if (pathname.startsWith('/socios/')) {
		return 'Socios / Ficha del socio';
	}
	if (pathname === '/comunicaciones/redactar') {
		return 'Comunicaciones / Redactar';
	}
	if (pathname === '/comunicaciones/plantillas') {
		return 'Comunicaciones / Plantillas';
	}
	if (pathname.startsWith('/comunicaciones/')) {
		return 'Comunicaciones / Detalle';
	}
	return navItems.find((item) => item.to === pathname)?.label ?? 'Gestión del club';
}

export const MainLayout = () => {
	const { logout, perfil, isSigningOut, cacheScope, profileStatus } = useAuth();
	const { pathname } = useLocation();
	const { toggleColorMode, mode } = useContext(ThemeModeContext);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
	const { data: clubConfig } = useClubConfig({ cacheScope, enabled: profileStatus === 'ready' });
	const { data: clubLogo } = useClubLogo({
		clubId: clubConfig?.id,
		cacheScope,
		enabled: profileStatus === 'ready',
	});
	const isAdmin = perfil?.rol === 'admin';
	const roleLabel = isAdmin ? 'Administrador' : 'Responsable';
	const displayName =
		[perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ').trim() || roleLabel;

	const operacionItems: NavItem[] = [
		...(isAdmin ? [{ to: '/dashboard', label: 'Dashboard', icon: <DashboardOutlinedIcon /> }] : []),
		{ to: '/socios', label: 'Socios', icon: <GroupsOutlinedIcon /> },
		{ to: '/pagos', label: 'Cobranza', icon: <PaymentsOutlinedIcon /> },
		{ to: '/gastos', label: 'Gastos e ingresos', icon: <AccountBalanceWalletOutlinedIcon /> },
		{ to: '/comunicaciones', label: 'Comunicaciones', icon: <MailOutlineIcon /> },
	];

	const administracionItems: NavItem[] = isAdmin
		? [
				{ to: '/deportes', label: 'Deportes', icon: <SportsSoccerOutlinedIcon /> },
				{ to: '/usuarios', label: 'Usuarios', icon: <ManageAccountsOutlinedIcon /> },
				{ to: '/settings', label: 'Configuración', icon: <SettingsOutlinedIcon /> },
			]
		: [];

	const allNavItems = [...operacionItems, ...administracionItems];
	const pageTitle = resolvePageTitle(pathname, allNavItems);

	const renderNavSection = (title: string, items: NavItem[]) => (
		<Box key={title} sx={{ mb: 1.5 }}>
			<Typography
				variant="caption"
				color="text.secondary"
				sx={{
					display: 'block',
					px: 1.5,
					py: 0.75,
					fontWeight: 700,
					letterSpacing: '0.06em',
					fontSize: '0.6875rem',
				}}
			>
				{title}
			</Typography>
			<List component="nav" aria-label={title} disablePadding sx={{ px: 1 }}>
				{items.map(({ to, label, icon }) => {
					const forceActive = to === '/pagos' && pathname === '/monitoreo-fiscal';
					return (
						<ListItemButton
							key={to}
							component={NavLink}
							to={to}
							className={forceActive ? 'active' : ''}
							onClick={() => setMobileOpen(false)}
							sx={{
								position: 'relative',
								mb: 0.5,
								borderRadius: 1.5,
								minHeight: 42,
								px: 1.5,
								color: 'text.secondary',
								'&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
								'&.active': {
									bgcolor: mode === 'dark' ? 'rgba(147, 180, 255, 0.14)' : 'primary.light',
									color: 'primary.main',
									'&::before': {
										content: '""',
										position: 'absolute',
										left: 0,
										top: 8,
										bottom: 8,
										width: 3,
										borderRadius: 2,
										bgcolor: 'primary.main',
									},
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
					);
				})}
			</List>
		</Box>
	);

	const sidebar = (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<Box
				sx={{
					minHeight: 72,
					px: 2.25,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
				}}
			>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
					<Avatar
						variant="rounded"
						src={clubLogo?.url ?? undefined}
						alt={clubConfig?.nombre ?? 'Club'}
						sx={{
							width: 36,
							height: 36,
							bgcolor: 'primary.main',
							color: 'primary.contrastText',
							fontWeight: 700,
							fontSize: '0.875rem',
						}}
					>
						{clubInitials(clubConfig?.nombre)}
					</Avatar>
					<Box sx={{ minWidth: 0 }}>
						<Typography noWrap sx={{ fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.35 }}>
							{clubConfig?.nombre || 'Gestión del Club'}
						</Typography>
						<Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
							Gestión deportiva
						</Typography>
					</Box>
				</Box>
			</Box>
			<Divider />
			<Box sx={{ py: 1.5, overflowY: 'auto', flex: 1 }}>
				{renderNavSection('OPERACIÓN', operacionItems)}
				{administracionItems.length > 0 && renderNavSection('ADMINISTRACIÓN', administracionItems)}
			</Box>
			<Divider />
			<Box sx={{ p: 2 }}>
				<Chip
					size="small"
					color={isAdmin ? 'info' : 'default'}
					label={`Rol: ${roleLabel}`}
					sx={{ width: '100%' }}
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
					slotProps={{
						paper: {
							sx: {
								width: sidebarWidth,
								boxSizing: 'border-box',
								borderRightColor: 'divider',
							},
						},
					}}
					sx={{ display: { xs: 'none', md: 'block' } }}
				>
					{sidebar}
				</Drawer>
			</Box>
			<Box sx={{ minWidth: 0, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
				<AppBar
					position="sticky"
					color="inherit"
					elevation={0}
					sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
				>
					<Toolbar
						sx={{
							minHeight: { xs: 60, sm: 72 },
							gap: { xs: 0.75, sm: 1.25 },
							px: { xs: 2, sm: 3 },
						}}
					>
						<IconButton
							aria-label="Abrir menú"
							onClick={() => setMobileOpen(true)}
							sx={{ display: { md: 'none' }, mr: 0.5 }}
						>
							<MenuIcon />
						</IconButton>
						<Typography
							component="p"
							variant="subtitle1"
							noWrap
							sx={{ flex: 1, minWidth: 0, fontWeight: 700, color: 'text.primary' }}
						>
							{pageTitle}
						</Typography>
						<Tooltip title={mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
							<IconButton
								onClick={toggleColorMode}
								aria-label={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
							>
								{mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
							</IconButton>
						</Tooltip>
						<Box
							component="button"
							type="button"
							aria-label="Abrir menú de mi cuenta"
							aria-haspopup="menu"
							aria-expanded={Boolean(accountAnchor)}
							onClick={(event) => setAccountAnchor(event.currentTarget)}
							sx={{
								bgcolor: 'transparent',
								color: 'inherit',
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								gap: 1,
								border: 1,
								borderColor: 'divider',
								borderRadius: 1.5,
								py: 0.5,
								px: 1,
								transition: 'background-color 120ms ease',
								'&:hover': { bgcolor: 'action.hover' },
							}}
						>
							<Avatar
								sx={{
									width: 30,
									height: 30,
									bgcolor: 'primary.main',
									color: 'primary.contrastText',
									fontSize: 12,
									fontWeight: 700,
									borderRadius: 1,
								}}
								variant="rounded"
							>
								{userInitials(perfil?.nombre, perfil?.apellido, perfil?.rol)}
							</Avatar>
							<Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'left', maxWidth: 160 }}>
								<Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.2 }}>
									{displayName}
								</Typography>
								<Typography
									variant="caption"
									color="text.secondary"
									noWrap
									sx={{ display: 'block', lineHeight: 1.2 }}
								>
									{roleLabel}
								</Typography>
							</Box>
							<KeyboardArrowDownIcon fontSize="small" sx={{ color: 'text.secondary' }} />
						</Box>
						<Menu
							anchorEl={accountAnchor}
							open={Boolean(accountAnchor)}
							onClose={() => setAccountAnchor(null)}
							anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
							transformOrigin={{ vertical: 'top', horizontal: 'right' }}
							slotProps={{ paper: { sx: { minWidth: 230, mt: 1, borderRadius: 2 } } }}
						>
							<Box sx={{ px: 2, py: 1.25 }}>
								<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
									{displayName}
								</Typography>
								{perfil?.email && (
									<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
										{perfil.email}
									</Typography>
								)}
							</Box>
							<Divider />
							<MenuItem
								component={NavLink}
								to="/cambiar-contrasena"
								onClick={() => setAccountAnchor(null)}
								sx={{ gap: 1.25, py: 1 }}
							>
								<VpnKeyOutlinedIcon fontSize="small" color="action" />
								Cambiar mi contraseña
							</MenuItem>
							<MenuItem
								disabled={isSigningOut}
								onClick={() => {
									setAccountAnchor(null);
									void logout();
								}}
								sx={{ gap: 1.25, py: 1, color: 'error.main' }}
							>
								<LogoutIcon fontSize="small" />
								{isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
							</MenuItem>
						</Menu>
					</Toolbar>
				</AppBar>
				<Box
					component="main"
					sx={{ p: { xs: 2, sm: 3, lg: 4 }, maxWidth: 1600, width: '100%', mx: 'auto', flex: 1 }}
				>
					<Outlet />
				</Box>
			</Box>
		</Box>
	);
};

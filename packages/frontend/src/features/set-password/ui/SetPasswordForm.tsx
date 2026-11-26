import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import {
	Alert,
	Avatar,
	Button,
	CircularProgress,
	Divider,
	IconButton,
	InputAdornment,
	Paper,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '#entities/session';
import { updatePassword } from '../api/password.api';
import {
	PASSWORD_HELP,
	type PasswordCallback,
	resolveSetPasswordView,
	validatePassword,
} from '../model/passwordForm';

export function SetPasswordForm({
	callback,
	change = false,
}: {
	callback: PasswordCallback | null;
	change?: boolean;
}) {
	const { user, profileStatus, logout, cacheScope } = useAuth();
	const [initialId] = useState(change ? (user?.id ?? null) : null);
	const [error, setError] = useState<string | null>(null);
	const [password, setPassword] = useState('');
	const [confirmation, setConfirmation] = useState('');
	const [currentPassword, setCurrentPassword] = useState('');
	const [currentVisible, setCurrentVisible] = useState(false);
	const [visible, setVisible] = useState(false);
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState(false);
	const [linkRequestFailed, setLinkRequestFailed] = useState(false);
	const mountedRef = useRef(false);
	const scopeRef = useRef(cacheScope);
	scopeRef.current = cacheScope;
	const view = resolveSetPasswordView({
		change,
		hasCallback: Boolean(callback),
		sessionMatches: Boolean(initialId) && initialId === user?.id,
		profileReady: profileStatus === 'ready',
		linkRequestFailed,
	});

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (!change) {
			window.history.replaceState(window.history.state, '', window.location.pathname);
			if (!callback) {
				setError(
					'Abrí el enlace de invitación o recuperación que recibiste por correo. Si venció, solicitá uno nuevo.',
				);
			}
		}
	}, [callback, change]);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		if (saving || !view.showForm) {
			return;
		}
		if (change && !currentPassword) {
			setError('Ingresá tu contraseña actual.');
			return;
		}
		const validation = validatePassword(password, confirmation);
		if (validation) {
			setError(validation);
			return;
		}
		setSaving(true);
		setError(null);
		const scope = cacheScope;
		try {
			await updatePassword({
				password,
				...(change ? { currentPassword, userId: initialId ?? '' } : callback ? { callback } : {}),
			});
			if (scopeRef.current !== scope || !mountedRef.current) {
				return;
			}
			setPassword('');
			setConfirmation('');
			setCurrentPassword('');
			if (change) {
				await logout('Tu contraseña se guardó. Ingresá nuevamente para continuar.');
			}
			if (mountedRef.current) {
				setDone(true);
			}
		} catch (reason) {
			if (mountedRef.current && scopeRef.current === scope) {
				if (!change) {
					setLinkRequestFailed(true);
				}
				setError(
					reason instanceof Error
						? reason.message
						: 'No pudimos confirmar el cambio de contraseña.',
				);
			}
		} finally {
			if (mountedRef.current) {
				setSaving(false);
			}
		}
	};

	return (
		<Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: '100%', boxSizing: 'border-box' }}>
			<Stack spacing={2.25}>
				<Stack spacing={1.25} sx={{ alignItems: 'center' }}>
					<Avatar
						variant="rounded"
						sx={{ width: 48, height: 48, bgcolor: 'primary.main', color: 'primary.contrastText' }}
					>
						<VpnKeyOutlinedIcon />
					</Avatar>
					<Typography component="h1" variant="h5" align="center">
						{change ? 'Cambiar contraseña' : 'Establecer contraseña'}
					</Typography>
					<Typography variant="body2" color="text.secondary" align="center">
						{change
							? 'Elegí una contraseña nueva para tu cuenta.'
							: 'Elegí la contraseña con la que vas a ingresar al sistema.'}
					</Typography>
				</Stack>
				<Divider />

				{done ? (
					<>
						<Alert severity="success">
							Contraseña guardada. Ingresá nuevamente para continuar.
						</Alert>
						<Button component={Link} to="/login" variant="contained" size="large">
							Ir al inicio de sesión
						</Button>
					</>
				) : (
					<>
						{error && <Alert severity="error">{error}</Alert>}
						{view.sessionMismatchMessage && (
							<Alert severity="warning">{view.sessionMismatchMessage}</Alert>
						)}
						{view.showForm && (
							<Stack component="form" noValidate onSubmit={save} spacing={2}>
								{change && (
									<TextField
										label="Contraseña actual"
										type={currentVisible ? 'text' : 'password'}
										autoComplete="current-password"
										required
										value={currentPassword}
										onChange={(event) => setCurrentPassword(event.target.value)}
										disabled={saving}
										slotProps={{
											input: {
												endAdornment: (
													<InputAdornment position="end">
														<IconButton
															aria-label={
																currentVisible
																	? 'Ocultar contraseña actual'
																	: 'Mostrar contraseña actual'
															}
															onClick={() => setCurrentVisible((value) => !value)}
															disabled={saving}
															edge="end"
														>
															{currentVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
														</IconButton>
													</InputAdornment>
												),
											},
										}}
									/>
								)}
								<TextField
									label="Nueva contraseña"
									type={visible ? 'text' : 'password'}
									autoComplete="new-password"
									required
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									disabled={saving}
									helperText={PASSWORD_HELP}
									slotProps={{
										input: {
											endAdornment: (
												<InputAdornment position="end">
													<IconButton
														aria-label={visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
														onClick={() => setVisible((value) => !value)}
														disabled={saving}
														edge="end"
													>
														{visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
													</IconButton>
												</InputAdornment>
											),
										},
									}}
								/>
								<TextField
									label="Confirmar nueva contraseña"
									type={visible ? 'text' : 'password'}
									autoComplete="new-password"
									required
									value={confirmation}
									onChange={(event) => setConfirmation(event.target.value)}
									disabled={saving}
								/>
								<Button
									type="submit"
									variant="contained"
									size="large"
									startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
									disabled={saving}
								>
									{saving ? 'Guardando…' : 'Guardar contraseña'}
								</Button>
							</Stack>
						)}
						{view.showRequestNewLink && (
							<Button component={Link} to="/recuperar-contrasena" disabled={saving}>
								Solicitar otro enlace
							</Button>
						)}
						<Button component={Link} to={view.cancelTo} disabled={saving}>
							Cancelar
						</Button>
					</>
				)}
			</Stack>
		</Paper>
	);
}

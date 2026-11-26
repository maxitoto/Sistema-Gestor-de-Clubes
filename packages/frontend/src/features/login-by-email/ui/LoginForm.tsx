import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
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
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '#entities/session';

export function LoginForm() {
	const { login } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const cleanEmail = email.trim();
		const nextErrors: { email?: string; password?: string } = {};
		if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
			nextErrors.email = 'Ingresá un correo electrónico válido.';
		}
		if (!password) {
			nextErrors.password = 'Ingresá tu contraseña.';
		}
		if (nextErrors.email || nextErrors.password) {
			setFieldErrors(nextErrors);
			return;
		}
		setFieldErrors({});
		setLoading(true);
		setError(null);
		try {
			const { error: authError } = await login({ email: cleanEmail, password });
			if (authError) {
				setError(
					authError.status === 400 || authError.status === 401
						? 'Correo o contraseña incorrectos.'
						: authError.message ||
								'No pudimos conectar con el servicio de acceso. Volvé a intentarlo.',
				);
			}
		} catch {
			setError('No pudimos conectar con el servicio de acceso. Revisá tu conexión.');
		} finally {
			setLoading(false);
		}
	};

	return (
		<Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: '100%', boxSizing: 'border-box' }}>
			<Stack spacing={1.25} sx={{ mb: 3, alignItems: 'center' }}>
				<Avatar
					variant="rounded"
					sx={{ width: 48, height: 48, bgcolor: 'primary.main', color: 'primary.contrastText' }}
				>
					<SportsSoccerIcon />
				</Avatar>
				<Typography variant="h5" component="h1" align="center">
					Sistema de Gestión de Clubes
				</Typography>
				<Typography variant="body2" color="text.secondary" align="center">
					Ingresá con tu cuenta para continuar
				</Typography>
			</Stack>
			<Divider sx={{ mb: 3 }} />
			{error && (
				<Alert severity="error" sx={{ mb: 2.5 }}>
					{error}
				</Alert>
			)}
			<Stack component="form" noValidate onSubmit={handleLogin} spacing={2.25}>
				<TextField
					fullWidth
					label="Correo electrónico"
					type="email"
					autoComplete="username"
					value={email}
					error={Boolean(fieldErrors.email)}
					helperText={fieldErrors.email}
					onChange={(e) => {
						setEmail(e.target.value);
						if (fieldErrors.email) {
							setFieldErrors((prev) => ({ ...prev, email: '' }));
						}
					}}
					required
					disabled={loading}
				/>
				<TextField
					fullWidth
					label="Contraseña"
					type={showPassword ? 'text' : 'password'}
					autoComplete="current-password"
					value={password}
					error={Boolean(fieldErrors.password)}
					helperText={fieldErrors.password}
					onChange={(e) => {
						setPassword(e.target.value);
						if (fieldErrors.password) {
							setFieldErrors((prev) => ({ ...prev, password: '' }));
						}
					}}
					required
					disabled={loading}
					slotProps={{
						input: {
							endAdornment: (
								<InputAdornment position="end">
									<IconButton
										aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
										onClick={() => setShowPassword((value) => !value)}
										disabled={loading}
										edge="end"
									>
										{showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
									</IconButton>
								</InputAdornment>
							),
						},
					}}
				/>
				<Button
					type="submit"
					fullWidth
					variant="contained"
					startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
					disabled={loading}
					size="large"
				>
					{loading ? 'Ingresando…' : 'Ingresar'}
				</Button>
				<Button component={Link} to="/recuperar-contrasena" disabled={loading}>
					¿Olvidaste tu contraseña?
				</Button>
			</Stack>
		</Paper>
	);
}

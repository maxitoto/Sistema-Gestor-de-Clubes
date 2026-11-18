import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
	Alert,
	Avatar,
	Button,
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
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setLoading(true);
		setError(null);
		try {
			const { error: authError } = await login({ email: email.trim(), password });
			if (authError) {
				setError(
					authError.status === 400 || authError.status === 401
						? 'Correo o contraseña incorrectos.'
						: authError.message ||
								'No pudimos conectar con el servicio de acceso. Vuelva a intentarlo.',
				);
			}
		} catch {
			setError('No pudimos conectar con el servicio de acceso. Revise su conexión.');
		} finally {
			setLoading(false);
		}
	};
	return (
		<Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: '100%', boxSizing: 'border-box' }}>
			<Stack spacing={1.5} sx={{ mb: 3, alignItems: 'center' }}>
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
				<Alert severity="error" sx={{ mb: 2 }}>
					{error}
				</Alert>
			)}
			<Stack component="form" onSubmit={handleLogin} spacing={2.5}>
				<TextField
					fullWidth
					label="Correo electrónico"
					type="email"
					autoComplete="username"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					disabled={loading}
				/>
				<TextField
					fullWidth
					label="Contraseña"
					type={showPassword ? 'text' : 'password'}
					autoComplete="current-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
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
				<Button type="submit" fullWidth variant="contained" disabled={loading} size="large">
					{loading ? 'Ingresando…' : 'Ingresar'}
				</Button>
				<Button component={Link} to="/recuperar-contrasena" disabled={loading}>
					¿Olvidaste tu contraseña?
				</Button>
			</Stack>
		</Paper>
	);
}

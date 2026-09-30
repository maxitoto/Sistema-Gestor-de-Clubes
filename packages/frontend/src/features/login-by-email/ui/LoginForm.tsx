// src/features/auth/login-by-email/ui/LoginForm.tsx

import { Alert, Button, Paper, TextField, Typography } from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useAuth } from '#entities/session';

export function LoginForm() {
	const { login } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
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
						? 'No se pudo iniciar sesión. Revise el correo y la contraseña.'
						: 'No pudimos conectar con el servicio de acceso. Vuelva a intentarlo.',
				);
			}
		} catch {
			setError('No pudimos conectar con el servicio de acceso. Revise su conexión.');
		} finally {
			setLoading(false);
		}
	};
	return (
		<Paper elevation={3} sx={{ p: 4, width: '100%', boxSizing: 'border-box' }}>
			<Typography variant="h5" component="h1" gutterBottom align="center">
				Sistema de Gestión de Clubes
			</Typography>
			<Typography align="center" sx={{ mb: 3 }}>
				Acceso al sistema de gestión
			</Typography>
			{error && (
				<Alert severity="error" sx={{ mb: 2 }}>
					{error}
				</Alert>
			)}
			<form onSubmit={handleLogin}>
				<TextField
					fullWidth
					label="Correo electrónico"
					type="email"
					autoComplete="username"
					margin="normal"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					disabled={loading}
				/>
				<TextField
					fullWidth
					label="Contraseña"
					type="password"
					autoComplete="current-password"
					margin="normal"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
					disabled={loading}
				/>
				<Button type="submit" fullWidth variant="contained" disabled={loading} sx={{ mt: 3 }}>
					{loading ? 'Ingresando...' : 'Iniciar Sesión'}
				</Button>
			</form>
		</Paper>
	);
}

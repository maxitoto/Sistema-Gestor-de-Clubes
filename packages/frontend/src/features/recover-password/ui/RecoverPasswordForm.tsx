import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { requestRecovery } from '#shared/api/access.api';

export function RecoverPasswordForm() {
	const [email, setEmail] = useState('');
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const mountedRef = useRef(false);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (pending) {
			return;
		}
		setPending(true);
		setError(null);
		try {
			await requestRecovery(email.trim());
			if (mountedRef.current) {
				setSent(true);
				setEmail('');
			}
		} catch (reason) {
			if (mountedRef.current) {
				setError(
					reason instanceof Error
						? reason.message
						: 'No pudimos procesar la solicitud. Volvé a intentarlo.',
				);
			}
		} finally {
			if (mountedRef.current) {
				setPending(false);
			}
		}
	};
	return (
		<Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: '100%', boxSizing: 'border-box' }}>
			<Stack spacing={2.5}>
				<Typography component="h1" variant="h5">
					Recuperar contraseña
				</Typography>
				<Typography color="text.secondary">
					Ingresá tu correo para recibir un enlace seguro. El enlace se puede usar una vez y vence a
					los 15 minutos.
				</Typography>
				{error && <Alert severity="error">{error}</Alert>}
				{sent ? (
					<Alert severity="success">
						Si existe una cuenta habilitada, recibirás un enlace para restablecer la contraseña.
						Revisá tu correo y la carpeta de correo no deseado.
					</Alert>
				) : (
					<Stack component="form" onSubmit={submit} spacing={2}>
						<TextField
							label="Correo electrónico"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							required
							disabled={pending}
						/>
						<Button variant="contained" type="submit" disabled={pending}>
							{pending ? 'Solicitando…' : 'Enviar enlace de recuperación'}
						</Button>
					</Stack>
				)}
				<Button component={Link} to="/login" disabled={pending}>
					Volver al inicio de sesión
				</Button>
			</Stack>
		</Paper>
	);
}

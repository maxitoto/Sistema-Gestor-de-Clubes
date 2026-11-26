import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import {
	Alert,
	Avatar,
	Button,
	CircularProgress,
	Divider,
	Paper,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { requestRecovery } from '#shared/api/access.api';

export function RecoverPasswordForm() {
	const [email, setEmail] = useState('');
	const [fieldError, setFieldError] = useState<string | null>(null);
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
		const clean = email.trim();
		if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
			setFieldError('Ingresá un correo electrónico válido.');
			return;
		}
		setFieldError(null);
		setPending(true);
		setError(null);
		try {
			await requestRecovery(clean);
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
			<Stack spacing={2.25}>
				<Stack spacing={1.25} sx={{ alignItems: 'center' }}>
					<Avatar
						variant="rounded"
						sx={{ width: 48, height: 48, bgcolor: 'primary.main', color: 'primary.contrastText' }}
					>
						<LockResetOutlinedIcon />
					</Avatar>
					<Typography component="h1" variant="h5" align="center">
						Recuperar contraseña
					</Typography>
					<Typography variant="body2" color="text.secondary" align="center">
						Ingresá tu correo para recibir un enlace de un solo uso (válido por 15 minutos).
					</Typography>
				</Stack>
				<Divider />
				{error && <Alert severity="error">{error}</Alert>}
				{sent ? (
					<Alert severity="success">
						Si existe una cuenta habilitada, recibirás un enlace para restablecer tu contraseña.
						Revisá tu bandeja de entrada y correo no deseado.
					</Alert>
				) : (
					<Stack component="form" noValidate onSubmit={submit} spacing={2}>
						<TextField
							label="Correo electrónico"
							type="email"
							autoComplete="email"
							value={email}
							error={Boolean(fieldError)}
							helperText={fieldError}
							onChange={(event) => {
								setEmail(event.target.value);
								if (fieldError) {
									setFieldError(null);
								}
							}}
							required
							disabled={pending}
						/>
						<Button
							variant="contained"
							size="large"
							type="submit"
							startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
							disabled={pending}
						>
							{pending ? 'Enviando…' : 'Enviar enlace de recuperación'}
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

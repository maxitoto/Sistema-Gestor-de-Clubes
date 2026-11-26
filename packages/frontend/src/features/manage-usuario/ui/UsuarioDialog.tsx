import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	MenuItem,
	Stack,
	TextField,
} from '@mui/material';
import { type FormEvent, useRef, useState } from 'react';
import {
	type DatosUsuario,
	type ResultadoUsuario,
	type Usuario,
	validarUsuario,
} from '#entities/usuario';
import { useGestionUsuario } from '../model/useGestionUsuario';

export function UsuarioDialog({
	usuario,
	onClose,
	onSaved,
}: {
	usuario: Usuario | null;
	onClose: () => void;
	onSaved: (r: ResultadoUsuario) => void;
}) {
	const [form, setForm] = useState<DatosUsuario>({
		nombre: usuario?.nombre ?? '',
		apellido: usuario?.apellido ?? '',
		email: usuario?.email ?? '',
		rol: usuario?.rol ?? 'responsable',
	});
	const [errors, setErrors] = useState<Partial<Record<keyof DatosUsuario, string>>>({});
	const operationRef = useRef<{ key: string; id: string } | null>(null);
	const management = useGestionUsuario(onSaved);

	const clearError = (field: keyof DatosUsuario) => {
		setErrors((prev) => {
			if (!prev[field]) {
				return prev;
			}
			const next = { ...prev };
			delete next[field];
			return next;
		});
	};

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const result = validarUsuario(form);
		setErrors(result.errores);
		if (Object.keys(result.errores).length) {
			return;
		}
		const key = JSON.stringify(result.datos);
		if (operationRef.current?.key !== key) {
			operationRef.current = { key, id: crypto.randomUUID() };
		}
		const operationId = operationRef.current.id;
		void management.run(
			usuario
				? { operacion: 'editar', operacionId: operationId, usuarioId: usuario.id, ...result.datos }
				: { operacion: 'crear', operacionId: operationId, ...result.datos },
		);
	};

	const locked = management.pending || management.needsCheck;

	return (
		<Dialog
			open
			aria-labelledby="usuario-dialog-title"
			onClose={() => {
				if (!management.pending) {
					onClose();
				}
			}}
			fullWidth
			maxWidth="sm"
		>
			<Box component="form" noValidate onSubmit={submit}>
				<DialogTitle id="usuario-dialog-title">
					{usuario ? 'Editar usuario' : 'Nuevo usuario'}
				</DialogTitle>
				<DialogContent dividers>
					<Stack spacing={2.25}>
						{management.feedback && (
							<Alert severity={management.needsCheck ? 'warning' : 'error'}>
								{management.feedback}
							</Alert>
						)}
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
							{(['nombre', 'apellido'] as const).map((field) => (
								<TextField
									key={field}
									fullWidth
									required
									label={field === 'nombre' ? 'Nombre' : 'Apellido'}
									value={form[field]}
									disabled={locked}
									error={Boolean(errors[field])}
									helperText={errors[field]}
									onChange={(e) => {
										setForm({ ...form, [field]: e.target.value });
										clearError(field);
									}}
									slotProps={{ htmlInput: { maxLength: 100 } }}
								/>
							))}
						</Stack>
						<TextField
							label="Correo electrónico"
							type="email"
							required
							value={form.email}
							disabled={locked}
							error={Boolean(errors.email)}
							helperText={errors.email ?? 'Se usa para iniciar sesión y recibir enlaces de acceso.'}
							onChange={(e) => {
								setForm({ ...form, email: e.target.value });
								clearError('email');
							}}
						/>
						<TextField
							label="Rol"
							select
							value={form.rol}
							disabled={locked}
							helperText={
								form.rol === 'admin'
									? 'Acceso total: panel financiero, deportes, usuarios, configuración ARCA y regularización fiscal.'
									: 'Acceso operativo: socios, cobranza, gastos y comunicaciones.'
							}
							onChange={(e) => setForm({ ...form, rol: e.target.value as DatosUsuario['rol'] })}
						>
							<MenuItem value="responsable">Responsable</MenuItem>
							<MenuItem value="admin">Administrador</MenuItem>
						</TextField>
						{!usuario && (
							<Alert severity="info">
								La persona recibirá por correo un enlace único para elegir su contraseña. El enlace
								vence a los 15 minutos.
							</Alert>
						)}
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose} disabled={management.pending}>
						Cancelar
					</Button>
					{management.needsCheck ? (
						<>
							<Button disabled={management.pending} onClick={() => void management.check()}>
								Consultar resultado
							</Button>
							{management.canResume && (
								<Button
									variant="contained"
									disabled={management.pending}
									onClick={management.resume}
								>
									Completar acción pendiente
								</Button>
							)}
						</>
					) : (
						<Button
							type="submit"
							variant="contained"
							startIcon={
								management.pending ? <CircularProgress size={16} color="inherit" /> : undefined
							}
							disabled={management.pending || !management.enabled}
						>
							{management.pending
								? 'Guardando…'
								: usuario
									? 'Guardar cambios'
									: 'Crear y enviar enlace'}
						</Button>
					)}
				</DialogActions>
			</Box>
		</Dialog>
	);
}

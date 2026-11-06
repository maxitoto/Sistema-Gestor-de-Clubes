import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	MenuItem,
	Stack,
	TextField,
} from '@mui/material';
import { useRef, useState } from 'react';
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
	const save = () => {
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
	return (
		<Dialog
			open
			onClose={() => {
				if (!management.pending) {
					onClose();
				}
			}}
			fullWidth
			maxWidth="sm"
		>
			<DialogTitle>{usuario ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
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
								disabled={management.pending || management.needsCheck}
								error={Boolean(errors[field])}
								helperText={errors[field]}
								onChange={(e) => setForm({ ...form, [field]: e.target.value })}
								slotProps={{ htmlInput: { maxLength: 100 } }}
							/>
						))}
					</Stack>
					<TextField
						label="Correo electrónico"
						type="email"
						required
						value={form.email}
						disabled={management.pending || management.needsCheck}
						error={Boolean(errors.email)}
						helperText={errors.email ?? 'Este correo se utiliza para ingresar.'}
						onChange={(e) => setForm({ ...form, email: e.target.value })}
					/>
					<TextField
						label="Rol"
						select
						value={form.rol}
						disabled={management.pending || management.needsCheck}
						onChange={(e) => setForm({ ...form, rol: e.target.value as DatosUsuario['rol'] })}
					>
						<MenuItem value="responsable">Responsable</MenuItem>
						<MenuItem value="admin">Administrador</MenuItem>
					</TextField>
					{!usuario && (
						<Alert severity="info">
							La persona recibirá un enlace para establecer su contraseña. El enlace vence a los 15
							minutos.
						</Alert>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={management.pending}>
					Cerrar
				</Button>
				{management.needsCheck ? (
					<>
						<Button disabled={management.pending} onClick={() => void management.check()}>
							Consultar resultado
						</Button>
						{management.canResume && (
							<Button variant="contained" disabled={management.pending} onClick={management.resume}>
								Completar acción pendiente
							</Button>
						)}
					</>
				) : (
					<Button
						variant="contained"
						disabled={management.pending || !management.enabled}
						onClick={save}
					>
						{management.pending
							? 'Guardando…'
							: usuario
								? 'Guardar cambios'
								: 'Crear y enviar enlace'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}

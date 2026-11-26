import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Paper,
	Stack,
	Typography,
} from '@mui/material';
import { useState } from 'react';
import type { AccionUsuario, ResultadoUsuario, Usuario } from '#entities/usuario';
import { useGestionUsuario } from '../model/useGestionUsuario';

const labels: Record<AccionUsuario, string> = {
	desactivar: 'Desactivar cuenta',
	reactivar: 'Reactivar cuenta',
	restablecer: 'Restablecer contraseña',
	reenviar: 'Reenviar enlace de acceso',
};

export function UsuarioActionDialog({
	usuario,
	accion,
	onClose,
	onSaved,
}: {
	usuario: Usuario;
	accion: AccionUsuario;
	onClose: () => void;
	onSaved: (r: ResultadoUsuario) => void;
}) {
	const management = useGestionUsuario(onSaved);
	const [operationId] = useState(() => crypto.randomUUID());

	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			aria-labelledby="usuario-action-title"
			onClose={() => {
				if (!management.pending) {
					onClose();
				}
			}}
		>
			<DialogTitle id="usuario-action-title">{labels[accion]}</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					{management.feedback && <Alert severity="warning">{management.feedback}</Alert>}
					<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
						<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
							{usuario.apellido}, {usuario.nombre}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{usuario.email}
						</Typography>
					</Paper>
					<Alert severity={accion === 'desactivar' ? 'warning' : 'info'}>
						{accion === 'desactivar'
							? 'La cuenta dejará de poder ingresar. Se conserva todo su historial y se solicitará el cierre de sus sesiones activas.'
							: accion === 'reactivar'
								? 'La cuenta volverá a estar habilitada. Deberá iniciar sesión nuevamente.'
								: accion === 'restablecer'
									? 'Se cerrarán sus sesiones activas y se enviará un enlace único (válido 15 minutos) para elegir una nueva contraseña.'
									: 'Se enviará un nuevo enlace para establecer la contraseña, reemplazando al anterior. No se creará otra cuenta.'}
					</Alert>
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
							<Button variant="contained" disabled={management.pending} onClick={management.resume}>
								Completar acción pendiente
							</Button>
						)}
					</>
				) : (
					<Button
						variant="contained"
						color={accion === 'desactivar' ? 'error' : 'primary'}
						startIcon={
							management.pending ? <CircularProgress size={16} color="inherit" /> : undefined
						}
						disabled={management.pending || !management.enabled}
						onClick={() =>
							void management.run({
								operacion: accion,
								operacionId: operationId,
								usuarioId: usuario.id,
							})
						}
					>
						{management.pending ? 'Procesando…' : labels[accion]}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}

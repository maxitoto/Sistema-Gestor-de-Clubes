import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Stack,
} from '@mui/material';
import { useState } from 'react';
import type { AccionUsuario, ResultadoUsuario, Usuario } from '#entities/usuario';
import { useGestionUsuario } from '../model/useGestionUsuario';

const labels: Record<AccionUsuario, string> = {
	desactivar: 'Desactivar cuenta',
	reactivar: 'Reactivar cuenta',
	restablecer: 'Restablecer contraseña',
	reenviar: 'Reenviar enlace',
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
			onClose={() => {
				if (!management.pending) {
					onClose();
				}
			}}
		>
			<DialogTitle>{labels[accion]}</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					{management.feedback && <Alert severity="warning">{management.feedback}</Alert>}
					<DialogContentText>
						{usuario.nombre} {usuario.apellido} · {usuario.email}
					</DialogContentText>
					<Alert severity={accion === 'desactivar' ? 'warning' : 'info'}>
						{accion === 'desactivar'
							? 'La cuenta dejará de operar. Se conserva su historial y se solicitará el cierre de sus sesiones.'
							: accion === 'reactivar'
								? 'La cuenta volverá a estar activa. Sus sesiones anteriores no se restauran.'
								: accion === 'restablecer'
									? 'Se solicitará el cierre de las sesiones y se enviará un enlace de un uso para establecer una nueva contraseña.'
									: 'Se enviará otro enlace para establecer la contraseña. No se creará una nueva cuenta.'}
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

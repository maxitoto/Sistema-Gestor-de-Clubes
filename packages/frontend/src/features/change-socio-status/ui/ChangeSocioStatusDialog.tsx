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
import { useId } from 'react';
import { useAuth } from '#entities/session';
import { cambiarEstadoSocio, getSocio, type SocioDetalle } from '#entities/socio';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';

export function ChangeSocioStatusDialog({
	socio,
	open,
	deudaPendiente,
	onClose,
	onSaved,
}: {
	socio: SocioDetalle;
	open: boolean;
	deudaPendiente: number | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { cacheScope, profileStatus, isSigningOut } = useAuth();
	const titleId = useId();
	const target = socio.estado === 'activo' ? 'inactivo' : 'activo';
	const baja = target === 'inactivo';
	const mutation = useVerifiedMutation({
		cacheScope,
		enabled: profileStatus === 'ready' && !isSigningOut,
		queryRoots: ['socios', 'socio', 'socio-deuda', 'inscripciones', 'cuotas'],
		write: (estado: 'activo' | 'inactivo', signal) => cambiarEstadoSocio(socio.id, estado, signal),
		read: (signal) => getSocio(socio.id, signal),
		matches: (row, estado) => row.estado === estado,
		onConfirmed: () => {
			onClose();
			onSaved();
		},
		describeError: () =>
			'No se pudo cambiar el estado. Consultá la ficha actual y verificá tu sesión.',
	});
	return (
		<Dialog
			open={open}
			aria-labelledby={titleId}
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
			maxWidth="sm"
		>
			<DialogTitle id={titleId}>{baja ? 'Dar de baja al socio' : 'Reactivar al socio'}</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					<DialogContentText>
						{socio.apellido}, {socio.nombre} · Socio n.º {socio.numero_socio}
					</DialogContentText>
					<Alert severity={baja ? 'warning' : 'info'}>
						{baja
							? 'Se inactivará el socio y se cerrarán sus inscripciones activas. Las cuotas y el historial se conservan.'
							: 'El socio volverá a estar activo. Las inscripciones anteriores seguirán cerradas: si retoma una actividad, deberá inscribirse nuevamente.'}
					</Alert>
					{deudaPendiente !== null && deudaPendiente > 0 && (
						<Alert severity="warning">
							Tiene deuda pendiente de{' '}
							{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
								deudaPendiente,
							)}
							. Se conservará después de esta operación.
						</Alert>
					)}
					{deudaPendiente === null && (
						<Alert severity="info">
							No se pudo consultar el saldo. Esta operación conserva las cuotas y la deuda
							existente.
						</Alert>
					)}
					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}
				</Stack>
			</DialogContent>
			<DialogActions sx={{ flexWrap: 'wrap' }}>
				<Button variant="outlined" onClick={onClose} disabled={mutation.isPending}>
					Cancelar
				</Button>
				{mutation.requiresCheck && (
					<Button onClick={() => void mutation.reconcile()} disabled={mutation.isPending}>
						Consultar resultado
					</Button>
				)}
				<Button
					variant="contained"
					color={baja ? 'error' : 'primary'}
					disabled={!mutation.enabled || mutation.isPending || mutation.requiresCheck}
					onClick={() => void mutation.run(target)}
				>
					{mutation.isPending ? 'Verificando…' : baja ? 'Confirmar baja' : 'Confirmar reactivación'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

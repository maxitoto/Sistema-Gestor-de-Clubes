import {
	Alert,
	Box,
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
import { useId } from 'react';
import { useAuth } from '#entities/session';
import { cambiarEstadoSocio, getSocio, type SocioDetalle } from '#entities/socio';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';

const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

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
					<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
						<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
							{socio.apellido}, {socio.nombre}
						</Typography>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ fontVariantNumeric: 'tabular-nums' }}
						>
							Socio #{socio.numero_socio} · DNI {socio.dni}
						</Typography>
					</Paper>

					<Alert severity={baja ? 'warning' : 'info'}>
						<Box component="ul" sx={{ m: 0, pl: 2.25, '& li': { mb: 0.5 } }}>
							<li>
								{baja
									? 'El socio pasará a estado inactivo y se cerrarán sus inscripciones activas.'
									: 'El socio volverá a estar activo. Sus inscripciones anteriores seguirán cerradas hasta que lo inscribas nuevamente.'}
							</li>
							{deudaPendiente !== null && deudaPendiente > 0 ? (
								<li>
									<strong>Registra una deuda pendiente de {currency.format(deudaPendiente)}</strong>
									, que se conservará luego de esta operación.
								</li>
							) : deudaPendiente === null ? (
								<li>
									No pudimos consultar el saldo actual; las cuotas y deudas existentes se conservan.
								</li>
							) : (
								<li>Las cuotas y el historial previo se conservan intactos.</li>
							)}
						</Box>
					</Alert>

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
					startIcon={
						mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
					}
					disabled={!mutation.enabled || mutation.isPending || mutation.requiresCheck}
					onClick={() => void mutation.run(target)}
				>
					{mutation.isPending ? 'Confirmando…' : baja ? 'Confirmar baja' : 'Confirmar reactivación'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

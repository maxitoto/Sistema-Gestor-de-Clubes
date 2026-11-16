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
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { getCuotasCobranza } from '#entities/cuota';
import { bajaInscripcion, getInscripcion, type InscripcionHistorial } from '#entities/inscripcion';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';
import { describirDeudaDesvinculacion } from '../model/deudaDesvinculacion';

export function DesvincularSocioDialog({
	inscripcion,
	open,
	onClose,
	onSaved,
}: {
	inscripcion: InscripcionHistorial;
	open: boolean;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { cacheScope, perfil, profileStatus, isSigningOut } = useAuth();
	const titleId = useId();
	const actorId = perfil?.id ?? '';
	const deudaQuery = useQuery({
		queryKey: [
			'socio-deuda',
			'desvincular',
			cacheScope,
			inscripcion.socio_id,
			inscripcion.categoria_id,
		],
		enabled:
			open &&
			profileStatus === 'ready' &&
			perfil?.estado === 'activo' &&
			!isSigningOut &&
			Boolean(actorId),
		queryFn: ({ signal }) =>
			getCuotasCobranza(
				{
					socio_id: inscripcion.socio_id,
					categoria_id: inscripcion.categoria_id,
					estado_cuota: 'pendiente',
					pagina: 0,
					limite: 20,
				},
				actorId,
				signal,
			),
	});
	const avisoDeuda = describirDeudaDesvinculacion(deudaQuery);
	const mutation = useVerifiedMutation({
		cacheScope,
		enabled: profileStatus === 'ready' && !isSigningOut,
		queryRoots: ['socio', 'socio-deuda', 'inscripciones', 'cuotas', 'socios', 'categorias'],
		write: (_payload: 'inactiva', signal) => bajaInscripcion(inscripcion.id, signal),
		read: (signal) => getInscripcion(inscripcion.id, signal),
		matches: (row) => row.estado === 'inactiva' && Boolean(row.fecha_baja),
		onConfirmed: () => {
			onClose();
			onSaved();
		},
		describeError: () =>
			'No se pudo cerrar la inscripción. Consultá su estado actual antes de continuar.',
	});
	return (
		<Dialog
			open={open}
			maxWidth="sm"
			aria-labelledby={titleId}
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle id={titleId}>Desvincular de la actividad</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					<DialogContentText>
						{inscripcion.categoria?.deporte?.nombre} · {inscripcion.categoria?.nombre}
					</DialogContentText>
					{avisoDeuda.estado === 'cargando' && (
						<Alert severity="info">Consultando cuotas pendientes de esta actividad…</Alert>
					)}
					{avisoDeuda.estado === 'con_deuda' && (
						<Alert severity="warning">{avisoDeuda.mensaje}</Alert>
					)}
					{avisoDeuda.estado === 'error' && <Alert severity="info">{avisoDeuda.mensaje}</Alert>}
					<Alert severity="warning">
						La inscripción quedará en el historial. Las cuotas emitidas se conservan y no se
						compensan; dejará de generar cuotas futuras mientras no exista una inscripción activa.
					</Alert>
					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}
				</Stack>
			</DialogContent>
			<DialogActions sx={{ flexWrap: 'wrap' }}>
				<Button variant="outlined" disabled={mutation.isPending} onClick={onClose}>
					Cancelar
				</Button>
				{mutation.requiresCheck && (
					<Button disabled={mutation.isPending} onClick={() => void mutation.reconcile()}>
						Consultar resultado
					</Button>
				)}
				<Button
					variant="contained"
					color="error"
					disabled={!mutation.enabled || mutation.isPending || mutation.requiresCheck}
					onClick={() => void mutation.run('inactiva')}
				>
					{mutation.isPending ? 'Verificando…' : 'Confirmar desvinculación'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

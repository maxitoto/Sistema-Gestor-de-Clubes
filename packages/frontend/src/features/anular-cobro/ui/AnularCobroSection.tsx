import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
	anularPago,
	type EstadoAnulacionPago,
	getEstadoAnulacionPago,
	motivoBloqueoAnulacionPago,
	validarMotivoAnulacionPago,
} from '#entities/pago';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';
import { fechaCobranza } from '#shared/types/cobranza';
export function AnularCobroSection({
	pagoId,
	onUpdated,
}: {
	pagoId: string;
	onUpdated: () => void;
}) {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth();
	const actorId = perfil?.id ?? '';
	const [open, setOpen] = useState(false),
		[confirmed, setConfirmed] = useState<EstadoAnulacionPago | null>(null);
	const query = useQuery({
		queryKey: ['anulacion-cobro', cacheScope, pagoId],
		queryFn: ({ signal }) => getEstadoAnulacionPago(pagoId, actorId, signal),
		enabled: profileStatus === 'ready' && !isSigningOut,
		retry: 1,
	});
	const row = confirmed ?? query.data,
		bloqueo = row ? motivoBloqueoAnulacionPago(row, perfil?.rol ?? '') : null;
	return (
		<Stack spacing={2}>
			<Divider />
			<Typography component="h3" variant="h6">
				Anulación del cobro
			</Typography>
			{query.isError ? (
				<Alert
					severity="warning"
					action={<Button onClick={() => void query.refetch()}>Consultar</Button>}
				>
					No pudimos verificar si este cobro admite anulación.
				</Alert>
			) : query.isPending ? (
				<Typography>Consultando permiso de anulación…</Typography>
			) : row?.estado === 'anulado' ? (
				<Alert severity="info">
					Anulación financiera confirmada el {fechaCobranza(row.anuladoEn)}. Motivo: {row.motivo}.
					La resolución fiscal conserva cualquier recobro posterior de la cuota.
				</Alert>
			) : row ? (
				<>
					<Typography variant="body2" color="text.secondary">
						Se usa para una devolución o para corregir un cobro erróneo. La regularización fiscal de
						un cobro válido se realiza desde Monitoreo fiscal.
					</Typography>
					{bloqueo ? (
						<Typography variant="body2" color="text.secondary">
							{bloqueo}
						</Typography>
					) : (
						<Button color="error" variant="outlined" onClick={() => setOpen(true)}>
							Anular cobro
						</Button>
					)}
				</>
			) : null}
			{open && row && (
				<AnularCobroDialog
					key={`${cacheScope}:${pagoId}`}
					pagoId={pagoId}
					onClose={() => setOpen(false)}
					onConfirmed={(result) => {
						setConfirmed(result);
						setOpen(false);
						onUpdated();
						void query.refetch();
					}}
				/>
			)}
		</Stack>
	);
}
function AnularCobroDialog({
	pagoId,
	onClose,
	onConfirmed,
}: {
	pagoId: string;
	onClose: () => void;
	onConfirmed: (row: EstadoAnulacionPago) => void;
}) {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth(),
		actorId = perfil?.id ?? '';
	const [motivo, setMotivo] = useState(''),
		[error, setError] = useState<string | null>(null);
	const mutation = useVerifiedMutation<{ motivo: string }, EstadoAnulacionPago>({
		cacheScope,
		enabled: profileStatus === 'ready' && !isSigningOut,
		queryRoots: [
			'pagos',
			'cuotas',
			'caja',
			'movimientos-caja',
			'anulacion-cobro',
			'comprobante-fiscal',
			'monitoreo-fiscal',
		],
		write: (input, signal) => anularPago(pagoId, input.motivo, actorId, signal),
		read: (signal) => getEstadoAnulacionPago(pagoId, actorId, signal),
		matches: (row) => row.estado === 'anulado',
		onConfirmed,
	});
	const confirm = () => {
		try {
			const clean = validarMotivoAnulacionPago(motivo);
			setError(null);
			void mutation.run({ motivo: clean });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Completá el motivo.');
		}
	};
	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle>Anular cobro</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Alert severity="warning">
						Al confirmar, el pago quedará anulado, la cuota volverá a pendiente y se conservará un
						único movimiento de reverso. Realizá la devolución o corrección de dinero que
						corresponda; esta pantalla no efectúa una transferencia bancaria.
					</Alert>
					<Typography>
						La resolución fiscal se procesa por separado. Puede quedar pendiente una Nota de Crédito
						o una conciliación; ese resultado no repetirá la anulación financiera.
					</Typography>
					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}
					<TextField
						label="Motivo de anulación"
						required
						multiline
						minRows={3}
						value={motivo}
						disabled={mutation.isPending || mutation.requiresCheck}
						error={!!error}
						helperText={error ?? 'Indicá la devolución o corrección de cobro erróneo.'}
						slotProps={{ htmlInput: { maxLength: 2000 } }}
						onChange={(e) => setMotivo(e.target.value)}
					/>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={mutation.isPending} onClick={onClose}>
					Cancelar
				</Button>
				{mutation.requiresCheck ? (
					<Button onClick={() => void mutation.reconcile()} disabled={mutation.isPending}>
						Consultar resultado
					</Button>
				) : (
					<Button
						variant="contained"
						color="error"
						disabled={mutation.isPending || !mutation.enabled}
						onClick={confirm}
					>
						Confirmar anulación
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}

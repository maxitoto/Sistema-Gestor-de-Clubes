import {
	Alert,
	Box,
	Button,
	CircularProgress,
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
		<Stack spacing={1.5}>
			<Divider />
			{query.isError ? (
				<Alert
					severity="warning"
					action={
						<Button size="small" color="inherit" onClick={() => void query.refetch()}>
							Reintentar
						</Button>
					}
				>
					No pudimos verificar si este cobro admite anulación.
				</Alert>
			) : query.isPending ? (
				<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
					<CircularProgress size={16} />
					<Typography variant="caption" color="text.secondary">
						Verificando disponibilidad de anulación…
					</Typography>
				</Stack>
			) : row?.estado === 'anulado' ? (
				<Alert severity="info">
					Cobro anulado el {fechaCobranza(row.anuladoEn)}. Motivo: {row.motivo}. Si la cuota volvió
					a cobrarse después, ese nuevo cobro se conserva sin cambios.
				</Alert>
			) : row ? (
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					spacing={1.5}
					sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
				>
					<Box sx={{ minWidth: 0 }}>
						<Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700 }}>
							Anulación del cobro
						</Typography>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ display: 'block', mt: 0.25 }}
						>
							{bloqueo
								? bloqueo
								: 'Usala únicamente ante una devolución o un cobro cargado por error. Si el problema es solo fiscal, regularizalo desde Monitoreo fiscal.'}
						</Typography>
					</Box>
					{!bloqueo && (
						<Button
							color="error"
							variant="outlined"
							size="small"
							onClick={() => setOpen(true)}
							sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0 }}
						>
							Anular cobro
						</Button>
					)}
				</Stack>
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
			setError(e instanceof Error ? e.message : 'Completá el motivo de la anulación.');
		}
	};

	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			aria-labelledby="anular-cobro-title"
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle id="anular-cobro-title">Anular cobro</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					<Alert severity="warning">
						<Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
							Antes de confirmar, tené en cuenta:
						</Typography>
						<Box component="ul" sx={{ m: 0, pl: 2.25, '& li': { mb: 0.5 } }}>
							<li>El pago quedará anulado en caja y la cuota volverá a figurar como pendiente.</li>
							<li>
								Cuando corresponda, se gestionará la Nota de Crédito C en ARCA sin eliminar el
								comprobante original.
							</li>
							<li>
								Esta operación no realiza transferencias bancarias automáticas: hacé la devolución
								del dinero por fuera del sistema.
							</li>
						</Box>
					</Alert>

					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}

					<TextField
						label="Motivo de la anulación"
						placeholder="Ej. Devolución solicitada por el socio o cobro cargado por error"
						required
						multiline
						minRows={3}
						value={motivo}
						disabled={mutation.isPending || mutation.requiresCheck}
						error={!!error}
						helperText={error ?? 'Queda registrado en el historial de caja y auditoría.'}
						slotProps={{ htmlInput: { maxLength: 2000 } }}
						onChange={(e) => {
							setMotivo(e.target.value);
							if (error) {
								setError(null);
							}
						}}
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
						startIcon={
							mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
						}
						disabled={mutation.isPending || !mutation.enabled}
						onClick={confirm}
					>
						{mutation.isPending ? 'Anulando…' : 'Confirmar anulación'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}

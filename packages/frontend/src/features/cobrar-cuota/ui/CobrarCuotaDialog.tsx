import {
	Alert,
	Button,
	Checkbox,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	MenuItem,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getCuotaCobranza } from '#entities/cuota';
import { useAuth } from '#entities/session';
import { monedaCobranza, periodoCobranza } from '#shared/types/cobranza';
import { validarSolicitudCobro } from '../model/cobroContract';
import { type CobroConfirmado, useCobrarCuota } from '../model/useCobrarCuota';
export function CobrarCuotaDialog({
	cuotaId,
	onClose,
	onConfirmed,
}: {
	cuotaId: string;
	onClose: () => void;
	onConfirmed: (result: CobroConfirmado) => void;
}) {
	const { perfil, cacheScope, profileStatus } = useAuth();
	const actorId = perfil?.id ?? '';
	const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo');
	const [referencia, setReferencia] = useState('');
	const [verificada, setVerificada] = useState(false);
	const [validation, setValidation] = useState<string | null>(null);
	const query = useQuery({
		queryKey: ['cuotas', cacheScope, 'detalle', cuotaId],
		queryFn: ({ signal }) => getCuotaCobranza(cuotaId, actorId, signal),
		enabled: profileStatus === 'ready',
		retry: 1,
	});
	const cobro = useCobrarCuota(cuotaId, onConfirmed);
	const locked = cobro.pending || cobro.requiresCheck;
	const cuota = query.data;
	const save = () => {
		try {
			const payload = validarSolicitudCobro(cuotaId, metodo, referencia, verificada);
			setValidation(null);
			void cobro.run(payload);
		} catch (error) {
			setValidation(error instanceof Error ? error.message : 'Revisá los datos del cobro.');
		}
	};
	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			onClose={() => {
				if (!cobro.pending) {
					onClose();
				}
			}}
		>
			<DialogTitle>Registrar cobro</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					{query.isPending ? (
						<Typography>Cargando cuota…</Typography>
					) : query.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar la cuota.
						</Alert>
					) : !cuota ? (
						<Alert severity="warning">No encontramos la cuota.</Alert>
					) : (
						<>
							<Typography sx={{ fontWeight: 700 }}>
								{cuota.socio_apellido}, {cuota.socio_nombre}
							</Typography>
							<Typography color="text.secondary">
								Socio {cuota.socio_numero} · DNI {cuota.socio_dni}
							</Typography>
							<Typography>
								{cuota.deporte_nombre} · {cuota.categoria_nombre} · {periodoCobranza(cuota)}
							</Typography>
							<Typography variant="h5">{monedaCobranza(cuota.monto)}</Typography>
							<Alert severity="info">
								Se cobra el importe completo de esta cuota. La autorización fiscal queda pendiente;
								este paso registra el dinero recibido.
							</Alert>
							{cuota.socio_estado === 'inactivo' && (
								<Alert severity="warning">
									El socio está inactivo. Sus cuotas pendientes se conservan y pueden cobrarse.
								</Alert>
							)}
							{cuota.estado_cuota !== 'pendiente' && (
								<Alert severity="warning">
									Esta cuota ya figura pagada. Consultá el cobro confirmado antes de continuar.
								</Alert>
							)}
							<TextField
								select
								label="Medio de pago"
								value={metodo}
								disabled={locked}
								onChange={(e) => {
									setMetodo(e.target.value as typeof metodo);
									setVerificada(false);
								}}
							>
								<MenuItem value="efectivo">Efectivo</MenuItem>
								<MenuItem value="transferencia">Transferencia bancaria</MenuItem>
							</TextField>
							{metodo === 'transferencia' && (
								<>
									<TextField
										label="Referencia de transferencia (opcional)"
										value={referencia}
										disabled={locked}
										slotProps={{ htmlInput: { maxLength: 255 } }}
										onChange={(e) => setReferencia(e.target.value)}
									/>
									<FormControlLabel
										control={
											<Checkbox
												checked={verificada}
												disabled={locked}
												onChange={(e) => setVerificada(e.target.checked)}
											/>
										}
										label="Verifiqué la acreditación de esta transferencia"
									/>
								</>
							)}
						</>
					)}
					{(validation || cobro.feedback) && (
						<Alert severity={cobro.requiresCheck ? 'warning' : 'error'}>
							{validation ?? cobro.feedback}
						</Alert>
					)}
				</Stack>
			</DialogContent>
			<DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
				<Button onClick={onClose} disabled={cobro.pending}>
					Cerrar
				</Button>
				{cobro.requiresCheck ? (
					<>
						<Button onClick={() => void cobro.reconcile()} disabled={cobro.pending}>
							Consultar resultado
						</Button>
						{cobro.canRetry && (
							<Button variant="contained" onClick={cobro.retry} disabled={cobro.pending}>
								Confirmar reintento
							</Button>
						)}
					</>
				) : (
					<Button
						variant="contained"
						disabled={
							cobro.pending ||
							!cuota ||
							!cobro.enabled ||
							cuota.monto <= 0 ||
							cuota.estado_cuota !== 'pendiente'
						}
						onClick={save}
					>
						{cobro.pending ? 'Registrando…' : 'Confirmar cobro'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}

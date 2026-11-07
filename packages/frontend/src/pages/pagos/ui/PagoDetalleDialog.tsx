import {
	Alert,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getPagoCobranza } from '#entities/pago';
import { useAuth } from '#entities/session';
import {
	estadoFiscalCobranza,
	esUuidCobranza,
	fechaCobranza,
	monedaCobranza,
	periodoCobranza,
} from '#shared/types/cobranza';

export function PagoDetalleDialog({ pagoId, onClose }: { pagoId: string; onClose: () => void }) {
	const { perfil, cacheScope, profileStatus } = useAuth();
	const actorId = perfil?.id ?? '';
	const query = useQuery({
		queryKey: ['pagos', cacheScope, 'detalle', pagoId],
		queryFn: ({ signal }) => getPagoCobranza(pagoId, actorId, signal),
		enabled: profileStatus === 'ready' && esUuidCobranza(pagoId),
		retry: 1,
	});
	const pago = query.data;
	return (
		<Dialog open fullWidth maxWidth="sm" onClose={onClose}>
			<DialogTitle>Detalle del cobro</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					{!esUuidCobranza(pagoId) ? (
						<Alert severity="warning">
							El cobro solicitado no tiene una identificación válida.
						</Alert>
					) : query.isPending ? (
						<Typography>Cargando cobro…</Typography>
					) : query.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar el cobro.
						</Alert>
					) : !pago ? (
						<Alert severity="info">No encontramos el cobro solicitado.</Alert>
					) : (
						<>
							<Typography variant="h6">
								{pago.socio_apellido}, {pago.socio_nombre}
							</Typography>
							<Typography color="text.secondary">
								Socio {pago.socio_numero} · DNI {pago.socio_dni}
								{pago.socio_estado === 'inactivo' ? ' · Inactivo' : ''}
							</Typography>
							<Typography>
								{pago.deporte_nombre} · {pago.categoria_nombre} · {periodoCobranza(pago)}
							</Typography>
							<Typography variant="h4">{monedaCobranza(pago.monto)}</Typography>
							<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
								<Chip
									label={pago.estado_pago === 'anulado' ? 'Cobro anulado' : 'Cobro confirmado'}
									color={pago.estado_pago === 'anulado' ? 'default' : 'success'}
								/>
								<Chip variant="outlined" label={estadoFiscalCobranza(pago)} />
							</Stack>
							<Typography>Fecha del cobro: {fechaCobranza(pago.fecha_pago)}</Typography>
							<Typography>
								Medio: {pago.medio === 'transferencia' ? 'Transferencia bancaria' : 'Efectivo'}
							</Typography>
							<Typography>Referencia: {pago.referencia || 'Sin referencia informada'}</Typography>
							<Typography>
								Comprobante: {pago.numero_comprobante || 'Sin numeración autorizada'}
							</Typography>
							<Typography>
								Cuota: {pago.estado_cuota === 'pagada' ? 'Pagada' : 'Pendiente'}
							</Typography>
							<Typography>
								Deuda pendiente total del socio: {monedaCobranza(pago.deuda_pendiente)}
							</Typography>
							<Alert severity="info">
								El estado fiscal del documento se consulta por separado. Un documento pendiente o
								fallido no vuelve a cobrar una cuota pagada.
							</Alert>
							<Button component={Link} to={`/socios/${pago.socio_id}`} onClick={onClose}>
								Ver ficha del socio
							</Button>
						</>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cerrar</Button>
			</DialogActions>
		</Dialog>
	);
}

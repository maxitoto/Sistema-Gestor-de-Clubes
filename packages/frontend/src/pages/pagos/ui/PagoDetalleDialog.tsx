import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	Paper,
	Stack,
	Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPagoCobranza } from '#entities/pago';
import { useAuth } from '#entities/session';
import { AnularCobroSection } from '#features/anular-cobro';
import { FiscalComprobantePanel } from '#features/comprobante-fiscal';
import {
	esUuidCobranza,
	type FilaCobranza,
	fechaCobranza,
	monedaCobranza,
	periodoCobranza,
} from '#shared/types/cobranza';
import { InfoTooltip } from '#shared/ui';
import {
	actualizarLecturasCobroFiscal,
	observarEstadoFiscalDelCobro,
} from '../model/sincronizacionFiscalPago';

function chipFiscalDetalle(estado: FilaCobranza['estado_fiscal']): {
	label: string;
	color: 'success' | 'warning' | 'error' | 'default';
} {
	if (estado === 'valido') {
		return { label: 'ARCA autorizado', color: 'success' };
	}
	if (estado === 'fallido') {
		return { label: 'Error ARCA', color: 'error' };
	}
	if (estado === 'anulacion_pendiente') {
		return { label: 'Anulación pendiente', color: 'warning' };
	}
	if (estado === 'pendiente_cae') {
		return { label: 'Pendiente ARCA', color: 'warning' };
	}
	if (estado === 'anulado') {
		return { label: 'Documento anulado', color: 'default' };
	}
	return { label: 'Sin comprobante', color: 'default' };
}

function DetailField({
	label,
	value,
	tabular = false,
	highlight = false,
	span = 1,
}: {
	label: string;
	value: string;
	tabular?: boolean;
	highlight?: boolean;
	span?: 1 | 2;
}) {
	return (
		<Box sx={{ gridColumn: span === 2 ? '1 / -1' : undefined, minWidth: 0 }}>
			<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
				{label}
			</Typography>
			<Typography
				variant="body2"
				color={highlight ? 'warning.main' : 'text.primary'}
				sx={{
					fontWeight: 600,
					fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
					wordBreak: 'break-word',
				}}
			>
				{value}
			</Typography>
		</Box>
	);
}

export function PagoDetalleDialog({
	pagoId,
	onClose,
	onUpdated,
	autoEmitir = false,
}: {
	pagoId: string;
	onClose: () => void;
	onUpdated?: () => void;
	autoEmitir?: boolean;
}) {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth();
	const actorId = perfil?.id ?? '';
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: ['pagos', cacheScope, 'detalle', pagoId],
		queryFn: ({ signal }) => getPagoCobranza(pagoId, actorId, signal),
		enabled: profileStatus === 'ready' && esUuidCobranza(pagoId),
		retry: 1,
	});
	const pago = query.data;

	useEffect(() => {
		if (profileStatus !== 'ready' || isSigningOut || !pago?.comprobante_id) {
			return;
		}
		return observarEstadoFiscalDelCobro(queryClient, cacheScope, pagoId, pago.comprobante_id);
	}, [queryClient, cacheScope, pagoId, pago?.comprobante_id, profileStatus, isSigningOut]);

	const fiscalChip = pago ? chipFiscalDetalle(pago.estado_fiscal) : null;

	return (
		<Dialog open fullWidth maxWidth="md" aria-labelledby="pago-detalle-title" onClose={onClose}>
			<DialogTitle id="pago-detalle-title">
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					spacing={1.25}
					sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
				>
					<Stack
						direction="row"
						spacing={1}
						useFlexGap
						sx={{ alignItems: 'center', flexWrap: 'wrap' }}
					>
						<span>Detalle del cobro</span>
						{pago && (
							<>
								<Chip
									size="small"
									label={pago.estado_pago === 'anulado' ? 'Cobro anulado' : 'Cobro confirmado'}
									color={pago.estado_pago === 'anulado' ? 'default' : 'success'}
								/>
								{fiscalChip && (
									<Chip size="small" color={fiscalChip.color} label={fiscalChip.label} />
								)}
							</>
						)}
					</Stack>
					{pago && (
						<Button
							component={Link}
							to={`/socios/${pago.socio_id}`}
							size="small"
							endIcon={<OpenInNewOutlinedIcon fontSize="small" />}
							onClick={onClose}
							sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0 }}
						>
							Ver ficha
						</Button>
					)}
				</Stack>
			</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2.5}>
					{!esUuidCobranza(pagoId) ? (
						<Alert severity="warning">
							El cobro solicitado no tiene una identificación válida.
						</Alert>
					) : query.isPending ? (
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ py: 4, justifyContent: 'center', alignItems: 'center' }}
						>
							<CircularProgress size={20} />
							<Typography variant="body2" color="text.secondary">
								Cargando detalle del cobro…
							</Typography>
						</Stack>
					) : query.isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void query.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos consultar el cobro.
						</Alert>
					) : !pago ? (
						<Alert severity="info">No encontramos el cobro solicitado.</Alert>
					) : (
						<>
							<Box
								sx={{
									display: 'grid',
									gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
									gap: 2.5,
									alignItems: 'start',
								}}
							>
								<Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'action.hover' }}>
									<Stack spacing={1.5}>
										<Box>
											<Stack
												direction="row"
												spacing={1}
												useFlexGap
												sx={{ alignItems: 'center', flexWrap: 'wrap' }}
											>
												<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
													{pago.socio_apellido}, {pago.socio_nombre}
												</Typography>
												{pago.socio_estado === 'inactivo' && (
													<Chip size="small" label="Socio inactivo" variant="outlined" />
												)}
											</Stack>
											<Typography
												variant="caption"
												color="text.secondary"
												sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
											>
												Socio #{pago.socio_numero} · DNI {pago.socio_dni}
											</Typography>
											<Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
												{pago.deporte_nombre} · {pago.categoria_nombre} · Período{' '}
												{periodoCobranza(pago)}
											</Typography>
										</Box>

										<Typography
											variant="h4"
											sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
										>
											{monedaCobranza(pago.monto)}
										</Typography>

										<Divider />

										<Box
											sx={{
												display: 'grid',
												gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
												gap: 1.5,
											}}
										>
											<DetailField
												label="Fecha del cobro"
												value={fechaCobranza(pago.fecha_pago)}
												tabular
											/>
											<DetailField
												label="Medio de pago"
												value={
													pago.medio === 'transferencia' ? 'Transferencia bancaria' : 'Efectivo'
												}
											/>
											<DetailField
												label="Comprobante"
												value={pago.numero_comprobante || 'Pendiente de numeración'}
												tabular
											/>
											<DetailField
												label="Estado de la cuota"
												value={pago.estado_cuota === 'pagada' ? 'Pagada' : 'Pendiente'}
											/>
											<DetailField
												label="Deuda pendiente del socio"
												value={monedaCobranza(pago.deuda_pendiente)}
												tabular
												highlight={pago.deuda_pendiente > 0}
											/>
											<DetailField
												label="Referencia"
												value={pago.referencia || 'Sin referencia informada'}
											/>
										</Box>

										{pago.estado_pago === 'anulado' ? (
											<Alert severity="info">
												Este cobro fue anulado. Si la cuota se cobró nuevamente después, ese cobro
												se gestiona por separado.
											</Alert>
										) : (
											<Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', pt: 0.25 }}>
												<Typography variant="caption" color="text.secondary">
													El comprobante ARCA se gestiona de forma independiente a caja.
												</Typography>
												<InfoTooltip
													label="Relación entre cobro y comprobante fiscal"
													title="Autorizar, reintentar o descargar un comprobante en ARCA no modifica el pago confirmado, la cuota ni el saldo de caja."
												/>
											</Stack>
										)}
									</Stack>
								</Paper>

								<Paper variant="outlined" sx={{ p: 2.5 }}>
									{pago.comprobante_id ? (
										<FiscalComprobantePanel
											key={`${cacheScope}:${pago.comprobante_id}`}
											comprobanteId={pago.comprobante_id}
											autoEmitir={autoEmitir}
											onUpdated={() => {
												void actualizarLecturasCobroFiscal(queryClient, cacheScope, pagoId);
												onUpdated?.();
											}}
										/>
									) : (
										<Typography variant="body2" color="text.secondary">
											Este cobro no tiene un comprobante fiscal asociado.
										</Typography>
									)}
								</Paper>
							</Box>

							<AnularCobroSection
								key={`${cacheScope}:${pagoId}`}
								pagoId={pagoId}
								onUpdated={() => {
									void query.refetch();
									onUpdated?.();
									if (pago.comprobante_id) {
										void queryClient.invalidateQueries({
											queryKey: ['comprobante-fiscal', cacheScope, pago.comprobante_id],
											refetchType: 'active',
										});
									}
								}}
							/>
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

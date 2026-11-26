import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import {
	Alert,
	Box,
	Button,
	ButtonBase,
	Checkbox,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	FormControlLabel,
	Paper,
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

const MEDIOS = [
	{
		value: 'efectivo' as const,
		title: 'Efectivo',
		subtitle: 'Se acredita en caja al instante.',
		icon: <PaymentsOutlinedIcon fontSize="small" />,
	},
	{
		value: 'transferencia' as const,
		title: 'Transferencia bancaria',
		subtitle: 'Requiere confirmar acreditación.',
		icon: <AccountBalanceOutlinedIcon fontSize="small" />,
	},
] as const;

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

	const selectMetodo = (next: 'efectivo' | 'transferencia') => {
		if (locked || next === metodo) {
			return;
		}
		setMetodo(next);
		setVerificada(false);
		setValidation(null);
	};

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
			aria-labelledby="cobrar-cuota-title"
			onClose={() => {
				if (!cobro.pending) {
					onClose();
				}
			}}
		>
			<DialogTitle id="cobrar-cuota-title">Registrar cobro</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2.5}>
					{query.isPending ? (
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ py: 3, justifyContent: 'center', alignItems: 'center' }}
						>
							<CircularProgress size={20} />
							<Typography variant="body2" color="text.secondary">
								Cargando datos de la cuota…
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
							No pudimos consultar la cuota.
						</Alert>
					) : !cuota ? (
						<Alert severity="warning">No encontramos la cuota seleccionada.</Alert>
					) : (
						<>
							<Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
								<Stack
									direction="row"
									spacing={1}
									sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
								>
									<Box sx={{ minWidth: 0 }}>
										<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
											{cuota.socio_apellido}, {cuota.socio_nombre}
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
											sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
										>
											Socio #{cuota.socio_numero} · DNI {cuota.socio_dni}
										</Typography>
									</Box>
									<Chip
										size="small"
										color={
											cuota.estado_cuota === 'pagada'
												? 'success'
												: cuota.cuota_en_mora
													? 'error'
													: 'warning'
										}
										label={
											cuota.estado_cuota === 'pagada'
												? 'Pagada'
												: cuota.cuota_en_mora
													? 'Con mora'
													: 'En plazo'
										}
									/>
								</Stack>

								<Divider sx={{ my: 1.5 }} />

								<Stack
									direction="row"
									spacing={2}
									sx={{ alignItems: 'flex-end', justifyContent: 'space-between' }}
								>
									<Box sx={{ minWidth: 0 }}>
										<Typography variant="body2" sx={{ fontWeight: 600 }}>
											{cuota.deporte_nombre} · {cuota.categoria_nombre}
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
											sx={{ fontVariantNumeric: 'tabular-nums' }}
										>
											Período {periodoCobranza(cuota)}
										</Typography>
									</Box>
									<Box sx={{ textAlign: 'right', flexShrink: 0 }}>
										<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
											Importe total
										</Typography>
										<Typography
											variant="h5"
											sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
										>
											{monedaCobranza(cuota.monto)}
										</Typography>
									</Box>
								</Stack>
							</Paper>

							{cuota.socio_estado === 'inactivo' && (
								<Alert severity="warning">
									El socio está inactivo. Sus cuotas pendientes siguen vigentes y se pueden cobrar
									normalmente.
								</Alert>
							)}
							{cuota.estado_cuota !== 'pendiente' && (
								<Alert severity="warning">
									Esta cuota ya figura pagada. Revisá el cobro confirmado antes de continuar.
								</Alert>
							)}

							<Stack spacing={1}>
								<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
									¿Cómo pagó el socio?
								</Typography>
								<Box
									sx={{
										display: 'grid',
										gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
										gap: 1.5,
									}}
								>
									{MEDIOS.map((option) => {
										const selected = metodo === option.value;
										return (
											<ButtonBase
												key={option.value}
												disabled={locked}
												aria-pressed={selected}
												onClick={() => selectMetodo(option.value)}
												sx={{
													display: 'block',
													width: '100%',
													textAlign: 'left',
													borderRadius: 1.5,
													'&.Mui-focusVisible': {
														outline: '2px solid',
														outlineColor: 'primary.main',
														outlineOffset: 2,
													},
												}}
											>
												<Paper
													variant="outlined"
													sx={{
														p: 1.75,
														height: '100%',
														borderColor: selected ? 'primary.main' : 'divider',
														boxShadow: selected
															? (theme) => `inset 0 0 0 1px ${theme.palette.primary.main}`
															: 'none',
														bgcolor: selected ? 'action.selected' : 'background.paper',
														opacity: locked ? 0.65 : 1,
														transition: 'border-color 140ms ease, background-color 140ms ease',
													}}
												>
													<Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
														<Box
															sx={{
																mt: 0.2,
																color: selected ? 'primary.main' : 'text.secondary',
																display: 'flex',
															}}
														>
															{option.icon}
														</Box>
														<Box sx={{ minWidth: 0 }}>
															<Typography variant="body2" sx={{ fontWeight: 700 }}>
																{option.title}
															</Typography>
															<Typography variant="caption" color="text.secondary">
																{option.subtitle}
															</Typography>
														</Box>
													</Stack>
												</Paper>
											</ButtonBase>
										);
									})}
								</Box>
							</Stack>

							{metodo === 'transferencia' && (
								<Stack
									spacing={1.5}
									sx={{
										p: 2,
										borderRadius: 1.5,
										bgcolor: 'action.hover',
										border: 1,
										borderColor: 'divider',
									}}
								>
									<TextField
										size="small"
										fullWidth
										label="Referencia o n.º de operación (opcional)"
										placeholder="Ej. número de comprobante o cuenta de origen"
										value={referencia}
										disabled={locked}
										slotProps={{ htmlInput: { maxLength: 255 } }}
										onChange={(e) => {
											setReferencia(e.target.value);
											if (validation) {
												setValidation(null);
											}
										}}
									/>
									<FormControlLabel
										control={
											<Checkbox
												checked={verificada}
												disabled={locked}
												onChange={(e) => {
													setVerificada(e.target.checked);
													if (validation) {
														setValidation(null);
													}
												}}
											/>
										}
										label="Verifiqué que la transferencia ya se acreditó en la cuenta del club"
									/>
								</Stack>
							)}

							<Typography variant="caption" color="text.secondary">
								Se cobra el importe completo de la cuota. Al confirmar se registra el ingreso en
								caja y se abrirá el detalle para emitir o descargar el comprobante ARCA.
							</Typography>
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
					Cancelar
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
						startIcon={cobro.pending ? <CircularProgress size={16} color="inherit" /> : undefined}
						disabled={
							cobro.pending ||
							!cuota ||
							!cobro.enabled ||
							cuota.monto <= 0 ||
							cuota.estado_cuota !== 'pendiente'
						}
						onClick={save}
					>
						{cobro.pending
							? 'Registrando cobro…'
							: cuota
								? `Confirmar cobro · ${monedaCobranza(cuota.monto)}`
								: 'Confirmar cobro'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}

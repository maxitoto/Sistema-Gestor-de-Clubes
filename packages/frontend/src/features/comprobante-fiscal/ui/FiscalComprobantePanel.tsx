import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
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
	Stack,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
	type DocumentoComprobante,
	emitirComprobante,
	generarPdfComprobante,
	getEstadoComprobante,
} from '#entities/comprobante';
import { EstadoNotificacionCorreo } from '#entities/comunicacion';
import { useAuth } from '#entities/session';
import { formatIsoDateArg } from '#shared/lib/datePresets';

function estadoFiscalChip(estado: string): {
	label: string;
	color: 'success' | 'warning' | 'error' | 'default';
} {
	if (estado === 'valido') {
		return { label: 'Autorizado', color: 'success' };
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
		return { label: 'Anulado', color: 'default' };
	}
	return { label: 'Sin datos', color: 'default' };
}

export function FiscalComprobantePanel({
	comprobanteId,
	autoEmitir = false,
	onUpdated,
	mostrarRelaciones = true,
	ocultarEnlaceMonitoreo = false,
}: {
	comprobanteId: string;
	autoEmitir?: boolean;
	onUpdated: () => void;
	mostrarRelaciones?: boolean;
	ocultarEnlaceMonitoreo?: boolean;
}) {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth(),
		actorId = perfil?.id ?? '';
	const [relatedId, setRelatedId] = useState<string | null>(null);
	const [busy, setBusy] = useState<'emitir' | 'pdf' | null>(null),
		[feedback, setFeedback] = useState<string | null>(null),
		[needsCheck, setNeedsCheck] = useState(false),
		[pdf, setPdf] = useState<DocumentoComprobante | null>(null);
	const controllerRef = useRef<AbortController | null>(null),
		generationRef = useRef(0),
		autoDoneRef = useRef(false);
	const enabled = profileStatus === 'ready' && !isSigningOut;

	const query = useQuery({
		queryKey: ['comprobante-fiscal', cacheScope, comprobanteId],
		queryFn: ({ signal }) => getEstadoComprobante(comprobanteId, actorId, signal),
		enabled,
		retry: 1,
		refetchInterval: (q) =>
			q.state.data?.operacion &&
			['adquirida', 'preparada', 'posible_envio'].includes(q.state.data.operacion)
				? 5000
				: false,
	});

	useEffect(
		() => () => {
			generationRef.current++;
			controllerRef.current?.abort();
		},
		[],
	);

	const run = async (kind: 'emitir' | 'pdf') => {
		const gen = generationRef.current,
			abort = new AbortController();
		controllerRef.current = abort;
		setBusy(kind);
		setFeedback(null);
		if (kind === 'pdf') {
			setPdf(null);
		}
		try {
			if (kind === 'pdf') {
				const doc = await generarPdfComprobante(comprobanteId, actorId, abort.signal);
				if (gen === generationRef.current) {
					setPdf(doc);
				}
			} else {
				await emitirComprobante(comprobanteId, actorId, abort.signal);
				if (gen === generationRef.current) {
					setNeedsCheck(false);
					onUpdated();
				}
			}
			if (gen === generationRef.current) {
				await query.refetch();
			}
		} catch (error) {
			if (gen === generationRef.current) {
				setFeedback(error instanceof Error ? error.message : 'No se obtuvo confirmación.');
				if (kind === 'emitir') {
					setNeedsCheck(true);
				}
			}
		} finally {
			if (gen === generationRef.current) {
				setBusy(null);
			}
		}
	};

	useEffect(() => {
		if (!autoEmitir || autoDoneRef.current || !query.data) {
			return;
		}
		autoDoneRef.current = true;
		if (query.data.emisionDisponible && !query.data.operacion) {
			void run('emitir');
		}
	});

	const check = async () => {
		setFeedback(null);
		const result = await query.refetch();
		if (!result.error) {
			setNeedsCheck(false);
			onUpdated();
		}
	};

	const documentKey = query.data
		? [query.data.estadoFiscal, query.data.pdfVersion, query.data.notaCreditoId].join(':')
		: null;
	useEffect(() => {
		if (documentKey !== null) {
			setPdf(null);
		}
	}, [documentKey]);

	const data = query.data;
	const chip = data ? estadoFiscalChip(data.estadoFiscal) : null;

	return (
		<Stack spacing={2}>
			<Stack
				direction="row"
				spacing={1}
				useFlexGap
				sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
			>
				<Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
					{data?.tipoDocumento === 'nota_credito'
						? 'Nota de Crédito ARCA'
						: 'Comprobante fiscal ARCA'}
				</Typography>
				{chip && <Chip size="small" color={chip.color} label={chip.label} />}
			</Stack>

			{query.isPending ? (
				<Stack direction="row" spacing={1.25} sx={{ py: 1.5, alignItems: 'center' }}>
					<CircularProgress size={18} />
					<Typography variant="body2" color="text.secondary">
						Consultando estado en ARCA…
					</Typography>
				</Stack>
			) : query.isError ? (
				<Alert severity="warning">
					No pudimos consultar el comprobante en este momento. El cobro sigue confirmado por
					separado.
				</Alert>
			) : (
				data && (
					<>
						{data.cae && (
							<Box
								sx={{
									p: 1.5,
									borderRadius: 1.5,
									bgcolor: 'action.hover',
									display: 'grid',
									gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
									gap: 1.25,
								}}
							>
								<Box sx={{ minWidth: 0 }}>
									<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
										CAE autorizado
									</Typography>
									<Typography
										variant="body2"
										sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
									>
										{data.cae}
									</Typography>
								</Box>
								<Box sx={{ minWidth: 0 }}>
									<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
										Vencimiento del CAE
									</Typography>
									<Typography
										variant="body2"
										sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
									>
										{formatIsoDateArg(data.vencimiento)}
									</Typography>
								</Box>
								{data.numero && (
									<Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
										<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
											Número de comprobante
										</Typography>
										<Typography
											variant="body2"
											sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
										>
											{data.numero}
										</Typography>
									</Box>
								)}
							</Box>
						)}

						{data.aviso && <Alert severity="info">{data.aviso}</Alert>}

						{data.operacion &&
							['adquirida', 'preparada', 'posible_envio'].includes(data.operacion) && (
								<Alert severity="info">
									La solicitud ante ARCA está en proceso. Podés actualizar el estado en unos
									segundos sin volver a registrar el cobro.
								</Alert>
							)}

						{data.estadoFiscal === 'fallido' && (
							<Alert severity="warning">
								{ocultarEnlaceMonitoreo
									? 'El comprobante requiere revisión. Usá las acciones disponibles en el listado para regularizarlo.'
									: 'El comprobante no pudo autorizarse y requiere revisión en Monitoreo fiscal.'}
							</Alert>
						)}

						{data.pdfVersion && (
							<Button
								variant="contained"
								fullWidth
								startIcon={
									busy === 'pdf' ? (
										<CircularProgress size={16} color="inherit" />
									) : (
										<PictureAsPdfOutlinedIcon />
									)
								}
								disabled={!!busy}
								onClick={() => void run('pdf')}
							>
								{busy === 'pdf'
									? 'Generando PDF…'
									: data.pdfVersion === 'autorizado'
										? 'Descargar PDF autorizado'
										: 'Descargar comprobante provisional'}
							</Button>
						)}

						{pdf && (
							<Alert
								severity="success"
								action={
									<Button
										size="small"
										color="inherit"
										component="a"
										href={pdf.url}
										target="_blank"
										rel="noopener noreferrer"
										endIcon={<OpenInNewOutlinedIcon fontSize="small" />}
									>
										Abrir PDF
									</Button>
								}
							>
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									PDF {pdf.version === 'autorizado' ? 'autorizado' : 'provisional'} listo.
								</Typography>
								<Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
									El enlace seguro vence en 10 minutos. Podés volver a generarlo cuando quieras sin
									emitir otro comprobante.
								</Typography>
							</Alert>
						)}

						<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
							{data.emisionDisponible && (
								<Button
									size="small"
									variant={data.pdfVersion ? 'outlined' : 'contained'}
									disabled={!!busy || needsCheck}
									startIcon={
										busy === 'emitir' ? <CircularProgress size={14} color="inherit" /> : undefined
									}
									onClick={() => void run('emitir')}
								>
									{busy === 'emitir'
										? 'Consultando ARCA…'
										: data.operacion
											? 'Verificar autorización'
											: 'Solicitar autorización ARCA'}
								</Button>
							)}

							<Button
								size="small"
								variant="outlined"
								startIcon={<RefreshOutlinedIcon />}
								disabled={!!busy || query.isFetching}
								onClick={() => void check()}
							>
								Actualizar estado
							</Button>

							{mostrarRelaciones && data.notaCreditoId && (
								<Button
									size="small"
									variant="outlined"
									onClick={() => setRelatedId(data.notaCreditoId ?? null)}
								>
									Ver Nota de Crédito
								</Button>
							)}

							{mostrarRelaciones && data.comprobanteOrigenId && (
								<Button
									size="small"
									variant="outlined"
									onClick={() => setRelatedId(data.comprobanteOrigenId ?? null)}
								>
									Ver factura original
								</Button>
							)}

							{!ocultarEnlaceMonitoreo && data.estadoFiscal !== 'valido' && (
								<Button
									size="small"
									component={Link}
									to="/monitoreo-fiscal"
									endIcon={<OpenInNewOutlinedIcon fontSize="small" />}
								>
									Ir a Monitoreo fiscal
								</Button>
							)}
						</Stack>
					</>
				)
			)}

			{!data && !query.isPending && (
				<Button
					size="small"
					variant="outlined"
					startIcon={<RefreshOutlinedIcon />}
					disabled={!!busy || query.isFetching}
					onClick={() => void check()}
					sx={{ alignSelf: 'flex-start' }}
				>
					Actualizar estado
				</Button>
			)}

			{feedback && (
				<Alert severity="warning">
					{feedback}
					{needsCheck ? ' Actualizá el estado antes de reintentar.' : ''}
				</Alert>
			)}

			<EstadoNotificacionCorreo
				operation={{ comprobanteId }}
				actorId={actorId}
				cacheScope={cacheScope}
				enabled={enabled}
			/>

			{relatedId && (
				<Dialog
					open
					fullWidth
					maxWidth="sm"
					aria-labelledby="documento-relacionado-title"
					onClose={() => setRelatedId(null)}
				>
					<DialogTitle id="documento-relacionado-title">Comprobante relacionado</DialogTitle>
					<DialogContent dividers>
						<FiscalComprobantePanel
							key={`${cacheScope}:${relatedId}`}
							comprobanteId={relatedId}
							mostrarRelaciones={false}
							onUpdated={onUpdated}
						/>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setRelatedId(null)}>Cerrar</Button>
					</DialogActions>
				</Dialog>
			)}
		</Stack>
	);
}

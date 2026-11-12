import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
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
import { useAuth } from '#entities/session';

export function FiscalComprobantePanel({
	comprobanteId,
	autoEmitir = false,
	onUpdated,
	mostrarRelaciones = true,
}: {
	comprobanteId: string;
	autoEmitir?: boolean;
	onUpdated: () => void;
	mostrarRelaciones?: boolean;
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
	return (
		<Stack spacing={2}>
			<Divider />
			<Typography component="h3" variant="h6">
				{query.data?.tipoDocumento === 'nota_credito'
					? 'Documentación de la Nota de Crédito'
					: 'Documentación del cobro'}
			</Typography>
			{query.isPending ? (
				<Typography>Consultando documentación…</Typography>
			) : query.isError ? (
				<Alert severity="warning">
					No pudimos consultar la documentación. Consultá el estado financiero por separado.
				</Alert>
			) : (
				data && (
					<>
						{data.aviso && <Alert severity="info">{data.aviso}</Alert>}
						{data.cae && (
							<Typography>
								CAE: {data.cae} · Vencimiento: {data.vencimiento}
							</Typography>
						)}
						{data.operacion &&
							['adquirida', 'preparada', 'posible_envio'].includes(data.operacion) && (
								<Alert severity="info">
									La operación fiscal está en proceso. Podés volver a consultar sin registrar otro
									cobro.
								</Alert>
							)}
						{data.estadoFiscal === 'fallido' && (
							<Alert severity="warning">
								La documentación requiere regularización. Consultá la incidencia en Monitoreo
								fiscal.
							</Alert>
						)}
						{data.emisionDisponible && (
							<Button
								variant="outlined"
								disabled={!!busy || needsCheck}
								onClick={() => void run('emitir')}
							>
								{busy === 'emitir'
									? 'Consultando autorización…'
									: data.operacion
										? 'Conciliar autorización'
										: 'Solicitar autorización'}
							</Button>
						)}
						<Button component={Link} to="/monitoreo-fiscal">
							Monitoreo fiscal
						</Button>
						{mostrarRelaciones && data.notaCreditoId && (
							<Button variant="outlined" onClick={() => setRelatedId(data.notaCreditoId ?? null)}>
								Ver Nota de Crédito
							</Button>
						)}
						{mostrarRelaciones && data.comprobanteOrigenId && (
							<Button
								variant="outlined"
								onClick={() => setRelatedId(data.comprobanteOrigenId ?? null)}
							>
								Ver factura original
							</Button>
						)}
						{data.pdfVersion && (
							<Button variant="contained" disabled={!!busy} onClick={() => void run('pdf')}>
								{busy === 'pdf'
									? 'Preparando PDF…'
									: `Obtener PDF ${data.pdfVersion === 'autorizado' ? 'autorizado' : 'provisional'}`}
							</Button>
						)}
					</>
				)
			)}
			{feedback && (
				<Alert severity="warning">
					{feedback}
					{needsCheck ? ' Consultá el estado antes de volver a enviar.' : ''}
				</Alert>
			)}
			<Button disabled={!!busy || query.isFetching} onClick={() => void check()}>
				Consultar estado
			</Button>
			{pdf && (
				<Alert severity="success">
					PDF {pdf.version === 'autorizado' ? 'autorizado' : 'provisional'} disponible.{' '}
					<Button component="a" href={pdf.url} target="_blank" rel="noopener noreferrer">
						Abrir PDF
					</Button>
					<Typography variant="caption" sx={{ display: 'block' }}>
						El enlace privado vence en 10 minutos. Podés obtenerlo nuevamente sin cobrar ni emitir
						otra vez.
					</Typography>
				</Alert>
			)}
			{relatedId && (
				<Dialog open fullWidth maxWidth="sm" onClose={() => setRelatedId(null)}>
					<DialogTitle>Documento relacionado</DialogTitle>
					<DialogContent>
						<FiscalComprobantePanel
							key={`${cacheScope}:${relatedId}`}
							comprobanteId={relatedId}
							mostrarRelaciones={false}
							onUpdated={onUpdated}
						/>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setRelatedId(null)}>Cerrar documento</Button>
					</DialogActions>
				</Dialog>
			)}
		</Stack>
	);
}

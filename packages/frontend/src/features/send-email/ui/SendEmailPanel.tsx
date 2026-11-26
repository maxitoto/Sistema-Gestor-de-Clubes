import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
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
	MenuItem,
	Paper,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '#entities/session';
import {
	ETIQUETAS_CORREO,
	idsCanonicosCorreo,
	validarTextoCorreo,
	vistaPreviaCorreo,
} from '#shared/lib/comunicaciones';
import type { AvisoPayload, AvisoResult } from '../api/email.api';
import { RequestIdentity } from '../model/requestIdentity';
import { useAvisoManual, useEmailTemplates } from '../model/useEmail';

interface Props {
	tipo: 'general' | 'deuda';
	incluirDesuscriptos: boolean;
	selectedSocios: string[];
	selectedLabels: string[];
	elegibles: number;
	excluidos: number;
	onClearSelection: () => void;
	onPendingChange: (pendingRef: boolean) => void;
	disabled?: boolean;
}

export function SendEmailPanel({
	tipo,
	incluirDesuscriptos,
	selectedSocios,
	selectedLabels,
	elegibles,
	excluidos,
	onClearSelection,
	onPendingChange,
	disabled = false,
}: Props) {
	const mutation = useAvisoManual(),
		templates = useEmailTemplates(),
		{ cacheScope, profileStatus, isSigningOut } = useAuth();
	const [plantilla, setPlantilla] = useState(''),
		[asunto, setAsunto] = useState(''),
		[cuerpo, setCuerpo] = useState(''),
		[review, setReview] = useState(false),
		[busy, setBusy] = useState(false),
		[uncertain, setUncertain] = useState(false),
		[error, setError] = useState<string | null>(null),
		[success, setSuccess] = useState<AvisoResult | null>(null);
	const identityRef = useRef(new RequestIdentity()),
		pendingRef = useRef<AvisoPayload | null>(null),
		lockRef = useRef(false),
		abortRef = useRef<AbortController | null>(null),
		aliveRef = useRef(true);
	const locked = busy || uncertain || disabled;

	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
			abortRef.current?.abort();
		};
	}, []);

	useEffect(() => {
		onPendingChange(busy || uncertain);
		return () => onPendingChange(false);
	}, [busy, uncertain, onPendingChange]);

	const insertarEtiqueta = (tag: (typeof ETIQUETAS_CORREO)[number]) => {
		if (locked) {
			return;
		}
		setCuerpo((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}{{${tag}}}`);
		setPlantilla('');
		setSuccess(null);
	};

	const prepare = () => {
		if (locked || !elegibles || profileStatus !== 'ready' || isSigningOut) {
			return;
		}
		setError(null);
		try {
			const ids = idsCanonicosCorreo(selectedSocios);
			if (tipo === 'general') {
				const issue = validarTextoCorreo(asunto, cuerpo);
				if (issue) {
					setError(issue);
					return;
				}
			}
			const payload = {
				tipo,
				asunto: tipo === 'deuda' ? 'Aviso de deuda' : asunto.trim(),
				cuerpo:
					tipo === 'deuda' ? 'Información de la deuda pendiente actual del socio.' : cuerpo.trim(),
				sociosIds: ids,
				plantillaId: tipo === 'general' && plantilla ? plantilla : null,
				incluirDesuscriptos: tipo === 'deuda' && incluirDesuscriptos,
			};
			pendingRef.current = {
				...payload,
				requestId: identityRef.current.forPayload({ actor: cacheScope, ...payload }),
			};
			setReview(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Revisá la selección.');
		}
	};

	const send = async () => {
		if (lockRef.current || !pendingRef.current || profileStatus !== 'ready' || isSigningOut) {
			return;
		}
		lockRef.current = true;
		setBusy(true);
		setError(null);
		setReview(false);
		const c = new AbortController();
		abortRef.current = c;
		try {
			const result = await mutation.mutateAsync({ payload: pendingRef.current, signal: c.signal });
			if (aliveRef.current) {
				setSuccess(result);
				setUncertain(false);
				pendingRef.current = null;
				identityRef.current.reset();
				onClearSelection();
			}
		} catch (e) {
			if (aliveRef.current) {
				setError(e instanceof Error ? e.message : 'No se confirmó la solicitud.');
				setUncertain(!(e && typeof e === 'object' && 'incierto' in e && e.incierto === false));
			}
		} finally {
			if (aliveRef.current) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};

	const previewSubject = tipo === 'deuda' ? 'Aviso de deuda pendiente' : vistaPreviaCorreo(asunto);
	const previewBody =
		tipo === 'deuda'
			? 'Cada destinatario recibirá el aviso institucional con su deuda pendiente y la fecha de emisión. Si regulariza su saldo antes del despacho, el envío se omite automáticamente.'
			: vistaPreviaCorreo(cuerpo);

	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Stack spacing={2.25}>
				<Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
					<Chip size="small" color="primary" label="Paso 2" />
					<Typography component="h2" variant="h6">
						Mensaje y vista previa
					</Typography>
				</Stack>

				{tipo === 'general' ? (
					<>
						<TextField
							size="small"
							select
							label="Cargar desde plantilla (opcional)"
							value={plantilla}
							disabled={locked || templates.isLoading}
							onChange={(e) => {
								const p = templates.data?.find((x) => x.id === e.target.value);
								setPlantilla(p?.id ?? '');
								if (p) {
									setAsunto(p.asunto);
									setCuerpo(p.cuerpo);
								}
								setSuccess(null);
							}}
						>
							<MenuItem value="">Redactar sin plantilla</MenuItem>
							{templates.data?.map((p) => (
								<MenuItem key={p.id} value={p.id}>
									{p.nombre_interno}
								</MenuItem>
							))}
						</TextField>

						{templates.isError && (
							<Alert
								severity="warning"
								action={
									<Button size="small" color="inherit" onClick={() => void templates.refetch()}>
										Reintentar
									</Button>
								}
							>
								No pudimos cargar las plantillas. Podés redactar el mensaje manualmente.
							</Alert>
						)}

						<TextField
							size="small"
							label="Asunto"
							placeholder="Ej. Horarios de entrenamiento de esta semana"
							required
							value={asunto}
							disabled={locked}
							onChange={(e) => {
								setAsunto(e.target.value);
								setPlantilla('');
								setSuccess(null);
							}}
							slotProps={{ htmlInput: { maxLength: 255 } }}
						/>

						<Stack spacing={1}>
							<Stack
								direction="row"
								spacing={0.75}
								useFlexGap
								sx={{ flexWrap: 'wrap', alignItems: 'center' }}
							>
								<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
									Insertar dato del socio:
								</Typography>
								{ETIQUETAS_CORREO.map((tag) => (
									<Chip
										key={tag}
										size="small"
										variant="outlined"
										clickable={!locked}
										disabled={locked}
										label={`{{${tag}}}`}
										onClick={() => insertarEtiqueta(tag)}
									/>
								))}
							</Stack>

							<TextField
								label="Mensaje"
								placeholder="Hola {{nombre}}, te escribimos desde el club para informarte…"
								required
								multiline
								minRows={5}
								value={cuerpo}
								disabled={locked}
								onChange={(e) => {
									setCuerpo(e.target.value);
									setPlantilla('');
									setSuccess(null);
								}}
								slotProps={{ htmlInput: { maxLength: 10000 } }}
								helperText="Se envía como texto simple. Las etiquetas se reemplazan con los datos de cada socio."
							/>
						</Stack>
					</>
				) : (
					<>
						<TextField
							size="small"
							label="Asunto del aviso"
							value="Aviso de deuda pendiente"
							slotProps={{ input: { readOnly: true } }}
						/>
						<Alert severity="info">
							El texto del aviso de deuda se arma automáticamente con el saldo actualizado de cada
							socio seleccionado.
						</Alert>
					</>
				)}

				<Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
					<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
						VISTA PREVIA DE EJEMPLO (DATOS ILUSTRATIVOS)
					</Typography>
					<Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1, overflowWrap: 'anywhere' }}>
						{previewSubject || 'Sin asunto todavía'}
					</Typography>
					<Divider sx={{ my: 1.25 }} />
					<Typography
						variant="body2"
						color={previewBody ? 'text.primary' : 'text.secondary'}
						sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
					>
						{previewBody || 'Escribí el mensaje arriba para ver cómo lo recibirá el socio.'}
					</Typography>
				</Paper>

				<Typography variant="caption" color="text.secondary">
					Cada destinatario recibe un correo individual. Antes de enviar, el sistema vuelve a
					validar dirección, preferencia y saldo pendiente.
				</Typography>

				{error && <Alert severity={uncertain ? 'warning' : 'error'}>{error}</Alert>}

				{uncertain && (
					<Box>
						<Button variant="contained" disabled={busy} onClick={() => void send()}>
							Recuperar la misma solicitud
						</Button>
					</Box>
				)}

				{success && (
					<Alert
						severity="success"
						action={
							<Button
								size="small"
								color="inherit"
								component={Link}
								to={`/comunicaciones/${success.id}`}
							>
								Ver detalle
							</Button>
						}
					>
						<Typography variant="body2" sx={{ fontWeight: 700 }}>
							Envío programado correctamente
						</Typography>
						<Typography variant="body2" sx={{ mt: 0.25 }}>
							Programados: {success.encolados} · Excluidos: {success.excluidos}. Los correos se
							están procesando en segundo plano y podrás seguir la entrega desde el historial.
						</Typography>
					</Alert>
				)}

				<Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
					<Button
						variant="contained"
						startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendOutlinedIcon />}
						disabled={
							locked ||
							!selectedSocios.length ||
							!elegibles ||
							(tipo === 'general' && (!asunto.trim() || !cuerpo.trim()))
						}
						onClick={prepare}
					>
						{busy ? 'Programando envío…' : 'Revisar y programar envío'}
					</Button>
				</Stack>

				<Dialog
					open={review}
					fullWidth
					maxWidth="md"
					aria-labelledby="confirmar-comunicacion-title"
					onClose={() => {
						if (!busy) {
							setReview(false);
						}
					}}
				>
					<DialogTitle id="confirmar-comunicacion-title">
						Confirmar envío de comunicación
					</DialogTitle>
					<DialogContent dividers>
						<Stack spacing={2}>
							<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
								<Typography variant="body2" sx={{ fontWeight: 700 }}>
									{selectedSocios.length} socios seleccionados: {elegibles} elegibles y {excluidos}{' '}
									excluidos.
								</Typography>
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{ display: 'block', mt: 0.5 }}
								>
									{selectedLabels.slice(0, 5).join(' · ')}
									{selectedLabels.length > 5 ? ` · y ${selectedLabels.length - 5} más` : ''}
								</Typography>
							</Paper>

							{tipo === 'deuda' && incluirDesuscriptos && (
								<Alert severity="warning">
									Se incluirán socios desuscriptos solo si mantienen deuda pendiente. Las
									direcciones marcadas como inválidas se excluyen siempre.
								</Alert>
							)}

							<Paper variant="outlined" sx={{ p: 2 }}>
								<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
									VISTA PREVIA (CADA SOCIO VERÁ SUS PROPIOS DATOS)
								</Typography>
								<Typography
									variant="subtitle2"
									sx={{ fontWeight: 700, mt: 0.75, overflowWrap: 'anywhere' }}
								>
									{previewSubject}
								</Typography>
								<Divider sx={{ my: 1 }} />
								<Typography
									variant="body2"
									sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
								>
									{previewBody}
								</Typography>
							</Paper>

							<Alert severity="info">
								Se registrará una única solicitud de envío en segundo plano. Podrás seguir el estado
								individual de cada destinatario en el historial.
							</Alert>
						</Stack>
					</DialogContent>
					<DialogActions>
						<Button disabled={busy} onClick={() => setReview(false)}>
							Volver a editar
						</Button>
						<Button
							variant="contained"
							startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
							disabled={busy}
							onClick={() => void send()}
						>
							{busy ? 'Programando…' : 'Confirmar y programar envío'}
						</Button>
					</DialogActions>
				</Dialog>
			</Stack>
		</Paper>
	);
}

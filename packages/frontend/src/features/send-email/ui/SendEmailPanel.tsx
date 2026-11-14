import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
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
			? 'Cada destinatario recibirá el aviso institucional con su deuda pendiente y fecha de preparación. El importe histórico se conserva; si salda toda la deuda antes del despacho, el aviso se excluye.'
			: vistaPreviaCorreo(cuerpo);
	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Stack spacing={2}>
				<Typography component="h2" variant="h6">
					Componer y revisar el mensaje
				</Typography>
				{tipo === 'general' ? (
					<>
						<TextField
							select
							label="Plantilla de correo"
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
							<MenuItem value="">Sin plantilla</MenuItem>
							{templates.data?.map((p) => (
								<MenuItem key={p.id} value={p.id}>
									{p.nombre_interno}
								</MenuItem>
							))}
						</TextField>
						{templates.isError && (
							<Alert
								severity="warning"
								action={<Button onClick={() => void templates.refetch()}>Reintentar</Button>}
							>
								No se pudieron cargar las plantillas. Podés redactar el mensaje.
							</Alert>
						)}
						<TextField
							label="Asunto"
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
						<TextField
							label="Mensaje"
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
							helperText="Etiquetas: {{nombre}}, {{apellido}}, {{deporte}} y {{deuda}}. Se muestran como texto simple."
						/>
					</>
				) : (
					<>
						<TextField
							label="Asunto del aviso"
							value="Aviso de deuda pendiente"
							slotProps={{ input: { readOnly: true } }}
						/>
						<Alert severity="info">
							El contenido del aviso de deuda se prepara con los datos confirmados de cada socio. No
							se reemplaza con una comunicación general.
						</Alert>
					</>
				)}
				<Paper variant="outlined" sx={{ p: 2 }}>
					<Typography component="h3" variant="subtitle1">
						Vista previa orientativa con datos sintéticos
					</Typography>
					<Typography sx={{ fontWeight: 700, my: 1, overflowWrap: 'anywhere' }}>
						{previewSubject}
					</Typography>
					<Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
						{previewBody}
					</Typography>
				</Paper>
				<Typography color="text.secondary">
					Cada destinatario recibe un mensaje individual. Antes de despachar se vuelven a comprobar
					dirección, preferencia y deuda; pueden cambiar las exclusiones.
				</Typography>
				{error && <Alert severity={uncertain ? 'warning' : 'error'}>{error}</Alert>}
				{uncertain && (
					<Button variant="contained" disabled={busy} onClick={() => void send()}>
						Recuperar la misma solicitud
					</Button>
				)}
				{success && (
					<Alert severity="success">
						<Typography sx={{ fontWeight: 700 }}>Encolado</Typography>
						En cola: {success.encolados}. Excluidos: {success.excluidos}. Los correos están siendo
						enviados en segundo plano. La entrega todavía no está confirmada.{' '}
						<Button component={Link} to={`/comunicaciones/${success.id}`}>
							Ver resultado en el historial
						</Button>
					</Alert>
				)}
				<Button
					variant="contained"
					disabled={
						locked ||
						!selectedSocios.length ||
						!elegibles ||
						(tipo === 'general' && (!asunto.trim() || !cuerpo.trim()))
					}
					onClick={prepare}
				>
					{busy ? 'Confirmando…' : 'Revisar y confirmar comunicación'}
				</Button>
				<Dialog
					open={review}
					fullWidth
					maxWidth="md"
					onClose={() => {
						if (!busy) {
							setReview(false);
						}
					}}
				>
					<DialogTitle>Confirmar comunicación</DialogTitle>
					<DialogContent>
						<Stack spacing={2}>
							<Typography>
								{selectedSocios.length} socios seleccionados: {elegibles} elegibles y {excluidos}{' '}
								excluidos según la consulta actual.
							</Typography>
							<Typography variant="body2">
								{selectedLabels.slice(0, 5).join(' · ')}
								{selectedLabels.length > 5 ? ` · y ${selectedLabels.length - 5} más` : ''}
							</Typography>
							{tipo === 'deuda' && incluirDesuscriptos && (
								<Alert severity="warning">
									Se incluyen desuscriptos sólo si conservan deuda pendiente. Una dirección inválida
									se excluye siempre.
								</Alert>
							)}
							<Typography variant="body2" color="text.secondary">
								Vista previa con datos de ejemplo. Cada mensaje usará los datos del socio.
							</Typography>
							<Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
								{previewSubject}
							</Typography>
							<Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
								{previewBody}
							</Typography>
							<Alert severity="info">
								Se guardará una única solicitud con los destinatarios elegidos. El resultado
								confirmado será Encolado; consultá el historial para seguir el procesamiento.
							</Alert>
						</Stack>
					</DialogContent>
					<DialogActions>
						<Button disabled={busy} onClick={() => setReview(false)}>
							Volver a revisar
						</Button>
						<Button variant="contained" disabled={busy} onClick={() => void send()}>
							Confirmar y encolar
						</Button>
					</DialogActions>
				</Dialog>
			</Stack>
		</Paper>
	);
}

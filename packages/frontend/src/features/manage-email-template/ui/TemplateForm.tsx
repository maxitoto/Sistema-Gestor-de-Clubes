import {
	Alert,
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
	TextField,
	Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { guardarPlantillaCorreo, type PlantillaCorreo } from '#entities/plantilla-correo';
import { useAuth } from '#entities/session';
import { ETIQUETAS_CORREO, validarPlantilla, vistaPreviaCorreo } from '#shared/lib/comunicaciones';

export function TemplateForm({
	plantilla,
	onClose,
	onSaved,
}: {
	plantilla: PlantillaCorreo | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { perfil, profileStatus, isSigningOut } = useAuth();
	const [name, setName] = useState(plantilla?.nombre_interno ?? ''),
		[asunto, setAsunto] = useState(plantilla?.asunto ?? ''),
		[cuerpo, setCuerpo] = useState(plantilla?.cuerpo ?? ''),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null);
	const lockRef = useRef(false),
		abortRef = useRef<AbortController | null>(null),
		aliveRef = useRef(true);

	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
			abortRef.current?.abort();
		};
	}, []);

	const insertarEtiqueta = (tag: (typeof ETIQUETAS_CORREO)[number]) => {
		if (busy) {
			return;
		}
		setCuerpo((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}{{${tag}}}`);
	};

	const save = async () => {
		if (lockRef.current || profileStatus !== 'ready' || isSigningOut) {
			return;
		}
		const payload = { nombre_interno: name, asunto, cuerpo };
		const issue = validarPlantilla(payload);
		if (issue) {
			setError(issue);
			return;
		}
		lockRef.current = true;
		setBusy(true);
		setError(null);
		const c = new AbortController();
		abortRef.current = c;
		try {
			await guardarPlantillaCorreo(payload, plantilla?.id ?? null, perfil?.id ?? '', c.signal);
			if (aliveRef.current) {
				onSaved();
				onClose();
			}
		} catch (e) {
			if (aliveRef.current) {
				setError(e instanceof Error ? e.message : 'No se confirmó el guardado.');
			}
		} finally {
			if (aliveRef.current) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};

	return (
		<Dialog
			open
			fullWidth
			maxWidth="md"
			aria-labelledby="template-form-title"
			onClose={() => {
				if (!busy) {
					onClose();
				}
			}}
		>
			<DialogTitle id="template-form-title">
				{plantilla ? 'Editar plantilla' : 'Nueva plantilla'}
			</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2.25}>
					<TextField
						size="small"
						label="Nombre de la plantilla"
						placeholder="Ej. Aviso de torneo de fin de semana"
						required
						value={name}
						disabled={busy}
						onChange={(e) => setName(e.target.value)}
						slotProps={{ htmlInput: { maxLength: 150 } }}
					/>
					<TextField
						size="small"
						label="Asunto"
						required
						value={asunto}
						disabled={busy}
						onChange={(e) => setAsunto(e.target.value)}
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
									clickable={!busy}
									disabled={busy}
									label={`{{${tag}}}`}
									onClick={() => insertarEtiqueta(tag)}
								/>
							))}
						</Stack>
						<TextField
							label="Mensaje"
							required
							multiline
							minRows={5}
							value={cuerpo}
							disabled={busy}
							onChange={(e) => setCuerpo(e.target.value)}
							slotProps={{ htmlInput: { maxLength: 10000 } }}
							helperText="Las etiquetas disponibles se reemplazan con los datos reales de cada destinatario."
						/>
					</Stack>
					<Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
						<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
							VISTA PREVIA DE EJEMPLO
						</Typography>
						<Typography
							variant="subtitle2"
							sx={{ fontWeight: 700, mt: 0.75, overflowWrap: 'anywhere' }}
						>
							{vistaPreviaCorreo(asunto) || 'Sin asunto todavía'}
						</Typography>
						<Divider sx={{ my: 1 }} />
						<Typography
							variant="body2"
							color={cuerpo ? 'text.primary' : 'text.secondary'}
							sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
						>
							{vistaPreviaCorreo(cuerpo) || 'Escribí el texto para previsualizar la plantilla.'}
						</Typography>
					</Paper>
					<Typography variant="caption" color="text.secondary">
						Guardar cambios solo afecta usos futuros. Los mensajes ya enviados conservan su texto
						original.
					</Typography>
					{error && <Alert severity="error">{error}</Alert>}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={busy} onClick={onClose}>
					Cancelar
				</Button>
				<Button
					variant="contained"
					startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
					disabled={busy}
					onClick={() => void save()}
				>
					{busy ? 'Guardando…' : 'Guardar plantilla'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

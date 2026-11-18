import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Paper,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { guardarPlantillaCorreo, type PlantillaCorreo } from '#entities/plantilla-correo';
import { useAuth } from '#entities/session';
import { validarPlantilla, vistaPreviaCorreo } from '#shared/lib/comunicaciones';
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
			onClose={() => {
				if (!busy) {
					onClose();
				}
			}}
		>
			<DialogTitle>{plantilla ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<TextField
						label="Nombre interno"
						required
						value={name}
						disabled={busy}
						onChange={(e) => setName(e.target.value)}
						slotProps={{ htmlInput: { maxLength: 150 } }}
					/>
					<TextField
						label="Asunto"
						required
						value={asunto}
						disabled={busy}
						onChange={(e) => setAsunto(e.target.value)}
						slotProps={{ htmlInput: { maxLength: 255 } }}
					/>
					<TextField
						label="Mensaje"
						required
						multiline
						minRows={5}
						value={cuerpo}
						disabled={busy}
						onChange={(e) => setCuerpo(e.target.value)}
						slotProps={{ htmlInput: { maxLength: 10000 } }}
						helperText="Etiquetas disponibles: {{nombre}}, {{apellido}}, {{deporte}} y {{deuda}}."
					/>
					<Paper variant="outlined" sx={{ p: 2 }}>
						<Typography component="h3" variant="subtitle1">
							Vista previa con datos de ejemplo
						</Typography>
						<Typography sx={{ fontWeight: 700, my: 1, overflowWrap: 'anywhere' }}>
							{vistaPreviaCorreo(asunto)}
						</Typography>
						<Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
							{vistaPreviaCorreo(cuerpo)}
						</Typography>
					</Paper>
					<Alert severity="info">
						Guardar cambios sólo afecta usos futuros. Los mensajes ya preparados conservan su
						contenido.
					</Alert>
					{error && <Alert severity="error">{error}</Alert>}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={busy} onClick={onClose}>
					Cancelar
				</Button>
				<Button variant="contained" disabled={busy} onClick={() => void save()}>
					{busy ? 'Guardando…' : 'Guardar plantilla'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

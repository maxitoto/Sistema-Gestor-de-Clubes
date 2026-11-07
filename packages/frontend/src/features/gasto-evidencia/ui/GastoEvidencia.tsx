import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '#entities/session';
import { asociarArchivo, descartarArchivo, leerArchivo, subirArchivo } from '#shared/api';
export function GastoEvidencia({
	gastoId,
	editable,
	initialFile = null,
	onUpdated,
	onPendingCleared,
}: {
	gastoId: string;
	editable: boolean;
	initialFile?: File | null;
	onUpdated: () => void;
	onPendingCleared?: () => void;
}) {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && !isSigningOut;
	const identity = {
		tipo: 'gasto-evidencia' as const,
		entidadId: gastoId,
		actorId: perfil?.id ?? '',
	};
	const storageKey = `club:gasto-evidencia:${perfil?.id ?? ''}:${gastoId}`;
	const client = useQueryClient();
	const key = ['gasto-evidencia', cacheScope, gastoId];
	const query = useQuery({
		queryKey: key,
		queryFn: ({ signal }) => leerArchivo(identity, signal),
		enabled,
		retry: 1,
		staleTime: 8 * 60_000,
		refetchInterval: 8 * 60_000,
	});
	const [file, setFile] = useState<File | null>(initialFile);
	const [preview, setPreview] = useState<string | null>(null);
	const [path, setPath] = useState<string | null>(() => {
		try {
			return sessionStorage.getItem(storageKey);
		} catch {
			return null;
		}
	});
	const [busy, setBusy] = useState(false);
	const [needsCheck, setNeedsCheck] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(
		initialFile
			? 'Gasto registrado. Guardá la evidencia seleccionada para completar el adjunto.'
			: null,
	);
	const mountedRef = useRef(false);
	const accessRef = useRef<string | null>(null);
	accessRef.current = enabled ? cacheScope : null;
	const requestRef = useRef<AbortController | null>(null);
	const lockRef = useRef(false);
	const pathRef = useRef(path);
	pathRef.current = path;
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			requestRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		if (!file || file.type === 'application/pdf') {
			setPreview(null);
			return;
		}
		const url = URL.createObjectURL(file);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);
	const current = (scope: string) => mountedRef.current && accessRef.current === scope;
	const remember = (value: string | null) => {
		pathRef.current = value;
		setPath(value);
		try {
			if (value) {
				sessionStorage.setItem(storageKey, value);
			} else {
				sessionStorage.removeItem(storageKey);
			}
		} catch {}
	};
	const confirmed = async (scope: string) => {
		if (!current(scope)) {
			return;
		}
		remember(null);
		setFile(null);
		setNeedsCheck(false);
		setFeedback('Evidencia guardada en el gasto.');
		await client.invalidateQueries({ queryKey: key });
		if (current(scope)) {
			onUpdated();
		}
	};
	const execute = async (mode: 'save' | 'check' | 'cancel') => {
		const scope = accessRef.current;
		if (
			!scope ||
			lockRef.current ||
			(mode === 'save' && (!editable || needsCheck || (!file && !pathRef.current)))
		) {
			return;
		}
		lockRef.current = true;
		setBusy(true);
		setFeedback(null);
		const controller = new AbortController();
		requestRef.current = controller;
		let pendingPath = pathRef.current;
		try {
			if (mode === 'cancel') {
				if (pendingPath) {
					const existing = await leerArchivo(identity, controller.signal);
					if (existing.storagePath === pendingPath) {
						await confirmed(scope);
						return;
					}
					await descartarArchivo({ ...identity, storagePath: pendingPath }, controller.signal);
				}
				if (current(scope)) {
					remember(null);
					setFile(null);
					setNeedsCheck(false);
					setFeedback('La selección pendiente se quitó; el gasto sigue registrado.');
					onPendingCleared?.();
				}
				return;
			}
			if (mode === 'save') {
				if (!pendingPath) {
					if (!file) {
						return;
					}
					const uploaded = await subirArchivo({ ...identity, archivo: file }, controller.signal);
					pendingPath = uploaded.storagePath;
					if (!current(scope)) {
						return;
					}
					remember(pendingPath);
				}
				await asociarArchivo({ ...identity, storagePath: pendingPath }, controller.signal);
			}
			if (!pendingPath) {
				return;
			}
			const result = await leerArchivo(identity, controller.signal);
			if (!current(scope)) {
				return;
			}
			if (result.storagePath === pendingPath) {
				await confirmed(scope);
			} else {
				setNeedsCheck(false);
				setFeedback(
					editable
						? 'El archivo está cargado pero no asociado. Podés guardar esa misma carga o quitarla.'
						: 'El archivo no quedó asociado y la ventana de edición terminó. Quitá la carga pendiente; el gasto permanece registrado.',
				);
			}
		} catch (error) {
			if (!current(scope)) {
				return;
			}
			if (pendingPath) {
				try {
					const result = await leerArchivo(identity, controller.signal);
					if (!current(scope)) {
						return;
					}
					if (result.storagePath === pendingPath) {
						await confirmed(scope);
						return;
					}
					setNeedsCheck(false);
					setFeedback(
						editable
							? 'Gasto registrado; evidencia pendiente. Reintentá guardar la misma carga o quitala.'
							: 'Gasto registrado; no pudo asociarse la evidencia dentro de su ventana. Podés quitar la carga pendiente.',
					);
				} catch {
					setNeedsCheck(true);
					setFeedback(
						'No pudimos confirmar si el archivo quedó asociado. Consultá el resultado antes de guardar o quitar la carga.',
					);
				}
			} else {
				setFeedback(
					error instanceof Error
						? error.message
						: 'No se pudo cargar el archivo. El gasto sigue registrado.',
				);
			}
		} finally {
			if (current(scope)) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};
	return (
		<Paper variant="outlined" sx={{ p: 2.5 }}>
			<Stack spacing={2}>
				<Typography component="h3" variant="h6">
					Evidencia del gasto
				</Typography>
				{query.isError ? (
					<Alert
						severity="warning"
						action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
					>
						No pudimos consultar el adjunto.
					</Alert>
				) : query.data?.url ? (
					<Button
						component="a"
						href={query.data.url}
						target="_blank"
						rel="noopener noreferrer"
						variant="outlined"
						sx={{ alignSelf: 'flex-start' }}
					>
						Ver evidencia guardada
					</Button>
				) : (
					<Typography color="text.secondary">Este gasto no tiene evidencia adjunta.</Typography>
				)}
				{!editable && (
					<Typography variant="body2" color="text.secondary">
						La evidencia sólo puede modificarse mientras el gasto esté activo y dentro de su día de
						carga.
					</Typography>
				)}
				{(editable || path || file) && (
					<>
						<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
							<Button
								component="label"
								variant="outlined"
								disabled={!enabled || !editable || busy || !!path}
							>
								Elegir archivo
								<input
									type="file"
									hidden
									accept="image/jpeg,image/png,application/pdf"
									onChange={(event) => {
										const selected = event.target.files?.[0];
										event.target.value = '';
										if (!selected) {
											return;
										}
										if (
											!['image/jpeg', 'image/png', 'application/pdf'].includes(selected.type) ||
											selected.size <= 0 ||
											selected.size > 10 * 1024 * 1024
										) {
											setFeedback('Elegí un archivo JPG, PNG o PDF de hasta 10 MB.');
											return;
										}
										setFile(selected);
										setFeedback(null);
									}}
								/>
							</Button>
							{(file || path) && (
								<>
									<Button
										variant="contained"
										disabled={!enabled || !editable || busy || needsCheck}
										onClick={() => void execute('save')}
									>
										Guardar evidencia
									</Button>
									<Button
										disabled={!enabled || busy || needsCheck}
										onClick={() => void execute('cancel')}
									>
										Quitar selección pendiente
									</Button>
								</>
							)}
							{(needsCheck || path) && (
								<Button disabled={!enabled || busy} onClick={() => void execute('check')}>
									Consultar resultado
								</Button>
							)}
						</Stack>
						<Typography variant="caption" color="text.secondary">
							JPG, PNG o PDF de hasta 10 MB.
						</Typography>
						{file && (
							<Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
								{file.name} · {(file.size / 1024).toFixed(0)} KB
							</Typography>
						)}
						{preview && (
							<Box
								component="img"
								src={preview}
								alt="Vista previa de la evidencia elegida"
								sx={{
									maxWidth: '100%',
									maxHeight: 220,
									objectFit: 'contain',
									alignSelf: 'flex-start',
								}}
							/>
						)}
					</>
				)}
				{feedback && <Alert severity="info">{feedback}</Alert>}
			</Stack>
		</Paper>
	);
}

import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import {
	Alert,
	Avatar,
	Box,
	Button,
	CircularProgress,
	Paper,
	Stack,
	Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '#entities/session';
import { asociarArchivo, descartarArchivo, leerArchivo, subirArchivo } from '#shared/api';

export interface UpdateClubLogoProps {
	clubId: string;
	onUpdated?: () => void;
}
export function UpdateClubLogo(props: UpdateClubLogoProps) {
	const { cacheScope } = useAuth();
	return <PhotoEditor key={`${cacheScope}:${props.clubId}`} {...props} />;
}
function PhotoEditor({ clubId, onUpdated }: UpdateClubLogoProps) {
	const { cacheScope, profileStatus, isSigningOut, perfil } = useAuth();
	const enabled = profileStatus === 'ready' && !isSigningOut && perfil?.rol === 'admin';
	const identity = { tipo: 'club-logo' as const, entidadId: clubId, actorId: perfil?.id ?? '' };
	const queryClient = useQueryClient();
	const photoKey = ['club-logo', cacheScope, clubId];
	const photo = useQuery({
		queryKey: photoKey,
		queryFn: ({ signal }) => leerArchivo(identity, signal),
		enabled,
		retry: 1,
		staleTime: 8 * 60_000,
		refetchInterval: 8 * 60_000,
	});
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [pendingPath, setPendingPath] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [needsCheck, setNeedsCheck] = useState(false);
	const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);
	const activeRef = useRef(true);
	const accessRef = useRef(enabled);
	const controllerRef = useRef<AbortController | null>(null);
	const lockedRef = useRef(false);
	accessRef.current = enabled;
	useEffect(() => {
		activeRef.current = true;
		return () => {
			activeRef.current = false;
			controllerRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		if (!file) {
			setPreview(null);
			return;
		}
		const url = URL.createObjectURL(file);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);
	const current = () => activeRef.current && accessRef.current;
	const confirmed = async () => {
		setPendingPath(null);
		setNeedsCheck(false);
		setFile(null);
		await queryClient.invalidateQueries({ queryKey: photoKey });
		if (current()) {
			setFeedback({ message: 'Logo actualizado.', success: true });
			onUpdated?.();
		}
	};
	const verify = async (path: string, signal: AbortSignal) => {
		const result = await leerArchivo(identity, signal);
		return result.storagePath === path;
	};
	const save = async () => {
		if (!enabled || lockedRef.current || needsCheck || (!file && !pendingPath)) {
			return;
		}
		lockedRef.current = true;
		setBusy(true);
		setFeedback(null);
		const request = new AbortController();
		controllerRef.current = request;
		let path = pendingPath;
		try {
			if (!path) {
				if (!file) {
					return;
				}
				const uploaded = await subirArchivo({ ...identity, archivo: file }, request.signal);
				path = uploaded.storagePath;
				if (!current()) {
					return;
				}
				setPendingPath(path);
			}
			await asociarArchivo({ ...identity, storagePath: path }, request.signal);
			if (!(await verify(path, request.signal))) {
				throw new Error('La logo cargada todavía no figura en la configuración.');
			}
			if (current()) {
				await confirmed();
			}
		} catch (error) {
			if (!current()) {
				return;
			}
			if (path) {
				try {
					if (await verify(path, request.signal)) {
						if (current()) {
							await confirmed();
						}
						return;
					}
					if (current()) {
						setNeedsCheck(false);
						setFeedback({
							message:
								'La imagen se cargó, pero no quedó asociada. Podés reintentar guardar la misma carga o cancelarla.',
							success: false,
						});
					}
				} catch {
					if (current()) {
						setNeedsCheck(true);
						setFeedback({
							message:
								'No pudimos confirmar si la logo quedó asociada. Verificá el resultado antes de guardar o cancelar.',
							success: false,
						});
					}
				}
			} else {
				setFeedback({
					message: error instanceof Error ? error.message : 'No se pudo cargar la imagen.',
					success: false,
				});
			}
		} finally {
			if (current()) {
				lockedRef.current = false;
				setBusy(false);
			}
		}
	};
	const check = async () => {
		if (!pendingPath || lockedRef.current || !enabled) {
			return;
		}
		lockedRef.current = true;
		setBusy(true);
		const request = new AbortController();
		controllerRef.current = request;
		try {
			if (await verify(pendingPath, request.signal)) {
				if (current()) {
					await confirmed();
				}
			} else if (current()) {
				setNeedsCheck(false);
				setFeedback({
					message: 'La logo no está asociada. Podés volver a guardar la carga o cancelarla.',
					success: false,
				});
			}
		} catch {
			if (current()) {
				setFeedback({
					message:
						'La consulta sigue sin poder confirmarse. Volvé a verificar cuando se recupere la conexión.',
					success: false,
				});
			}
		} finally {
			if (current()) {
				lockedRef.current = false;
				setBusy(false);
			}
		}
	};
	const cancel = async () => {
		if (!enabled || lockedRef.current || needsCheck) {
			return;
		}
		lockedRef.current = true;
		setBusy(true);
		const request = new AbortController();
		controllerRef.current = request;
		try {
			if (pendingPath) {
				await descartarArchivo({ ...identity, storagePath: pendingPath }, request.signal);
			}
			if (current()) {
				setPendingPath(null);
				setFile(null);
				setFeedback(null);
			}
		} catch {
			if (current()) {
				setFeedback({
					message:
						'No se pudo descartar la carga. Conservamos su referencia para reintentar sin modificar la configuración.',
					success: false,
				});
			}
		} finally {
			if (current()) {
				lockedRef.current = false;
				setBusy(false);
			}
		}
	};
	return (
		<Paper variant="outlined" sx={{ p: 2.5 }}>
			<Typography component="h2" variant="h6" sx={{ mb: 2 }}>
				Logo del club
			</Typography>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				spacing={2.5}
				sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}
			>
				<Avatar
					variant="rounded"
					src={preview ?? photo.data?.url ?? undefined}
					alt="Logo del club"
					sx={{ width: 112, height: 112, bgcolor: 'action.hover', color: 'text.secondary' }}
				>
					<ImageOutlinedIcon sx={{ fontSize: 56 }} />
				</Avatar>
				<Box sx={{ minWidth: 0, flex: 1 }}>
					<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
						Imagen JPG o PNG de hasta 5 MB y 16 megapíxeles.
					</Typography>
					<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
						<Button
							component="label"
							variant="outlined"
							startIcon={<AddPhotoAlternateOutlinedIcon />}
							disabled={!enabled || busy || !!pendingPath}
						>
							Elegir imagen
							<input
								type="file"
								accept="image/jpeg,image/png"
								hidden
								onChange={(event) => {
									const selected = event.target.files?.[0];
									event.target.value = '';
									if (!selected) {
										return;
									}
									if (
										!['image/jpeg', 'image/png'].includes(selected.type) ||
										selected.size > 5 * 1024 * 1024 ||
										selected.size === 0
									) {
										setFeedback({
											message: 'Elegí una imagen JPG o PNG de hasta 5 MB.',
											success: false,
										});
										return;
									}
									setFile(selected);
									setFeedback(null);
								}}
							/>
						</Button>
						{(file || pendingPath) && (
							<>
								<Button
									variant="contained"
									disabled={busy || !enabled || needsCheck}
									onClick={() => void save()}
								>
									Guardar logo
								</Button>
								<Button disabled={busy || !enabled || needsCheck} onClick={() => void cancel()}>
									Cancelar
								</Button>
							</>
						)}
						{needsCheck && (
							<Button variant="outlined" disabled={busy || !enabled} onClick={() => void check()}>
								Verificar resultado
							</Button>
						)}
					</Stack>
					{file && (
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}
						>
							{file.name} · {(file.size / 1024).toFixed(0)} KB
						</Typography>
					)}
					{busy && <CircularProgress size={20} aria-label="Procesando logo" sx={{ mt: 1 }} />}
				</Box>
			</Stack>
			{photo.isError && (
				<Alert
					severity="warning"
					sx={{ mt: 2 }}
					action={<Button onClick={() => void photo.refetch()}>Reintentar</Button>}
				>
					No pudimos consultar la logo guardada.
				</Alert>
			)}
			{feedback && (
				<Alert severity={feedback.success ? 'success' : 'warning'} sx={{ mt: 2 }}>
					{feedback.message}
				</Alert>
			)}
		</Paper>
	);
}

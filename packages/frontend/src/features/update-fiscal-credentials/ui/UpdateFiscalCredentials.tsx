import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { Alert, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { getEstadoFiscal, guardarCredencialesFiscales } from '#entities/club';
import { useAuth } from '#entities/session';
import { formatIsoDateArg } from '#shared/lib/datePresets';

export function UpdateFiscalCredentials() {
	const { cacheScope } = useAuth();
	return <FiscalEditor key={cacheScope} />;
}

function FiscalEditor() {
	const { cacheScope, profileStatus, isSigningOut, perfil } = useAuth();
	const enabled = profileStatus === 'ready' && !isSigningOut && perfil?.rol === 'admin';
	const queryClient = useQueryClient();
	const key = ['club-fiscal', cacheScope];
	const query = useQuery({
		queryKey: key,
		queryFn: ({ signal }) => getEstadoFiscal(signal),
		enabled,
		retry: 1,
	});
	const [certificado, setCertificado] = useState<File | null>(null),
		[clave, setClave] = useState<File | null>(null);
	const [busy, setBusy] = useState(false),
		[feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null),
		[requiresCheck, setRequiresCheck] = useState(false);
	const activeRef = useRef(true),
		accessRef = useRef(enabled),
		controllerRef = useRef<AbortController | null>(null),
		lockRef = useRef(false);
	accessRef.current = enabled;

	useEffect(() => {
		activeRef.current = true;
		return () => {
			activeRef.current = false;
			controllerRef.current?.abort();
		};
	}, []);

	const current = () => activeRef.current && accessRef.current;

	const save = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!enabled || lockRef.current || requiresCheck || !certificado || !clave) {
			return;
		}
		if (certificado.size > 65_536 || clave.size > 32_768 || !certificado.size || !clave.size) {
			setFeedback({
				message: 'El certificado admite hasta 64 KB y la clave privada hasta 32 KB.',
				success: false,
			});
			return;
		}
		if (!/\.crt$/i.test(certificado.name) || !/\.key$/i.test(clave.name)) {
			setFeedback({
				message: 'Los archivos deben tener extensión .crt (certificado) y .key (clave privada).',
				success: false,
			});
			return;
		}
		lockRef.current = true;
		setBusy(true);
		setFeedback(null);
		const request = new AbortController();
		controllerRef.current = request;
		try {
			const result = await guardarCredencialesFiscales({ certificado, clave }, request.signal);
			if (current()) {
				queryClient.setQueryData(key, result);
				setCertificado(null);
				setClave(null);
				setFeedback({ message: 'Certificados ARCA de homologación guardados.', success: true });
			}
		} catch (error) {
			if (current()) {
				setRequiresCheck(true);
				setFeedback({
					message:
						error instanceof Error
							? `${error.message} Consultá el estado guardado antes de volver a enviar.`
							: 'No pudimos confirmar el guardado. Consultá el estado antes de volver a enviar.',
					success: false,
				});
			}
		} finally {
			if (current()) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};

	const check = async () => {
		if (!enabled || lockRef.current) {
			return;
		}
		lockRef.current = true;
		setBusy(true);
		try {
			const result = await query.refetch();
			if (result.isError) {
				throw new Error();
			}
			if (current()) {
				setRequiresCheck(false);
				setFeedback({
					message:
						'Estado actualizado. Si necesitás reemplazar los certificados, elegí ambos archivos y volvé a guardar.',
					success: false,
				});
			}
		} catch {
			if (current()) {
				setFeedback({
					message:
						'No pudimos consultar el estado guardado. Volvé a intentar cuando se recupere la conexión.',
					success: false,
				});
			}
		} finally {
			if (current()) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};

	const statusChip = !query.data
		? null
		: !query.data.configurado
			? { label: 'Sin configurar', color: 'default' as const }
			: query.data.alerta === 'vencido'
				? { label: 'Vencido', color: 'error' as const }
				: query.data.alerta === 'por_vencer'
					? { label: 'Por vencer', color: 'warning' as const }
					: { label: 'Vigente', color: 'success' as const };

	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Stack spacing={2}>
				<Stack
					direction="row"
					spacing={1}
					useFlexGap
					sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
				>
					<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
						<Chip size="small" color="primary" label="Paso 1" />
						<Typography variant="h6" component="h2">
							Certificados ARCA (Homologación)
						</Typography>
					</Stack>
					{statusChip && <Chip size="small" color={statusChip.color} label={statusChip.label} />}
				</Stack>

				<Typography variant="body2" color="text.secondary">
					Cargá el certificado digital (.crt) y su clave privada (.key). Por seguridad, los archivos
					guardados no se pueden volver a descargar.
				</Typography>

				{query.isPending && (
					<Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
						<CircularProgress size={18} aria-label="Consultando estado fiscal" />
						<Typography variant="body2" color="text.secondary">
							Consultando estado de credenciales…
						</Typography>
					</Stack>
				)}

				{query.isError && (
					<Alert
						severity="warning"
						action={
							<Button size="small" color="inherit" onClick={() => void check()} disabled={busy}>
								Reintentar
							</Button>
						}
					>
						No pudimos consultar el estado de los certificados.
					</Alert>
				)}

				{query.data && (
					<Alert
						severity={
							!query.data.configurado
								? 'info'
								: query.data.alerta === 'vencido'
									? 'error'
									: query.data.alerta === 'por_vencer'
										? 'warning'
										: 'success'
						}
					>
						{query.data.configurado
							? `Certificado activo · Vencimiento: ${formatIsoDateArg(query.data.vencimiento)}. ${
									query.data.alerta === 'vencido'
										? 'Requiere renovación inmediata.'
										: query.data.alerta === 'por_vencer'
											? 'Restan 30 días o menos para su vencimiento.'
											: ''
								}`
							: 'Todavía no hay certificados fiscales ARCA cargados.'}
					</Alert>
				)}

				<Stack component="form" onSubmit={(event) => void save(event)} spacing={2}>
					<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
						<Button
							component="label"
							variant="outlined"
							size="small"
							startIcon={<UploadFileOutlinedIcon />}
							disabled={!enabled || busy || requiresCheck}
						>
							Elegir certificado (.crt)
							<input
								type="file"
								accept=".crt"
								hidden
								onChange={(event) => {
									setCertificado(event.target.files?.[0] ?? null);
									setFeedback(null);
									event.target.value = '';
								}}
							/>
						</Button>
						<Button
							component="label"
							variant="outlined"
							size="small"
							startIcon={<UploadFileOutlinedIcon />}
							disabled={!enabled || busy || requiresCheck}
						>
							Elegir clave privada (.key)
							<input
								type="file"
								accept=".key"
								hidden
								onChange={(event) => {
									setClave(event.target.files?.[0] ?? null);
									setFeedback(null);
									event.target.value = '';
								}}
							/>
						</Button>
					</Stack>

					{(certificado || clave) && (
						<Stack spacing={0.5} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
							{certificado && (
								<Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
									<strong>Certificado:</strong> {certificado.name}
								</Typography>
							)}
							{clave && (
								<Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
									<strong>Clave privada:</strong> {clave.name}
								</Typography>
							)}
						</Stack>
					)}

					<Typography variant="caption" color="text.secondary">
						La fecha de vencimiento se lee automáticamente del certificado al guardar.
					</Typography>

					{feedback && (
						<Alert severity={feedback.success ? 'success' : 'warning'}>{feedback.message}</Alert>
					)}

					<Stack
						direction="row"
						spacing={1}
						useFlexGap
						sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}
					>
						{requiresCheck && (
							<Button variant="outlined" onClick={() => void check()} disabled={busy}>
								Consultar estado guardado
							</Button>
						)}
						<Button
							type="submit"
							variant="contained"
							startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
							disabled={!enabled || busy || requiresCheck || !certificado || !clave}
						>
							{busy ? 'Guardando…' : 'Guardar certificados ARCA'}
						</Button>
					</Stack>
				</Stack>
			</Stack>
		</Paper>
	);
}

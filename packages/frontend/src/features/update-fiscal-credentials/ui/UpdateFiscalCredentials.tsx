import { Alert, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { getEstadoFiscal, guardarCredencialesFiscales } from '#entities/club';
import { useAuth } from '#entities/session';

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
		lockRef.current = true;
		setBusy(true);
		setFeedback(null);
		const request = new AbortController();
		controllerRef.current = request;
		try {
			if (certificado.size > 65_536 || clave.size > 32_768 || !certificado.size || !clave.size) {
				throw new Error('Certificado: hasta 64 KB; clave: hasta 32 KB.');
			}
			if (!/\.crt$/i.test(certificado.name) || !/\.key$/i.test(clave.name)) {
				throw new Error('Los archivos del certificado deben ser .crt y .key');
			}
			const result = await guardarCredencialesFiscales({ certificado, clave }, request.signal);
			if (current()) {
				queryClient.setQueryData(key, result);
				setCertificado(null);
				setClave(null);
				setFeedback({ message: 'Credenciales de homologación guardadas.', success: true });
			}
		} catch (error) {
			if (current()) {
				setRequiresCheck(true);
				setFeedback({
					message:
						error instanceof Error
							? `${error.message} Consultá el estado guardado antes de volver a enviar.`
							: 'No se pudo confirmar el guardado. Consultá el estado antes de volver a enviar.',
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
						'Estado actualizado. Si necesitás reemplazar la pareja, revisá los archivos y volvé a guardar.',
					success: false,
				});
			}
		} catch {
			if (current()) {
				setFeedback({
					message:
						'No se pudo consultar el estado guardado. Volvé a intentar cuando se recupere la conexión.',
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
	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Typography variant="h6" component="h2" sx={{ mb: 1 }}>
				Credenciales fiscales · Homologación
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Cargá el certificado y su clave correspondiente. Los archivos guardados no se pueden
				descargar desde esta pantalla.
			</Typography>
			{query.isPending && <CircularProgress size={22} aria-label="Consultando estado fiscal" />}
			{query.isError && (
				<Alert
					severity="warning"
					action={
						<Button onClick={() => void check()} disabled={busy}>
							Reintentar
						</Button>
					}
				>
					No pudimos consultar el estado de las credenciales.
				</Alert>
			)}
			{query.data && (
				<Alert
					severity={
						query.data.alerta === 'vencido'
							? 'error'
							: query.data.alerta === 'por_vencer'
								? 'warning'
								: 'info'
					}
					sx={{ mb: 2 }}
				>
					{query.data.configurado
						? `Certificado cargado. Vencimiento: ${query.data.vencimiento}. ${query.data.alerta === 'vencido' ? 'Requiere renovación.' : query.data.alerta === 'por_vencer' ? 'Restan 30 días o menos para su vencimiento.' : ''}`
						: 'Todavía no hay credenciales fiscales cargadas.'}
				</Alert>
			)}
			<Stack component="form" onSubmit={(event) => void save(event)} spacing={2}>
				<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
					<Button component="label" variant="outlined" disabled={!enabled || busy || requiresCheck}>
						Elegir certificado CRT
						<input
							type="file"
							accept=".crt"
							hidden
							onChange={(event) => {
								setCertificado(event.target.files?.[0] ?? null);
								event.target.value = '';
							}}
						/>
					</Button>
					<Button component="label" variant="outlined" disabled={!enabled || busy || requiresCheck}>
						Elegir clave KEY
						<input
							type="file"
							accept=".key"
							hidden
							onChange={(event) => {
								setClave(event.target.files?.[0] ?? null);
								event.target.value = '';
							}}
						/>
					</Button>
				</Stack>
				{certificado && (
					<Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
						Certificado: {certificado.name}
					</Typography>
				)}
				{clave && (
					<Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
						Clave: {clave.name}
					</Typography>
				)}
				<Typography variant="body2" color="text.secondary">
					El vencimiento se obtiene automáticamente del certificado al guardar.
				</Typography>
				{feedback && (
					<Alert severity={feedback.success ? 'success' : 'warning'}>{feedback.message}</Alert>
				)}
				<Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
					{requiresCheck && (
						<Button onClick={() => void check()} disabled={busy}>
							Consultar estado guardado
						</Button>
					)}
					<Button
						type="submit"
						variant="contained"
						disabled={!enabled || busy || requiresCheck || !certificado || !clave}
					>
						{busy ? 'Procesando…' : 'Guardar pareja'}
					</Button>
				</Stack>
			</Stack>
		</Paper>
	);
}

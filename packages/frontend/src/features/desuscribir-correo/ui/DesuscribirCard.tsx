import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { confirmarBajaCorreo, verificarEnlaceBaja } from '../api/desuscribir.api';
import {
	type EstadoBajaCorreo,
	leerParametrosBaja,
	MENSAJES_BAJA_CORREO,
} from '../model/desuscribirContract';

export function DesuscribirCard() {
	const [searchParams] = useSearchParams();
	const params = useMemo(() => leerParametrosBaja(searchParams), [searchParams]);
	const [estado, setEstado] = useState<EstadoBajaCorreo | 'cargando' | 'error_verificacion'>(() =>
		params ? 'cargando' : 'invalido',
	);
	const [enviando, setEnviando] = useState(false);
	const mountedRef = useRef(false);
	const verifyAbortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			verifyAbortRef.current?.abort();
		};
	}, []);

	const verificar = useCallback(() => {
		verifyAbortRef.current?.abort();
		if (!params) {
			setEstado('invalido');
			return;
		}
		const controller = new AbortController();
		verifyAbortRef.current = controller;
		setEstado('cargando');
		void verificarEnlaceBaja(params, controller.signal)
			.then((resultado) => {
				if (mountedRef.current && !controller.signal.aborted) {
					setEstado(resultado);
				}
			})
			.catch(() => {
				if (mountedRef.current && !controller.signal.aborted) {
					setEstado('error_verificacion');
				}
			});
	}, [params]);

	useEffect(() => {
		verificar();
		return () => verifyAbortRef.current?.abort();
	}, [verificar]);

	const confirmar = async () => {
		if (!params || enviando) {
			return;
		}
		setEnviando(true);
		try {
			const resultado = await confirmarBajaCorreo(params);
			if (mountedRef.current) {
				setEstado(resultado);
			}
		} catch {
			if (mountedRef.current) {
				setEstado('error');
			}
		} finally {
			if (mountedRef.current) {
				setEnviando(false);
			}
		}
	};

	const contenido =
		estado === 'cargando'
			? null
			: estado === 'error_verificacion'
				? {
						titulo: 'No pudimos verificar el enlace',
						descripcion:
							'No pudimos comprobar el enlace en este momento. Revisá tu conexión y volvé a intentarlo.',
						severidad: 'error' as const,
					}
				: MENSAJES_BAJA_CORREO[estado];
	const mostrarPie = estado !== 'invalido' && estado !== 'error' && estado !== 'error_verificacion';

	return (
		<Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: '100%', boxSizing: 'border-box' }}>
			<Stack spacing={2.5}>
				<Typography variant="overline" color="text.secondary">
					Comunicaciones del club
				</Typography>
				{estado === 'cargando' ? (
					<Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
						<CircularProgress size={22} aria-label="Verificando enlace de baja" />
						<Typography>Verificando el enlace…</Typography>
					</Box>
				) : (
					contenido && (
						<>
							<Typography component="h1" variant="h5">
								{contenido.titulo}
							</Typography>
							{estado === 'confirmar' ? (
								<>
									<Typography color="text.secondary">{contenido.descripcion}</Typography>
									<Button
										variant="contained"
										size="large"
										startIcon={
											enviando ? <CircularProgress size={16} color="inherit" /> : undefined
										}
										disabled={enviando}
										onClick={() => void confirmar()}
									>
										{enviando ? 'Confirmando baja…' : 'Confirmar baja'}
									</Button>
								</>
							) : (
								<Alert severity={contenido.severidad}>{contenido.descripcion}</Alert>
							)}
							{estado === 'error_verificacion' && params && (
								<Button variant="outlined" onClick={verificar}>
									Volver a intentar
								</Button>
							)}
							{estado === 'error' && params && (
								<Button variant="outlined" disabled={enviando} onClick={() => void confirmar()}>
									Volver a intentar
								</Button>
							)}
							{mostrarPie && (
								<Typography
									variant="body2"
									color="text.secondary"
									sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}
								>
									Esta preferencia afecta las comunicaciones generales. Para volver a recibirlas,
									podés solicitarlo al club.
								</Typography>
							)}
						</>
					)
				)}
			</Stack>
		</Paper>
	);
}

import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Paper,
	Stack,
	Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { getEstadoComprobante } from '#entities/comprobante';
import {
	type AccionMonitoreo,
	ejecutarAccionFiscal,
	type FilaMonitoreo,
	tituloAccionFiscal,
} from '#entities/monitoreo-fiscal';
import { useAuth } from '#entities/session';
import { monedaCobranza } from '#shared/types/cobranza';

type FeedbackTone = 'success' | 'error' | 'warning' | 'info';

function estadoConsultadoLabel(estado: string): string {
	if (estado === 'valido') {
		return 'Autorizado';
	}
	if (estado === 'anulado') {
		return 'Documento anulado';
	}
	if (estado === 'anulacion_pendiente') {
		return 'Anulación fiscal pendiente';
	}
	if (estado === 'fallido') {
		return 'Error ARCA';
	}
	return 'Pendiente ARCA';
}

export function AccionFiscalDialog({
	accion,
	fila,
	onClose,
	onUpdated,
}: {
	accion: AccionMonitoreo;
	fila: FilaMonitoreo;
	onClose: () => void;
	onUpdated: () => void;
}) {
	const { perfil, profileStatus, isSigningOut } = useAuth(),
		actorId = perfil?.id ?? '';
	const controllerRef = useRef<AbortController | null>(null),
		generationRef = useRef(0),
		lockRef = useRef(false);
	const [busy, setBusy] = useState(false),
		[needsCheck, setNeedsCheck] = useState(false),
		[done, setDone] = useState(false),
		[feedback, setFeedback] = useState<{ message: string; severity: FeedbackTone } | null>(null);

	useEffect(
		() => () => {
			generationRef.current++;
			controllerRef.current?.abort();
		},
		[],
	);

	const run = async (check: boolean) => {
		if (lockRef.current || profileStatus !== 'ready' || isSigningOut || perfil?.rol !== 'admin') {
			return;
		}
		lockRef.current = true;
		setBusy(true);
		setFeedback(null);
		const gen = generationRef.current,
			abort = new AbortController();
		controllerRef.current = abort;
		try {
			if (check) {
				const state = await getEstadoComprobante(fila.comprobanteId, actorId, abort.signal);
				if (gen !== generationRef.current) {
					return;
				}
				setFeedback({
					severity: state.estadoFiscal === 'valido' ? 'success' : 'info',
					message: `Estado actual en ARCA: ${estadoConsultadoLabel(state.estadoFiscal)}. Revisá el listado actualizado antes de decidir otra acción.`,
				});
				setNeedsCheck(false);
				setDone(true);
				onUpdated();
			} else {
				const before = await getEstadoComprobante(fila.comprobanteId, actorId, abort.signal);
				if (gen !== generationRef.current) {
					return;
				}
				if (
					['valido', 'anulado'].includes(before.estadoFiscal) ||
					(accion === 'reabrir' && before.estadoFiscal !== 'fallido') ||
					(accion === 'resolver' && before.estadoFiscal !== 'anulacion_pendiente')
				) {
					setFeedback({
						severity: 'info',
						message:
							'El estado del comprobante ya cambió. No se repitió la acción; revisá el listado actualizado.',
					});
					setDone(true);
					onUpdated();
					return;
				}
				const result = await ejecutarAccionFiscal(
					accion,
					fila.comprobanteId,
					actorId,
					abort.signal,
				);
				if (gen !== generationRef.current) {
					return;
				}
				const severityByResult: Record<typeof result.resultado, FeedbackTone> = {
					autorizado: 'success',
					reabierto: 'success',
					resuelto: 'success',
					rechazado: 'error',
					bloqueado: 'warning',
					pendiente: 'info',
					en_proceso: 'info',
					sin_cambios: 'info',
				};
				const messageByResult: Record<typeof result.resultado, string> = {
					autorizado: 'Comprobante autorizado correctamente por ARCA.',
					rechazado: 'ARCA rechazó la solicitud. Revisá el detalle de la incidencia.',
					pendiente: 'La solicitud sigue pendiente de confirmación en ARCA.',
					en_proceso: 'Ya hay una solicitud en curso. Consultá el estado en unos segundos.',
					bloqueado: 'No se pudo completar la acción: revisá el detalle de la incidencia.',
					reabierto: 'Plazo de regularización reabierto correctamente.',
					resuelto: 'Anulación fiscal conciliada correctamente.',
					sin_cambios: 'El comprobante no requirió modificaciones.',
				};
				setFeedback({
					severity: result.advertencia ? 'warning' : severityByResult[result.resultado],
					message: result.advertencia ?? messageByResult[result.resultado],
				});
				setDone(true);
				onUpdated();
			}
		} catch (error) {
			if (gen === generationRef.current) {
				setFeedback({
					severity: 'warning',
					message: error instanceof Error ? error.message : 'No se obtuvo confirmación.',
				});
				setNeedsCheck(true);
			}
		} finally {
			if (gen === generationRef.current) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};

	const help =
		accion === 'forzar'
			? 'Se hará un nuevo intento de autorización ante ARCA dentro del límite permitido. Si hubo un intento anterior sin respuesta clara, primero se verificará su resultado para evitar duplicados.'
			: accion === 'reabrir'
				? 'Se verificará el intento anterior en ARCA antes de reiniciar el plazo y los reintentos automáticos. Si el problema original persiste, la incidencia seguirá visible en el listado.'
				: accion === 'resolver'
					? 'Se revisará primero si el comprobante llegó a enviarse a ARCA. Si hace falta consultar el estado remoto, se requiere la configuración fiscal completa. Cuando corresponda, se conservará una única Nota de Crédito.'
					: 'Se consultará directamente en ARCA usando los datos ya registrados del comprobante. No se permite cargar un CAE manual sin validación.';

	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			aria-labelledby="accion-fiscal-title"
			onClose={() => {
				if (!busy) {
					onClose();
				}
			}}
		>
			<DialogTitle id="accion-fiscal-title">{tituloAccionFiscal(accion)}</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ alignItems: 'center', justifyContent: 'space-between' }}
						>
							<Box sx={{ minWidth: 0 }}>
								<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
									{fila.socio.apellido}, {fila.socio.nombre}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{fila.tipo === 'nota_credito' ? 'Nota de Crédito C' : 'Factura C'} · Socio #
									{fila.socio.nroSocio}
								</Typography>
							</Box>
							<Typography
								variant="subtitle1"
								sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
							>
								{monedaCobranza(fila.monto)}
							</Typography>
						</Stack>
					</Paper>

					<Typography variant="body2">{help}</Typography>

					<Alert severity="info">
						Esta acción impacta únicamente en la documentación fiscal ante ARCA. El cobro, la cuota
						y la caja mantienen su estado actual.
					</Alert>

					{feedback && (
						<Alert severity={needsCheck ? 'warning' : feedback.severity}>
							{feedback.message}
							{needsCheck ? ' Consultá el estado antes de volver a enviar.' : ''}
						</Alert>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={busy} onClick={onClose}>
					Cerrar
				</Button>
				{needsCheck ? (
					<Button
						disabled={busy}
						startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
						onClick={() => void run(true)}
					>
						{busy ? 'Consultando…' : 'Consultar estado'}
					</Button>
				) : (
					!done && (
						<Button
							variant="contained"
							disabled={busy}
							startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
							onClick={() => void run(false)}
						>
							{busy ? 'Procesando…' : 'Confirmar'}
						</Button>
					)
				)}
			</DialogActions>
		</Dialog>
	);
}

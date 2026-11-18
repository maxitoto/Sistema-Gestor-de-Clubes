import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
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
		[feedback, setFeedback] = useState<string | null>(null);
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
				setFeedback(
					`Estado consultado: ${state.estadoFiscal === 'valido' ? 'Autorizado' : state.estadoFiscal === 'anulado' ? 'Documento anulado' : state.estadoFiscal === 'anulacion_pendiente' ? 'Anulación fiscal pendiente' : state.estadoFiscal === 'fallido' ? 'Fiscal fallido' : 'Pendiente de CAE'}. Revisá el listado actualizado antes de decidir otra acción.`,
				);
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
					setFeedback('El estado cambió. No se repitió la acción; revisá la consulta actualizada.');
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
				setFeedback(
					result.advertencia ??
						{
							autorizado: 'Autorización fiscal confirmada.',
							rechazado: 'La solicitud fiscal fue rechazada; revisá la incidencia.',
							pendiente: 'La operación permanece pendiente.',
							en_proceso: 'Hay una operación en proceso. Consultá el estado.',
							bloqueado: 'La operación requiere resolver la incidencia indicada.',
							reabierto: 'Regularización reabierta.',
							resuelto: 'Resolución fiscal confirmada.',
							sin_cambios: 'No se modificó el comprobante.',
						}[result.resultado],
				);
				setDone(true);
				onUpdated();
			}
		} catch (error) {
			if (gen === generationRef.current) {
				setFeedback(error instanceof Error ? error.message : 'No se obtuvo confirmación.');
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
			? 'Se usará el mismo presupuesto de regularización que los reintentos automáticos. Si hay una respuesta incierta, se consultará el intento existente.'
			: accion === 'reabrir'
				? 'La reapertura verifica el intento anterior antes de reiniciar el plazo y los reintentos. Una respuesta incompatible o incierta conservará la incidencia.'
				: accion === 'resolver'
					? 'Se verificará primero si el historial permite confirmar que no hubo envío. Si hace falta consultar ARCA, se requiere completar su configuración. La resolución conserva una única Nota de Crédito cuando corresponde.'
					: 'Se consultará la identidad del comprobante ya registrada. Un CAE ingresado libremente no acredita una regularización y no se admite desde esta pantalla.';
	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			onClose={() => {
				if (!busy) {
					onClose();
				}
			}}
		>
			<DialogTitle>{tituloAccionFiscal(accion)}</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Typography>
						{fila.socio.apellido}, {fila.socio.nombre} ·{' '}
						{fila.tipo === 'nota_credito' ? 'Nota de Crédito' : 'Factura'}
					</Typography>
					<Typography>{help}</Typography>
					<Alert severity="info">
						Esta acción sólo resuelve documentación fiscal. Conserva el estado actual de pago, cuota
						y caja, incluido cualquier recobro posterior.
					</Alert>
					{feedback && (
						<Alert severity={needsCheck ? 'warning' : 'info'}>
							{feedback}
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
					<Button disabled={busy} onClick={() => void run(true)}>
						Consultar estado
					</Button>
				) : (
					!done && (
						<Button variant="contained" disabled={busy} onClick={() => void run(false)}>
							Confirmar
						</Button>
					)
				)}
			</DialogActions>
		</Dialog>
	);
}

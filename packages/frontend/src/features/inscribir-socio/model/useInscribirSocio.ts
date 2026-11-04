import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
	confirmarInscripcion,
	consultarResultadoInscripcion,
	type IdentidadInscripcion,
	mismaVistaPrevia,
	previsualizarInscripcion,
	type ResultadoInscripcion,
	recuperarInscripcion,
	type VistaPreviaInscripcion,
} from '#entities/inscripcion';
import { useAuth } from '#entities/session';
import {
	guardarIntentoInscripcion,
	type IntentoInscripcion,
	leerIntentoInscripcion,
	quitarIntentoInscripcion,
	requiereRecuperacionInscripcion,
} from './intentoInscripcion';

interface Options {
	open: boolean;
	socioId: string;
	categoriaId: string;
	deporteId: string;
	selectionEnabled: boolean;
}
type Attempt = { scope: string; generation: number };
type Tracking = { ticket: IntentoInscripcion | null; error: boolean };
function loadTracking(userId: string | undefined, socioId: string): Tracking {
	if (!userId) {
		return { ticket: null, error: false };
	}
	try {
		return { ticket: leerIntentoInscripcion(userId, socioId), error: false };
	} catch {
		return { ticket: null, error: true };
	}
}
export function useInscribirSocio(options: Options) {
	const { cacheScope, profileStatus, user, perfil, isSigningOut } = useAuth();
	const client = useQueryClient();
	const userId = user?.id;
	const enabled =
		options.open &&
		profileStatus === 'ready' &&
		perfil?.estado === 'activo' &&
		!isSigningOut &&
		Boolean(userId);
	const identity: IdentidadInscripcion = {
		socioId: options.socioId,
		categoriaId: options.categoriaId,
	};
	const access = enabled ? `${cacheScope}:${options.socioId}:${options.categoriaId}` : null;
	const accessRef = useRef(access);
	accessRef.current = access;
	const mountedRef = useRef(false);
	const generationRef = useRef(0);
	const requestRef = useRef<AbortController | null>(null);
	const lockedRef = useRef(false);
	const [tracking, setTracking] = useState(() => loadTracking(userId, options.socioId));
	const [working, setWorking] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [result, setResult] = useState<ResultadoInscripcion | null>(null);
	const queryKey = [
		'inscripciones',
		cacheScope,
		'previsualizacion',
		options.socioId,
		options.categoriaId,
	];
	const previewQuery = useQuery({
		queryKey,
		queryFn: ({ signal }) => previsualizarInscripcion(identity, signal),
		enabled: enabled && options.selectionEnabled && !tracking.ticket && !tracking.error && !result,
		retry: 1,
	});
	const mutation = useMutation({
		mutationFn: ({ selected, signal }: { selected: IdentidadInscripcion; signal: AbortSignal }) =>
			confirmarInscripcion(selected, signal),
		retry: false,
	});
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			generationRef.current += 1;
			requestRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		accessRef.current = access;
		setTracking(loadTracking(userId, options.socioId));
		setResult(null);
		setFeedback(null);
		setWorking(false);
		lockedRef.current = false;
		return () => {
			generationRef.current += 1;
			requestRef.current?.abort();
			lockedRef.current = false;
		};
	}, [userId, options.socioId, access]);

	const current = (attempt: Attempt) =>
		mountedRef.current &&
		accessRef.current === attempt.scope &&
		generationRef.current === attempt.generation;
	const invalidate = () => {
		for (const key of ['inscripciones', 'cuotas', 'socios', 'estado-socio']) {
			void client.invalidateQueries({ queryKey: [key, cacheScope], refetchType: 'none' });
		}
	};
	const clearTracking = () => {
		if (userId) {
			try {
				quitarIntentoInscripcion(userId, options.socioId);
			} catch {
				// El registro persistido seguirá exigiendo verificación tras una recarga.
			}
		}
		setTracking({ ticket: null, error: false });
	};
	const recover = async (ticket: IntentoInscripcion, attempt: Attempt, signal: AbortSignal) => {
		const recovered = await recuperarInscripcion(
			{
				socioId: ticket.socioId,
				categoriaId: ticket.categoriaId,
			},
			signal,
		);
		if (!current(attempt)) {
			return;
		}
		if (recovered.estado === 'recuperada') {
			setResult(recovered.resultado);
			clearTracking();
			setFeedback(null);
			invalidate();
		} else {
			setFeedback(
				recovered.estado === 'incompleta'
					? 'Existe una inscripción activa, pero no pudimos verificar su cuota del período de alta. No se habilitará otro envío.'
					: 'No se encontró una inscripción activa. El intento anterior sigue sin confirmarse; consultá nuevamente antes de realizar cualquier otra escritura.',
			);
		}
	};

	const confirm = async (approved: VistaPreviaInscripcion) => {
		if (
			!access ||
			!userId ||
			lockedRef.current ||
			tracking.ticket ||
			tracking.error ||
			!options.selectionEnabled ||
			!approved.detalle ||
			result
		) {
			return;
		}
		lockedRef.current = true;
		setWorking(true);
		setFeedback(null);
		const attempt = { scope: access, generation: ++generationRef.current };
		const controller = new AbortController();
		requestRef.current = controller;
		let ticket: IntentoInscripcion | null = null;
		let sent = false;
		let responseReceived = false;
		try {
			// Toda confirmación vuelve a leer fecha, arancel y cargos del servidor.
			const fresh = await previsualizarInscripcion(identity, controller.signal);
			if (!current(attempt)) {
				return;
			}
			if (!fresh.detalle || !mismaVistaPrevia(approved, fresh)) {
				client.setQueryData(queryKey, fresh);
				setFeedback(
					'La previsualización cambió. Revisá los valores actualizados y confirmá nuevamente.',
				);
				return;
			}
			const existing = await recuperarInscripcion(identity, controller.signal);
			if (!current(attempt)) {
				return;
			}
			if (existing.estado === 'recuperada') {
				setResult(existing.resultado);
				invalidate();
				return;
			}
			ticket = {
				version: 1,
				socioId: options.socioId,
				categoriaId: options.categoriaId,
				deporteId: options.deporteId,
				fechaClub: fresh.fecha,
			};
			guardarIntentoInscripcion(userId, ticket);
			setTracking({ ticket, error: false });
			if (existing.estado === 'incompleta') {
				setFeedback(
					'La inscripción activa no tiene una cuota verificable. Consultá el resultado antes de continuar.',
				);
				return;
			}
			sent = true;
			const response = await mutation.mutateAsync({
				selected: identity,
				signal: controller.signal,
			});
			responseReceived = true;
			const saved = await consultarResultadoInscripcion(identity, response, controller.signal);
			if (!current(attempt)) {
				return;
			}
			setResult(saved);
			clearTracking();
			invalidate();
		} catch (error) {
			if (!current(attempt)) {
				return;
			}
			if (sent && ticket && requiereRecuperacionInscripcion(responseReceived, error)) {
				setFeedback(
					'La respuesta es incierta. Consultamos la inscripción y su cuota antes de habilitar otro envío.',
				);
				try {
					await recover(ticket, attempt, controller.signal);
				} catch {
					if (current(attempt)) {
						setFeedback(
							'No se pudo verificar el resultado. El envío permanece bloqueado; usá Consultar resultado para recuperar la inscripción y su cuota.',
						);
					}
				}
			} else {
				if (sent) {
					clearTracking();
				}
				setFeedback(
					sent
						? 'El servidor rechazó la inscripción. Actualizá los datos y verificá que socio, categoría y deporte sigan activos y que no exista una inscripción activa.'
						: 'No pudimos verificar los datos previos o guardar el seguimiento local. No se envió una inscripción; actualizá la información antes de continuar.',
				);
			}
		} finally {
			if (current(attempt)) {
				lockedRef.current = false;
				setWorking(false);
			}
		}
	};
	const checkResult = async () => {
		if (!access || !tracking.ticket || lockedRef.current) {
			return;
		}
		lockedRef.current = true;
		setWorking(true);
		const attempt = { scope: access, generation: ++generationRef.current };
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			await recover(tracking.ticket, attempt, controller.signal);
		} catch {
			if (current(attempt)) {
				setFeedback(
					'No pudimos consultar el resultado. La inscripción permanece bloqueada para evitar otro envío incierto.',
				);
			}
		} finally {
			if (current(attempt)) {
				lockedRef.current = false;
				setWorking(false);
			}
		}
	};
	return {
		enabled,
		previewQuery,
		confirm,
		checkResult,
		feedback,
		result: result?.inscripcion.categoria_id === options.categoriaId ? result : null,
		pendingTicket: tracking.ticket,
		trackingError: tracking.error,
		isPending: working || mutation.isPending,
	};
}

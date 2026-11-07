import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getCuotaCobranza } from '#entities/cuota';
import { cobrarCuota, consultarCobroConfirmado, type SolicitudCobro } from '#entities/pago';
import { useAuth } from '#entities/session';
import { clasificarErrorCreacion } from '#shared/lib/useHumanCreate';
import type { FilaCobranza } from '#shared/types/cobranza';
import { cobroVerificado, type IntentoCobro, parseIntentoCobro } from './cobroContract';
export interface CobroConfirmado {
	pago: FilaCobranza;
	origen: 'registrado' | 'recuperado' | 'existente';
}
export function useCobrarCuota(cuotaId: string, onConfirmed: (result: CobroConfirmado) => void) {
	const { perfil, cacheScope, profileStatus } = useAuth();
	const usuarioId = perfil?.id ?? '';
	const enabled = profileStatus === 'ready' && !!usuarioId;
	const client = useQueryClient();
	const [pending, setPending] = useState(false);
	const [requiresCheck, setRequiresCheckState] = useState(false);
	const [canRetry, setCanRetry] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const mountedRef = useRef(false);
	const activeRef = useRef<string | null>(null);
	activeRef.current = enabled ? cacheScope : null;
	const generationRef = useRef(0);
	const lockedRef = useRef(false);
	const requestRef = useRef<AbortController | null>(null);
	const attemptedRef = useRef<IntentoCobro | null>(null);
	const needsCheckRef = useRef(false);
	const confirmedRef = useRef(onConfirmed);
	confirmedRef.current = onConfirmed;
	const key = `club:cobro:${usuarioId}:${cuotaId}`;
	const needsCheck = (value: boolean) => {
		needsCheckRef.current = value;
		setRequiresCheckState(value);
	};
	const current = (scope: string, version: number) =>
		mountedRef.current && activeRef.current === scope && generationRef.current === version;
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			generationRef.current++;
			requestRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		activeRef.current = enabled ? cacheScope : null;
		generationRef.current++;
		requestRef.current?.abort();
		lockedRef.current = false;
		setPending(false);
		setFeedback(null);
		setCanRetry(false);
		attemptedRef.current = null;
		needsCheckRef.current = false;
		setRequiresCheckState(false);
		try {
			const saved = sessionStorage.getItem(key);
			const ticket = saved ? parseIntentoCobro(JSON.parse(saved), usuarioId, cuotaId) : null;
			if (ticket) {
				attemptedRef.current = ticket;
				needsCheckRef.current = true;
				setRequiresCheckState(true);
				setFeedback(
					'Este cobro tiene un resultado pendiente de verificar. Consultalo antes de confirmar otro intento.',
				);
			}
		} catch {
			setFeedback(
				'No pudimos recuperar el intento anterior. Consultá el historial antes de cobrar.',
			);
		}
		return () => {
			generationRef.current++;
			requestRef.current?.abort();
		};
	}, [key, usuarioId, cuotaId, cacheScope, enabled]);
	const saveTicket = (ticket: IntentoCobro) => {
		sessionStorage.setItem(key, JSON.stringify(ticket));
		attemptedRef.current = ticket;
	};
	const clearTicket = () => {
		attemptedRef.current = null;
		try {
			sessionStorage.removeItem(key);
		} catch {}
	};
	const complete = async (
		pago: FilaCobranza,
		origen: CobroConfirmado['origen'],
		scope: string,
		version: number,
	) => {
		if (!current(scope, version)) {
			return;
		}
		clearTicket();
		needsCheck(false);
		setCanRetry(false);
		setFeedback(null);
		await Promise.all(
			[
				'pagos',
				'cuotas',
				'socios',
				'socio',
				'socio-deuda',
				'caja',
				'movimientos-caja',
				'flujo-caja',
			].map((root) => client.invalidateQueries({ queryKey: [root, scope], refetchType: 'none' })),
		);
		if (current(scope, version)) {
			confirmedRef.current({ pago, origen });
		}
	};
	const reconcile = async () => {
		const scope = activeRef.current;
		const ticket = attemptedRef.current;
		if (!scope || !ticket || lockedRef.current) {
			return;
		}
		lockedRef.current = true;
		setPending(true);
		const version = ++generationRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			const result = await consultarCobroConfirmado(
				cuotaId,
				usuarioId,
				ticket.comprobanteId,
				controller.signal,
			);
			if (!current(scope, version)) {
				return;
			}
			if (cobroVerificado(result, cuotaId, ticket.comprobanteId)) {
				await complete(result, ticket.comprobanteId ? 'recuperado' : 'existente', scope, version);
				return;
			}
			const quota = await getCuotaCobranza(cuotaId, usuarioId, controller.signal);
			if (!current(scope, version)) {
				return;
			}
			setCanRetry(quota?.estado_cuota === 'pendiente');
			setFeedback(
				quota?.estado_cuota === 'pendiente'
					? 'Todavía no aparece un cobro confirmado. Podés consultar nuevamente o confirmar un reintento manual.'
					: 'No encontramos un resultado financiero coherente. Actualizá el historial antes de continuar.',
			);
		} catch {
			if (current(scope, version)) {
				setCanRetry(false);
				setFeedback(
					'No pudimos consultar el resultado. Esperá a recuperar conexión y volvé a consultarlo.',
				);
			}
		} finally {
			if (current(scope, version)) {
				lockedRef.current = false;
				setPending(false);
			}
		}
	};
	const run = async (solicitud: SolicitudCobro, retry = false) => {
		const scope = activeRef.current;
		if (
			!scope ||
			lockedRef.current ||
			(!retry && needsCheckRef.current) ||
			solicitud.cuotaId !== cuotaId
		) {
			return;
		}
		lockedRef.current = true;
		setPending(true);
		setFeedback(null);
		setCanRetry(false);
		const version = ++generationRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		let submitted = false;
		try {
			const before = await getCuotaCobranza(cuotaId, usuarioId, controller.signal);
			if (!current(scope, version)) {
				return;
			}
			if (!before) {
				throw new Error('No encontramos la cuota seleccionada.');
			}
			if (before.estado_cuota === 'pagada') {
				const existing = await consultarCobroConfirmado(
					cuotaId,
					usuarioId,
					null,
					controller.signal,
				);
				if (!existing) {
					throw new Error('La cuota figura pagada y requiere revisar su cobro.');
				}
				await complete(existing, 'existente', scope, version);
				return;
			}
			if (before.monto <= 0) {
				throw Object.assign(new Error('Esta cuota no tiene un importe cobrable.'), { status: 400 });
			}
			const ticket: IntentoCobro = {
				usuarioId,
				cuotaId,
				solicitud,
				iniciadoEn: new Date().toISOString(),
				comprobanteId: null,
			};
			saveTicket(ticket);
			submitted = true;
			const comprobanteId = await cobrarCuota(solicitud, usuarioId, controller.signal);
			if (!current(scope, version)) {
				return;
			}
			saveTicket({ ...ticket, comprobanteId });
			const result = await consultarCobroConfirmado(
				cuotaId,
				usuarioId,
				comprobanteId,
				controller.signal,
			);
			if (!cobroVerificado(result, cuotaId, comprobanteId)) {
				throw Object.assign(new Error('Falta verificar el cobro guardado.'), {
					responseReceived: true,
				});
			}
			await complete(result, 'registrado', scope, version);
		} catch (error) {
			if (!current(scope, version)) {
				return;
			}
			const uncertain =
				submitted &&
				(clasificarErrorCreacion(error) === 'uncertain' ||
					(error as { responseReceived?: boolean })?.responseReceived === true);
			if (submitted && !uncertain) {
				try {
					const existing = await consultarCobroConfirmado(
						cuotaId,
						usuarioId,
						null,
						controller.signal,
					);
					if (existing) {
						await complete(existing, 'existente', scope, version);
						return;
					}
				} catch {
					needsCheck(true);
					setFeedback(
						'No pudimos verificar si la cuota ya fue cobrada. Consultá el resultado antes de continuar.',
					);
					return;
				}
			}
			needsCheck(uncertain);
			if (!uncertain) {
				clearTicket();
			}
			setFeedback(
				uncertain
					? 'No pudimos confirmar el resultado del cobro. Consultá el estado antes de repetir la operación.'
					: error instanceof Error
						? error.message
						: 'No se pudo registrar el cobro.',
			);
		} finally {
			if (current(scope, version)) {
				lockedRef.current = false;
				setPending(false);
			}
		}
	};
	const retry = () => {
		const ticket = attemptedRef.current;
		if (ticket && canRetry) {
			void run(ticket.solicitud, true);
		}
	};
	return { run, reconcile, retry, pending, requiresCheck, canRetry, feedback, enabled };
}

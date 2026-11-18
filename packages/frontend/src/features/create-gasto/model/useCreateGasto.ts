import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
	consultarAltaGasto,
	type DatosGasto,
	errorGasto,
	type Gasto,
	getGasto,
	registrarGasto,
} from '#entities/gasto';
import { useAuth } from '#entities/session';

interface Intento {
	actorId: string;
	solicitud: string;
	datos: DatosGasto;
	evidenciaPrevista: boolean;
}
export function useCreateGasto(onRegistered: (gasto: Gasto, evidenciaPrevista: boolean) => void) {
	const { perfil, profileStatus, cacheScope, isSigningOut } = useAuth();
	const actorId = perfil?.id ?? '';
	const enabled = profileStatus === 'ready' && !isSigningOut;
	const storageKey = `club:gasto-alta:${actorId}`;
	const client = useQueryClient();
	const [pending, setPending] = useState(false);
	const [requiresCheck, setRequiresCheck] = useState(false);
	const [canResume, setCanResume] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [attempt, setAttempt] = useState<Intento | null>(null);
	const mountedRef = useRef(false);
	const scopeRef = useRef<string | null>(null);
	scopeRef.current = enabled ? cacheScope : null;
	const versionRef = useRef(0);
	const lockRef = useRef(false);
	const requestRef = useRef<AbortController | null>(null);
	const attemptRef = useRef<Intento | null>(null);
	const checkRef = useRef(false);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			versionRef.current++;
			requestRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		setPending(false);
		setFeedback(null);
		setRequiresCheck(false);
		checkRef.current = false;
		setCanResume(false);
		setAttempt(null);
		attemptRef.current = null;
		lockRef.current = false;
		try {
			const raw = sessionStorage.getItem(storageKey);
			if (enabled && raw) {
				const saved = JSON.parse(raw) as Intento;
				if (saved.actorId === actorId && typeof saved.solicitud === 'string' && saved.datos) {
					attemptRef.current = saved;
					setAttempt(saved);
					checkRef.current = true;
					setRequiresCheck(true);
					setFeedback(
						'Hay un gasto pendiente de confirmar. Consultá su resultado antes de registrar otro.',
					);
				}
			}
		} catch {
			setFeedback(
				'No pudimos recuperar el intento anterior. Revisá el historial antes de registrar otro gasto.',
			);
		}
		return () => {
			versionRef.current++;
			requestRef.current?.abort();
		};
	}, [actorId, enabled, storageKey]);
	const current = (scope: string, version: number) =>
		mountedRef.current && scopeRef.current === scope && versionRef.current === version;
	const confirmed = async (id: string, scope: string, version: number, signal: AbortSignal) => {
		const gasto = await getGasto(id, signal);
		if (!gasto || gasto.usuario_id !== actorId) {
			throw new Error('No pudimos verificar la identidad del gasto.');
		}
		if (!current(scope, version)) {
			return;
		}
		await Promise.all(
			['gastos', 'movimientos-caja', 'caja'].map((key) =>
				client.invalidateQueries({ queryKey: [key, scope], refetchType: 'none' }),
			),
		);
		if (!current(scope, version)) {
			return;
		}
		try {
			sessionStorage.removeItem(storageKey);
		} catch {}
		const evidenciaPrevista = attemptRef.current?.evidenciaPrevista ?? false;
		attemptRef.current = null;
		setAttempt(null);
		checkRef.current = false;
		setRequiresCheck(false);
		setCanResume(false);
		setFeedback(null);
		onRegistered(gasto, evidenciaPrevista);
	};
	const submit = async (datos: DatosGasto, evidenciaPrevista = false, resume = false) => {
		const scope = scopeRef.current;
		if (!scope || lockRef.current || (!resume && checkRef.current)) {
			return;
		}
		const previous = resume ? attemptRef.current : null;
		const intento = previous ?? {
			actorId,
			solicitud: crypto.randomUUID(),
			datos,
			evidenciaPrevista,
		};
		if (!intento) {
			return;
		}
		lockRef.current = true;
		setPending(true);
		setFeedback(null);
		attemptRef.current = intento;
		setAttempt(intento);
		const version = ++versionRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			sessionStorage.setItem(storageKey, JSON.stringify(intento));
			const prior = await consultarAltaGasto(intento.solicitud, controller.signal);
			if (!current(scope, version)) {
				return;
			}
			const id =
				prior ??
				(await registrarGasto(intento.solicitud, intento.datos, actorId, controller.signal));
			await confirmed(id, scope, version, controller.signal);
		} catch (error) {
			if (!current(scope, version)) {
				return;
			}
			const e = error as { status?: number; code?: string };
			const uncertain = !e.status || e.status >= 500 || e.status === 408;
			checkRef.current = uncertain;
			setRequiresCheck(uncertain);
			setCanResume(false);
			setFeedback(
				uncertain
					? 'No pudimos confirmar el gasto. Consultá su resultado antes de volver a enviarlo.'
					: errorGasto(error),
			);
			if (!uncertain) {
				try {
					sessionStorage.removeItem(storageKey);
				} catch {}
				attemptRef.current = null;
				setAttempt(null);
			}
		} finally {
			if (current(scope, version)) {
				lockRef.current = false;
				setPending(false);
			}
		}
	};
	const check = async () => {
		const scope = scopeRef.current;
		const intento = attemptRef.current;
		if (!scope || !intento || lockRef.current) {
			return;
		}
		lockRef.current = true;
		setPending(true);
		const version = ++versionRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			const id = await consultarAltaGasto(intento.solicitud, controller.signal);
			if (!current(scope, version)) {
				return;
			}
			if (id) {
				await confirmed(id, scope, version, controller.signal);
			} else {
				setCanResume(true);
				setFeedback(
					'No aparece un gasto confirmado para este intento. Podés retomar el mismo registro sin crear otro intento.',
				);
			}
		} catch {
			if (current(scope, version)) {
				setFeedback(
					'No pudimos consultar el resultado. Reintentá la consulta cuando vuelva la conexión.',
				);
			}
		} finally {
			if (current(scope, version)) {
				lockRef.current = false;
				setPending(false);
			}
		}
	};
	return {
		submit: (datos: DatosGasto, evidenciaPrevista: boolean) => submit(datos, evidenciaPrevista),
		check,
		resume: () => {
			if (canResume && attemptRef.current) {
				void submit(attemptRef.current.datos, attemptRef.current.evidenciaPrevista, true);
			}
		},
		pending,
		feedback,
		requiresCheck,
		canResume,
		attempt,
		enabled,
	};
}

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '#entities/session';
import {
	type ComandoUsuario,
	gestionarUsuario,
	getOperacionUsuario,
	type ResultadoUsuario,
} from '#entities/usuario';
import { comandoParaRetomar } from './recuperacion';
export function useGestionUsuario(onResult: (r: ResultadoUsuario) => void) {
	const { cacheScope, profileStatus, perfil } = useAuth();
	const enabled = profileStatus === 'ready' && perfil?.rol === 'admin';
	const client = useQueryClient();
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [needsCheck, setNeedsCheckState] = useState(false);
	const needsCheckRef = useRef(false);
	const setNeedsCheck = useCallback((value: boolean) => {
		needsCheckRef.current = value;
		setNeedsCheckState(value);
	}, []);
	const lastResultRef = useRef<ResultadoUsuario | null>(null);
	const [canResume, setCanResume] = useState(false);
	const activeRef = useRef<string | null>(null);
	activeRef.current = enabled ? cacheScope : null;
	const mountedRef = useRef(false);
	const versionRef = useRef(0);
	const lockRef = useRef(false);
	const reqRef = useRef<AbortController | null>(null);
	const attemptRef = useRef<ComandoUsuario | null>(null);
	const actorId = perfil?.id ?? '';
	const storageKey = `club:usuario-gestion:${actorId}`;
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			versionRef.current++;
			reqRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		activeRef.current = enabled ? cacheScope : null;
		setPending(false);
		setFeedback(null);
		setNeedsCheck(false);
		setCanResume(false);
		attemptRef.current = null;
		lastResultRef.current = null;
		lockRef.current = false;
		try {
			const saved = sessionStorage.getItem(storageKey);
			if (saved) {
				const ticket = JSON.parse(saved) as { actorId?: string; command?: ComandoUsuario };
				const parsed = ticket.command;
				if (
					enabled &&
					ticket.actorId === actorId &&
					parsed &&
					typeof parsed.operacionId === 'string' &&
					['crear', 'editar', 'desactivar', 'reactivar', 'restablecer', 'reenviar'].includes(
						parsed.operacion,
					)
				) {
					attemptRef.current = parsed;
					setNeedsCheck(true);
					setFeedback(
						'Hay una gestión pendiente de confirmar. Consultá su resultado antes de enviar otra.',
					);
				}
			}
		} catch {
			setFeedback(
				'No se pudo recuperar el intento guardado. Consultá el listado antes de continuar.',
			);
		}
		return () => {
			versionRef.current++;
			reqRef.current?.abort();
		};
	}, [storageKey, enabled, actorId, setNeedsCheck, cacheScope]);
	const current = (s: string, v: number) =>
		mountedRef.current && activeRef.current === s && versionRef.current === v;
	const done = async (r: ResultadoUsuario, s: string, v: number) => {
		await client.invalidateQueries({ queryKey: ['usuarios', s], refetchType: 'none' });
		if (!current(s, v)) {
			return;
		}
		lastResultRef.current = r;
		if (r.resultado === 'completo' || r.resultado === 'rechazado') {
			try {
				sessionStorage.removeItem(storageKey);
			} catch {}
			attemptRef.current = null;
			setNeedsCheck(false);
			setCanResume(false);
			setFeedback(null);
		} else {
			setNeedsCheck(true);
			setCanResume(
				r.resultado !== 'en_proceso' && (r.resultado !== 'enlace_pendiente' || r.puedeReenviar),
			);
			setFeedback(r.mensaje);
		}
		onResult(r);
	};
	const submit = async (command: ComandoUsuario, resume = false) => {
		const s = activeRef.current;
		if (!s || lockRef.current || (!resume && needsCheckRef.current)) {
			return;
		}
		const v = ++versionRef.current;
		const c = new AbortController();
		reqRef.current = c;
		lockRef.current = true;
		setPending(true);
		setFeedback(null);
		attemptRef.current = command;
		try {
			sessionStorage.setItem(storageKey, JSON.stringify({ actorId, command }));
			if (!resume) {
				const prior = await getOperacionUsuario(command.operacionId, actorId, c.signal);
				if (prior) {
					await done(prior, s, v);
					return;
				}
			}
			const result = await gestionarUsuario(command, actorId, c.signal);
			await done(result, s, v);
		} catch (e) {
			if (!current(s, v)) {
				return;
			}
			const status = (e as { status?: number })?.status;
			const uncertain = !status || status >= 500 || status === 408;
			setNeedsCheck(uncertain);
			setCanResume(false);
			if (!uncertain) {
				try {
					sessionStorage.removeItem(storageKey);
				} catch {}
			}
			setFeedback(
				uncertain
					? 'No pudimos confirmar el resultado. Consultá el estado antes de repetir.'
					: e instanceof Error
						? e.message
						: 'No se pudo guardar.',
			);
		} finally {
			if (current(s, v)) {
				lockRef.current = false;
				setPending(false);
			}
		}
	};
	const check = async () => {
		const s = activeRef.current;
		const command = attemptRef.current;
		if (!s || !command || lockRef.current) {
			return;
		}
		const v = ++versionRef.current;
		const c = new AbortController();
		reqRef.current = c;
		lockRef.current = true;
		setPending(true);
		try {
			const result = await getOperacionUsuario(command.operacionId, actorId, c.signal);
			if (!current(s, v)) {
				return;
			}
			if (result) {
				await done(result, s, v);
			} else {
				setCanResume(true);
				setFeedback(
					'No hay un resultado registrado. Podés retomar el mismo intento sin crear una operación nueva.',
				);
			}
		} catch {
			if (current(s, v)) {
				setFeedback(
					'No pudimos consultar el resultado. Reintentá la consulta cuando vuelva la conexión.',
				);
			}
		} finally {
			if (current(s, v)) {
				lockRef.current = false;
				setPending(false);
			}
		}
	};
	const resume = () => {
		if (attemptRef.current && canResume) {
			try {
				void submit(
					comandoParaRetomar(attemptRef.current, lastResultRef.current, crypto.randomUUID()),
					true,
				);
			} catch (error) {
				setFeedback(error instanceof Error ? error.message : 'No se pudo retomar.');
			}
		}
	};
	return {
		run: (command: ComandoUsuario) => submit(command),
		check,
		resume,
		canResume,
		pending,
		feedback,
		needsCheck,
		enabled,
	};
}

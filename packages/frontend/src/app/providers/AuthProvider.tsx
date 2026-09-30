// src/app/providers/AuthProvider.tsx

import type { Session, SignInWithPasswordCredentials } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
	AuthContext,
	activityKey,
	INACTIVITY_MS,
	inactivityExpired,
	type ProfileStatus,
	RequestGeneration,
} from '#entities/session';
import { clearStoredSession, supabase } from '#shared/api/supabaseClient';
import type { Tables } from '#shared/types';

export function AuthProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const [session, setSession] = useState<Session | null>(null);
	const [perfil, setPerfil] = useState<Tables<'usuarios'> | null>(null);
	const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
	const [message, setMessage] = useState<string | null>(null);
	const [epoch, setEpoch] = useState(0);
	const [revision, setRevision] = useState(0);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const identityRef = useRef<string | null>(null);
	const signingOutRef = useRef(false);
	const locallyClosedRef = useRef(false);
	const mountedRef = useRef(false);
	const generationRef = useRef(new RequestGeneration());
	const profileRequestRef = useRef<AbortController | null>(null);
	const lastRoleRef = useRef<string | null>(null);

	const clearProtectedData = useCallback(() => {
		void queryClient.cancelQueries();
		queryClient.clear();
		setEpoch((value) => value + 1);
	}, [queryClient]);

	const logout = useCallback(
		async (reason?: string) => {
			if (signingOutRef.current) {
				return;
			}
			signingOutRef.current = true;
			locallyClosedRef.current = true;
			setIsSigningOut(true);
			generationRef.current.next();
			profileRequestRef.current?.abort();
			const previousId = identityRef.current;
			identityRef.current = null;
			lastRoleRef.current = null;
			setSession(null);
			setPerfil(null);
			setProfileStatus('signed_out');
			setMessage(reason ?? null);
			clearProtectedData();
			try {
				const { error } = await supabase.auth.signOut({ scope: 'local' });
				if (error && mountedRef.current) {
					setMessage(
						'La sesión se quitó de este navegador. No se pudo confirmar la revocación en el servidor.',
					);
				}
			} catch {
				if (mountedRef.current) {
					setMessage(
						'La sesión se quitó de este navegador. No se pudo confirmar la revocación en el servidor.',
					);
				}
			} finally {
				clearStoredSession();
				if (previousId) {
					try {
						localStorage.removeItem(activityKey(previousId));
					} catch {
						/* Sin almacenamiento. */
					}
				}
				signingOutRef.current = false;
				if (mountedRef.current) {
					setIsSigningOut(false);
				}
			}
		},
		[clearProtectedData],
	);

	useEffect(() => {
		mountedRef.current = true;
		const initialTimeout = window.setTimeout(() => {
			if (!mountedRef.current) {
				return;
			}
			setProfileStatus('error');
			setMessage('No pudimos recuperar la sesión. Vuelva a iniciar sesión.');
		}, 10_000);
		// El callback es síncrono: la carga del perfil sucede en el efecto siguiente.
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, nextSession) => {
			window.clearTimeout(initialTimeout);
			if (!mountedRef.current || signingOutRef.current || locallyClosedRef.current) {
				return;
			}
			const nextId = nextSession?.user.id ?? null;
			const changed = identityRef.current !== nextId;
			if (changed || event === 'SIGNED_OUT') {
				generationRef.current.next();
				profileRequestRef.current?.abort();
				identityRef.current = nextId;
				lastRoleRef.current = null;
				setPerfil(null);
				clearProtectedData();
				if (nextId && event === 'SIGNED_IN') {
					try {
						localStorage.setItem(activityKey(nextId), String(Date.now()));
					} catch {
						/* Sin almacenamiento. */
					}
				}
			}
			setSession(nextSession);
			if (!nextId) {
				setProfileStatus('signed_out');
			} else {
				if (changed) {
					setProfileStatus('loading');
				}
				setRevision((value) => value + 1);
			}
		});
		return () => {
			mountedRef.current = false;
			window.clearTimeout(initialTimeout);
			generationRef.current.next();
			profileRequestRef.current?.abort();
			subscription.unsubscribe();
		};
	}, [clearProtectedData]);

	const userId = session?.user.id;
	useEffect(() => {
		void revision;
		if (!userId || signingOutRef.current) {
			return;
		}
		const current = generationRef.current.next();
		const controller = new AbortController();
		profileRequestRef.current?.abort();
		profileRequestRef.current = controller;
		let cancelled = false;
		const timeout = window.setTimeout(() => controller.abort(), 10_000);
		void (async () => {
			try {
				const { data, error } = await supabase
					.from('usuarios')
					.select('*')
					.eq('id', userId)
					.abortSignal(controller.signal)
					.maybeSingle();
				if (
					cancelled ||
					!mountedRef.current ||
					!generationRef.current.isCurrent(current) ||
					identityRef.current !== userId
				) {
					return;
				}
				if (error) {
					throw error;
				}
				if (data?.estado !== 'activo' || !['admin', 'responsable'].includes(data.rol)) {
					setPerfil(null);
					setProfileStatus(data?.estado === 'inactivo' ? 'inactive' : 'missing');
					setMessage(
						data?.estado === 'inactivo'
							? 'Su cuenta ha sido suspendida.'
							: 'Su cuenta no tiene un perfil operativo habilitado. Comuníquese con el administrador.',
					);
					clearProtectedData();
					return;
				}
				if (lastRoleRef.current !== null && lastRoleRef.current !== data.rol) {
					clearProtectedData();
				}
				lastRoleRef.current = data.rol;
				setPerfil(data);
				setProfileStatus('ready');
				setMessage(null);
			} catch {
				if (cancelled || !mountedRef.current || !generationRef.current.isCurrent(current)) {
					return;
				}
				setPerfil(null);
				setProfileStatus('error');
				setMessage('No pudimos verificar su perfil. Revise la conexión y vuelva a intentarlo.');
				clearProtectedData();
			} finally {
				window.clearTimeout(timeout);
			}
		})();
		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
			controller.abort();
		};
	}, [userId, revision, clearProtectedData]);

	useEffect(() => {
		if (!userId) {
			return;
		}
		const revalidate = () => {
			if (document.visibilityState === 'visible') {
				setRevision((value) => value + 1);
			}
		};
		const interval = window.setInterval(revalidate, 60_000);
		window.addEventListener('focus', revalidate);
		document.addEventListener('visibilitychange', revalidate);
		return () => {
			window.clearInterval(interval);
			window.removeEventListener('focus', revalidate);
			document.removeEventListener('visibilitychange', revalidate);
		};
	}, [userId]);

	useEffect(() => {
		if (!userId) {
			return;
		}
		const key = activityKey(userId);
		let lastActivity = Date.now();
		try {
			const saved = Number(localStorage.getItem(key));
			if (saved > 0 && saved <= Date.now()) {
				lastActivity = saved;
			} else {
				localStorage.setItem(key, String(lastActivity));
			}
		} catch {
			/* Sigue funcionando el temporizador de esta pestaña. */
		}
		let timeout = 0;
		const check = () => {
			window.clearTimeout(timeout);
			if (inactivityExpired(lastActivity)) {
				void logout('La sesión finalizó después de 30 minutos sin actividad. Ingrese nuevamente.');
				return false;
			}
			timeout = window.setTimeout(check, Math.max(1, INACTIVITY_MS - (Date.now() - lastActivity)));
			return true;
		};
		const activity = () => {
			if (!check() || document.visibilityState !== 'visible') {
				return;
			}
			lastActivity = Date.now();
			try {
				localStorage.setItem(key, String(lastActivity));
			} catch {
				/* Sin almacenamiento. */
			}
			check();
		};
		const storage = (event: StorageEvent) => {
			if (event.key !== key) {
				return;
			}
			if (event.newValue === null) {
				void logout('La sesión finalizó en otra pestaña.');
				return;
			}
			const timestamp = Number(event.newValue);
			if (timestamp > lastActivity && timestamp <= Date.now()) {
				lastActivity = timestamp;
			}
			check();
		};
		const visible = () => {
			if (document.visibilityState === 'visible') {
				check();
			}
		};
		for (const event of ['pointerdown', 'keydown', 'scroll']) {
			window.addEventListener(event, activity, { passive: true });
		}
		window.addEventListener('storage', storage);
		window.addEventListener('focus', check);
		document.addEventListener('visibilitychange', visible);
		check();
		return () => {
			window.clearTimeout(timeout);
			for (const event of ['pointerdown', 'keydown', 'scroll']) {
				window.removeEventListener(event, activity);
			}
			window.removeEventListener('storage', storage);
			window.removeEventListener('focus', check);
			document.removeEventListener('visibilitychange', visible);
		};
	}, [userId, logout]);

	const login = async (credentials: SignInWithPasswordCredentials) => {
		locallyClosedRef.current = false;
		setMessage(null);
		const { error } = await supabase.auth.signInWithPassword(credentials);
		return { error };
	};

	return (
		<AuthContext.Provider
			value={{
				session,
				user: session?.user ?? null,
				perfil,
				isLoading: profileStatus === 'loading',
				profileStatus,
				message,
				isSigningOut,
				cacheScope: `${userId ?? 'anonymous'}:${epoch}`,
				retryProfile: () => {
					setProfileStatus('loading');
					setRevision((value) => value + 1);
				},
				login,
				logout,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '#entities/session';
import {
	buscarSocioPorDni,
	type CrearSocioPayload,
	crearSocio,
	type SocioCreado,
} from '#entities/socio';

type Feedback = {
	kind:
		| 'duplicate'
		| 'validation'
		| 'permission'
		| 'error'
		| 'uncertain_pending'
		| 'uncertain_absent'
		| 'existing';
	message: string;
	dni?: string;
	existing?: SocioCreado;
};
type ErrorKind = 'duplicate' | 'validation' | 'permission' | 'error' | 'uncertain_pending';
type Attempt = { scope: string; generation: number };

export function clasificarErrorAlta(error: unknown): ErrorKind {
	const value = error as { code?: string; status?: number } | null;
	if (value?.code === '23505') {
		return 'duplicate';
	}
	if (
		[401, 403].includes(value?.status ?? 0) ||
		['42501', '28000', 'PGRST301', 'PGRST302'].includes(value?.code ?? '')
	) {
		return 'permission';
	}
	if (['23514', '23502', '22007', '22008', '22001', 'P0001'].includes(value?.code ?? '')) {
		return 'validation';
	}
	if (!value?.status || value.status >= 500 || value.status === 408 || value.status === 406) {
		return 'uncertain_pending';
	}
	return 'error';
}

export function useCreateSocio(onCreated: (socio: SocioCreado) => void) {
	const queryClient = useQueryClient();
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && perfil?.estado === 'activo' && !isSigningOut;
	const accessRef = useRef<string | null>(null);
	accessRef.current = enabled ? cacheScope : null;
	const callbackRef = useRef(onCreated);
	callbackRef.current = onCreated;
	const mountedRef = useRef(false);
	const generationRef = useRef(0);
	const requestRef = useRef<AbortController | null>(null);
	const lockedRef = useRef(false);
	const [feedback, setFeedback] = useState<Feedback | null>(null);
	const [isChecking, setIsChecking] = useState(false);
	const mutation = useMutation({
		mutationFn: ({ payload, signal }: { payload: CrearSocioPayload; signal: AbortSignal }) =>
			crearSocio(payload, signal),
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
		accessRef.current = enabled ? cacheScope : null;
		setFeedback(null);
		setIsChecking(false);
		lockedRef.current = false;
		return () => {
			generationRef.current += 1;
			requestRef.current?.abort();
			lockedRef.current = false;
		};
	}, [cacheScope, enabled]);
	const isCurrent = (attempt: Attempt) =>
		mountedRef.current &&
		accessRef.current === attempt.scope &&
		generationRef.current === attempt.generation;

	const reconcile = async (dni: string, attempt: Attempt, signal: AbortSignal) => {
		if (!isCurrent(attempt)) {
			return;
		}
		setIsChecking(true);
		try {
			const existing = await buscarSocioPorDni(dni, signal);
			if (!isCurrent(attempt)) {
				return;
			}
			if (existing) {
				setFeedback({
					kind: 'existing',
					dni,
					existing,
					message: `Ya existe un socio con el DNI ${dni}. No podemos atribuirlo a este intento. Verificá el registro antes de continuar.`,
				});
			} else {
				setFeedback({
					kind: 'uncertain_absent',
					dni,
					message: `La respuesta del alta del DNI ${dni} no pudo confirmarse. La consulta posterior no encontró ese DNI; podés volver a intentar conservando estos datos.`,
				});
			}
		} catch {
			if (isCurrent(attempt)) {
				setFeedback({
					kind: 'uncertain_pending',
					dni,
					message: `No se pudo confirmar el resultado ni consultar el DNI ${dni}. Consultalo antes de volver a guardar; tus datos se conservan.`,
				});
			}
		} finally {
			if (isCurrent(attempt)) {
				setIsChecking(false);
			}
		}
	};

	const create = async (payload: CrearSocioPayload) => {
		const scope = accessRef.current;
		if (
			!scope ||
			lockedRef.current ||
			feedback?.kind === 'uncertain_pending' ||
			feedback?.kind === 'existing'
		) {
			return;
		}
		lockedRef.current = true;
		const attempt = { scope, generation: ++generationRef.current };
		const controller = new AbortController();
		requestRef.current = controller;
		setFeedback(null);
		try {
			const socio = await mutation.mutateAsync({ payload, signal: controller.signal });
			if (!isCurrent(attempt)) {
				return;
			}
			await queryClient.invalidateQueries({ queryKey: ['socios', scope] });
			if (isCurrent(attempt)) {
				callbackRef.current(socio);
			}
		} catch (error) {
			if (!isCurrent(attempt)) {
				return;
			}
			const kind = clasificarErrorAlta(error);
			if (kind === 'uncertain_pending') {
				setFeedback({
					kind,
					dni: payload.dni,
					message:
						'La respuesta del alta es incierta. Estamos consultando el DNI antes de habilitar otro intento.',
				});
				await reconcile(payload.dni, attempt, controller.signal);
			} else {
				const messages = {
					duplicate:
						'Ya existe un socio con ese DNI. Revisá el documento; no se creó otra persona.',
					permission:
						'Tu cuenta no tiene permiso para dar de alta socios. Volvé a verificar la sesión.',
					validation:
						'El servidor rechazó los datos. Revisá nacimiento y contactos de emergencia antes de volver a guardar.',
					error:
						'No pudimos completar el alta. Revisá los datos ingresados; el formulario se conserva.',
				};
				setFeedback({ kind, dni: payload.dni, message: messages[kind] });
			}
		} finally {
			if (isCurrent(attempt)) {
				lockedRef.current = false;
			}
		}
	};

	const checkExisting = async () => {
		const scope = accessRef.current;
		const dni = feedback?.dni;
		if (!scope || !dni || lockedRef.current) {
			return;
		}
		lockedRef.current = true;
		const attempt = { scope, generation: ++generationRef.current };
		const controller = new AbortController();
		requestRef.current = controller;
		await reconcile(dni, attempt, controller.signal);
		if (isCurrent(attempt)) {
			lockedRef.current = false;
		}
	};
	const clearRecoverableFeedback = () => {
		if (lockedRef.current) {
			return;
		}
		// Editar el borrador no resuelve una escritura incierta: conservar su conciliación.
		setFeedback((previous) =>
			previous && ['duplicate', 'validation', 'permission', 'error'].includes(previous.kind)
				? null
				: previous,
		);
	};
	const resetForNew = () => {
		if (!accessRef.current || lockedRef.current) {
			return;
		}
		generationRef.current += 1;
		requestRef.current?.abort();
		setFeedback(null);
		mutation.reset();
	};
	return {
		create,
		clearRecoverableFeedback,
		resetForNew,
		checkExisting,
		feedback,
		enabled,
		isPending: mutation.isPending || isChecking,
		requiresCheck: feedback?.kind === 'uncertain_pending' || feedback?.kind === 'existing',
	};
}

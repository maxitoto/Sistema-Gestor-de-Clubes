import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

type Feedback<T> = {
	kind:
		| 'duplicate'
		| 'permission'
		| 'validation'
		| 'error'
		| 'checking'
		| 'uncertain'
		| 'absent'
		| 'existing';
	message: string;
	existing?: T;
};
export function clasificarErrorCreacion(error: unknown) {
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
	if (['23514', '23502', '23503', '22001', '22003', 'P0001'].includes(value?.code ?? '')) {
		return 'validation';
	}
	if (!value?.status || value.status >= 500 || [408, 406].includes(value.status)) {
		return 'uncertain';
	}
	return 'error';
}
interface Options<P, T> {
	cacheScope: string;
	enabled: boolean;
	queryRoot: string;
	create: (payload: P, signal: AbortSignal) => Promise<T>;
	lookup: (payload: P, signal: AbortSignal) => Promise<T | null>;
	onCreated: (created: T) => void;
}
/** Escritura humana sin retry; verifica identidad si se pierde la respuesta. */
export function useHumanCreate<P, T>(options: Options<P, T>) {
	const queryClient = useQueryClient();
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const accessRef = useRef<string | null>(null);
	accessRef.current = options.enabled ? options.cacheScope : null;
	const generationRef = useRef(0);
	const mountedRef = useRef(false);
	const lockedRef = useRef(false);
	const requestRef = useRef<AbortController | null>(null);
	const attemptedRef = useRef<P | null>(null);
	const [feedback, setFeedback] = useState<Feedback<T> | null>(null);
	const [checking, setChecking] = useState(false);
	const mutation = useMutation({
		mutationFn: ({ payload, signal }: { payload: P; signal: AbortSignal }) =>
			optionsRef.current.create(payload, signal),
		retry: false,
	});
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			generationRef.current++;
			requestRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		accessRef.current = options.enabled ? options.cacheScope : null;
		setFeedback(null);
		setChecking(false);
		lockedRef.current = false;
		attemptedRef.current = null;
		return () => {
			generationRef.current++;
			requestRef.current?.abort();
			lockedRef.current = false;
		};
	}, [options.cacheScope, options.enabled]);
	const current = (scope: string, version: number) =>
		mountedRef.current && accessRef.current === scope && generationRef.current === version;
	const reconcile = async (payload: P, scope: string, version: number, signal: AbortSignal) => {
		if (!current(scope, version)) {
			return;
		}
		setChecking(true);
		try {
			const found = await optionsRef.current.lookup(payload, signal);
			if (!current(scope, version)) {
				return;
			}
			setFeedback(
				found
					? {
							kind: 'existing',
							existing: found,
							message:
								'Se encontró un registro con esa identidad. No podemos atribuirlo a este intento. Verificá el listado antes de continuar.',
						}
					: {
							kind: 'absent',
							message:
								'La respuesta del alta fue incierta. La consulta posterior no encontró esa identidad. Podés revisar los datos y volver a guardar manualmente.',
						},
			);
		} catch {
			if (current(scope, version)) {
				setFeedback({
					kind: 'uncertain',
					message:
						'No se pudo confirmar el alta ni consultar su identidad. Consultá el resultado antes de volver a guardar; tus datos se conservan.',
				});
			}
		} finally {
			if (current(scope, version)) {
				setChecking(false);
			}
		}
	};
	const create = async (payload: P) => {
		const scope = accessRef.current;
		if (
			!scope ||
			lockedRef.current ||
			['checking', 'uncertain', 'existing'].includes(feedback?.kind ?? '')
		) {
			return;
		}
		lockedRef.current = true;
		attemptedRef.current = payload;
		const version = ++generationRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		setFeedback(null);
		try {
			const created = await mutation.mutateAsync({ payload, signal: controller.signal });
			if (!current(scope, version)) {
				return;
			}
			await queryClient.invalidateQueries({ queryKey: [optionsRef.current.queryRoot, scope] });
			if (current(scope, version)) {
				optionsRef.current.onCreated(created);
			}
		} catch (error) {
			if (!current(scope, version)) {
				return;
			}
			const kind = clasificarErrorCreacion(error);
			if (kind === 'uncertain') {
				setFeedback({
					kind: 'checking',
					message:
						'La respuesta es incierta; estamos consultando la identidad antes de habilitar otro intento.',
				});
				await reconcile(payload, scope, version, controller.signal);
			} else {
				const messages = {
					duplicate:
						'Ya existe ese nombre: para categorías, el nombre debe ser único dentro del deporte. No se creó otro registro.',
					permission: 'Necesitás una sesión de Administrador activo para guardar.',
					validation: 'El servidor rechazó los datos. Revisá el nombre, el arancel y las edades.',
					error: 'No pudimos completar el alta. Revisá los datos; el formulario se conserva.',
				};
				setFeedback({ kind, message: messages[kind] });
			}
		} finally {
			if (current(scope, version)) {
				lockedRef.current = false;
			}
		}
	};
	const checkExisting = async () => {
		const scope = accessRef.current;
		const payload = attemptedRef.current;
		if (!scope || !payload || lockedRef.current) {
			return;
		}
		lockedRef.current = true;
		const version = ++generationRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		await reconcile(payload, scope, version, controller.signal);
		if (current(scope, version)) {
			lockedRef.current = false;
		}
	};
	const resetForNew = () => {
		if (!accessRef.current || lockedRef.current) {
			return;
		}
		generationRef.current++;
		requestRef.current?.abort();
		attemptedRef.current = null;
		setFeedback(null);
		mutation.reset();
	};
	return {
		create,
		checkExisting,
		resetForNew,
		feedback,
		enabled: options.enabled,
		isPending: mutation.isPending || checking,
		requiresCheck: ['checking', 'uncertain', 'existing'].includes(feedback?.kind ?? ''),
	};
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { clasificarErrorCreacion } from './useHumanCreate';

export interface VerifiedMutationOptions<P, T> {
	cacheScope: string;
	enabled: boolean;
	queryRoots: readonly string[];
	write: (payload: P, signal: AbortSignal) => Promise<unknown>;
	read: (signal: AbortSignal) => Promise<T | null>;
	matches: (row: T, payload: P) => boolean;
	onConfirmed: (row: T) => void;
	describeError?: (error: unknown) => string;
}

export function resultadoMutacionIncierto(
	error: unknown,
	submitted: boolean,
	responseReceived: boolean,
): boolean {
	return (
		submitted &&
		(responseReceived ||
			clasificarErrorCreacion(error) === 'uncertain' ||
			(error as { responseReceived?: boolean } | null)?.responseReceived === true)
	);
}

/** Escritura humana por identidad estable: consulta antes de reenviar y verifica el estado guardado. */
export function useVerifiedMutation<P, T>(options: VerifiedMutationOptions<P, T>) {
	const queryClient = useQueryClient();
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const accessRef = useRef<string | null>(null);
	accessRef.current = options.enabled ? options.cacheScope : null;
	const mountedRef = useRef(false);
	const generationRef = useRef(0);
	const lockedRef = useRef(false);
	const requestRef = useRef<AbortController | null>(null);
	const attemptedRef = useRef<{ payload: P } | null>(null);
	const needsCheckRef = useRef(false);
	const [isPending, setIsPending] = useState(false);
	const [requiresCheck, setRequiresCheck] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: ({ payload, signal }: { payload: P; signal: AbortSignal }) =>
			optionsRef.current.write(payload, signal),
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
		setIsPending(false);
		needsCheckRef.current = false;
		setRequiresCheck(false);
		setFeedback(null);
		attemptedRef.current = null;
		lockedRef.current = false;
		return () => {
			generationRef.current++;
			requestRef.current?.abort();
			lockedRef.current = false;
		};
	}, [options.cacheScope, options.enabled]);
	const current = (scope: string, version: number) =>
		mountedRef.current && accessRef.current === scope && generationRef.current === version;
	const confirmed = async (row: T, scope: string, version: number) => {
		if (!current(scope, version)) {
			return;
		}
		await Promise.all(
			optionsRef.current.queryRoots.map((queryRoot) =>
				queryClient.invalidateQueries({ queryKey: [queryRoot, scope], refetchType: 'none' }),
			),
		);
		if (current(scope, version)) {
			attemptedRef.current = null;
			needsCheckRef.current = false;
			setRequiresCheck(false);
			setFeedback(null);
			optionsRef.current.onConfirmed(row);
		}
	};
	const verify = async (payload: P, scope: string, version: number, signal: AbortSignal) => {
		const row = await optionsRef.current.read(signal);
		if (!current(scope, version)) {
			return false;
		}
		if (row && optionsRef.current.matches(row, payload)) {
			await confirmed(row, scope, version);
			return true;
		}
		needsCheckRef.current = false;
		setRequiresCheck(false);
		setFeedback(
			row
				? 'El registro consultado todavía no tiene los cambios solicitados. Revisá los datos antes de volver a confirmar manualmente.'
				: 'No encontramos el registro. Actualizá el listado antes de continuar.',
		);
		return false;
	};
	const reconcile = async () => {
		const scope = accessRef.current;
		const attempt = attemptedRef.current;
		if (!scope || !attempt || lockedRef.current) {
			return;
		}
		lockedRef.current = true;
		setIsPending(true);
		const version = ++generationRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			await verify(attempt.payload, scope, version, controller.signal);
		} catch {
			if (current(scope, version)) {
				needsCheckRef.current = true;
				setRequiresCheck(true);
				setFeedback(
					'No pudimos consultar el resultado. Volvé a consultarlo antes de reenviar la operación.',
				);
			}
		} finally {
			if (current(scope, version)) {
				lockedRef.current = false;
				setIsPending(false);
			}
		}
	};
	const run = async (payload: P) => {
		const scope = accessRef.current;
		if (!scope || lockedRef.current || needsCheckRef.current) {
			return;
		}
		lockedRef.current = true;
		setIsPending(true);
		setFeedback(null);
		attemptedRef.current = { payload };
		const version = ++generationRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		let submitted = false;
		let responseReceived = false;
		try {
			// Una reapertura después de respuesta perdida no repite una transición ya guardada.
			const before = await optionsRef.current.read(controller.signal);
			if (!current(scope, version)) {
				return;
			}
			if (before && optionsRef.current.matches(before, payload)) {
				await confirmed(before, scope, version);
				return;
			}
			if (!before) {
				setFeedback('No encontramos el registro. Actualizá el listado antes de continuar.');
				return;
			}
			submitted = true;
			await mutation.mutateAsync({ payload, signal: controller.signal });
			responseReceived = true;
			await verify(payload, scope, version, controller.signal);
		} catch (error) {
			if (!current(scope, version)) {
				return;
			}
			const uncertain = resultadoMutacionIncierto(error, submitted, responseReceived);
			if (uncertain) {
				needsCheckRef.current = true;
				setRequiresCheck(true);
				setFeedback(
					'No pudimos confirmar el resultado. Consultá el estado guardado antes de volver a enviar la operación.',
				);
			} else {
				setFeedback(
					!submitted
						? 'No pudimos consultar el registro antes de guardar. Reintentá cuando se restablezca la conexión.'
						: (optionsRef.current.describeError?.(error) ??
								'No se pudo guardar. Revisá los datos y los permisos de tu sesión.'),
				);
			}
		} finally {
			if (current(scope, version)) {
				lockedRef.current = false;
				setIsPending(false);
			}
		}
	};
	return {
		run,
		reconcile,
		isPending,
		requiresCheck,
		feedback,
		enabled: options.enabled,
		clearFeedback: () => {
			if (!lockedRef.current && !requiresCheck) {
				setFeedback(null);
			}
		},
	};
}

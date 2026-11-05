import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
	generarCuotasMesManual,
	getJobCuotas,
	getPeriodoCuotasActual,
	getUltimoJobCuotas,
	type JobCuotas,
	mismoPeriodo,
	type PeriodoCuotas,
	verificarResultadoGeneracion,
} from '#entities/job-cuotas';
import { clasificarErrorCreacion } from '#shared/lib/useHumanCreate';
import {
	type IntentoGeneracion,
	parseIntentoGeneracion,
	resolverRecuperacionGeneracion,
} from './intentoGeneracion';

export interface VistaGeneracion {
	job: JobCuotas;
	origen: 'generado' | 'ya_ejecutado' | 'fallido' | 'recuperado';
}

const claveIntento = (usuarioId: string) => `club:generacion-cuotas:${usuarioId}`;
function leerIntento(usuarioId: string) {
	try {
		const value = sessionStorage.getItem(claveIntento(usuarioId));
		return value ? parseIntentoGeneracion(JSON.parse(value), usuarioId) : null;
	} catch {
		return null;
	}
}

export function useGenerarCuotas({
	cacheScope,
	enabled,
	usuarioId,
}: {
	cacheScope: string;
	enabled: boolean;
	usuarioId: string;
}) {
	const queryClient = useQueryClient();
	const [initialTicket] = useState(() => leerIntento(usuarioId));
	const attemptedRef = useRef<IntentoGeneracion | null>(initialTicket);
	const mountedRef = useRef(false);
	const scopeRef = useRef<string | null>(null);
	scopeRef.current = enabled ? cacheScope : null;
	const generationRef = useRef(0);
	const requestRef = useRef<AbortController | null>(null);
	const lockedRef = useRef(false);
	const [isPending, setIsPending] = useState(false);
	const [requiresCheck, setRequiresCheck] = useState(Boolean(initialTicket));
	const [feedback, setFeedback] = useState<string | null>(
		initialTicket
			? 'Hay una generación cuyo resultado debe consultarse antes de iniciar otra.'
			: null,
	);
	const [result, setResult] = useState<VistaGeneracion | null>(null);
	const mutation = useMutation({
		mutationFn: ({ signal }: { signal: AbortSignal }) => generarCuotasMesManual(signal),
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
		const ticket = leerIntento(usuarioId);
		scopeRef.current = enabled ? cacheScope : null;
		attemptedRef.current = ticket;
		setRequiresCheck(Boolean(ticket));
		setFeedback(
			ticket ? 'Hay una generación cuyo resultado debe consultarse antes de iniciar otra.' : null,
		);
		setResult(null);
		setIsPending(false);
		lockedRef.current = false;
		return () => {
			generationRef.current++;
			requestRef.current?.abort();
			lockedRef.current = false;
		};
	}, [cacheScope, enabled, usuarioId]);

	const current = (scope: string, version: number) =>
		mountedRef.current && scopeRef.current === scope && generationRef.current === version;
	const clearTicket = () => {
		attemptedRef.current = null;
		try {
			sessionStorage.removeItem(claveIntento(usuarioId));
		} catch {
			/* El estado guardado puede volver a consultarse. */
		}
	};
	const saveTicket = (periodo: PeriodoCuotas, baseline: JobCuotas | null) => {
		const ticket: IntentoGeneracion = {
			usuarioId,
			periodo,
			iniciadoEn: new Date().toISOString(),
			baselineJobId: baseline?.id ?? null,
			baselineJobEstado: baseline?.estado ?? null,
		};
		try {
			sessionStorage.setItem(claveIntento(usuarioId), JSON.stringify(ticket));
		} catch {
			return false;
		}
		attemptedRef.current = ticket;
		return true;
	};
	const complete = async (
		job: JobCuotas,
		origen: VistaGeneracion['origen'],
		scope: string,
		version: number,
	) => {
		if (!current(scope, version)) {
			return;
		}
		clearTicket();
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ['job-cuotas', scope] }),
			queryClient.invalidateQueries({ queryKey: ['job-cuotas-periodo', scope] }),
			...['socio', 'socio-deuda', 'inscripciones', 'cuotas', 'socios'].map((key) =>
				queryClient.invalidateQueries({ queryKey: [key, scope], refetchType: 'none' }),
			),
		]);
		if (current(scope, version)) {
			setRequiresCheck(false);
			setFeedback(null);
			setResult({ job, origen });
		}
	};
	const consultarResultado = async () => {
		const scope = scopeRef.current;
		const ticket = attemptedRef.current;
		if (!scope || !ticket || lockedRef.current) {
			return;
		}
		lockedRef.current = true;
		setIsPending(true);
		const version = ++generationRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			const periodoActual = await getPeriodoCuotasActual(controller.signal);
			const periodos = mismoPeriodo(periodoActual, ticket.periodo)
				? [ticket.periodo]
				: [ticket.periodo, periodoActual];
			const rows = await Promise.all(periodos.map((p) => getUltimoJobCuotas(p, controller.signal)));
			if (!current(scope, version)) {
				return;
			}
			const resolution = resolverRecuperacionGeneracion(ticket, periodoActual, rows);
			if (resolution.estado === 'recuperado') {
				await complete(resolution.job, 'recuperado', scope, version);
			} else if (resolution.estado === 'procesando') {
				setRequiresCheck(true);
				setFeedback(
					'La corrida todavía figura en proceso. Volvé a consultar su resultado antes de iniciar otra.',
				);
			} else if (resolution.estado === 'ausente') {
				clearTicket();
				setRequiresCheck(false);
				setFeedback(
					'Se consultaron los períodos del intento y no hay una corrida guardada. Podés revisar y confirmar un nuevo intento manual; no se repetirá automáticamente.',
				);
			} else {
				setRequiresCheck(true);
				setFeedback(
					'Hay corridas históricas o más de un resultado posible para este intento. Revisá el historial y volvé a consultar; no se atribuyó una corrida ni se habilitó otro envío.',
				);
			}
		} catch {
			if (current(scope, version)) {
				setRequiresCheck(true);
				setFeedback(
					'No pudimos consultar el resultado. Restablecé la conexión y volvé a consultarlo antes de generar.',
				);
			}
		} finally {
			if (current(scope, version)) {
				lockedRef.current = false;
				setIsPending(false);
			}
		}
	};
	const generar = async (periodoConfirmado: PeriodoCuotas) => {
		const scope = scopeRef.current;
		if (!scope || lockedRef.current || requiresCheck || attemptedRef.current) {
			return;
		}
		lockedRef.current = true;
		setIsPending(true);
		setFeedback(null);
		setResult(null);
		const version = ++generationRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		let submitted = false;
		let responseReceived = false;
		try {
			const periodo = await getPeriodoCuotasActual(controller.signal);
			if (!current(scope, version)) {
				return;
			}
			if (!mismoPeriodo(periodo, periodoConfirmado)) {
				setFeedback(
					'Cambió el mes del club. Actualizá el período y volvé a confirmar antes de generar.',
				);
				await queryClient.invalidateQueries({ queryKey: ['job-cuotas-periodo', scope] });
				return;
			}
			const before = await getUltimoJobCuotas(periodo, controller.signal);
			if (!current(scope, version)) {
				return;
			}
			if (before?.estado === 'exitoso') {
				await complete(before, 'ya_ejecutado', scope, version);
				return;
			}
			if (!saveTicket(periodo, before)) {
				setFeedback(
					'No se pudo conservar el estado del intento en este navegador. Habilitá el almacenamiento de la aplicación antes de generar.',
				);
				return;
			}
			if (before?.estado === 'procesando') {
				setRequiresCheck(true);
				setFeedback('Hay una corrida en proceso. Consultá su resultado antes de iniciar otra.');
				return;
			}
			submitted = true;
			const response = await mutation.mutateAsync({ signal: controller.signal });
			responseReceived = true;
			if (!current(scope, version)) {
				return;
			}
			const job = await getJobCuotas(response.job_id, controller.signal);
			if (!current(scope, version)) {
				return;
			}
			verificarResultadoGeneracion(response, job);
			await complete(job, response.resultado, scope, version);
		} catch (error) {
			if (!current(scope, version)) {
				return;
			}
			const uncertain =
				submitted &&
				(responseReceived ||
					clasificarErrorCreacion(error) === 'uncertain' ||
					(error as { responseReceived?: boolean } | null)?.responseReceived === true);
			if (uncertain) {
				setRequiresCheck(true);
				setFeedback(
					'No pudimos confirmar la corrida. Consultá el resultado guardado antes de iniciar otra generación.',
				);
			} else {
				clearTicket();
				setFeedback(
					submitted
						? 'El servidor rechazó la operación. Necesitás una sesión de Administrador activo; revisá los permisos antes de volver a intentar.'
						: 'No pudimos consultar el período o el historial antes de generar. Revisá la conexión y volvé a intentar.',
				);
			}
		} finally {
			if (current(scope, version)) {
				lockedRef.current = false;
				setIsPending(false);
			}
		}
	};
	return { generar, consultarResultado, isPending, requiresCheck, feedback, result };
}

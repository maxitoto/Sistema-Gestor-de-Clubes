import {
	type GrillaReporte,
	interpretarPaginaReporte,
	type ResultadoReporte,
} from '#shared/lib/reportes';
import type { Json } from '#shared/types/model';
import { createHumanRequestClient } from './humanRequest';
import { supabase } from './supabaseClient';

export type { GrillaReporte, ResultadoReporte } from '#shared/lib/reportes';
export interface OpcionesReporte {
	actorId?: string | undefined;
	revision?: string | undefined;
	exportar?: boolean;
}
export async function leerGrillaReporte<T>(
	grilla: GrillaReporte,
	criterios: object,
	parseFila: (v: unknown) => T,
	signal?: AbortSignal,
	opciones: OpcionesReporte = {},
): Promise<ResultadoReporte<T>> {
	const {
		data: { session },
		error: sessionError,
	} = await supabase.auth.getSession();
	if (sessionError || !session || (opciones.actorId && session.user.id !== opciones.actorId)) {
		throw new Error('La sesión cambió. Ingresá nuevamente.');
	}
	const db = await createHumanRequestClient(opciones.actorId ?? session.user.id, signal);
	const timed = signal
		? AbortSignal.any([signal, AbortSignal.timeout(30000)])
		: AbortSignal.timeout(30000);
	const { data, error } = await db
		.rpc('consultar_grilla_reporte', {
			p_grilla: grilla,
			p_criterios: criterios as Json,
			...(opciones.revision ? { p_revision: opciones.revision } : {}),
			p_exportar: opciones.exportar ?? false,
		})
		.abortSignal(timed);
	if (error) {
		if (error.code === '40001') {
			throw new Error(
				'Los datos cambiaron durante la exportación. Volvé a intentarlo; no se descargó un archivo parcial.',
			);
		}
		if (error.code === '42501') {
			throw new Error('Tu cuenta no está habilitada para consultar estos datos.');
		}
		if (error.code === 'PGRST202' || error.code === '42883') {
			throw new Error(
				'Los reportes todavía no están preparados. Reiniciá el backend con start:containers y revisá su resultado.',
			);
		}
		throw new Error(
			'No se pudo recuperar el listado completo. Revisá los filtros y volvé a intentarlo.',
		);
	}
	return interpretarPaginaReporte(data, grilla, criterios, parseFila);
}

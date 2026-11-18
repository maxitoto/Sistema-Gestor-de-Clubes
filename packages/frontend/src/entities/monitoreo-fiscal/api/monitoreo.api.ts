import { createHumanRequestClient } from '#shared/api';
import { esUuidCobranza } from '#shared/types/cobranza';
import {
	type AccionMonitoreo,
	type CriteriosMonitoreo,
	parseResultadoAccionFiscal,
	parseResultadoMonitoreo,
} from '../model/monitoreoContract';

async function request(path: string, actorId: string, body?: object, signal?: AbortSignal) {
	const client = await createHumanRequestClient(actorId, signal);
	const { data, error } = await client.functions.invoke(`monitoreo${path}`, {
		method: body ? 'POST' : 'GET',
		...(body ? { body } : {}),
		...(signal ? { signal } : {}),
	});
	if (error) {
		let message =
				'No se pudo confirmar la operación fiscal. Consultá el estado antes de repetirla.',
			status = 503;
		if (error.context instanceof Response) {
			status = error.context.status;
			try {
				const value: unknown = await error.context.json();
				if (
					value &&
					typeof value === 'object' &&
					'error' in value &&
					typeof value.error === 'string' &&
					value.error.length <= 700
				) {
					message = value.error;
				}
			} catch {}
		}
		throw Object.assign(new Error(message), { status });
	}
	return data;
}
export async function getMonitoreoFiscal(
	criteria: CriteriosMonitoreo,
	actorId: string,
	signal?: AbortSignal,
) {
	if (criteria.desde && criteria.hasta && criteria.desde > criteria.hasta) {
		throw new Error('La fecha inicial debe ser anterior o igual a la final.');
	}
	const params = new URLSearchParams({
		page: String(criteria.page),
		pageSize: String(criteria.pageSize),
		estado: criteria.estado,
		tipo: criteria.tipo,
	});
	if (criteria.q.trim()) {
		params.set('q', criteria.q.trim());
	}
	if (criteria.desde) {
		params.set('desde', criteria.desde);
	}
	if (criteria.hasta) {
		params.set('hasta', criteria.hasta);
	}
	return parseResultadoMonitoreo(await request(`?${params}`, actorId, undefined, signal), criteria);
}
export async function ejecutarAccionFiscal(
	accion: AccionMonitoreo,
	id: string,
	actorId: string,
	signal?: AbortSignal,
) {
	if (!esUuidCobranza(id)) {
		throw new Error('La identificación del comprobante no es válida.');
	}
	return parseResultadoAccionFiscal(
		await request(`/${accion}`, actorId, { comprobanteId: id }, signal),
	);
}

import { createHumanRequestClient } from '#shared/api';
import {
	crearConsultaSerieRequest,
	parseConsultaSerieFiscal,
} from '../model/consultaSerieFiscalContract';
import { parseDiagnosticoFiscal } from '../model/diagnosticoFiscalContract';
import { parseDocumentoComprobante, parseEstadoFiscal } from '../model/fiscalContract';

async function request(
	path: string,
	actorId: string,
	body?: object,
	signal?: AbortSignal,
): Promise<unknown> {
	const client = await createHumanRequestClient(actorId, signal);
	const { data, error } = await client.functions.invoke(`arca${path}`, {
		method: body ? 'POST' : 'GET',
		...(body ? { body } : {}),
		...(signal ? { signal } : {}),
	});
	if (error) {
		let mensaje =
			'No se pudo confirmar la operación documental. Consultá el estado antes de repetir.';
		let status = 503;
		if (error.context instanceof Response) {
			status = error.context.status;
			try {
				const v: unknown = await error.context.json();
				if (
					v &&
					typeof v === 'object' &&
					'error' in v &&
					typeof v.error === 'string' &&
					v.error.length <= 700
				) {
					mensaje = v.error;
				}
			} catch {}
		}
		throw Object.assign(new Error(mensaje), { status });
	}
	return data;
}
export async function getEstadoComprobante(id: string, actorId: string, signal?: AbortSignal) {
	return parseEstadoFiscal(await request(`/comprobantes/${id}`, actorId, undefined, signal), id);
}
export async function emitirComprobante(id: string, actorId: string, signal?: AbortSignal) {
	return parseEstadoFiscal(await request('/emitir', actorId, { comprobanteId: id }, signal), id);
}
export async function generarPdfComprobante(id: string, actorId: string, signal?: AbortSignal) {
	return parseDocumentoComprobante(
		await request('/pdf', actorId, { comprobanteId: id }, signal),
		id,
		process.env.PUBLIC_SUPABASE_URL ?? '',
	);
}
export async function diagnosticarFiscal(actorId: string, signal?: AbortSignal) {
	return parseDiagnosticoFiscal(await request('/diagnostico', actorId, {}, signal));
}

export async function consultarSerieFiscal(
	tipoComprobante: number,
	actorId: string,
	signal?: AbortSignal,
) {
	const body = crearConsultaSerieRequest(tipoComprobante);
	return parseConsultaSerieFiscal(
		await request('/diagnostico/serie', actorId, body, signal),
		tipoComprobante,
	);
}

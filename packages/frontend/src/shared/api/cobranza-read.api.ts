import {
	type CriteriosCobranza,
	parseResultadoCobranza,
	type VistaCobranza,
} from '#shared/types/cobranza';
import { supabase } from './supabaseClient';
export async function solicitarCobranza(
	path: string,
	payload: object,
	actorId: string,
	signal?: AbortSignal,
): Promise<unknown> {
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();
	if (error || !session || session.user.id !== actorId) {
		throw Object.assign(new Error('La sesión cambió. Volvé a consultar la operación.'), {
			status: 401,
		});
	}
	const response = await fetch(`${process.env.PUBLIC_SUPABASE_URL}/rest/v1/rpc/${path}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${session.access_token}`,
			apikey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
		signal: signal
			? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
			: AbortSignal.timeout(20_000),
	});
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw Object.assign(new Error('No pudimos verificar la respuesta del servidor.'), {
			status: 502,
			responseReceived: response.ok,
		});
	}
	if (!response.ok) {
		const message =
			body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
				? body.message
				: 'No se pudo completar la consulta de cobranza.';
		const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
		throw Object.assign(new Error(message), { status: response.status, code });
	}
	return body;
}
export async function leerCobranza(
	vista: VistaCobranza,
	criterios: Partial<CriteriosCobranza>,
	actorId: string,
	signal?: AbortSignal,
) {
	return parseResultadoCobranza(
		await solicitarCobranza(
			'consultar_cobranza',
			{ p_vista: vista, p_criterios: criterios },
			actorId,
			signal,
		),
	);
}

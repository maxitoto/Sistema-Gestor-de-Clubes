import {
	type EstadoBajaCorreo,
	type ParametrosBajaCorreo,
	parseEstadoBaja,
} from '../model/desuscribirContract';

async function llamarBaja(
	metodo: 'GET' | 'POST',
	params: ParametrosBajaCorreo,
	signal?: AbortSignal,
): Promise<EstadoBajaCorreo> {
	const baseUrl = process.env.PUBLIC_SUPABASE_URL;
	const apiKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
	if (!baseUrl || !apiKey) {
		return 'error';
	}
	const query = new URLSearchParams({ id: params.id, firma: params.firma });
	const response = await fetch(
		`${baseUrl}/functions/v1/comunicaciones/desuscribir?${query.toString()}`,
		{
			method: metodo,
			headers: {
				Accept: 'application/json',
				apikey: apiKey,
			},
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
				: AbortSignal.timeout(15_000),
		},
	);
	const body: unknown = await response.json().catch(() => null);
	return parseEstadoBaja(body);
}

export function verificarEnlaceBaja(
	params: ParametrosBajaCorreo,
	signal?: AbortSignal,
): Promise<EstadoBajaCorreo> {
	return llamarBaja('GET', params, signal);
}

export function confirmarBajaCorreo(
	params: ParametrosBajaCorreo,
	signal?: AbortSignal,
): Promise<EstadoBajaCorreo> {
	return llamarBaja('POST', params, signal);
}

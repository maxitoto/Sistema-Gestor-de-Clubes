import { supabase } from '#shared/api';

export interface EstadoFiscal {
	configurado: boolean;
	vencimiento: string | null;
	diasRestantes: number | null;
	alerta: 'sin_cargar' | 'vigente' | 'por_vencer' | 'vencido';
	entorno: 'homologacion';
}
async function request(options: RequestInit, signal?: AbortSignal): Promise<EstadoFiscal> {
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();
	if (error || !session) {
		throw new Error('Volvé a iniciar sesión.');
	}
	const headers = new Headers(options.headers);
	headers.set('Authorization', `Bearer ${session.access_token}`);
	headers.set('apikey', process.env.PUBLIC_SUPABASE_ANON_KEY ?? '');
	const response = await fetch(
		`${process.env.PUBLIC_SUPABASE_URL}/functions/v1/configuracion/fiscal`,
		{
			...options,
			headers,
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
				: AbortSignal.timeout(30_000),
		},
	);
	const body: unknown = await response.json();
	if (!response.ok) {
		throw new Error(
			body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
				? body.error
				: 'No se pudo completar la operación fiscal.',
		);
	}
	if (
		!body ||
		typeof body !== 'object' ||
		!('configurado' in body) ||
		typeof body.configurado !== 'boolean' ||
		!('vencimiento' in body) ||
		(body.vencimiento !== null && typeof body.vencimiento !== 'string') ||
		!('diasRestantes' in body) ||
		(body.diasRestantes !== null && typeof body.diasRestantes !== 'number') ||
		!('alerta' in body) ||
		!['sin_cargar', 'vigente', 'por_vencer', 'vencido'].includes(String(body.alerta)) ||
		!('entorno' in body) ||
		body.entorno !== 'homologacion'
	) {
		throw new Error('No se pudo verificar el estado fiscal.');
	}
	return body as EstadoFiscal;
}
export const getEstadoFiscal = (signal?: AbortSignal) => request({ method: 'GET' }, signal);
export function guardarCredencialesFiscales(
	input: { certificado: File; clave: File },
	signal?: AbortSignal,
) {
	const form = new FormData();
	form.set('certificado', input.certificado);
	form.set('clave', input.clave);
	form.set('entorno', 'homologacion');
	return request({ method: 'POST', body: form }, signal);
}

import type { Session } from '@supabase/supabase-js';

async function request(input: object, signal?: AbortSignal): Promise<{ session?: unknown }> {
	const response = await fetch(`${process.env.PUBLIC_SUPABASE_URL}/functions/v1/acceso`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
		},
		body: JSON.stringify(input),
		signal: signal
			? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
			: AbortSignal.timeout(20_000),
	});
	const body: unknown = await response.json();
	if (!response.ok) {
		const message =
			response.status === 429
				? 'Se alcanzó el límite de solicitudes. Esperá antes de volver a intentarlo.'
				: response.status === 400 || response.status === 401
					? 'Correo o contraseña incorrectos.'
					: 'No pudimos conectar con el servicio de acceso. Volvé a intentarlo.';
		throw Object.assign(new Error(message), { status: response.status });
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new Error('El servicio de acceso devolvió una respuesta inválida.');
	}
	return body as { session?: unknown };
}

export async function requestLogin(
	email: string,
	password: string,
	signal?: AbortSignal,
): Promise<Session> {
	const body = await request({ operacion: 'login', email, password }, signal);
	const session = body.session;
	if (
		!session ||
		typeof session !== 'object' ||
		!('access_token' in session) ||
		typeof session.access_token !== 'string' ||
		!('refresh_token' in session) ||
		typeof session.refresh_token !== 'string'
	) {
		throw new Error('No se pudo verificar la sesión. Volvé a intentarlo.');
	}
	return session as Session;
}

export async function requestRecovery(email: string): Promise<void> {
	await request({ operacion: 'recuperar', email });
}

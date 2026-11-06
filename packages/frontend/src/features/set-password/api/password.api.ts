import { supabase } from '#shared/api';
import type { PasswordCallback } from '../model/passwordForm';
export async function updatePassword(input: {
	password: string;
	userId?: string;
	currentPassword?: string;
	callback?: PasswordCallback;
}): Promise<void> {
	const headers = new Headers({
		'Content-Type': 'application/json',
		apikey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
	});
	if (!input.callback) {
		const { data, error } = await supabase.auth.getSession();
		if (error || !data.session || data.session.user.id !== input.userId) {
			throw new Error('La sesión cambió. Volvé a iniciar el proceso con tu cuenta.');
		}
		headers.set('Authorization', `Bearer ${data.session.access_token}`);
	}
	let response: Response;
	try {
		response = await fetch(
			`${process.env.PUBLIC_SUPABASE_URL}/functions/v1/credenciales/${input.callback ? 'establecer' : 'cambiar'}`,
			{
				method: 'POST',
				headers,
				body: JSON.stringify(
					input.callback
						? {
								password: input.password,
								token_hash: input.callback.tokenHash,
								type: input.callback.type,
							}
						: { password: input.password, currentPassword: input.currentPassword },
				),
				signal: AbortSignal.timeout(40_000),
			},
		);
	} catch {
		throw new Error(
			'No pudimos confirmar el cambio. Intentá ingresar con la contraseña nueva antes de repetirlo.',
		);
	}
	const result: unknown = await response.json();
	if (!response.ok) {
		const message =
			result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
				? result.error
				: 'No pudimos confirmar el cambio. Intentá ingresar con la contraseña nueva antes de repetirlo.';
		throw new Error(message);
	}
	if (
		!result ||
		typeof result !== 'object' ||
		!('actualizado' in result) ||
		result.actualizado !== true
	) {
		throw new Error('No pudimos verificar el resultado. Intentá ingresar con la contraseña nueva.');
	}
}

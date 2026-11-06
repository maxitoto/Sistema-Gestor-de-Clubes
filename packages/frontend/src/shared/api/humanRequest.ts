import { createClient } from '@supabase/supabase-js';
import type { Database } from '#shared/types/model';
import { supabase } from './supabaseClient';
/** Captura la identidad que autorizó la acción, sin reutilizar una sesión mutable al enviar. */
export async function createHumanRequestClient(actorId: string, signal?: AbortSignal) {
	signal?.throwIfAborted();
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();
	signal?.throwIfAborted();
	if (error || !session || !actorId || session.user.id !== actorId) {
		throw Object.assign(new Error('La sesión cambió. Volvé a abrir la operación con tu cuenta.'), {
			status: 401,
		});
	}
	const url = process.env.PUBLIC_SUPABASE_URL,
		key = process.env.PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) {
		throw new Error('Falta la configuración pública del entorno.');
	}
	return createClient<Database>(url, key, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
			storageKey: `club-human-request-${crypto.randomUUID()}`,
		},
		global: {
			headers: { Authorization: `Bearer ${session.access_token}` },
			fetch: ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
				const signals = [AbortSignal.timeout(30_000)];
				if (signal) {
					signals.push(signal);
				}
				if (init?.signal) {
					signals.push(init.signal);
				}
				return fetch(input, { ...init, signal: AbortSignal.any(signals) });
			}) as typeof fetch,
		},
	});
}

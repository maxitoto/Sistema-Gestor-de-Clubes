// src/shared/utils/supabaseClient.ts

import { createClient } from '@supabase/supabase-js';
import type { Database } from '#shared/types/model';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Falta la configuración pública de conexión del sistema.');
}

// Clave propia: permite quitar la sesión local incluso si falla la revocación remota.
// Al adoptar esta clave, las sesiones anteriores deberán iniciar sesión nuevamente.
const storageKey = 'club.auth.session';
export function clearStoredSession(): void {
	for (const key of [storageKey, `${storageKey}-code-verifier`, `${storageKey}-user`]) {
		try {
			window.localStorage.removeItem(key);
		} catch {
			/* Almacenamiento deshabilitado. */
		}
	}
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
	auth: { storageKey },
});

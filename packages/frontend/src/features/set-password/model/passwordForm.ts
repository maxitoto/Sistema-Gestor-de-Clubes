export const PASSWORD_HELP = 'Usá al menos 8 caracteres, una mayúscula y un número.';

export function validatePassword(password: string, confirmation: string): string | null {
	if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
		return PASSWORD_HELP;
	}
	if (password !== confirmation) {
		return 'Las contraseñas no coinciden.';
	}
	return null;
}

export type PasswordCallback = { tokenHash: string; type: 'invite' | 'recovery' };

// Sólo fragmento: el token no se envía como parte de la solicitud al frontend.
// No se aceptan destino libre, access_token ni tipos ajenos a estos dos flujos.
export function parsePasswordCallback(hash: string): PasswordCallback | null {
	const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
	const keys = [...params.keys()];
	const tokenHash = params.get('token_hash');
	const type = params.get('type');
	if (
		keys.length !== 2 ||
		new Set(keys).size !== 2 ||
		!tokenHash ||
		!/^[a-f0-9]{56}$/i.test(tokenHash) ||
		(type !== 'invite' && type !== 'recovery')
	) {
		return null;
	}
	return { tokenHash, type };
}

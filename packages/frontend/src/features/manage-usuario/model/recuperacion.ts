import type { ComandoUsuario, ResultadoUsuario } from '#entities/usuario';
export function comandoParaRetomar(
	command: ComandoUsuario,
	result: ResultadoUsuario | null,
	nuevaId: string,
): ComandoUsuario {
	if (!result) {
		return command;
	}
	if (result.operacionId !== command.operacionId) {
		throw new Error('El resultado pertenece a otro intento.');
	}
	if (result.resultado === 'enlace_pendiente') {
		if (!result.puedeReenviar) {
			throw new Error('La cuenta no admite reenvío. Consultá su estado.');
		}
		return { operacion: 'reenviar', operacionId: nuevaId, usuarioId: result.usuarioId };
	}
	if (result.resultado !== 'datos_pendientes' && result.resultado !== 'sesiones_pendientes') {
		throw new Error('Consultá el estado antes de retomar esta acción.');
	}
	return command;
}

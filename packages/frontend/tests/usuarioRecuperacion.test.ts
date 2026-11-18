import { describe, expect, test } from 'bun:test';
import type { ComandoUsuario, ResultadoUsuario } from '../src/entities/usuario';
import { comandoParaRetomar } from '../src/features/manage-usuario/model/recuperacion';

const command: ComandoUsuario = {
	operacion: 'crear',
	operacionId: 'intento-original',
	nombre: 'Prueba',
	apellido: 'Local',
	email: 'prueba@v2.example.test',
	rol: 'responsable',
};
const result = (
	resultado: ResultadoUsuario['resultado'],
	extra: Partial<ResultadoUsuario> = {},
): ResultadoUsuario => ({
	operacionId: command.operacionId,
	usuarioId: 'usuario-reservado',
	usuario: null,
	resultado,
	mensaje: 'Resultado',
	revocacionPendiente: false,
	puedeReenviar: true,
	enlaceEnviadoEn: null,
	actualizadoEn: '2026-10-24T00:00:00Z',
	...extra,
});
describe('recuperación de gestión administrativa', () => {
	test('sin registro retoma la misma identidad y payload ante respuesta perdida', () => {
		expect(comandoParaRetomar(command, null, 'nueva')).toEqual(command);
	});
	test('envío incierto requiere reenvío explícito con identidad nueva y cuenta existente', () => {
		const next = comandoParaRetomar(command, result('enlace_pendiente'), 'reenvio-explicito');
		expect(next).toEqual({
			operacion: 'reenviar',
			operacionId: 'reenvio-explicito',
			usuarioId: 'usuario-reservado',
		});
		expect('email' in next).toBe(false);
	});
	test('respuesta de otra operación no se usa para confirmar ni descartar el intento', () => {
		expect(() =>
			comandoParaRetomar(command, result('completo', { operacionId: 'otra' }), 'nueva'),
		).toThrow('otro intento');
	});
	test('no convierte el reenvío en reset de una cuenta no elegible', () => {
		expect(() =>
			comandoParaRetomar(command, result('enlace_pendiente', { puedeReenviar: false }), 'nueva'),
		).toThrow('no admite reenvío');
	});
	test('perfil o revocación parciales conservan operación y cuenta original', () => {
		for (const state of ['datos_pendientes', 'sesiones_pendientes'] as const) {
			expect(comandoParaRetomar(command, result(state), 'nueva')).toEqual(command);
		}
	});
	test('una operación en curso, terminada o rechazada nunca se relanza desde recuperar', () => {
		for (const state of ['en_proceso', 'completo', 'rechazado'] as const) {
			expect(() => comandoParaRetomar(command, result(state), 'nueva')).toThrow();
		}
	});
});

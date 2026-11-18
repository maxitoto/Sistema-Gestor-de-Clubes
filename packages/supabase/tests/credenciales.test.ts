import { describe, expect, test } from 'bun:test';
import { validarCredencial } from '../functions/_shared/modules/credenciales/domain/solicitud.ts';

describe('cambio de clave con contrato cerrado', () => {
	test('no consume el enlace para contraseñas que no cumplen política exacta', () => {
		for (const password of ['ABC1234', 'abc12345', 'ABCDEFGH'])
			expect(() =>
				validarCredencial('establecer', {
					password,
					token_hash: 'a'.repeat(56),
					type: 'recovery',
				}),
			).toThrow();
		expect(
			validarCredencial('establecer', {
				password: 'ABC12345',
				token_hash: 'a'.repeat(56),
				type: 'recovery',
			}),
		).toEqual({
			tipo: 'establecer',
			password: 'ABC12345',
			token_hash: 'a'.repeat(56),
			type: 'recovery',
		});
	});
	test('prohíbe actor/body y modificar roles/email por el circuito de contraseña', () => {
		for (const extra of [
			{ id: crypto.randomUUID() },
			{ email: 'otra@v2.example.test' },
			{ rol: 'admin' },
			{ type: 'signup' },
		])
			expect(() =>
				validarCredencial('cambiar', {
					password: 'ABC12345',
					currentPassword: 'ANTERIOR123',
					...extra,
				}),
			).toThrow();
		expect(() =>
			validarCredencial('cambiar', { password: 'ABC12345', currentPassword: '' }),
		).toThrow();
		expect(
			validarCredencial('cambiar', {
				password: 'ABC12345',
				currentPassword: 'ANTERIOR123',
			}),
		).toEqual({
			tipo: 'cambiar',
			password: 'ABC12345',
			currentPassword: 'ANTERIOR123',
		});
	});
});

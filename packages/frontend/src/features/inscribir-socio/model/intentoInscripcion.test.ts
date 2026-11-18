import { describe, expect, test } from 'bun:test';
import { requiereRecuperacionInscripcion } from './intentoInscripcion';

describe('incertidumbre del intento de inscripción', () => {
	test('respuesta recibida y posterior error de permiso siempre exige recuperación', () => {
		expect(requiereRecuperacionInscripcion(true, { code: '42501', status: 403 })).toBe(true);
	});
	test('timeout, red y respuesta inválida exigen recuperación', () => {
		expect(requiereRecuperacionInscripcion(false, new TypeError('Failed to fetch'))).toBe(true);
		expect(requiereRecuperacionInscripcion(false, { status: 408 })).toBe(true);
		expect(requiereRecuperacionInscripcion(false, new Error('JSON inesperado'))).toBe(true);
	});
	test('rechazo transaccional previo a respuesta no se presenta como éxito', () => {
		expect(requiereRecuperacionInscripcion(false, { code: 'P0001', status: 400 })).toBe(false);
		expect(requiereRecuperacionInscripcion(false, { code: '42501', status: 403 })).toBe(false);
	});
});

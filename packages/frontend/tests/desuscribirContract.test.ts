import { describe, expect, test } from 'bun:test';
import {
	leerParametrosBaja,
	MENSAJES_BAJA_CORREO,
	parseEstadoBaja,
} from '../src/features/desuscribir-correo/model/desuscribirContract';

const validId = '93b55c3e-19d7-4565-852a-e42824792c12';

describe('Contrato de desuscripción de correo', () => {
	test('acepta id UUID válido y firma presente', () => {
		const params = new URLSearchParams({ id: validId, firma: 'firma-valida-123' });
		expect(leerParametrosBaja(params)).toEqual({ id: validId, firma: 'firma-valida-123' });
	});

	test('rechaza parámetros faltantes, UUID inválido o firma excesiva', () => {
		expect(leerParametrosBaja(new URLSearchParams())).toBeNull();
		expect(leerParametrosBaja(new URLSearchParams({ id: 'no-uuid', firma: 'abc' }))).toBeNull();
		expect(leerParametrosBaja(new URLSearchParams({ id: validId, firma: '   ' }))).toBeNull();
		expect(
			leerParametrosBaja(new URLSearchParams({ id: validId, firma: 'a'.repeat(257) })),
		).toBeNull();
	});

	test('valida los 7 estados oficiales y degrada respuestas desconocidas a error', () => {
		for (const estado of [
			'confirmar',
			'confirmada',
			'ya_confirmada',
			'direccion_antigua',
			'no_disponible',
			'invalido',
			'error',
		] as const) {
			expect(parseEstadoBaja({ estado })).toBe(estado);
			expect(MENSAJES_BAJA_CORREO[estado].titulo.length).toBeGreaterThan(0);
		}
		expect(parseEstadoBaja(null)).toBe('error');
		expect(parseEstadoBaja({})).toBe('error');
		expect(parseEstadoBaja({ estado: 'otro' })).toBe('error');
	});
});

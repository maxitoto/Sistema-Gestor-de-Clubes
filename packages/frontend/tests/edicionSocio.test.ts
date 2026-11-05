import { describe, expect, test } from 'bun:test';
import {
	coincideEdicionSocio,
	formularioDesdeSocio,
	payloadEdicionSocio,
	type SocioDetalle,
	validarSocioForm,
} from '../src/entities/socio';

const socio: SocioDetalle = {
	id: '11111111-1111-4111-8111-111111111111',
	numero_socio: 42,
	dni: '00001',
	nombre: 'Persona',
	apellido: 'Sintética',
	fecha_nacimiento: '1990-01-01',
	email: null,
	telefono: null,
	direccion: null,
	foto_url: null,
	estado: 'activo',
	acepta_comunicaciones: false,
	email_invalido: true,
	contacto_emergencia_nombre: null,
	contacto_emergencia_telefono: null,
	fecha_alta: '2026-01-01',
	fecha_baja: null,
	dni_anterior: null,
	dni_corregido_at: null,
	dni_corregido_por: null,
	created_at: '2026-01-01T12:00:00Z',
	updated_at: '2026-01-01T12:00:00Z',
};

describe('edición humana conserva identidad y preferencias', () => {
	test('formulario explicita nulos y no transforma consentimiento falso', () => {
		const form = formularioDesdeSocio(socio);
		expect(form.dni).toBe('00001');
		expect(form.email).toBe('');
		expect(form.acepta_comunicaciones).toBe(false);
		expect('numero_socio' in form).toBe(false);
		expect('email_invalido' in form).toBe(false);
	});
	test('payload de Responsable excluye DNI e identidad aun si llegan extras', () => {
		const validated = validarSocioForm(formularioDesdeSocio(socio));
		if (!validated.valid) {
			throw new Error('Fixture inválido');
		}
		const payload = payloadEdicionSocio(
			{
				...validated.payload,
				id: 'otro',
				numero_socio: 500,
				estado: 'inactivo',
			} as typeof validated.payload,
			false,
		);
		expect(Object.keys(payload).sort()).toEqual(
			[
				'acepta_comunicaciones',
				'apellido',
				'contacto_emergencia_nombre',
				'contacto_emergencia_telefono',
				'direccion',
				'email',
				'fecha_nacimiento',
				'nombre',
				'telefono',
			].sort(),
		);
	});
	test('corrección administrativa sólo agrega documento, auditoría queda fuera', () => {
		const validated = validarSocioForm({ ...formularioDesdeSocio(socio), dni: '00002' });
		if (!validated.valid) {
			throw new Error('Fixture inválido');
		}
		const payload = payloadEdicionSocio(validated.payload, true);
		expect(payload.dni).toBe('00002');
		expect('dni_anterior' in payload).toBe(false);
		expect('dni_corregido_por' in payload).toBe(false);
		expect(coincideEdicionSocio(socio, payload)).toBe(false);
		expect(coincideEdicionSocio({ ...socio, dni: '00002' }, payload)).toBe(true);
	});
	test('conciliación exige todos los valores incluidos y no exige un DNI omitido', () => {
		const validated = validarSocioForm(formularioDesdeSocio(socio));
		if (!validated.valid) {
			throw new Error('Fixture inválido');
		}
		const payload = payloadEdicionSocio(validated.payload, false);
		expect(coincideEdicionSocio(socio, payload)).toBe(true);
		expect(coincideEdicionSocio({ ...socio, acepta_comunicaciones: true }, payload)).toBe(false);
		expect(coincideEdicionSocio({ ...socio, email: '' }, payload)).toBe(false);
		expect(coincideEdicionSocio({ ...socio, dni: '00003' }, payload)).toBe(true);
	});
});

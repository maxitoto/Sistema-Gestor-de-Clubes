import { describe, expect, test } from 'bun:test';
import { cuitValido, toClubUpdate } from '../src/features/update-config/model/clubForm';

const form = {
	nombre: ' Club sintético ',
	cuit: '30-12345678-1',
	domicilio_fiscal: ' Domicilio de prueba ',
	email_contacto: ' club@example.test ',
	punto_venta: '1',
};
describe('configuración institucional', () => {
	test('valida el CUIT con el mismo módulo11 del contratoSQL', () => {
		expect(cuitValido(form.cuit)).toBe(true);
		expect(cuitValido('30123456781')).toBe(false);
		expect(cuitValido('30-12345678-0')).toBe(false);
	});
	test('sólo envía campos institucionales y conserva el contacto', () => {
		const payload = toClubUpdate({
			...form,
			logo_url: 'https://ejemplo.test',
			certificado_key: 'no permitido',
		} as typeof form);
		expect(Object.keys(payload).sort()).toEqual([
			'cuit',
			'domicilio_fiscal',
			'email_contacto',
			'nombre',
			'punto_venta',
		]);
		expect(payload.email_contacto).toBe('club@example.test');
		expect(payload.nombre).toBe('Club sintético');
	});
	test('punto de venta es entero decimal1a99999', () => {
		for (const punto_venta of ['0', '100000', '1.2', '1e3', '-1', '']) {
			expect(() => toClubUpdate({ ...form, punto_venta })).toThrow();
		}
		expect(toClubUpdate({ ...form, punto_venta: '99999' }).punto_venta).toBe(99999);
	});
	test('rechaza contacto no válido y datos vacíos', () => {
		expect(() => toClubUpdate({ ...form, email_contacto: 'mal' })).toThrow();
		expect(() => toClubUpdate({ ...form, nombre: ' ' })).toThrow();
	});
});

import { describe, expect, test } from 'bun:test';
import {
	edadSocio,
	fechaBuenosAires,
	fechaCalendarioValida,
	formularioSocioInicial,
	validarSocioForm,
} from '../src/features/create-socio/model/socioForm';

const now = new Date('2026-10-23T15:00:00Z');
const adult = () => ({
	...formularioSocioInicial(),
	dni: ' 000123ABC ',
	nombre: ' Ana ',
	apellido: ' Prueba ',
	fecha_nacimiento: '1990-05-20',
});

describe('Alta de socio: contrato de calendario y datos', () => {
	test('conserva ceros/documento alfanumérico, normaliza vacíos y consentimiento explícito', () => {
		const result = validarSocioForm({ ...adult(), acepta_comunicaciones: false }, now);
		expect(result.valid).toBe(true);
		if (!result.valid) {
			return;
		}
		expect(result.payload.dni).toBe('000123ABC');
		expect(result.payload.nombre).toBe('Ana');
		expect(result.payload.email).toBeNull();
		expect(result.payload.telefono).toBeNull();
		expect(result.payload.direccion).toBeNull();
		expect(result.payload.acepta_comunicaciones).toBe(false);
	});
	test('valida calendario sin normalizar 30 de febrero ni confundir años bisiestos', () => {
		expect(fechaCalendarioValida('2026-02-30')).toBe(false);
		expect(fechaCalendarioValida('2024-02-29')).toBe(true);
		expect(fechaCalendarioValida('1900-02-29')).toBe(false);
		expect(fechaCalendarioValida('2000-02-29')).toBe(true);
		expect(fechaCalendarioValida('0000-01-01')).toBe(false);
		expect(fechaCalendarioValida('2026-13-01')).toBe(false);
	});
	test('la fecha de Buenos Aires puede ser el día previo al UTC', () => {
		const localMidnight = new Date('2026-10-23T01:30:00Z');
		expect(fechaBuenosAires(localMidnight)).toBe('2026-10-22');
		const result = validarSocioForm(
			{
				...adult(),
				fecha_nacimiento: '2026-10-23',
				contacto_emergencia_nombre: 'Contacto',
				contacto_emergencia_telefono: '000',
			},
			localMidnight,
		);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors.fecha_nacimiento).toContain('futura');
		}
	});
	test('cumplir 18 hoy permite omitir emergencia; cumplir mañana todavía requiere ambos contactos', () => {
		expect(edadSocio('2008-10-23', '2026-10-23')).toBe(18);
		expect(validarSocioForm({ ...adult(), fecha_nacimiento: '2008-10-23' }, now).valid).toBe(true);
		const result = validarSocioForm({ ...adult(), fecha_nacimiento: '2008-10-24' }, now);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors.contacto_emergencia_nombre).toBeDefined();
			expect(result.errors.contacto_emergencia_telefono).toBeDefined();
		}
	});
	test('menor con un solo contacto sigue rechazado y con ambos pasa', () => {
		const minor = {
			...adult(),
			fecha_nacimiento: '2015-01-01',
			contacto_emergencia_nombre: '  Contacto sintético  ',
		};
		const incomplete = validarSocioForm(minor, now);
		expect(incomplete.valid).toBe(false);
		if (!incomplete.valid) {
			expect(incomplete.errors.contacto_emergencia_telefono).toBeDefined();
		}
		const complete = validarSocioForm(
			{ ...minor, contacto_emergencia_telefono: ' 000-PRUEBA ' },
			now,
		);
		expect(complete.valid).toBe(true);
		if (complete.valid) {
			expect(complete.payload.contacto_emergencia_nombre).toBe('Contacto sintético');
		}
	});
	test('nacimiento 29/2 conserva frontera de edad equivalente al calendario SQL', () => {
		expect(edadSocio('2008-02-29', '2026-02-28')).toBe(17);
		expect(edadSocio('2008-02-29', '2026-03-01')).toBe(18);
	});
	test('documento obligatorio máximo20 sin imponer patrón adicional', () => {
		expect(validarSocioForm({ ...adult(), dni: 'DOC / 00-X' }, now).valid).toBe(true);
		expect(validarSocioForm({ ...adult(), dni: ' '.repeat(3) }, now).valid).toBe(false);
		expect(validarSocioForm({ ...adult(), dni: '1'.repeat(21) }, now).valid).toBe(false);
	});
	test('aplica límites a texto y contactos opcionales de adulto', () => {
		const result = validarSocioForm(
			{
				...adult(),
				nombre: 'x'.repeat(101),
				telefono: 'x'.repeat(51),
				contacto_emergencia_nombre: 'x'.repeat(151),
				contacto_emergencia_telefono: 'x'.repeat(51),
			},
			now,
		);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(Object.keys(result.errors).sort()).toEqual(
				['nombre', 'telefono', 'contacto_emergencia_nombre', 'contacto_emergencia_telefono'].sort(),
			);
		}
	});
	test('email ingresado debe tener forma válida y no exceder255', () => {
		expect(validarSocioForm({ ...adult(), email: 'invalido' }, now).valid).toBe(false);
		expect(
			validarSocioForm({ ...adult(), email: `${'a'.repeat(250)}@example.test` }, now).valid,
		).toBe(false);
		expect(validarSocioForm({ ...adult(), email: 'persona@example.test' }, now).valid).toBe(true);
	});
	test('el payload excluye campos de sistema incluso si llegan propiedades extra', () => {
		const injected = {
			...adult(),
			id: 'no',
			numero_socio: 9,
			estado: 'inactivo',
			email_invalido: true,
			foto_url: 'no',
			created_at: 'no',
			dni_anterior: 'no',
		};
		const result = validarSocioForm(injected, now);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(Object.keys(result.payload).sort()).toEqual(
				[
					'dni',
					'nombre',
					'apellido',
					'fecha_nacimiento',
					'email',
					'telefono',
					'direccion',
					'acepta_comunicaciones',
					'contacto_emergencia_nombre',
					'contacto_emergencia_telefono',
				].sort(),
			);
		}
	});
});

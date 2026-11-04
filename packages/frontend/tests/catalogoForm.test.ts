import { describe, expect, test } from 'bun:test';
import { validarCategoriaForm } from '../src/features/create-categoria/model/categoriaForm';
import { validarDeporteForm } from '../src/features/create-deporte/model/deporteForm';
import { clasificarErrorCreacion } from '../src/shared/lib/useHumanCreate';

const base = {
	deporte_id: 'b1111111-1111-1111-1111-111111111111',
	nombre: 'Sub 17',
	arancel_mensual: '1500.25',
	edad_min: '10',
	edad_max: '17',
};
describe('contrato de alta de catálogo', () => {
	test('nombre obligatorio, máximo 100 y descripción nullable', () => {
		expect(validarDeporteForm({ nombre: ' ', descripcion: '' }).valid).toBe(false);
		expect(validarDeporteForm({ nombre: 'a'.repeat(101), descripcion: '' }).valid).toBe(false);
		expect(validarDeporteForm({ nombre: ' Fútbol ', descripcion: ' ' })).toEqual({
			valid: true,
			payload: { nombre: 'Fútbol', descripcion: null },
		});
	});
	test('arancel positivo de dos decimales, sin redondeo', () => {
		for (const amount of ['0', '0.00', '-1', '12.345', '1e3', '100000000', '1,50', '']) {
			expect(validarCategoriaForm({ ...base, arancel_mensual: amount }).valid).toBe(false);
		}
		for (const amount of ['0.01', '10', '10.20', '99999999.99']) {
			expect(validarCategoriaForm({ ...base, arancel_mensual: amount }).valid).toBe(true);
		}
	});
	test('ambas edades nulas o enteras ordenadas', () => {
		expect(validarCategoriaForm({ ...base, edad_min: '', edad_max: '' })).toMatchObject({
			valid: true,
			payload: { edad_min: null, edad_max: null },
		});
		for (const [min, max] of [
			['', '17'],
			['10', ''],
			['18', '17'],
			['-1', '17'],
			['1.5', '17'],
			['0', '2147483648'],
		]) {
			expect(
				validarCategoriaForm({ ...base, edad_min: min ?? '', edad_max: max ?? '' }).valid,
			).toBe(false);
		}
		expect(validarCategoriaForm({ ...base, edad_min: '0', edad_max: '0' }).valid).toBe(true);
	});
	test('payload explícito y nombre conserva semántica de mayúsculas', () => {
		expect(validarCategoriaForm(base)).toEqual({
			valid: true,
			payload: {
				deporte_id: base.deporte_id,
				nombre: 'Sub 17',
				arancel_mensual: 1500.25,
				edad_min: 10,
				edad_max: 17,
			},
		});
	});
	test('errores únicos, permisos y resultado incierto requieren distinto tratamiento', () => {
		expect(clasificarErrorCreacion({ code: '23505', status: 409 })).toBe('duplicate');
		expect(clasificarErrorCreacion({ code: '42501', status: 403 })).toBe('permission');
		expect(clasificarErrorCreacion({ code: '23514', status: 400 })).toBe('validation');
		expect(clasificarErrorCreacion({ status: 0 })).toBe('uncertain');
		expect(clasificarErrorCreacion({ status: 504 })).toBe('uncertain');
	});
});

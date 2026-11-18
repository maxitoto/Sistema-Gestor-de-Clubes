import { describe, expect, test } from 'bun:test';
import { describirErrorCategoria, validarCategoriaForm } from '../src/entities/categoria';
import { describirErrorDeporte, validarDeporteForm } from '../src/entities/deporte';
import { resultadoMutacionIncierto } from '../src/shared/lib/useVerifiedMutation';

describe('edición y bajas del catálogo', () => {
	test('edición reutiliza el contrato validado y excluye columnas de sistema', () => {
		const result = validarCategoriaForm({
			deporte_id: 'b1111111-1111-1111-1111-111111111111',
			nombre: ' Sub 18 ',
			arancel_mensual: '1250.50',
			edad_min: '0',
			edad_max: '18',
			estado: 'inactivo',
			id: 'no-editable',
		} as Parameters<typeof validarCategoriaForm>[0]);
		expect(result).toEqual({
			valid: true,
			payload: {
				deporte_id: 'b1111111-1111-1111-1111-111111111111',
				nombre: 'Sub 18',
				arancel_mensual: 1250.5,
				edad_min: 0,
				edad_max: 18,
			},
		});
		expect(validarDeporteForm({ nombre: ' Judo ', descripcion: '  ' })).toEqual({
			valid: true,
			payload: { nombre: 'Judo', descripcion: null },
		});
	});
	test('mensajes de dependencias se traducen sin referencias internas', () => {
		const sport = describirErrorDeporte({
			code: 'P0001',
			message: 'No se puede ... categorias activas ... (CU-03.3)',
		});
		const category = describirErrorCategoria({
			code: 'P0001',
			message: 'existen socios inscriptos activos ... (CU-03.6)',
		});
		expect(sport).toContain('categorías activas');
		expect(category).toContain('inscripciones activas');
		expect(sport).not.toContain('CU-');
		expect(category).not.toContain('CU-');
	});
	test('permisos y nombre duplicado no se confunden con baja permitida', () => {
		expect(describirErrorCategoria({ code: '23505', status: 409 })).toContain('únicos');
		expect(describirErrorDeporte({ code: '42501', status: 403 })).toContain('Administrador activo');
		expect(describirErrorCategoria({ status: 401 })).toContain('Administrador activo');
	});
});

describe('recuperación de mutaciones por identidad', () => {
	test('fallo previo al envío permite reintento manual sin atribuir escritura', () => {
		expect(resultadoMutacionIncierto(new TypeError('sin red'), false, false)).toBe(false);
	});
	test('timeout y respuesta perdida luego de enviar bloquean otro envío', () => {
		expect(resultadoMutacionIncierto(new TypeError('sin red'), true, false)).toBe(true);
		expect(resultadoMutacionIncierto({ status: 504 }, true, false)).toBe(true);
	});
	test('error posterior a escritura confirmada exige consulta aunque sea permiso', () => {
		expect(resultadoMutacionIncierto({ status: 403, code: '42501' }, true, true)).toBe(true);
		expect(resultadoMutacionIncierto({ status: 403, responseReceived: true }, true, false)).toBe(
			true,
		);
	});
	test('rechazo transaccional de dependencia no se anuncia como resultado incierto', () => {
		expect(resultadoMutacionIncierto({ status: 400, code: 'P0001' }, true, false)).toBe(false);
	});
});

import { describe, expect, test } from 'bun:test';
import type { Gasto, GastoForm } from '../src/entities/gasto';
import { parseGasto } from '../src/entities/gasto/model/gastoContract';
import {
	coincideAnulacionGasto,
	coincideGasto,
	errorGasto,
	fechaCalendario,
	formDesdeGasto,
	mensajeAltaGasto,
	puedeAnularGasto,
	puedeEditarGasto,
	validarGasto,
} from '../src/entities/gasto/model/gastoForm';

const form: GastoForm = {
	categoria_id: '00000000-0000-4000-8000-000000000001',
	fecha: '2026-10-24',
	concepto: ' Pelotas ',
	monto: '1000,25',
	metodo_pago: 'efectivo',
	referencia_banco: ' ',
	descripcion: ' detalle ',
};
const base = validarGasto(form).datos;
if (!base) {
	throw new Error('Fixture de gasto inválido.');
}
const gasto: Gasto = {
	...base,
	id: '00000000-0000-4000-8000-000000000002',
	usuario_id: '00000000-0000-4000-8000-000000000003',
	estado: 'activo',
	created_at: '2026-10-25T02:59:59Z',
	updated_at: '2026-10-25T02:59:59Z',
	motivo_anulacion: null,
	anulado_at: null,
	anulado_por: null,
	categoria: null,
};
describe('gastos: contrato humano y ventana de carga', () => {
	test('payload normaliza opcionales y omite identidad/autor/estado/evidencia aun con extras', () => {
		const result = validarGasto({
			...form,
			id: 'prohibido',
			usuario_id: 'otro',
			estado: 'anulado',
		} as GastoForm);
		expect(result.errores).toEqual({});
		expect(result.datos).toEqual({
			categoria_id: form.categoria_id,
			fecha: form.fecha,
			concepto: 'Pelotas',
			monto: 1000.25,
			metodo_pago: 'efectivo',
			referencia_banco: null,
			descripcion: 'detalle',
		});
	});
	test('no redondea importes con más de dos decimales ni acepta ceros, negativos o infinito', () => {
		for (const monto of ['1.005', '0', '-1', 'Infinity', '100000000', '1e3']) {
			expect(validarGasto({ ...form, monto }).datos).toBeNull();
		}
	});
	test('transferencia exige referencia y trim también al editar', () => {
		expect(
			validarGasto({ ...form, metodo_pago: 'transferencia', referencia_banco: '   ' }).errores
				.referencia_banco,
		).toBeDefined();
		expect(
			validarGasto({ ...form, metodo_pago: 'transferencia', referencia_banco: ' Banco 12 ' }).datos
				?.referencia_banco,
		).toBe('Banco 12');
	});
	test('calendario rechaza normalización de fecha imposible y permite fecha negocio distinta', () => {
		expect(fechaCalendario('2026-02-29')).toBe(false);
		expect(fechaCalendario('2028-02-29')).toBe(true);
		expect(validarGasto({ ...form, fecha: '2025-10-01' }).datos?.fecha).toBe('2025-10-01');
	});
	test('del día depende de created_at Buenos Aires, no fecha de negocio ni UTC', () => {
		expect(puedeEditarGasto({ ...gasto, fecha: '2020-01-01' }, '2026-10-24')).toBe(true);
		expect(puedeEditarGasto(gasto, '2026-10-25')).toBe(false);
		expect(puedeEditarGasto({ ...gasto, created_at: '2026-10-25T03:00:00Z' }, '2026-10-25')).toBe(
			true,
		);
	});
	test('Admin anula histórico, Responsable sólo hoy; anulado nunca se edita/reactiva', () => {
		expect(puedeAnularGasto(gasto, '2026-10-25', 'admin')).toBe(true);
		expect(puedeAnularGasto(gasto, '2026-10-25', 'responsable')).toBe(false);
		expect(puedeEditarGasto({ ...gasto, estado: 'anulado' }, '2026-10-24')).toBe(false);
		expect(puedeAnularGasto({ ...gasto, estado: 'anulado' }, '2026-10-24', 'admin')).toBe(false);
	});
	test('conciliación comprueba todos los datos solicitados y formulario conserva nulos', () => {
		const datos = validarGasto(form).datos;
		if (!datos) {
			throw new Error('Fixture inválido.');
		}
		expect(coincideGasto(gasto, datos)).toBe(true);
		expect(coincideGasto({ ...gasto, monto: 10 }, datos)).toBe(false);
		expect(formDesdeGasto({ ...gasto, descripcion: null }).descripcion).toBe('');
	});
});

test('recuperar anulación exige el mismo autor y motivo; no atribuye la acción de otro operador', () => {
	const anulado = {
		...gasto,
		estado: 'anulado' as const,
		motivo_anulacion: 'Motivo',
		anulado_por: gasto.usuario_id,
	};
	expect(coincideAnulacionGasto(anulado, ' Motivo ', gasto.usuario_id)).toBe(true);
	expect(coincideAnulacionGasto(anulado, 'Otro motivo', gasto.usuario_id)).toBe(false);
	expect(coincideAnulacionGasto(anulado, 'Motivo', 'otro-actor')).toBe(false);
});
test('alta recuperada conserva intención de evidencia aunque el archivo no sobreviva a recarga', () => {
	expect(mensajeAltaGasto(true, false)).toContain('evidencia pendiente');
	expect(mensajeAltaGasto(true, false)).toContain('sin registrar otro gasto');
	expect(mensajeAltaGasto(true, true)).toContain('pendiente de guardar');
	expect(mensajeAltaGasto(false, false)).toBe('Gasto registrado.');
});
test('restricciones SQL se presentan como errores de negocio sin nombre de tabla o constraint', () => {
	const message = errorGasto({
		code: '23514',
		message: 'new row violates chk_gastos_concepto_no_vacio',
	});
	expect(message).not.toContain('chk_');
	expect(message).not.toContain('new row');
	expect(message).toContain('concepto');
});

test('UUID históricos PostgreSQL de categorías seed no se rechazan por versión RFC', () => {
	const legacy = 'f1111111-1111-1111-1111-111111111111';
	expect(validarGasto({ ...form, categoria_id: legacy }).datos?.categoria_id).toBe(legacy);
	expect(
		parseGasto({
			...gasto,
			categoria_id: legacy,
			categoria: { id: legacy, nombre: 'Mantenimiento', estado: 'activo' },
		}).categoria_id,
	).toBe(legacy);
	expect(
		validarGasto({ ...form, categoria_id: '------------------------------------' }).datos,
	).toBeNull();
});

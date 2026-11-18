import { describe, expect, test } from 'bun:test';
import {
	claveMovimientoCaja,
	formatearImporteCaja,
	interpretarCaja,
	urlOrigenCaja,
} from '../src/entities/movimiento-caja/model/cajaContract';

const id = 'e124d343-46f5-4d77-a91e-c184be8033e3';
const original = {
	tipo: 'egreso',
	movimientoId: id,
	fecha: '2026-10-24T03:00:00+00:00',
	monto: '200.00',
	metodo: 'efectivo',
	referencia: null,
	concepto: 'Gasto de prueba',
	estado: 'anulado',
	autor: 'Cuenta sintética',
	esReverso: false,
	origen: 'gasto',
	origenId: id,
	cargadoEn: '2026-10-24T10:00:00+00:00',
	fechaNegocio: '2026-10-24',
};
const reversed = { ...original, tipo: 'ingreso', esReverso: true, concepto: 'Anulacion de gasto' };
const payload = (rows: object[] = [original]) => ({
	version: 1,
	total: rows.length,
	pagina: 0,
	limite: 20,
	filas: rows,
	totales: { ingresos: '200.00', egresos: '200.00', neto: '0.00' },
});
const criteria = { pagina: 0, limite: 20 as const };
describe('contrato de caja continua', () => {
	test('identidades UUID históricas válidas en PostgreSQL no exigen versión RFC', () => {
		const legacy = 'b9999999-9999-9999-9999-999999999999';
		expect(
			interpretarCaja(payload([{ ...original, movimientoId: legacy, origenId: legacy }]), criteria)
				.filas[0]?.movimientoId,
		).toBe(legacy);
	});
	test('original y reverso conservan importe positivo, claves distintas y mismo origen', () => {
		const result = interpretarCaja(payload([original, reversed]), criteria);
		expect(result.filas.map(claveMovimientoCaja)).toEqual([
			`egreso:${id}:original`,
			`ingreso:${id}:reverso`,
		]);
		expect(result.filas.map(urlOrigenCaja)).toEqual([
			`/gastos?gastoId=${id}`,
			`/gastos?gastoId=${id}`,
		]);
	});
	test('totales nulos del Responsable permanecen ausentes, no se convierten a cero', () => {
		expect(interpretarCaja({ ...payload(), totales: null }, criteria).totales).toBeNull();
	});
	test('rechaza página, total o filas que pertenecen a otra consulta', () => {
		expect(() => interpretarCaja({ ...payload(), pagina: 1 }, criteria)).toThrow();
		expect(() => interpretarCaja({ ...payload(), total: 2 }, criteria)).toThrow();
		expect(() => interpretarCaja({ ...payload(), total: -1 }, criteria)).toThrow();
		expect(() => interpretarCaja({ ...payload(), limite: 50 }, criteria)).toThrow();
	});
	test('no permite perder el reverso por duplicar clave ni inventar una reactivación', () => {
		expect(() => interpretarCaja(payload([original, original]), criteria)).toThrow();
		expect(() => interpretarCaja(payload([{ ...reversed, estado: 'activo' }]), criteria)).toThrow();
		expect(() => interpretarCaja(payload([{ ...original, origen: 'cobro' }]), criteria)).toThrow();
	});
	test('importes decimales no se aceptan como float o redondeados', () => {
		for (const monto of [200, '200', '200.001', '-200.00', '0.00']) {
			expect(() => interpretarCaja(payload([{ ...original, monto }]), criteria)).toThrow();
		}
		expect(() =>
			interpretarCaja(
				{ ...payload(), totales: { ingresos: '0.00', egresos: '200.00', neto: '-200.00' } },
				criteria,
			),
		).not.toThrow();
	});
	test('formato conserva centavos y entero mayor al rango seguro de Number', () => {
		expect(formatearImporteCaja('9007199254740993.01')).toBe('$ 9.007.199.254.740.993,01');
		expect(formatearImporteCaja('-0.01')).toBe('-$ 0,01');
	});
	test('no presenta éxito de una respuesta incompleta o con campos inesperados', () => {
		expect(() => interpretarCaja({ ...payload(), saldo: 0 }, criteria)).toThrow();
		expect(() => interpretarCaja({ ...payload(), totales: { neto: '0.00' } }, criteria)).toThrow();
		expect(() =>
			interpretarCaja(payload([{ ...original, fechaNegocio: '2026-02-30' }]), criteria),
		).toThrow();
	});
	test('página fuera del último tramo puede estar vacía conservando total completo', () => {
		expect(
			interpretarCaja(
				{ version: 1, total: 25, pagina: 2, limite: 20, filas: [], totales: null },
				{ pagina: 2, limite: 20 },
			).total,
		).toBe(25);
	});
});

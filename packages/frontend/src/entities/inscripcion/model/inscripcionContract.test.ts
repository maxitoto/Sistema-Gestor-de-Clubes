import { describe, expect, test } from 'bun:test';
import {
	type CuotaPersistida,
	comprobarRecuperacion,
	type InscripcionPersistida,
	parseConfirmacionInscripcion,
	periodoDeFecha,
} from './inscripcionContract';

const socioId = '10000000-0000-0000-0000-000000000001';
const categoriaId = '20000000-0000-0000-0000-000000000001';
const inscripcionId = '30000000-0000-0000-0000-000000000001';
const cuotaId = '40000000-0000-0000-0000-000000000001';
const response = {
	inscripcion_id: inscripcionId,
	cuota_id: cuotaId,
	cuota_creada: true,
	monto_cuota: 2500,
	estado_cuota: 'pendiente',
};
const inscripcion: InscripcionPersistida = {
	id: inscripcionId,
	socio_id: socioId,
	categoria_id: categoriaId,
	fecha_alta: '2026-10-23',
	fecha_baja: null,
	estado: 'activa',
	created_at: null,
	updated_at: null,
};
const cuota: CuotaPersistida = {
	id: cuotaId,
	socio_id: socioId,
	categoria_id: categoriaId,
	periodo_mes: 10,
	periodo_anio: 2026,
	monto: 2500,
	estado: 'pendiente',
	created_at: null,
	updated_at: null,
};

describe('respuesta exacta de confirmar_inscripcion', () => {
	test('acepta cinco claves reales y distingue cuota nueva/reutilizada', () => {
		expect(parseConfirmacionInscripcion(response).cuota_creada).toBe(true);
		expect(parseConfirmacionInscripcion({ ...response, cuota_creada: false }).cuota_creada).toBe(
			false,
		);
	});
	test('rechaza alias y claves adicionales', () => {
		expect(() => parseConfirmacionInscripcion({ ...response, exito: true })).toThrow();
		expect(() => parseConfirmacionInscripcion({ id: inscripcionId, monto: 2500 })).toThrow();
	});
	test('rechaza UUID y formas no válidos', () => {
		expect(() => parseConfirmacionInscripcion({ ...response, cuota_id: 'cualquiera' })).toThrow();
		expect(() => parseConfirmacionInscripcion(null)).toThrow();
		expect(() => parseConfirmacionInscripcion([response])).toThrow();
	});
	test('rechaza importes no numéricos, infinitos o negativos', () => {
		for (const monto of ['2500', Number.NaN, Number.POSITIVE_INFINITY, -1]) {
			expect(() => parseConfirmacionInscripcion({ ...response, monto_cuota: monto })).toThrow();
		}
	});
	test('rechaza booleanos o estados inventados', () => {
		expect(() => parseConfirmacionInscripcion({ ...response, cuota_creada: 'true' })).toThrow();
		expect(() => parseConfirmacionInscripcion({ ...response, estado_cuota: 'cobrada' })).toThrow();
	});
});

describe('recuperación de inscripción y cuota persistidas', () => {
	test('ausencia no se atribuye a éxito', () => {
		expect(comprobarRecuperacion({ socioId, categoriaId }, null, null)).toEqual({
			estado: 'ausente',
		});
	});
	test('inscripción sin cuota se mantiene incompleta', () => {
		expect(comprobarRecuperacion({ socioId, categoriaId }, inscripcion, null)).toEqual({
			estado: 'incompleta',
		});
	});
	test('recupera cuota del período de alta sin inventar cuota_creada', () => {
		const result = comprobarRecuperacion({ socioId, categoriaId }, inscripcion, cuota);
		expect(result.estado).toBe('recuperada');
		if (result.estado === 'recuperada') {
			expect(result.resultado.origen).toBe('recuperada');
			expect(result.resultado.cuotaCreada).toBeNull();
			expect(result.resultado.cuota.id).toBe(cuotaId);
		}
	});
	test('rechaza cuota de otro mes o identidad', () => {
		expect(() =>
			comprobarRecuperacion({ socioId, categoriaId }, inscripcion, { ...cuota, periodo_mes: 11 }),
		).toThrow();
		expect(() =>
			comprobarRecuperacion({ socioId, categoriaId }, inscripcion, {
				...cuota,
				socio_id: categoriaId,
			}),
		).toThrow();
	});
	test('rechaza inscripción de otra categoría o inactiva', () => {
		expect(() =>
			comprobarRecuperacion(
				{ socioId, categoriaId },
				{ ...inscripcion, categoria_id: socioId },
				cuota,
			),
		).toThrow();
		expect(() =>
			comprobarRecuperacion(
				{ socioId, categoriaId },
				{ ...inscripcion, estado: 'inactiva', fecha_baja: '2026-10-24' },
				cuota,
			),
		).toThrow();
	});
	test('período deriva de fecha persistida y valida días reales', () => {
		expect(periodoDeFecha('2026-12-31')).toEqual({ mes: 12, anio: 2026 });
		expect(periodoDeFecha('2027-01-01')).toEqual({ mes: 1, anio: 2027 });
		expect(() => periodoDeFecha('2026-02-30')).toThrow();
		expect(() => periodoDeFecha('23/10/2026')).toThrow();
	});
});

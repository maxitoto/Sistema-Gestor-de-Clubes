import { describe, expect, test } from 'bun:test';
import { parseDiagnosticoFiscal } from '../src/entities/comprobante/model/diagnosticoFiscalContract';

function payload() {
	return {
		autenticado: true,
		ambiente: 'homologacion',
		servicio: 'wsfe',
		puntosVenta: [
			{ numero: 5, emisionTipo: 'CAE', bloqueado: false, bajaFecha: null },
			{ numero: 7, emisionTipo: 'CAEA', bloqueado: true, bajaFecha: '2026-10-01' },
		],
		puntoVentaConfigurado: 5,
		puntoVentaDisponible: true,
	};
}

describe('diagnóstico público y puntos de venta de homologación', () => {
	test('conserva el listado y el punto configurado de la respuesta real del backend', () => {
		const source = payload();
		expect(parseDiagnosticoFiscal(source)).toEqual(source);
		expect(parseDiagnosticoFiscal(source).puntosVenta).toHaveLength(2);
	});
	test('lista vacía autenticada conserva estado no disponible sin fabricar un punto', () => {
		const source = { ...payload(), puntosVenta: [], puntoVentaDisponible: false };
		expect(parseDiagnosticoFiscal(source).puntosVenta).toEqual([]);
		expect(parseDiagnosticoFiscal(source).puntoVentaDisponible).toBe(false);
	});
	test('el punto configurado ausente no se sustituye por el primero de la lista', () => {
		const source = { ...payload(), puntoVentaConfigurado: 42, puntoVentaDisponible: false };
		expect(parseDiagnosticoFiscal(source).puntoVentaConfigurado).toBe(42);
		expect(parseDiagnosticoFiscal(source).puntosVenta.map((punto) => punto.numero)).toEqual([5, 7]);
	});
	test('bloqueo, baja y tipo distinto de CAE permanecen visibles y no disponibles', () => {
		for (const changes of [
			{ bloqueado: true },
			{ bajaFecha: '2026-10-27' },
			{ emisionTipo: 'CAEA' },
			{ emisionTipo: 'OTRO' },
		]) {
			const punto = { ...payload().puntosVenta[0], ...changes };
			const source = { ...payload(), puntosVenta: [punto], puntoVentaDisponible: false };
			expect(parseDiagnosticoFiscal(source).puntosVenta[0]).toEqual(punto);
		}
	});
	test('rechaza disponibilidad contradictoria con el listado o el punto configurado', () => {
		for (const source of [
			{ ...payload(), puntoVentaDisponible: false },
			{ ...payload(), puntosVenta: [] },
			{ ...payload(), puntoVentaConfigurado: 42 },
			{ ...payload(), puntoVentaConfigurado: 7 },
		]) {
			expect(() => parseDiagnosticoFiscal(source)).toThrow();
		}
	});
	test('ambiente, servicio y autenticación requieren los valores de homologación exactos', () => {
		for (const changes of [
			{ ambiente: 'produccion' },
			{ ambiente: undefined },
			{ servicio: 'arbccf' },
			{ servicio: 'wsfev1' },
			{ servicio: undefined },
			{ autenticado: false },
			{ autenticado: 'true' },
			{ autenticado: 1 },
		]) {
			expect(() => parseDiagnosticoFiscal({ ...payload(), ...changes })).toThrow();
		}
	});
	test('no acepta una respuesta o una colección malformada como listado vacío', () => {
		for (const value of [null, undefined, [], 3, 'respuesta']) {
			expect(() => parseDiagnosticoFiscal(value)).toThrow();
		}
		for (const puntosVenta of [undefined, null, {}, 'puntos', [null], [[]], ['punto']]) {
			expect(() => parseDiagnosticoFiscal({ ...payload(), puntosVenta })).toThrow();
		}
	});
	test('los números requieren enteros reales de uno a 99999, sin coerción', () => {
		for (const numero of [0, -1, 100_000, 5.5, Number.NaN, Number.POSITIVE_INFINITY, '5', null]) {
			expect(() =>
				parseDiagnosticoFiscal({ ...payload(), puntoVentaConfigurado: numero }),
			).toThrow();
			expect(() =>
				parseDiagnosticoFiscal({
					...payload(),
					puntosVenta: [{ ...payload().puntosVenta[0], numero }],
				}),
			).toThrow();
		}
		expect(
			parseDiagnosticoFiscal({
				...payload(),
				puntoVentaConfigurado: 99_999,
				puntoVentaDisponible: false,
			}).puntoVentaConfigurado,
		).toBe(99_999);
	});
	test('un número duplicado es ambiguo y no elige una de sus filas', () => {
		const source = payload();
		source.puntosVenta.push({ ...source.puntosVenta[0], numero: 5, bloqueado: true });
		expect(() => parseDiagnosticoFiscal(source)).toThrow();
	});
	test('baja nula y fecha bisiesta válidas se conservan; fechas imposibles se rechazan', () => {
		const source = payload();
		source.puntosVenta[1] = {
			numero: 7,
			emisionTipo: 'CAE',
			bloqueado: false,
			bajaFecha: '2028-02-29',
		};
		expect(parseDiagnosticoFiscal(source).puntosVenta[1]?.bajaFecha).toBe('2028-02-29');
		for (const bajaFecha of [
			'2026-02-29',
			'2026-02-31',
			'2026-13-01',
			'27/10/2026',
			'NULL',
			'',
			undefined,
			1,
		]) {
			expect(() =>
				parseDiagnosticoFiscal({
					...source,
					puntosVenta: [{ ...source.puntosVenta[1], bajaFecha }],
				}),
			).toThrow();
		}
	});
	test('el tipo de emisión debe ser texto acotado sin controles ni blancos engañosos', () => {
		for (const emisionTipo of ['', ' CAE', 'CAE ', 'CAE\n', 'a'.repeat(41), 1, null, undefined]) {
			expect(() =>
				parseDiagnosticoFiscal({
					...payload(),
					puntosVenta: [{ ...payload().puntosVenta[0], emisionTipo }],
				}),
			).toThrow();
		}
	});
	test('bloqueo y disponibilidad requieren booleanos, y la fecha de baja es obligatoria', () => {
		for (const bloqueado of ['false', 0, null, undefined]) {
			expect(() =>
				parseDiagnosticoFiscal({
					...payload(),
					puntosVenta: [{ ...payload().puntosVenta[0], bloqueado }],
				}),
			).toThrow();
		}
		for (const puntoVentaDisponible of ['true', 1, null, undefined]) {
			expect(() => parseDiagnosticoFiscal({ ...payload(), puntoVentaDisponible })).toThrow();
		}
		expect(() =>
			parseDiagnosticoFiscal({
				...payload(),
				puntosVenta: [{ numero: 5, emisionTipo: 'CAE', bloqueado: false }],
			}),
		).toThrow();
	});
	test('proyecta sólo campos públicos aunque aparezcan credenciales o datos extra', () => {
		const source = {
			...payload(),
			cuit: 'DATO_NO_PUBLICO_DE_FIXTURE',
			token: 'SECRETO_SINTETICO',
			puntosVenta: payload().puntosVenta.map((punto) => ({
				...punto,
				certificado: 'NO_DEBE_SALIR',
			})),
		};
		expect(parseDiagnosticoFiscal(source)).not.toHaveProperty('cuit');
		expect(parseDiagnosticoFiscal(source)).not.toHaveProperty('token');
		expect(parseDiagnosticoFiscal(source).puntosVenta[0]).not.toHaveProperty('certificado');
	});
	test('preserva orden y no comparte objetos mutables con la respuesta original', () => {
		const source = payload();
		source.puntosVenta.reverse();
		const result = parseDiagnosticoFiscal(source);
		expect(result.puntosVenta.map((punto) => punto.numero)).toEqual([7, 5]);
		expect(result.puntosVenta).not.toBe(source.puntosVenta);
		expect(result.puntosVenta[0]).not.toBe(source.puntosVenta[0]);
		if (result.puntosVenta[0]) {
			result.puntosVenta[0].emisionTipo = 'EDITADO';
		}
		expect(source.puntosVenta[0]?.emisionTipo).toBe('CAEA');
	});
});

describe('listado sin datos con código 602', () => {
	const vacio = () => ({ ...payload(), puntosVenta: [], puntoVentaDisponible: false });
	test('conserva 602 como dato sin fabricar disponibilidad del punto', () => {
		const source = { ...vacio(), ausenciaDatos: '602' };
		expect(parseDiagnosticoFiscal(source)).toEqual(source);
	});
	test('no transforma otros códigos ni valores malformados en ausencia de datos', () => {
		for (const ausenciaDatos of ['600', '601', '500', '602,601', '0602', 602, true, null, {}]) {
			expect(() => parseDiagnosticoFiscal({ ...vacio(), ausenciaDatos })).toThrow();
		}
	});
	test('rechaza 602 junto con puntos de venta aunque no estén disponibles', () => {
		expect(() =>
			parseDiagnosticoFiscal({
				...payload(),
				puntoVentaConfigurado: 42,
				puntoVentaDisponible: false,
				ausenciaDatos: '602',
			}),
		).toThrow();
	});
	test('rechaza 602 con disponibilidad afirmada', () => {
		expect(() =>
			parseDiagnosticoFiscal({
				...vacio(),
				puntoVentaDisponible: true,
				ausenciaDatos: '602',
			}),
		).toThrow();
	});
	test('descarta mensajes remotos y credenciales también en ausencia de datos', () => {
		const source = { ...vacio(), ausenciaDatos: '602', Msg: 'PRIVADO', token: 'FIXTURE' };
		expect(parseDiagnosticoFiscal(source)).toEqual({ ...vacio(), ausenciaDatos: '602' });
	});
});

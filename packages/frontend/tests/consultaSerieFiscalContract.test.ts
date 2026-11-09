import { describe, expect, test } from 'bun:test';
import {
	crearConsultaSerieRequest,
	parseConsultaSerieFiscal,
} from '../src/entities/comprobante/model/consultaSerieFiscalContract';

function payload() {
	return {
		ambiente: 'homologacion',
		servicio: 'wsfe',
		operacion: 'FECompUltimoAutorizado',
		puntoVentaConfigurado: 1,
		tipoComprobante: 11,
		resultado: 'obtenido',
		ultimoAutorizado: '0',
		codigos: [],
	};
}
function unavailable() {
	return {
		...payload(),
		resultado: 'no_disponible',
		ultimoAutorizado: null,
		codigos: [
			{ codigo: '11002', mensaje: 'El punto de venta no está habilitado para la consulta.' },
		],
	};
}
describe('consulta de serie fiscal sin emisión', () => {
	test('el cuerpo contiene sólo tipo y rechaza coerción, ausencia y números inválidos', () => {
		expect(crearConsultaSerieRequest(11)).toEqual({ tipoComprobante: 11 });
		for (const tipo of [
			0,
			-1,
			1000,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			'11',
			null,
			undefined,
		]) {
			expect(() => crearConsultaSerieRequest(tipo as number)).toThrow();
		}
		expect(crearConsultaSerieRequest(999)).toEqual({ tipoComprobante: 999 });
	});
	test('acepta cero como último número consultado sin fabricar una nueva factura', () => {
		expect(parseConsultaSerieFiscal(payload(), 11)).toEqual(payload());
		expect(parseConsultaSerieFiscal(payload(), 11).ultimoAutorizado).toBe('0');
	});
	test('conserva números de comprobante como texto canónico sin pérdida de precisión', () => {
		for (const numero of ['1', '2147483647', '999999999999']) {
			expect(
				parseConsultaSerieFiscal({ ...payload(), ultimoAutorizado: numero }, 11).ultimoAutorizado,
			).toBe(numero);
		}
		for (const numero of [
			0,
			1,
			'',
			'00',
			'01',
			'-1',
			'+1',
			'1e3',
			'1.5',
			' 1',
			'1 ',
			'1000000000000',
			null,
			undefined,
		]) {
			expect(() =>
				parseConsultaSerieFiscal({ ...payload(), ultimoAutorizado: numero }, 11),
			).toThrow();
		}
	});
	test('conserva una consulta no disponible con su código seguro sin suponer último cero', () => {
		expect(parseConsultaSerieFiscal(unavailable(), 11)).toEqual(unavailable());
		expect(parseConsultaSerieFiscal(unavailable(), 11).ultimoAutorizado).toBeNull();
	});
	test('rechaza estados y resultados contradictorios', () => {
		for (const source of [
			{ ...payload(), resultado: 'emitido' },
			{ ...payload(), ultimoAutorizado: null },
			{ ...payload(), codigos: unavailable().codigos },
			{ ...unavailable(), ultimoAutorizado: '0' },
			{ ...unavailable(), codigos: [] },
			{ ...payload(), resultado: undefined },
		]) {
			expect(() => parseConsultaSerieFiscal(source, 11)).toThrow();
		}
	});
	test('exige ambiente, servicio y operación exactos de la consulta sin emisión', () => {
		for (const change of [
			{ ambiente: 'produccion' },
			{ servicio: 'wsfev1' },
			{ operacion: 'FECAESolicitar' },
			{ operacion: undefined },
		]) {
			expect(() => parseConsultaSerieFiscal({ ...payload(), ...change }, 11)).toThrow();
		}
	});
	test('el tipo de respuesta debe coincidir con el solicitado y ser entero', () => {
		for (const tipo of [1, 0, 1000, 11.5, '11', null, undefined]) {
			expect(() => parseConsultaSerieFiscal({ ...payload(), tipoComprobante: tipo }, 11)).toThrow();
		}
		expect(() => parseConsultaSerieFiscal(payload(), 6)).toThrow();
		expect(() => parseConsultaSerieFiscal(payload(), 0)).toThrow();
	});
	test('el punto configurado debe ser un entero real del contrato institucional', () => {
		for (const punto of [0, -1, 100000, 1.5, '1', null, Number.NaN]) {
			expect(() =>
				parseConsultaSerieFiscal({ ...payload(), puntoVentaConfigurado: punto }, 11),
			).toThrow();
		}
		expect(
			parseConsultaSerieFiscal({ ...payload(), puntoVentaConfigurado: 99999 }, 11)
				.puntoVentaConfigurado,
		).toBe(99999);
	});
	test('no convierte respuestas o códigos malformados en una consulta válida', () => {
		for (const source of [null, undefined, [], 0, 'respuesta']) {
			expect(() => parseConsultaSerieFiscal(source, 11)).toThrow();
		}
		for (const codigos of [null, undefined, {}, '600', [null], [[]], ['600']]) {
			expect(() => parseConsultaSerieFiscal({ ...unavailable(), codigos }, 11)).toThrow();
		}
	});
	test('permite códigos numéricos y locales acotados, y rechaza texto remoto arbitrario como código', () => {
		for (const codigo of ['600', '601', '602', '11002', '99999999', 'WSFE_SERIE_NO_CONFIRMADA']) {
			expect(
				parseConsultaSerieFiscal(
					{ ...unavailable(), codigos: [{ codigo, mensaje: 'Mensaje propio del backend.' }] },
					11,
				).codigos[0]?.codigo,
			).toBe(codigo);
		}
		for (const codigo of ['', '100000000', '-1', 'wsfe', 'WSFE ERROR', 'A'.repeat(81), 600, null]) {
			expect(() =>
				parseConsultaSerieFiscal(
					{ ...unavailable(), codigos: [{ codigo, mensaje: 'Mensaje.' }] },
					11,
				),
			).toThrow();
		}
	});
	test('mensajes de diagnóstico acotados y sin caracteres de control', () => {
		for (const mensaje of [
			'',
			' mensaje',
			'mensaje ',
			'Mensaje\n',
			'Mensaje\u0000',
			'x'.repeat(513),
			null,
			1,
		]) {
			expect(() =>
				parseConsultaSerieFiscal({ ...unavailable(), codigos: [{ codigo: '11002', mensaje }] }, 11),
			).toThrow();
		}
		const codigos = Array.from({ length: 31 }, () => unavailable().codigos[0]);
		expect(() => parseConsultaSerieFiscal({ ...unavailable(), codigos }, 11)).toThrow();
	});
	test('proyecta sólo campos públicos y clona el diagnóstico sin credenciales o CAE', () => {
		const source = {
			...unavailable(),
			token: 'NO_PUBLICAR',
			sign: 'NO_PUBLICAR',
			cuit: 'NO_PUBLICAR',
			cae: 'NO_PUBLICAR',
			codigos: [{ ...unavailable().codigos[0], soap: 'NO_PUBLICAR', Msg: 'NO_PUBLICAR' }],
		};
		const result = parseConsultaSerieFiscal(source, 11);
		expect(result).toEqual(unavailable());
		expect(JSON.stringify(result)).not.toContain('NO_PUBLICAR');
		expect(result.codigos).not.toBe(source.codigos);
		expect(result.codigos[0]).not.toBe(source.codigos[0]);
	});
});

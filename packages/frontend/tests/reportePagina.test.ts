import { describe, expect, test } from 'bun:test';
import { interpretarPaginaReporte } from '../src/shared/lib/reportes';

const solicitud = { pagina: 1, limite: 500 };
const fila = { id: 'fila-unica', nombre: 'Persona sintética' };
function respuesta() {
	return {
		version: 1,
		grilla: 'socios',
		filas: [fila],
		total: 1001,
		pagina: 1,
		limite: 500,
		revision: 'a'.repeat(32),
	};
}
const parseFila = (v: unknown) => {
	const x = v as { id: string; nombre: string };
	return { id: x.id, nombre: x.nombre };
};
describe('respuesta paginada de reportes', () => {
	test('acepta la página completa pedida conservando total y revisión', () => {
		expect(interpretarPaginaReporte(respuesta(), 'socios', solicitud, parseFila)).toEqual({
			filas: [fila],
			total: 1001,
			pagina: 1,
			limite: 500,
			revision: 'a'.repeat(32),
		});
	});
	test('rechaza una respuesta válida que corresponde a otra página', () => {
		expect(() =>
			interpretarPaginaReporte({ ...respuesta(), pagina: 0 }, 'socios', solicitud, parseFila),
		).toThrow('no coincide');
	});
	test('rechaza la página visible de100 cuando exportar pidió500', () => {
		expect(() =>
			interpretarPaginaReporte({ ...respuesta(), limite: 100 }, 'socios', solicitud, parseFila),
		).toThrow('no coincide');
	});
	test('no acepta una respuesta de otra grilla aunque tenga datos válidos', () => {
		expect(() =>
			interpretarPaginaReporte({ ...respuesta(), grilla: 'pagos' }, 'socios', solicitud, parseFila),
		).toThrow();
	});
	test('cero registros es un conjunto válido y distinto de error', () => {
		expect(
			interpretarPaginaReporte(
				{ ...respuesta(), pagina: 0, limite: 20, filas: [], total: 0 },
				'socios',
				{ pagina: 0, limite: 20 },
				parseFila,
			),
		).toEqual({ filas: [], total: 0, pagina: 0, limite: 20, revision: 'a'.repeat(32) });
	});
	test.each([NaN, 1.5, -1, Number.MAX_SAFE_INTEGER + 1])(
		'total imposible %s no pasa como éxito',
		(total) => {
			expect(() =>
				interpretarPaginaReporte({ ...respuesta(), total }, 'socios', solicitud, parseFila),
			).toThrow();
		},
	);
	test('no entrega filas cuando el total confirmado es menor', () => {
		expect(() =>
			interpretarPaginaReporte({ ...respuesta(), total: 0 }, 'socios', solicitud, parseFila),
		).toThrow();
	});
	test('no entrega más filas que las pedidas por página', () => {
		expect(() =>
			interpretarPaginaReporte(
				{ ...respuesta(), filas: [fila, fila], limite: 1 },
				'socios',
				{ pagina: 1, limite: 1 },
				parseFila,
			),
		).toThrow();
	});
	test.each(['', 'no-es-una-revision', 'a'.repeat(31)])(
		'rechaza revisión inválida %s',
		(revision) => {
			expect(() =>
				interpretarPaginaReporte({ ...respuesta(), revision }, 'socios', solicitud, parseFila),
			).toThrow();
		},
	);
	test('metadatos extra no aparecen en el DTO y cada fila usa proyección autorizada', () => {
		const data = {
			...respuesta(),
			firma: 'privada-sintetica',
			payload: { token: 'sintetico' },
			filas: [{ ...fila, token: 'dato-descartado' }],
		};
		expect(interpretarPaginaReporte(data, 'socios', solicitud, parseFila)).toEqual({
			filas: [fila],
			total: 1001,
			pagina: 1,
			limite: 500,
			revision: 'a'.repeat(32),
		});
	});
	test('un error del parser de fila impide entregar el conjunto', () => {
		expect(() =>
			interpretarPaginaReporte(respuesta(), 'socios', solicitud, () => {
				throw new Error('Fila no autorizada');
			}),
		).toThrow('Fila no autorizada');
	});
	test('la ausencia de la paginación solicitada no crea valores implícitos', () => {
		expect(() => interpretarPaginaReporte(respuesta(), 'socios', {}, parseFila)).toThrow(
			'solicitada',
		);
	});
});

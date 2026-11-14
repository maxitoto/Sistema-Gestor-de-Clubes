import { describe, expect, test } from 'bun:test';
import type {
	ConfiguracionExportacion,
	OpcionesExportacion,
} from '../src/features/export-grid/model/exportarGrilla';
import { exportarGrilla } from '../src/features/export-grid/model/exportarGrilla';
import type { ColumnaExportacion } from '../src/shared/lib/export';
import { escaparCsv, exportCsv, exportXlsx } from '../src/shared/lib/export';

type Fila = { id: string; dni: string; nombre: string; importe: number };
type Filtro = { busqueda: string; activo: boolean };
const columnas: ColumnaExportacion<Fila>[] = [
	{ titulo: 'Identificador', tipo: 'texto', valor: (f) => f.id },
	{ titulo: 'DNI', tipo: 'texto', valor: (f) => f.dni },
	{ titulo: 'Nombre', tipo: 'texto', valor: (f) => f.nombre },
	{ titulo: 'Importe', tipo: 'numero', valor: (f) => f.importe },
];
const datos = (total: number): Fila[] =>
	Array.from({ length: total }, (_, i) => ({
		id: `sintetico-${i}`,
		dni: String(i).padStart(8, '0'),
		nombre: i % 2 ? 'Nombre empatado' : 'Otro nombre',
		importe: 12.5 + i,
	}));
function opciones(total = 1001): OpcionesExportacion<Fila, Filtro> {
	const filas = datos(total);
	return {
		formato: 'csv',
		nombreArchivo: 'socios',
		filtroSnapshot: { busqueda: 'sintetico', activo: true },
		orden: { campo: 'nombre', direccion: 'asc' },
		columnas,
		alcanceSesion: 'sesion-A',
		sesionActual: () => 'sesion-A',
		signal: new AbortController().signal,
		claveFila: (f) => f.id,
		obtenerPagina: async ({ pagina, tamanoPagina }) => ({
			filas: filas.slice((pagina - 1) * tamanoPagina, pagina * tamanoPagina),
			total,
			version: 'revision-1',
		}),
	};
}
function entradasZip(datosZip: Uint8Array): Map<string, string> {
	const resultado = new Map<string, string>(),
		v = new DataView(datosZip.buffer, datosZip.byteOffset, datosZip.byteLength),
		decoder = new TextDecoder();
	let offset = 0;
	while (v.getUint32(offset, true) === 0x04034b50) {
		const tamano = v.getUint32(offset + 18, true),
			nombre = v.getUint16(offset + 26, true),
			extra = v.getUint16(offset + 28, true),
			inicio = offset + 30 + nombre + extra;
		resultado.set(
			decoder.decode(datosZip.slice(offset + 30, offset + 30 + nombre)),
			decoder.decode(datosZip.slice(inicio, inicio + tamano)),
		);
		offset = inicio + tamano;
	}
	expect(v.getUint32(offset, true)).toBe(0x02014b50);
	return resultado;
}
describe('recuperación completa y cancelación de exportación', () => {
	test('1001 filas de nombres empatados conservan todos los IDs en tres páginas', async () => {
		const o = opciones(),
			original = o.obtenerPagina,
			paginas: number[] = [],
			versiones: (string | undefined)[] = [];
		o.obtenerPagina = async (p) => {
			paginas.push(p.pagina);
			versiones.push(p.version);
			return original(p);
		};
		const archivo = await exportarGrilla(o),
			texto = await archivo.blob.text();
		expect(paginas).toEqual([1, 2, 3]);
		expect(versiones).toEqual([undefined, 'revision-1', 'revision-1']);
		expect(archivo.total).toBe(1001);
		const ids = [...texto.matchAll(/"sintetico-(\d+)"/gu)].map((m) => Number(m[1]));
		expect(ids).toHaveLength(1001);
		expect(new Set(ids).size).toBe(1001);
		expect(ids.at(-1)).toBe(1000);
		expect(texto).toContain('"00000000"');
		expect(archivo.blob.type).toBe('text/csv;charset=utf-8');
	});
	test('filtros y orden capturados no cambian al editar la pantalla durante la descarga', async () => {
		const o = opciones(),
			original = o.obtenerPagina,
			usados: { busqueda: string; campo: string }[] = [];
		o.obtenerPagina = async (p) => {
			usados.push({ busqueda: p.filtro.busqueda, campo: p.orden.campo });
			o.filtroSnapshot.busqueda = 'otro';
			o.orden.campo = 'dni';
			return original(p);
		};
		await exportarGrilla(o);
		expect(usados).toEqual(
			Array.from({ length: 3 }, () => ({ busqueda: 'sintetico', campo: 'nombre' })),
		);
	});
	test('cambio de revisión falla sin devolver archivo parcial', async () => {
		const o = opciones(),
			original = o.obtenerPagina;
		o.obtenerPagina = async (p) => ({
			...(await original(p)),
			version: p.pagina === 2 ? 'revision-2' : 'revision-1',
		});
		await expect(exportarGrilla(o)).rejects.toThrow('Los datos cambiaron');
	});
	test('cambio de total falla aunque el servidor repita la revisión', async () => {
		const o = opciones(),
			original = o.obtenerPagina;
		o.obtenerPagina = async (p) => ({
			...(await original(p)),
			total: p.pagina === 2 ? 1002 : 1001,
		});
		await expect(exportarGrilla(o)).rejects.toThrow('Los datos cambiaron');
	});
	test('fila repetida entre páginas falla sin ocultar la omisión', async () => {
		const o = opciones(),
			original = o.obtenerPagina;
		o.obtenerPagina = async (p) => {
			const v = await original(p);
			return p.pagina === 2
				? { ...v, filas: v.filas.map((f, i) => (i === 0 ? { ...f, id: 'sintetico-0' } : f)) }
				: v;
		};
		await expect(exportarGrilla(o)).rejects.toThrow('repitió una fila');
	});
	test('una página truncada no equivale a terminar el conjunto', async () => {
		const o = opciones(),
			original = o.obtenerPagina;
		o.obtenerPagina = async (p) => {
			const v = await original(p);
			return p.pagina === 2 ? { ...v, filas: v.filas.slice(0, 100) } : v;
		};
		await expect(exportarGrilla(o)).rejects.toThrow('No se descargó un archivo parcial');
	});
	test('fallo de red en página posterior no devuelve el archivo recuperado hasta ese momento', async () => {
		const o = opciones(),
			original = o.obtenerPagina;
		o.obtenerPagina = async (p) => {
			if (p.pagina === 2) {
				throw new Error('corte sintético de red');
			}
			return original(p);
		};
		await expect(exportarGrilla(o)).rejects.toThrow('corte sintético');
	});
	test('cancelar antes de empezar no solicita datos', async () => {
		const o = opciones(),
			c = new AbortController();
		let llamadas = 0;
		o.signal = c.signal;
		o.obtenerPagina = async () => {
			llamadas++;
			throw new Error('no llamar');
		};
		c.abort();
		await expect(exportarGrilla(o)).rejects.toMatchObject({ name: 'AbortError' });
		expect(llamadas).toBe(0);
	});
	test('cancelar después de una página evita la siguiente y la descarga', async () => {
		const o = opciones(),
			c = new AbortController(),
			original = o.obtenerPagina;
		let llamadas = 0;
		o.signal = c.signal;
		o.obtenerPagina = async (p) => {
			llamadas++;
			return original(p);
		};
		o.onProgreso = () => c.abort();
		await expect(exportarGrilla(o)).rejects.toMatchObject({ name: 'AbortError' });
		expect(llamadas).toBe(1);
	});
	test('cambio de sesión durante una respuesta invalida sus filas', async () => {
		const o = opciones(),
			original = o.obtenerPagina;
		let sesion = 'sesion-A';
		o.sesionActual = () => sesion;
		o.obtenerPagina = async (p) => {
			const respuesta = await original(p);
			sesion = 'sesion-B';
			return respuesta;
		};
		await expect(exportarGrilla(o)).rejects.toMatchObject({ name: 'AbortError' });
	});
	test('cancelar al generar el archivo no obtiene un Blob descargable', async () => {
		const o = opciones(),
			c = new AbortController();
		o.signal = c.signal;
		o.onProgreso = (p) => {
			if (p.fase === 'generando') {
				c.abort();
			}
		};
		await expect(exportarGrilla(o)).rejects.toMatchObject({ name: 'AbortError' });
	});
	test('el resultado vacío exporta encabezados y total cero válidos', async () => {
		const archivo = await exportarGrilla(opciones(0));
		expect(archivo.total).toBe(0);
		expect(await archivo.blob.text()).toContain('"Identificador","DNI","Nombre","Importe"');
	});
	test('limita filas y celdas antes de retener una colección inmanejable', async () => {
		for (const total of [100001, 100000]) {
			const o = opciones(0);
			o.obtenerPagina = async () => ({ filas: [], total, version: 'v' });
			await expect(exportarGrilla(o)).rejects.toThrow('demasiado grande');
		}
	});
	test('el presupuesto de 25 MB evita generar un archivo de textos grandes', async () => {
		const o = opciones(500);
		o.columnas = Array.from({ length: 30 }, (_, i) => ({
			titulo: `Texto ${i}`,
			tipo: 'texto' as const,
			valor: () => 'A'.repeat(2000),
		}));
		await expect(exportarGrilla(o)).rejects.toThrow('25 MB');
	});
	test('progreso final y nombre de archivo sólo se devuelven al completar', async () => {
		const o = opciones(501),
			avances: number[] = [];
		o.nombreArchivo = '../socios:local';
		o.onProgreso = (p) => avances.push(p.recuperadas);
		const archivo = await exportarGrilla(o);
		expect(avances).toEqual([500, 501, 501]);
		expect(archivo.nombreArchivo).toMatch(/^-{3}socios-local-.*\.csv$/u);
		expect(archivo.version).toBe('revision-1');
	});
});
describe('serialización segura CSV y XLSX reales', () => {
	test('CSV entrecomilla comas, comillas y saltos sin eliminar texto', async () => {
		const filas = [
			{ id: 'x', dni: '00001234', nombre: 'Apellido, "Nombre"\r\nOtra línea 🎾', importe: -25.75 },
		];
		const datosCsv = await exportCsv(filas, columnas),
			texto = new TextDecoder().decode(datosCsv);
		expect([...datosCsv.slice(0, 3)]).toEqual([239, 187, 191]);
		expect(texto).toContain('"00001234"');
		expect(texto).toContain('"Apellido, ""Nombre""\r\nOtra línea 🎾"');
		expect(texto).toContain('"-25.75"');
	});
	test('CSV neutraliza fórmulas de texto incluso con espacios o tabulación', () => {
		for (const valor of [
			'=HYPERLINK("x")',
			' +SUM(A1)',
			'-2+3',
			'@SUM(A1)',
			'\t=1',
			'\r=1',
			'\n=1',
		]) {
			expect(escaparCsv(valor).startsWith('"\'')).toBe(true);
		}
		expect(escaparCsv(-2)).toBe('"-2"');
		expect(escaparCsv('00001234')).toBe('"00001234"');
	});
	test('XLSX guarda DNI y fórmulas aportadas como texto, importes como números', async () => {
		const archivo = await exportarGrilla({ ...opciones(1001), formato: 'xlsx' }),
			zip = entradasZip(new Uint8Array(await archivo.blob.arrayBuffer())),
			hoja = zip.get('xl/worksheets/sheet1.xml') ?? '';
		expect(archivo.total).toBe(1001);
		expect(zip.size).toBe(6);
		expect(hoja.match(/<row /gu)).toHaveLength(1002);
		expect(hoja).toContain('r="B2" t="inlineStr"');
		expect(hoja).toContain('>00000000</t>');
		expect(hoja).toContain('r="D2" t="n"><v>12.5</v>');
		expect(hoja).not.toContain('<f>');
		const celdaFormula = await exportXlsx(
			[{ valor: '=HYPERLINK("https://example.test")' }],
			[{ titulo: 'Dato', tipo: 'texto', valor: (f) => f.valor }],
		);
		const xml = entradasZip(celdaFormula).get('xl/worksheets/sheet1.xml') ?? '';
		expect(xml).toContain('t="inlineStr"');
		expect(xml).toContain('=HYPERLINK(&quot;');
		expect(xml).not.toContain('<f>');
	});
	test('rechaza valores no finitos o texto incompatible sin corromper la planilla', async () => {
		for (const importe of [Number.NaN, Number.POSITIVE_INFINITY]) {
			await expect(exportCsv([{ ...datos(1)[0], importe } as Fila], columnas)).rejects.toThrow(
				'número válido',
			);
		}
		for (const nombre of ['mal\u0000texto', 'mal\uD800texto', 'A'.repeat(32768)]) {
			await expect(
				exportXlsx([{ id: 'x', dni: '0001', nombre, importe: 1 }], columnas),
			).rejects.toThrow();
		}
	});
	test('columnas vacías o tipos incorrectos no producen archivos', async () => {
		await expect(exportCsv(datos(1), [])).rejects.toThrow('columnas');
		const mala: ColumnaExportacion<Fila>[] = [
			{ titulo: 'DNI', tipo: 'numero', valor: (f) => f.dni },
		];
		await expect(exportXlsx(datos(1), mala)).rejects.toThrow('número válido');
	});
	test('configuración es genérica y no requiere entidades de negocio', () => {
		const cfg: ConfiguracionExportacion<{ id: string }, { estado: string }> = {
			nombreArchivo: 'genérico',
			filtroSnapshot: { estado: 'activo' },
			orden: { campo: 'id', direccion: 'asc' },
			columnas: [{ titulo: 'Código', tipo: 'texto', valor: (f) => f.id }],
			claveFila: (f) => f.id,
			obtenerPagina: async () => ({ filas: [], total: 0, version: 'v' }),
		};
		expect(cfg.filtroSnapshot.estado).toBe('activo');
	});
});

import { cederExportacion, comprobarCancelacion, MAX_BYTES_EXPORTACION } from './types';

const tablaCrc = Uint32Array.from({ length: 256 }, (_, i) => {
	let n = i;
	for (let bit = 0; bit < 8; bit++) {
		n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
	}
	return n >>> 0;
});
async function crc32(datos: Uint8Array, signal?: AbortSignal): Promise<number> {
	let crc = 0xffffffff;
	for (let i = 0; i < datos.length; i++) {
		crc = (tablaCrc[(crc ^ (datos[i] ?? 0)) & 255] ?? 0) ^ (crc >>> 8);
		if (i > 0 && i % 1_048_576 === 0) {
			await cederExportacion(signal);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}
// ZIP almacenado: nombres UTF-8, CRC32 y directorio central. No comprime ni
// necesita servicios, paquetes ejecutables o un procesador de fórmulas.
export async function crearZip(
	archivos: readonly { nombre: string; texto: string }[],
	signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
	const encoder = new TextEncoder();
	const entradas = [];
	let longitud = 22;
	for (const archivo of archivos) {
		comprobarCancelacion(signal);
		const nombre = encoder.encode(archivo.nombre),
			datos = encoder.encode(archivo.texto);
		const crc = await crc32(datos, signal);
		const entrada = { nombre, datos, crc, offset: 0 };
		entradas.push(entrada);
		longitud += 30 + nombre.length + datos.length + 46 + nombre.length;
		if (longitud > MAX_BYTES_EXPORTACION) {
			throw new Error('El archivo supera 25 MB. Reducí los filtros.');
		}
	}
	const salida = new Uint8Array(longitud),
		vista = new DataView(salida.buffer);
	let cursor = 0;
	const u16 = (pos: number, n: number) => vista.setUint16(pos, n, true);
	const u32 = (pos: number, n: number) => vista.setUint32(pos, n, true);
	for (const e of entradas) {
		e.offset = cursor;
		u32(cursor, 0x04034b50);
		u16(cursor + 4, 20);
		u16(cursor + 6, 0x0800);
		u16(cursor + 12, 33);
		u32(cursor + 14, e.crc);
		u32(cursor + 18, e.datos.length);
		u32(cursor + 22, e.datos.length);
		u16(cursor + 26, e.nombre.length);
		salida.set(e.nombre, cursor + 30);
		salida.set(e.datos, cursor + 30 + e.nombre.length);
		cursor += 30 + e.nombre.length + e.datos.length;
	}
	const inicioDirectorio = cursor;
	for (const e of entradas) {
		u32(cursor, 0x02014b50);
		u16(cursor + 4, 20);
		u16(cursor + 6, 20);
		u16(cursor + 8, 0x0800);
		u16(cursor + 14, 33);
		u32(cursor + 16, e.crc);
		u32(cursor + 20, e.datos.length);
		u32(cursor + 24, e.datos.length);
		u16(cursor + 28, e.nombre.length);
		u32(cursor + 42, e.offset);
		salida.set(e.nombre, cursor + 46);
		cursor += 46 + e.nombre.length;
	}
	u32(cursor, 0x06054b50);
	u16(cursor + 8, entradas.length);
	u16(cursor + 10, entradas.length);
	u32(cursor + 12, cursor - inicioDirectorio);
	u32(cursor + 16, inicioDirectorio);
	comprobarCancelacion(signal);
	return salida;
}

import type { ColumnaExportacion, ControlSerializacion } from './types';
import {
	cederExportacion,
	comprobarCancelacion,
	MAX_BYTES_EXPORTACION,
	validarColumnas,
	valorCelda,
} from './types';

// CSV conserva el texto y los ceros del campo. Al importarlo en una planilla,
// el lector debe elegir tipo texto para DNI: CSV no tiene metadatos de tipos.
export function escaparCsv(valor: string | number | null): string {
	if (valor === null) {
		return '""';
	}
	const texto = String(valor);
	const seguro =
		typeof valor === 'string' && (/^[\s\uFEFF]*[=+\-@]/u.test(texto) || /^[\t\r\n]/u.test(texto))
			? `'${texto}`
			: texto;
	return `"${seguro.replaceAll('"', '""')}"`;
}
export async function exportCsv<Fila>(
	filas: readonly Fila[],
	columnas: readonly ColumnaExportacion<Fila>[],
	control: ControlSerializacion = {},
): Promise<Uint8Array<ArrayBuffer>> {
	validarColumnas(columnas);
	comprobarCancelacion(control.signal);
	const lineas = [columnas.map((c) => escaparCsv(c.titulo)).join(',')];
	for (let i = 0; i < filas.length; i++) {
		const fila = filas[i];
		if (fila === undefined) {
			throw new Error('Falta una fila de la exportación.');
		}
		lineas.push(columnas.map((c) => escaparCsv(valorCelda(c, fila))).join(','));
		if ((i + 1) % 1000 === 0) {
			await cederExportacion(control.signal);
		}
	}
	comprobarCancelacion(control.signal);
	const datos = new TextEncoder().encode(`\uFEFF${lineas.join('\r\n')}\r\n`);
	if (datos.byteLength > MAX_BYTES_EXPORTACION) {
		throw new Error('El archivo supera 25 MB. Reducí los filtros.');
	}
	return datos;
}

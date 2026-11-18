export type ValorExportacion = string | number | null | undefined;
export interface ColumnaExportacion<Fila> {
	titulo: string;
	tipo: 'texto' | 'numero';
	valor: (fila: Fila) => ValorExportacion;
}
export interface ControlSerializacion {
	signal?: AbortSignal;
}
export const MAX_BYTES_EXPORTACION = 25 * 1024 * 1024;
export const MAX_FILAS_EXPORTACION = 100_000;
export const MAX_CELDAS_EXPORTACION = 250_000;

export function comprobarCancelacion(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException('Exportación cancelada.', 'AbortError');
	}
}
export async function cederExportacion(signal?: AbortSignal): Promise<void> {
	comprobarCancelacion(signal);
	await new Promise<void>((resolve, reject) => {
		const canal = typeof MessageChannel === 'function' ? new MessageChannel() : null;
		let temporizador: ReturnType<typeof setTimeout> | undefined;
		let terminado = false;
		const terminar = (completar: () => void) => {
			if (terminado) {
				return;
			}
			terminado = true;
			signal?.removeEventListener('abort', cancelar);
			if (temporizador !== undefined) {
				clearTimeout(temporizador);
			}
			if (canal) {
				canal.port1.onmessage = null;
				canal.port1.close();
				canal.port2.close();
			}
			completar();
		};
		const cancelar = () =>
			terminar(() => reject(new DOMException('Exportación cancelada.', 'AbortError')));
		signal?.addEventListener('abort', cancelar, { once: true });
		if (signal?.aborted) {
			cancelar();
			return;
		}
		try {
			if (canal) {
				canal.port1.onmessage = () => terminar(resolve);
				canal.port2.postMessage(null);
			} else {
				temporizador = setTimeout(() => terminar(resolve), 0);
			}
		} catch (error) {
			terminar(() => reject(error));
		}
	});
	comprobarCancelacion(signal);
}
export function textoXml(valor: string): string {
	for (const caracter of valor) {
		const codigo = caracter.codePointAt(0) ?? 0;
		if (
			(codigo < 32 && ![9, 10, 13].includes(codigo)) ||
			codigo === 65534 ||
			codigo === 65535 ||
			(codigo >= 55296 && codigo <= 57343)
		) {
			throw new Error('Un texto contiene caracteres que el archivo no admite. Revisá los datos.');
		}
	}
	return valor
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
		.replaceAll('\r', '&#13;');
}
export function valorCelda<Fila>(
	columna: ColumnaExportacion<Fila>,
	fila: Fila,
): string | number | null {
	const valor = columna.valor(fila);
	if (valor === null || valor === undefined) {
		return null;
	}
	if (columna.tipo === 'numero') {
		if (typeof valor !== 'number' || !Number.isFinite(valor)) {
			throw new Error('Un importe o cantidad no es un número válido.');
		}
		return valor;
	}
	if (typeof valor !== 'string') {
		throw new Error('Un dato de texto no tiene el formato esperado.');
	}
	if (valor.length > 32_767) {
		throw new Error('Un texto supera el tamaño admitido por la planilla.');
	}
	textoXml(valor);
	return valor;
}
export function validarColumnas<Fila>(columnas: readonly ColumnaExportacion<Fila>[]): void {
	if (!columnas.length || columnas.length > 100) {
		throw new Error('La selección de columnas no es válida.');
	}
	for (const c of columnas) {
		if (!c.titulo.trim() || c.titulo.length > 200) {
			throw new Error('El nombre de una columna no es válido.');
		}
		textoXml(c.titulo);
	}
}

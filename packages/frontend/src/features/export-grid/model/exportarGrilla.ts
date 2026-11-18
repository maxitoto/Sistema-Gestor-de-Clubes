import type { ColumnaExportacion, ValorExportacion } from '#shared/lib/export';
import {
	comprobarCancelacion,
	exportCsv,
	exportXlsx,
	MAX_BYTES_EXPORTACION,
	MAX_CELDAS_EXPORTACION,
	MAX_FILAS_EXPORTACION,
	textoXml,
	validarColumnas,
	valorCelda,
} from '#shared/lib/export';
export type FormatoExportacion = 'csv' | 'xlsx';
export interface OrdenExportacion {
	campo: string;
	direccion: 'asc' | 'desc';
}
export interface SolicitudPaginaExportacion<Filtro> {
	filtro: Filtro;
	orden: OrdenExportacion;
	pagina: number;
	tamanoPagina: number;
	version?: string;
	signal: AbortSignal;
}
export interface PaginaExportacion<Fila> {
	filas: readonly Fila[];
	total: number;
	version: string;
}
export interface ConfiguracionExportacion<Fila, Filtro extends object> {
	nombreArchivo: string;
	filtroSnapshot: Filtro;
	orden: OrdenExportacion;
	columnas: readonly ColumnaExportacion<Fila>[];
	obtenerPagina: (
		solicitud: SolicitudPaginaExportacion<Filtro>,
	) => Promise<PaginaExportacion<Fila>>;
	claveFila: (fila: Fila) => string;
}
export interface OpcionesExportacion<Fila, Filtro extends object>
	extends ConfiguracionExportacion<Fila, Filtro> {
	formato: FormatoExportacion;
	alcanceSesion: string;
	sesionActual: () => string | null;
	signal: AbortSignal;
	onProgreso?: (progreso: {
		recuperadas: number;
		total: number;
		fase: 'recuperando' | 'generando';
	}) => void;
}
export interface ArchivoExportado {
	blob: Blob;
	nombreArchivo: string;
	total: number;
	version: string;
}
export async function exportarGrilla<Fila, Filtro extends object>(
	opciones: OpcionesExportacion<Fila, Filtro>,
): Promise<ArchivoExportado> {
	const filtro = structuredClone(opciones.filtroSnapshot),
		orden = { ...opciones.orden },
		columnas = [...opciones.columnas];
	validarColumnas(columnas);
	if (!opciones.alcanceSesion) {
		throw new Error('La sesión no está disponible para exportar.');
	}
	const comprobar = () => {
		comprobarCancelacion(opciones.signal);
		if (opciones.sesionActual() !== opciones.alcanceSesion) {
			throw new DOMException('La sesión cambió. Volvé a iniciar la exportación.', 'AbortError');
		}
	};
	const filas: ValorExportacion[][] = [],
		ids = new Set<string>();
	let pagina = 1,
		total: number | null = null,
		version: string | undefined,
		bytesEstimados = 8_192;
	const encoder = new TextEncoder();
	while (total === null || filas.length < total) {
		comprobar();
		const respuesta = await opciones.obtenerPagina({
			filtro: structuredClone(filtro),
			orden: { ...orden },
			pagina,
			tamanoPagina: 500,
			...(version ? { version } : {}),
			signal: opciones.signal,
		});
		comprobar();
		if (
			!Number.isSafeInteger(respuesta.total) ||
			respuesta.total < 0 ||
			typeof respuesta.version !== 'string' ||
			!respuesta.version ||
			respuesta.version.length > 256 ||
			!Array.isArray(respuesta.filas)
		) {
			throw new Error('El listado no confirmó una exportación completa. Volvé a intentarlo.');
		}
		if (
			respuesta.total > MAX_FILAS_EXPORTACION ||
			respuesta.total * columnas.length > MAX_CELDAS_EXPORTACION
		) {
			throw new Error('El conjunto es demasiado grande. Reducí los filtros para exportar.');
		}
		if (total === null) {
			total = respuesta.total;
			version = respuesta.version;
		}
		if (total !== respuesta.total || version !== respuesta.version) {
			throw new Error('Los datos cambiaron durante la exportación. Volvé a intentarlo.');
		}
		if (respuesta.filas.length !== Math.min(500, total - filas.length)) {
			throw new Error(
				'Faltan filas del listado. No se descargó un archivo parcial. Volvé a intentarlo.',
			);
		}
		for (const fila of respuesta.filas) {
			const id = opciones.claveFila(fila);
			if (!id || ids.has(id)) {
				throw new Error('El listado repitió una fila. Volvé a iniciar la exportación.');
			}
			ids.add(id);
			const valores = columnas.map((c) => valorCelda(c, fila));
			bytesEstimados += 40;
			for (const valor of valores) {
				bytesEstimados +=
					100 +
					encoder.encode(typeof valor === 'string' ? textoXml(valor) : String(valor ?? '')).length;
			}
			if (bytesEstimados > MAX_BYTES_EXPORTACION) {
				throw new Error('El archivo supera 25 MB. Reducí los filtros.');
			}
			filas.push(valores);
		}
		opciones.onProgreso?.({ recuperadas: filas.length, total, fase: 'recuperando' });
		pagina++;
	}
	comprobar();
	opciones.onProgreso?.({ recuperadas: filas.length, total: total ?? 0, fase: 'generando' });
	const definicion: ColumnaExportacion<ValorExportacion[]>[] = columnas.map((c, i) => ({
		titulo: c.titulo,
		tipo: c.tipo,
		valor: (fila) => fila[i],
	}));
	const datos =
		opciones.formato === 'csv'
			? await exportCsv(filas, definicion, { signal: opciones.signal })
			: await exportXlsx(filas, definicion, { signal: opciones.signal });
	comprobar();
	const prefijo =
		opciones.nombreArchivo.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 80) || 'reporte';
	const fecha = new Date()
		.toISOString()
		.replaceAll(':', '-')
		.replace(/\.\d{3}Z$/u, 'Z');
	return {
		blob: new Blob([datos], {
			type:
				opciones.formato === 'csv'
					? 'text/csv;charset=utf-8'
					: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		}),
		nombreArchivo: `${prefijo}-${fecha}.${opciones.formato}`,
		total: total ?? 0,
		version: version ?? '',
	};
}
export function descargarExportacion(archivo: ArchivoExportado): void {
	const url = URL.createObjectURL(archivo.blob),
		link = document.createElement('a');
	link.href = url;
	link.download = archivo.nombreArchivo;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

import { createHumanRequestClient, supabase } from '#shared/api';
import { leerGrillaReporte, type OpcionesReporte } from '#shared/api/reportes-read.api';
import { rangoDiasCorreo } from '#shared/lib/comunicaciones';
import { parseGasto } from '../model/gastoContract';
export interface DatosGasto {
	categoria_id: string;
	fecha: string;
	concepto: string;
	monto: number;
	metodo_pago: 'efectivo' | 'transferencia';
	referencia_banco: string | null;
	descripcion: string | null;
}
export interface Gasto extends DatosGasto {
	id: string;
	usuario_id: string;
	estado: 'activo' | 'anulado';
	created_at: string;
	updated_at: string;
	motivo_anulacion: string | null;
	anulado_at: string | null;
	anulado_por: string | null;
	categoria: { id: string; nombre: string; estado: 'activo' | 'inactivo' } | null;
}
export interface FiltrosGasto {
	desde: string;
	hasta: string;
	categoriaId: string;
	metodo: string;
	estado: string;
	busqueda: string;
	orden: 'fecha' | 'concepto' | 'monto' | 'metodo_pago' | 'estado';
	ascendente: boolean;
	pagina: number;
	limite: number;
}
const columnas =
	'id,categoria_id,usuario_id,fecha,concepto,monto,metodo_pago,referencia_banco,descripcion,estado,created_at,updated_at,motivo_anulacion,anulado_at,anulado_por,categoria:categorias_gasto(id,nombre,estado)';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const timed = (signal?: AbortSignal) =>
	signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
export async function getReporteGastos(
	filters: FiltrosGasto,
	signal?: AbortSignal,
	opciones: OpcionesReporte = {},
) {
	rangoDiasCorreo(filters.desde, filters.hasta);
	return leerGrillaReporte('gastos', { ...filters }, parseGasto, signal, opciones);
}
export async function getGastos(filters: FiltrosGasto, signal?: AbortSignal) {
	const resultado = await getReporteGastos(filters, signal);
	if (resultado.pagina !== filters.pagina || resultado.limite !== filters.limite) {
		throw new Error('La página recibida no coincide con los gastos consultados.');
	}
	return { gastos: resultado.filas, total: resultado.total };
}
export async function getGasto(id: string, signal?: AbortSignal): Promise<Gasto | null> {
	if (!uuid.test(id)) {
		return null;
	}
	const { data, error } = await supabase
		.from('gastos')
		.select(columnas)
		.eq('id', id)
		.abortSignal(timed(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	return data ? parseGasto(data) : null;
}
export async function getFechaClubGastos(signal?: AbortSignal) {
	const { data, error } = await supabase.rpc('fecha_actual_club').abortSignal(timed(signal));
	if (error) {
		throw error;
	}
	if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
		throw new Error('No se pudo consultar la fecha del club.');
	}
	return data;
}
export async function registrarGasto(
	solicitud: string,
	datos: DatosGasto,
	actorId: string,
	signal?: AbortSignal,
) {
	const client = await createHumanRequestClient(actorId, signal);
	const { data, error, status } = await client.rpc('registrar_gasto_idempotente', {
		p_solicitud: solicitud,
		p_datos: { ...datos },
	});
	if (error) {
		throw Object.assign(error, { status });
	}
	if (typeof data !== 'string' || !uuid.test(data)) {
		throw Object.assign(new Error('No se pudo confirmar la identidad del gasto.'), { status: 502 });
	}
	return data;
}
export async function consultarAltaGasto(solicitud: string, signal?: AbortSignal) {
	const { data, error } = await supabase
		.rpc('consultar_alta_gasto', { p_solicitud: solicitud })
		.abortSignal(timed(signal));
	if (error) {
		throw error;
	}
	if (data !== null && (typeof data !== 'string' || !uuid.test(data))) {
		throw new Error('No se pudo verificar el intento de gasto.');
	}
	return data;
}
export async function actualizarGasto(
	id: string,
	datos: DatosGasto,
	actorId: string,
	signal?: AbortSignal,
) {
	const client = await createHumanRequestClient(actorId, signal);
	const { data, error, status } = await client
		.from('gastos')
		.update({
			categoria_id: datos.categoria_id,
			fecha: datos.fecha,
			concepto: datos.concepto,
			monto: datos.monto,
			metodo_pago: datos.metodo_pago,
			referencia_banco: datos.referencia_banco,
			descripcion: datos.descripcion,
		})
		.eq('id', id)
		.select('id')
		.maybeSingle();
	if (error) {
		throw Object.assign(error, { status });
	}
	if (!data || data.id !== id) {
		throw Object.assign(
			new Error('El gasto no está disponible para editar. Actualizá el detalle.'),
			{ status: 409 },
		);
	}
}
export async function anularGasto(
	id: string,
	motivo: string,
	actorId: string,
	signal?: AbortSignal,
) {
	const client = await createHumanRequestClient(actorId, signal);
	const { error, status } = await client.rpc('anular_gasto', { p_gasto_id: id, p_motivo: motivo });
	if (error) {
		throw Object.assign(error, { status });
	}
}

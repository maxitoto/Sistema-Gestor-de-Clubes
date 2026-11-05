import { supabase } from '#shared/api';
import {
	type ConfirmacionInscripcion,
	comprobarRecuperacion,
	type IdentidadInscripcion,
	type PeriodoInscripcion,
	parseConfirmacionInscripcion,
	periodoDeFecha,
	type ResultadoInscripcion,
	type VistaPreviaInscripcion,
} from '../model/inscripcionContract';

function lecturaSignal(signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(10_000);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function getFechaActualClub(signal?: AbortSignal): Promise<string> {
	const { data, error } = await supabase
		.rpc('fecha_actual_club')
		.abortSignal(lecturaSignal(signal));
	if (error) {
		throw error;
	}
	if (typeof data !== 'string') {
		throw new Error('No se pudo consultar la fecha del club.');
	}
	periodoDeFecha(data);
	return data;
}

export async function getCargosDelPeriodo(
	socioId: string,
	periodo: PeriodoInscripcion,
	signal?: AbortSignal,
) {
	const { data, error } = await supabase
		.rpc('cuotas_del_periodo', {
			p_socio_id: socioId,
			p_mes: periodo.mes,
			p_anio: periodo.anio,
		})
		.abortSignal(lecturaSignal(signal));
	if (error) {
		throw error;
	}
	return data ?? [];
}

export async function previsualizarInscripcion(
	identidad: IdentidadInscripcion,
	signal?: AbortSignal,
): Promise<VistaPreviaInscripcion> {
	const fecha = await getFechaActualClub(signal);
	const periodo = periodoDeFecha(fecha);
	const [preview, cargos] = await Promise.all([
		supabase
			.rpc('previsualizar_inscripcion', {
				p_socio_id: identidad.socioId,
				p_categoria_id: identidad.categoriaId,
			})
			.abortSignal(lecturaSignal(signal)),
		getCargosDelPeriodo(identidad.socioId, periodo, signal),
	]);
	if (preview.error) {
		throw preview.error;
	}
	if ((preview.data?.length ?? 0) > 1) {
		throw new Error('El servidor devolvió más de una previsualización.');
	}
	// Si cambió el día durante las lecturas, exigir una nueva previsualización.
	const fechaFinal = await getFechaActualClub(signal);
	if (fechaFinal !== fecha) {
		throw new Error('Cambió la fecha del club. Actualizá la previsualización.');
	}
	return { fecha, periodo, detalle: preview.data?.[0] ?? null, cargos };
}

export async function confirmarInscripcion(
	identidad: IdentidadInscripcion,
	signal?: AbortSignal,
): Promise<ConfirmacionInscripcion> {
	const timeout = AbortSignal.timeout(15_000);
	const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	const { data, error, status } = await supabase
		.rpc('confirmar_inscripcion', {
			p_socio_id: identidad.socioId,
			p_categoria_id: identidad.categoriaId,
		})
		.abortSignal(requestSignal);
	if (error) {
		throw Object.assign(error, { status });
	}
	return parseConfirmacionInscripcion(data);
}

export async function consultarResultadoInscripcion(
	identidad: IdentidadInscripcion,
	confirmacion: ConfirmacionInscripcion,
	signal?: AbortSignal,
): Promise<ResultadoInscripcion> {
	const [inscripcion, cuota] = await Promise.all([
		supabase
			.from('inscripciones')
			.select('*')
			.eq('id', confirmacion.inscripcion_id)
			.eq('socio_id', identidad.socioId)
			.eq('categoria_id', identidad.categoriaId)
			.abortSignal(lecturaSignal(signal))
			.single(),
		supabase
			.from('cuotas')
			.select('*')
			.eq('id', confirmacion.cuota_id)
			.eq('socio_id', identidad.socioId)
			.eq('categoria_id', identidad.categoriaId)
			.abortSignal(lecturaSignal(signal))
			.single(),
	]);
	if (inscripcion.error) {
		throw inscripcion.error;
	}
	if (cuota.error) {
		throw cuota.error;
	}
	const recuperacion = comprobarRecuperacion(identidad, inscripcion.data, cuota.data);
	if (recuperacion.estado !== 'recuperada') {
		throw new Error('No se pudieron verificar la inscripción y su cuota.');
	}
	return {
		...recuperacion.resultado,
		origen: 'confirmada',
		cuotaCreada: confirmacion.cuota_creada,
	};
}

export async function recuperarInscripcion(identidad: IdentidadInscripcion, signal?: AbortSignal) {
	const inscripcion = await supabase
		.from('inscripciones')
		.select('*')
		.eq('socio_id', identidad.socioId)
		.eq('categoria_id', identidad.categoriaId)
		.eq('estado', 'activa')
		.abortSignal(lecturaSignal(signal))
		.maybeSingle();
	if (inscripcion.error) {
		throw inscripcion.error;
	}
	if (!inscripcion.data) {
		return comprobarRecuperacion(identidad, null, null);
	}
	const periodo = periodoDeFecha(inscripcion.data.fecha_alta);
	const cuota = await supabase
		.from('cuotas')
		.select('*')
		.eq('socio_id', identidad.socioId)
		.eq('categoria_id', identidad.categoriaId)
		.eq('periodo_mes', periodo.mes)
		.eq('periodo_anio', periodo.anio)
		.abortSignal(lecturaSignal(signal))
		.maybeSingle();
	if (cuota.error) {
		throw cuota.error;
	}
	return comprobarRecuperacion(identidad, inscripcion.data, cuota.data);
}

const historialSelect =
	'id,socio_id,categoria_id,fecha_alta,fecha_baja,estado,categoria:categorias(nombre,estado,arancel_mensual,deporte:deportes(nombre,estado))';
export async function getHistorialInscripciones(socioId: string, signal?: AbortSignal) {
	const { data, error } = await supabase
		.from('inscripciones')
		.select(historialSelect)
		.eq('socio_id', socioId)
		.order('fecha_alta', { ascending: false })
		.order('id')
		.abortSignal(lecturaSignal(signal));
	if (error) {
		throw error;
	}
	return data ?? [];
}
export type InscripcionHistorial = Awaited<ReturnType<typeof getHistorialInscripciones>>[number];
export async function getInscripcion(id: string, signal?: AbortSignal) {
	const { data, error } = await supabase
		.from('inscripciones')
		.select(historialSelect)
		.eq('id', id)
		.abortSignal(lecturaSignal(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	return data;
}
export async function bajaInscripcion(id: string, signal?: AbortSignal) {
	const { error, status } = await supabase
		.rpc('baja_inscripcion', { p_inscripcion_id: id })
		.abortSignal(lecturaSignal(signal));
	if (error) {
		throw Object.assign(error, { status });
	}
}

import { supabase } from '#shared/api';
import {
	type PeriodoCuotas,
	parseJobCuotas,
	parseResultadoGeneracion,
	periodoCuotasDeFecha,
} from '../model/jobCuotasContract';

const columns =
	'id,periodo_mes,periodo_anio,estado,cuotas_generadas,cuotas_omitidas,fecha_inicio,fecha_fin';
const lectura = (signal?: AbortSignal) =>
	signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);

export async function getPeriodoCuotasActual(signal?: AbortSignal) {
	const { data, error } = await supabase.rpc('fecha_actual_club').abortSignal(lectura(signal));
	if (error) {
		throw error;
	}
	return periodoCuotasDeFecha(data);
}

export async function getUltimoJobCuotas(periodo: PeriodoCuotas, signal?: AbortSignal) {
	const { data, error } = await supabase
		.from('cuota_job_logs')
		.select(columns)
		.eq('periodo_mes', periodo.mes)
		.eq('periodo_anio', periodo.anio)
		.order('fecha_inicio', { ascending: false })
		.order('id', { ascending: false })
		.limit(1)
		.abortSignal(lectura(signal))
		.maybeSingle();
	if (error) {
		throw error;
	}
	return data ? parseJobCuotas(data) : null;
}

export async function getJobCuotas(id: string, signal?: AbortSignal) {
	const { data, error } = await supabase
		.from('cuota_job_logs')
		.select(columns)
		.eq('id', id)
		.abortSignal(lectura(signal))
		.single();
	if (error) {
		throw error;
	}
	return parseJobCuotas(data);
}

export async function getHistorialJobsCuotas(signal?: AbortSignal) {
	const { data, error } = await supabase
		.from('cuota_job_logs')
		.select(columns)
		.order('fecha_inicio', { ascending: false })
		.order('id', { ascending: false })
		.limit(12)
		.abortSignal(lectura(signal));
	if (error) {
		throw error;
	}
	return (data ?? []).map(parseJobCuotas);
}

export async function generarCuotasMesManual(signal?: AbortSignal) {
	const { data, error, status } = await supabase
		.rpc('generar_cuotas_mes_manual')
		.abortSignal(
			signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
		);
	if (error) {
		throw Object.assign(error, { status });
	}
	try {
		return parseResultadoGeneracion(data);
	} catch (error) {
		throw Object.assign(error instanceof Error ? error : new Error('Respuesta inválida.'), {
			responseReceived: true,
		});
	}
}

import { supabase } from '#shared/api';
import { type CriteriosCaja, fechaCajaValida, interpretarCaja } from '../model/cajaContract';

const timed = (signal?: AbortSignal) =>
	signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
export async function getCaja(criteria: CriteriosCaja, signal?: AbortSignal) {
	const { data, error } = await supabase
		.rpc('consultar_caja', { p_criterios: { ...criteria } })
		.abortSignal(timed(signal));
	if (error) {
		throw error;
	}
	return interpretarCaja(data, criteria);
}
export async function getPeriodoCajaActual(signal?: AbortSignal) {
	const { data, error } = await supabase.rpc('fecha_actual_club').abortSignal(timed(signal));
	if (error) {
		throw error;
	}
	if (typeof data !== 'string' || !fechaCajaValida(data)) {
		throw new Error('No pudimos consultar la fecha del club.');
	}
	const year = Number(data.slice(0, 4)),
		month = Number(data.slice(5, 7));
	const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return {
		desde: `${data.slice(0, 7)}-01`,
		hasta: `${data.slice(0, 7)}-${String(days).padStart(2, '0')}`,
	};
}

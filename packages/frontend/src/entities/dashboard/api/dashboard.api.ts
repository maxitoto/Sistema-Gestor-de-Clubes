import { createHumanRequestClient } from '#shared/api/humanRequest';
import {
	interpretarDashboard,
	type PeriodoDashboard,
	periodoDashboardValido,
} from '../model/dashboardContract';
export async function consultarDashboard(
	periodo: PeriodoDashboard,
	actorId: string,
	signal?: AbortSignal,
) {
	if (!periodoDashboardValido(periodo)) {
		throw new Error('Elegí un mes y año válidos.');
	}
	const db = await createHumanRequestClient(actorId, signal);
	const { data, error } = await db
		.rpc('consultar_dashboard', { p_mes: periodo.mes, p_anio: periodo.anio })
		.abortSignal(signal ?? new AbortController().signal);
	if (error) {
		if (error.code === '42501') {
			throw new Error('El dashboard requiere una cuenta de Administrador activa.');
		}
		if (error.code === '22023') {
			throw new Error('El período elegido no es válido.');
		}
		throw new Error('No pudimos consultar el dashboard. Revisá la conexión y volvé a intentarlo.');
	}
	signal?.throwIfAborted();
	return interpretarDashboard(data, periodo);
}

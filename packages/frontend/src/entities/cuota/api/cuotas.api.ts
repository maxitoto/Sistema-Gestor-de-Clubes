import { leerCobranza } from '#shared/api/cobranza-read.api';
import type { CriteriosCobranza } from '#shared/types/cobranza';
export const getCuotasCobranza = (
	criterios: Partial<CriteriosCobranza>,
	actorId: string,
	signal?: AbortSignal,
) => leerCobranza('cuotas', criterios, actorId, signal);
export async function getCuotaCobranza(id: string, actorId: string, signal?: AbortSignal) {
	const result = await getCuotasCobranza({ cuota_id: id }, actorId, signal);
	if (result.total > 1) {
		throw new Error('La identidad de cuota no es única.');
	}
	return result.filas[0] ?? null;
}

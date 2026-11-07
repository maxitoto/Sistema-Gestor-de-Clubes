import { leerCobranza, solicitarCobranza } from '#shared/api/cobranza-read.api';
import type { CriteriosCobranza, FilaCobranza } from '#shared/types/cobranza';
import { parseComprobanteCobrado } from '../model/cobroUuid';

export interface SolicitudCobro {
	cuotaId: string;
	metodo: 'efectivo' | 'transferencia';
	referencia: string | null;
}
export const getPagosCobranza = (
	criterios: Partial<CriteriosCobranza>,
	actorId: string,
	signal?: AbortSignal,
) => leerCobranza('pagos', criterios, actorId, signal);
export async function getPagoCobranza(id: string, actorId: string, signal?: AbortSignal) {
	const result = await getPagosCobranza({ pago_id: id }, actorId, signal);
	if (result.total > 1) {
		throw new Error('La identidad del cobro no es única.');
	}
	return result.filas[0] ?? null;
}
export async function cobrarCuota(input: SolicitudCobro, actorId: string, signal?: AbortSignal) {
	return parseComprobanteCobrado(
		await solicitarCobranza(
			'cobrar_cuota',
			{
				p_cuota_id: input.cuotaId,
				p_usuario_id: actorId,
				p_medio_pago: input.metodo,
				p_referencia: input.referencia,
			},
			actorId,
			signal,
		),
	);
}
export async function consultarCobroConfirmado(
	cuotaId: string,
	actorId: string,
	comprobanteId?: string | null,
	signal?: AbortSignal,
): Promise<FilaCobranza | null> {
	const result = await getPagosCobranza(
		{ cuota_id: cuotaId, ...(comprobanteId ? { comprobante_id: comprobanteId } : {}) },
		actorId,
		signal,
	);
	const completed = result.filas.filter((row) => row.estado_pago === 'completado');
	if (completed.length > 1) {
		throw new Error('El cobro requiere revisión: hay más de un pago vigente.');
	}
	const row = completed[0];
	if (!row) {
		return null;
	}
	if (
		row.cuota_id !== cuotaId ||
		row.estado_cuota !== 'pagada' ||
		!row.pago_id ||
		!row.comprobante_id ||
		(comprobanteId && row.comprobante_id !== comprobanteId)
	) {
		throw new Error('El cobro no tiene un resultado financiero coherente.');
	}
	return row;
}

import { createHumanRequestClient } from '#shared/api';
import { esUuidCobranza } from '#shared/types/cobranza';
import {
	parseEstadoAnulacionPago,
	parseResultadoAnulacionPago,
	validarMotivoAnulacionPago,
} from '../model/anulacionPago';
export async function getEstadoAnulacionPago(id: string, actorId: string, signal?: AbortSignal) {
	if (!esUuidCobranza(id)) {
		throw new Error('La identificación del cobro no es válida.');
	}
	const client = await createHumanRequestClient(actorId, signal);
	const [pago, original, fecha] = await Promise.all([
		client
			.from('pagos')
			.select('id,estado,fecha_pago,motivo_anulacion,anulado_por,anulado_at')
			.eq('id', id)
			.maybeSingle(),
		client
			.from('comprobantes')
			.select('estado_fiscal,cae')
			.eq('pago_id', id)
			.eq('tipo', 'factura')
			.maybeSingle(),
		client.rpc('fecha_actual_club'),
	]);
	if (pago.error || original.error || fecha.error) {
		throw new Error('No se pudo consultar el permiso de anulación.');
	}
	if (!pago.data || !original.data) {
		return null;
	}
	return parseEstadoAnulacionPago(pago.data, original.data, fecha.data, id);
}
export async function anularPago(
	id: string,
	motivo: string,
	actorId: string,
	signal?: AbortSignal,
) {
	if (!esUuidCobranza(id)) {
		throw new Error('La identificación del cobro no es válida.');
	}
	const client = await createHumanRequestClient(actorId, signal);
	const { data, error, status } = await client.rpc('anular_pago', {
		p_pago_id: id,
		p_motivo: validarMotivoAnulacionPago(motivo),
	});
	if (error) {
		throw Object.assign(
			new Error(
				'No se pudo anular el cobro. Consultá su estado y revisá fecha, permisos y estado fiscal.',
			),
			{ status, code: error.code },
		);
	}
	return parseResultadoAnulacionPago(data);
}

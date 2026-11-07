import type { SolicitudCobro } from '#entities/pago';
import { esUuidCobranza, type FilaCobranza } from '#shared/types/cobranza';
export interface IntentoCobro {
	usuarioId: string;
	cuotaId: string;
	solicitud: SolicitudCobro;
	iniciadoEn: string;
	comprobanteId: string | null;
}
export function parseIntentoCobro(
	value: unknown,
	usuarioId: string,
	cuotaId: string,
): IntentoCobro | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const v = value as IntentoCobro;
	if (
		v.usuarioId !== usuarioId ||
		v.cuotaId !== cuotaId ||
		!esUuidCobranza(v.usuarioId) ||
		!esUuidCobranza(v.cuotaId) ||
		!v.solicitud ||
		v.solicitud.cuotaId !== cuotaId ||
		!['efectivo', 'transferencia'].includes(v.solicitud.metodo) ||
		(v.solicitud.referencia !== null && typeof v.solicitud.referencia !== 'string') ||
		typeof v.iniciadoEn !== 'string' ||
		!Number.isFinite(Date.parse(v.iniciadoEn)) ||
		(v.comprobanteId !== null && !esUuidCobranza(v.comprobanteId))
	) {
		return null;
	}
	return v;
}
export function validarSolicitudCobro(
	cuotaId: string,
	metodo: string,
	referencia: string,
	verificada: boolean,
): SolicitudCobro {
	if (!esUuidCobranza(cuotaId) || !['efectivo', 'transferencia'].includes(metodo)) {
		throw new Error('Elegí una cuota y un medio de pago válidos.');
	}
	if (metodo === 'transferencia' && !verificada) {
		throw new Error('Verificá la acreditación de la transferencia antes de confirmar.');
	}
	const ref = referencia.trim();
	if (ref.length > 255) {
		throw new Error('La referencia admite hasta255 caracteres.');
	}
	return {
		cuotaId,
		metodo: metodo as SolicitudCobro['metodo'],
		referencia: metodo === 'transferencia' && ref ? ref : null,
	};
}
export function cobroVerificado(
	row: FilaCobranza | null,
	cuotaId: string,
	comprobanteId: string | null,
): row is FilaCobranza {
	return (
		!!row &&
		row.cuota_id === cuotaId &&
		row.estado_cuota === 'pagada' &&
		row.estado_pago === 'completado' &&
		!!row.pago_id &&
		!!row.comprobante_id &&
		(!comprobanteId || row.comprobante_id === comprobanteId)
	);
}

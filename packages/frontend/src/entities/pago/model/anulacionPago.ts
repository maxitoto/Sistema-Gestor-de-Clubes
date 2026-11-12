import { esUuidCobranza } from '#shared/types/cobranza';
export interface EstadoAnulacionPago {
	id: string;
	estado: 'completado' | 'anulado';
	fechaPago: string;
	motivo: string | null;
	anuladoPor: string | null;
	anuladoEn: string | null;
	estadoFiscal: 'valido' | 'pendiente_cae' | 'fallido' | 'anulado' | 'anulacion_pendiente';
	cae: string | null;
	fechaClub: string;
}
type FilaAnulacion = Record<string, unknown> & {
	[K in
		| 'id'
		| 'estado'
		| 'fecha_pago'
		| 'motivo_anulacion'
		| 'anulado_por'
		| 'anulado_at'
		| 'estado_fiscal'
		| 'cae']?: unknown;
};
const textoNulo = (v: unknown) => v === null || typeof v === 'string';
export function parseEstadoAnulacionPago(
	pago: unknown,
	comprobante: unknown,
	fechaClub: unknown,
	id: string,
): EstadoAnulacionPago {
	if (
		!pago ||
		typeof pago !== 'object' ||
		Array.isArray(pago) ||
		!comprobante ||
		typeof comprobante !== 'object' ||
		Array.isArray(comprobante)
	) {
		throw new Error('No se pudo verificar la anulación del cobro.');
	}
	const p = pago as FilaAnulacion,
		c = comprobante as FilaAnulacion;
	if (
		p.id !== id ||
		!esUuidCobranza(id) ||
		!['completado', 'anulado'].includes(String(p.estado)) ||
		typeof p.fecha_pago !== 'string' ||
		!Number.isFinite(Date.parse(p.fecha_pago)) ||
		!['valido', 'pendiente_cae', 'fallido', 'anulado', 'anulacion_pendiente'].includes(
			String(c.estado_fiscal),
		) ||
		![p.motivo_anulacion, p.anulado_por, p.anulado_at, c.cae].every(textoNulo) ||
		typeof fechaClub !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}$/.test(fechaClub) ||
		new Date(`${fechaClub}T00:00:00Z`).toISOString().slice(0, 10) !== fechaClub
	) {
		throw new Error('El estado de anulación no cumple su contrato.');
	}
	if (
		p.estado === 'anulado' &&
		(!esUuidCobranza(p.anulado_por) ||
			typeof p.anulado_at !== 'string' ||
			!Number.isFinite(Date.parse(p.anulado_at)) ||
			typeof p.motivo_anulacion !== 'string' ||
			!p.motivo_anulacion.trim())
	) {
		throw new Error('La anulación guardada está incompleta.');
	}
	return {
		id,
		estado: p.estado as EstadoAnulacionPago['estado'],
		fechaPago: p.fecha_pago,
		motivo: p.motivo_anulacion as string | null,
		anuladoPor: p.anulado_por as string | null,
		anuladoEn: p.anulado_at as string | null,
		estadoFiscal: c.estado_fiscal as EstadoAnulacionPago['estadoFiscal'],
		cae: c.cae as string | null,
		fechaClub,
	};
}
export function validarMotivoAnulacionPago(value: string): string {
	const motivo = value.trim();
	if (!motivo || motivo.length > 2000) {
		throw new Error('Completá un motivo de anulación de hasta 2000 caracteres.');
	}
	return motivo;
}
export function motivoBloqueoAnulacionPago(row: EstadoAnulacionPago, rol: string): string | null {
	if (row.estado !== 'completado') {
		return 'El cobro ya está anulado.';
	}
	if (!['admin', 'responsable'].includes(rol)) {
		return 'Tu perfil no permite anular cobros.';
	}
	if (
		!['valido', 'fallido'].includes(row.estadoFiscal) ||
		(row.estadoFiscal === 'valido' && !row.cae)
	) {
		return 'Este documento no admite anulación en su estado fiscal actual.';
	}
	if (rol === 'responsable') {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'America/Argentina/Buenos_Aires',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).formatToParts(new Date(row.fechaPago));
		const day = (type: string) => parts.find((p) => p.type === type)?.value;
		if (`${day('year')}-${day('month')}-${day('day')}` !== row.fechaClub) {
			return 'Los cobros de días anteriores requieren un Administrador.';
		}
	}
	return null;
}
export function parseResultadoAnulacionPago(value: unknown): string | null {
	if (value !== null && !esUuidCobranza(value)) {
		throw Object.assign(
			new Error('No pudimos confirmar la respuesta de anulación. Consultá el estado guardado.'),
			{ responseReceived: true },
		);
	}
	return value;
}

import { monedaCobranza, type ResultadoCobranza } from '#shared/types/cobranza';

export type AvisoDeudaDesvinculacion =
	| { estado: 'cargando' }
	| { estado: 'error'; mensaje: string }
	| { estado: 'sin_deuda' }
	| { estado: 'con_deuda'; monto: string; cuotas: number; mensaje: string };

/** Resume si existen cuotas pendientes en la categoría antes de confirmar la baja de inscripción. */
export function describirDeudaDesvinculacion(state: {
	isPending: boolean;
	isError: boolean;
	data?: Pick<ResultadoCobranza, 'total' | 'deuda_filtrada'> | undefined;
}): AvisoDeudaDesvinculacion {
	if (state.isPending) {
		return { estado: 'cargando' };
	}
	if (state.isError || !state.data) {
		return {
			estado: 'error',
			mensaje:
				'No se pudo consultar si tiene cuotas pendientes en esta categoría. La operación igualmente conserva las cuotas existentes.',
		};
	}
	if (/^0+(?:\.0+)?$/.test(state.data.deuda_filtrada)) {
		return { estado: 'sin_deuda' };
	}
	const monto = monedaCobranza(state.data.deuda_filtrada);
	if (monto === 'Importe no disponible') {
		return {
			estado: 'error',
			mensaje:
				'No se pudo interpretar el saldo pendiente en esta categoría. La operación igualmente conserva las cuotas existentes.',
		};
	}
	const cuotas = state.data.total;
	const etiquetaCuotas =
		cuotas > 0 ? ` (${cuotas} ${cuotas === 1 ? 'cuota pendiente' : 'cuotas pendientes'})` : '';
	return {
		estado: 'con_deuda',
		monto,
		cuotas,
		mensaje: `El socio adeuda ${monto} por esta disciplina${etiquetaCuotas}. La deuda se mantendrá activa para cobrar desde Cobranza; ¿deseás desvincularlo de todos modos?`,
	};
}

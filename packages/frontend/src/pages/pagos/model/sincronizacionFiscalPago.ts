import type { QueryClient } from '@tanstack/react-query';
import type { EstadoFiscalComprobante } from '#entities/comprobante';

/** Ambas lecturas deciden lo que muestra el mismo detalle del cobro. */
export async function actualizarLecturasCobroFiscal(
	client: QueryClient,
	cacheScope: string,
	pagoId: string,
) {
	await Promise.all([
		client.invalidateQueries({
			queryKey: ['pagos', cacheScope, 'detalle', pagoId],
			exact: true,
			refetchType: 'active',
		}),
		client.invalidateQueries({
			queryKey: ['anulacion-cobro', cacheScope, pagoId],
			exact: true,
			refetchType: 'active',
		}),
	]);
}

function firmaEstado(
	data: EstadoFiscalComprobante | undefined,
	pagoId: string,
	comprobanteId: string,
) {
	if (!data || data.pagoId !== pagoId || data.comprobanteId !== comprobanteId) {
		return null;
	}
	return JSON.stringify([
		data.estadoFiscal,
		data.cae,
		data.numero,
		data.vencimiento,
		data.operacion,
		data.notaCreditoId,
		data.comprobanteOrigenId,
	]);
}

/** También sincroniza las transiciones que llegan por polling, sin invalidar su propia fuente. */
export function observarEstadoFiscalDelCobro(
	client: QueryClient,
	cacheScope: string,
	pagoId: string,
	comprobanteId: string,
) {
	const key = ['comprobante-fiscal', cacheScope, comprobanteId];
	let ultimaFirma = firmaEstado(
		client.getQueryData<EstadoFiscalComprobante>(key),
		pagoId,
		comprobanteId,
	);
	const unsubscribe = client.getQueryCache().subscribe((event) => {
		const queryKey = event.query.queryKey;
		if (
			event.type !== 'updated' ||
			queryKey.length !== key.length ||
			queryKey.some((part: unknown, index: number) => part !== key[index]) ||
			event.query.state.status !== 'success'
		) {
			return;
		}
		const firma = firmaEstado(
			event.query.state.data as EstadoFiscalComprobante | undefined,
			pagoId,
			comprobanteId,
		);
		if (firma === null || firma === ultimaFirma) {
			return;
		}
		ultimaFirma = firma;
		void actualizarLecturasCobroFiscal(client, cacheScope, pagoId);
	});
	// Un diálogo reabierto también debe contrastar lecturas si ya tiene autorización en caché.
	if (ultimaFirma !== null) {
		void actualizarLecturasCobroFiscal(client, cacheScope, pagoId);
	}
	return unsubscribe;
}

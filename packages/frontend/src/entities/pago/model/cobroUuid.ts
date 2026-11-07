import { esUuidCobranza } from '#shared/types/cobranza';
export function parseComprobanteCobrado(value: unknown): string {
	if (!esUuidCobranza(value)) {
		throw Object.assign(new Error('No pudimos verificar el cobro. Consultá su estado.'), {
			responseReceived: true,
		});
	}
	return value;
}

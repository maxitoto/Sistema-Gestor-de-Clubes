import { createHumanRequestClient } from '#shared/api/humanRequest';
import { idsCanonicosCorreo, UUID_CORREO, validarTextoCorreo } from '#shared/lib/comunicaciones';
export interface AvisoPayload {
	requestId: string;
	tipo: 'general' | 'deuda';
	asunto: string;
	cuerpo: string;
	sociosIds: string[];
	plantillaId: string | null;
	incluirDesuscriptos: boolean;
}
export interface AvisoResult {
	id: string;
	estado: 'procesando';
	encolados: number;
	excluidos: number;
}
export interface EmailTemplate {
	id: string;
	nombre_interno: string;
	asunto: string;
	cuerpo: string;
	estado: 'activo' | 'inactivo';
}
async function responseError(error: unknown): Promise<Error> {
	const ctx = error && typeof error === 'object' && 'context' in error ? error.context : null;
	if (ctx instanceof Response) {
		if (ctx.status === 401) {
			return Object.assign(new Error('La sesión venció. Ingresá nuevamente.'), { incierto: false });
		}
		if (ctx.status === 403) {
			return Object.assign(new Error('Tu cuenta no está habilitada para este envío.'), {
				incierto: false,
			});
		}
		if ([400, 409].includes(ctx.status)) {
			const x: unknown = await ctx
				.clone()
				.json()
				.catch(() => null);
			if (x && typeof x === 'object' && 'error' in x && typeof x.error === 'string') {
				return Object.assign(new Error(x.error), { incierto: false });
			}
		}
	}
	return Object.assign(
		new Error(
			'No se pudo confirmar la solicitud. Recuperá la misma solicitud sin modificar el contenido ni los destinatarios, o consultá el historial.',
		),
		{ incierto: true },
	);
}
export async function dispararAvisoManual(
	payload: AvisoPayload,
	actorId: string,
	signal?: AbortSignal,
): Promise<AvisoResult> {
	if (!UUID_CORREO.test(payload.requestId)) {
		throw Object.assign(new Error('No se pudo preparar la solicitud.'), { incierto: false });
	}
	const sociosIds = idsCanonicosCorreo(payload.sociosIds);
	if (payload.tipo === 'general') {
		const issue = validarTextoCorreo(payload.asunto, payload.cuerpo);
		if (issue) {
			throw Object.assign(new Error(issue), { incierto: false });
		}
	}
	const db = await createHumanRequestClient(actorId, signal);
	const { data, error } = await db.functions.invoke('comunicaciones/enviar-aviso', {
		body: { ...payload, sociosIds },
		...(signal ? { signal } : {}),
	});
	if (error) {
		throw await responseError(error);
	}
	if (
		!data ||
		!UUID_CORREO.test(data.id) ||
		data.estado !== 'procesando' ||
		!Number.isSafeInteger(data.encolados) ||
		data.encolados < 0 ||
		!Number.isSafeInteger(data.excluidos) ||
		data.excluidos < 0 ||
		data.encolados + data.excluidos !== sociosIds.length
	) {
		throw Object.assign(
			new Error('La respuesta no confirmó la solicitud completa. Recuperá la misma solicitud.'),
			{ incierto: true },
		);
	}
	return data as AvisoResult;
}
export async function getEmailTemplates(
	actorId: string,
	signal?: AbortSignal,
): Promise<EmailTemplate[]> {
	const db = await createHumanRequestClient(actorId, signal);
	const { data, error } = await db.functions.invoke('comunicaciones/plantillas', {
		method: 'GET',
		...(signal ? { signal } : {}),
	});
	if (error || !data || !Array.isArray(data.templates)) {
		throw new Error('No se pudieron consultar las plantillas activas.');
	}
	return data.templates.filter((x: EmailTemplate) => x.estado === 'activo');
}

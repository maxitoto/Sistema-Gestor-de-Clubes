// src/modules/comuniciones/api/email.api.ts
import { supabase } from '#shared/api/supabaseClient';

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
	const response = error && typeof error === 'object' && 'context' in error ? error.context : null;
	if (response instanceof Response) {
		if (response.status === 401) {
			return new Error('Su sesión venció. Ingrese nuevamente.');
		}
		if (response.status === 403) {
			return new Error('Su cuenta no está habilitada para realizar este envío.');
		}
		if (response.status === 400 || response.status === 409) {
			const body: unknown = await response
				.clone()
				.json()
				.catch(() => null);
			if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
				return new Error(body.error);
			}
		}
	}
	return new Error(
		'No pudimos confirmar el resultado. Revise su conexión y reintente sin cambiar el mensaje para evitar duplicados.',
	);
}

export async function dispararAvisoManual(payload: AvisoPayload): Promise<AvisoResult> {
	const { data, error } = await supabase.functions.invoke<AvisoResult>(
		'comunicaciones/enviar-aviso',
		{ body: payload },
	);
	if (error) {
		throw await responseError(error);
	}
	if (
		!data ||
		typeof data.id !== 'string' ||
		data.estado !== 'procesando' ||
		!Number.isInteger(data.encolados) ||
		data.encolados < 0 ||
		!Number.isInteger(data.excluidos) ||
		data.excluidos < 0
	) {
		throw new Error('El servidor no confirmó el envío. Reintente sin modificar el mensaje.');
	}
	return data;
}

export async function getEmailTemplates(signal?: AbortSignal): Promise<EmailTemplate[]> {
	const options = { method: 'GET' as const, ...(signal ? { signal } : {}) };
	const { data, error } = await supabase.functions.invoke<{ templates: EmailTemplate[] }>(
		'comunicaciones/plantillas',
		options,
	);
	if (error || !data || !Array.isArray(data.templates)) {
		throw new Error('No pudimos cargar las plantillas.');
	}
	return data.templates.filter((template) => template.estado === 'activo');
}

import { supabase } from './supabaseClient';

export type TipoArchivo = 'socio-foto' | 'club-logo' | 'gasto-evidencia';
export interface IdentidadArchivo {
	tipo: TipoArchivo;
	entidadId: string;
	actorId?: string;
}
export interface ArchivoCargado {
	storagePath: string;
	tipoMime: string;
	tamano: number;
}
export interface LecturaArchivo {
	url: string | null;
	storagePath: string | null;
	legacy: boolean;
}
async function request(
	path: string,
	options: RequestInit,
	signal?: AbortSignal,
	expectedActorId?: string,
): Promise<unknown> {
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();
	if (error || !session || (expectedActorId !== undefined && session.user.id !== expectedActorId)) {
		throw Object.assign(new Error('La sesión cambió. Volvé a abrir la operación de archivos.'), {
			status: 401,
		});
	}
	const controller = signal
		? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
		: AbortSignal.timeout(30_000);
	const headers = new Headers(options.headers);
	headers.set('Authorization', `Bearer ${session.access_token}`);
	headers.set('apikey', process.env.PUBLIC_SUPABASE_ANON_KEY ?? '');
	const response = await fetch(`${process.env.PUBLIC_SUPABASE_URL}/functions/v1/archivos/${path}`, {
		...options,
		headers,
		signal: controller,
	});
	const body: unknown = await response.json();
	if (!response.ok) {
		const message =
			body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
				? body.error
				: 'No se pudo completar la operación de archivos.';
		throw Object.assign(new Error(message), { status: response.status });
	}
	return body;
}
type ArchivoResponse = {
	storagePath?: unknown;
	tipoMime?: unknown;
	tamano?: unknown;
	url?: unknown;
	legacy?: unknown;
	descartado?: unknown;
	error?: unknown;
};
const isRecord = (value: unknown): value is ArchivoResponse =>
	!!value && typeof value === 'object' && !Array.isArray(value);
export async function subirArchivo(
	input: IdentidadArchivo & { archivo: File },
	signal?: AbortSignal,
): Promise<ArchivoCargado> {
	const form = new FormData();
	form.set('tipo', input.tipo);
	form.set('entidadId', input.entidadId);
	form.set('archivo', input.archivo);
	const body = await request('subir', { method: 'POST', body: form }, signal, input.actorId);
	if (
		!isRecord(body) ||
		typeof body.storagePath !== 'string' ||
		typeof body.tipoMime !== 'string' ||
		typeof body.tamano !== 'number' ||
		!Number.isSafeInteger(body.tamano) ||
		body.tamano <= 0
	) {
		throw new Error('No se pudo verificar la carga del archivo.');
	}
	return { storagePath: body.storagePath, tipoMime: body.tipoMime, tamano: body.tamano };
}
export async function asociarArchivo(
	input: IdentidadArchivo & { storagePath: string },
	signal?: AbortSignal,
): Promise<void> {
	const body = await request(
		'asociar',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				tipo: input.tipo,
				entidadId: input.entidadId,
				storagePath: input.storagePath,
			}),
		},
		signal,
		input.actorId,
	);
	if (!isRecord(body) || body.storagePath !== input.storagePath) {
		throw new Error('La asociación necesita una verificación adicional.');
	}
}
export async function leerArchivo(
	input: IdentidadArchivo,
	signal?: AbortSignal,
): Promise<LecturaArchivo> {
	const query = new URLSearchParams({ tipo: input.tipo, entidadId: input.entidadId });
	const body = await request(`leer?${query}`, { method: 'GET' }, signal, input.actorId);
	if (
		!isRecord(body) ||
		(body.url !== null && typeof body.url !== 'string') ||
		(body.storagePath !== null && typeof body.storagePath !== 'string') ||
		typeof body.legacy !== 'boolean'
	) {
		throw new Error('La lectura del archivo no es válida.');
	}
	if (
		typeof body.url === 'string' &&
		!['http:', 'https:'].includes(new URL(body.url, window.location.origin).protocol)
	) {
		throw new Error('La dirección del archivo no es válida.');
	}
	return { url: body.url, storagePath: body.storagePath, legacy: body.legacy };
}
export async function descartarArchivo(
	input: IdentidadArchivo & { storagePath: string },
	signal?: AbortSignal,
): Promise<void> {
	const body = await request(
		'descartar',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				tipo: input.tipo,
				entidadId: input.entidadId,
				storagePath: input.storagePath,
			}),
		},
		signal,
		input.actorId,
	);
	if (!isRecord(body) || body.descartado !== true) {
		throw new Error('No se pudo verificar el descarte del archivo.');
	}
}

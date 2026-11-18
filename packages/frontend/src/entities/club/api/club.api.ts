import { supabase } from '#shared/api';
import type { ClubConfig, ClubUpdate } from '#shared/types';

// Campos públicos explícitos. Los sobres fiscales nunca ingresan a la caché humana.
const publicFields =
	'id,nombre,cuit,domicilio_fiscal,email_contacto,punto_venta,logo_url,logo_storage_path';
export async function getClubConfig(signal?: AbortSignal): Promise<ClubConfig> {
	let query = supabase.from('club').select(publicFields).limit(1);
	if (signal) {
		query = query.abortSignal(signal);
	}
	const { data, error } = await query.single();
	if (error) {
		throw error;
	}
	return data;
}
export async function updateClubConfig(
	id: string,
	payload: ClubUpdate,
	signal?: AbortSignal,
): Promise<ClubConfig> {
	const allowed = {
		nombre: payload.nombre,
		cuit: payload.cuit,
		domicilio_fiscal: payload.domicilio_fiscal,
		email_contacto: payload.email_contacto,
		punto_venta: payload.punto_venta,
	};
	let query = supabase.from('club').update(allowed).eq('id', id).select(publicFields);
	if (signal) {
		query = query.abortSignal(signal);
	}
	const { data, error } = await query.single();
	if (error) {
		throw error;
	}
	return data;
}

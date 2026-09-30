// src/modules/configuracion/api/club.api.ts

import { supabase } from '#shared/api';
import type { ClubConfig, ClubUpdate } from '#shared/types';

// Nunca descargar certificado_arca ni certificado_key en el formulario general.
const publicFields = 'id,nombre,cuit,domicilio_fiscal,email_contacto,punto_venta,logo_url';

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

export async function updateClubConfig(id: string, payload: ClubUpdate): Promise<ClubConfig> {
	const { data, error } = await supabase
		.from('club')
		.update(payload)
		.eq('id', id)
		.select(publicFields)
		.single();
	if (error) {
		throw error;
	}
	return data;
}

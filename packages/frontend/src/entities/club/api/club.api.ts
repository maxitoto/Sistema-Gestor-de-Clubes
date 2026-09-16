// src/modules/configuracion/api/club.api.ts

import { supabase } from '#shared/api';
import type { ClubUpdate } from '#shared/types';

export async function getClubConfig() {
	const { data, error } = await supabase.from('club').select('*').limit(1).single();

	if (error) {
		throw error;
	}
	return data;
}

export async function updateClubConfig(id: string, payload: ClubUpdate) {
	const { data, error } = await supabase
		.from('club')
		.update(payload)
		.eq('id', id)
		.select()
		.single();

	if (error) {
		throw error;
	}
	return data;
}

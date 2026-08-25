import { supabase } from '#utils/supabaseClient';
import type { Database } from '#types/model';

export type ClubUpdate = Database['public']['Tables']['club']['Update'];

export async function getClubConfig() {
  const { data, error } = await supabase
    .from('club')
    .select('*')
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

export async function updateClubConfig({ id, payload }: { id: string, payload: ClubUpdate }) {
  const { data, error } = await supabase
    .from('club')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
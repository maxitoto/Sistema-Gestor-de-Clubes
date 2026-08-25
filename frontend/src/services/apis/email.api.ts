import { supabase } from '#utils/supabaseClient';

interface Payload {
  asunto: string;
  cuerpo: string;
  sociosIds: string[];
}

export async function dispararAvisoManual(payload: Payload) {
  const { data, error } = await supabase.functions.invoke('procesar-correos', {
    body: payload
  });

  if (error) throw new Error(error.message);
  return data.enviados;
}
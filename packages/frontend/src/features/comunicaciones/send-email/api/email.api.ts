// src/modules/comuniciones/api/email.api.ts
import { supabase } from '#shared/api/supabaseClient';

interface Payload {
  asunto: string;
  cuerpo: string;
  sociosIds: string[];
}

export async function dispararAvisoManual(payload: Payload) {
  const { data, error } = await supabase.functions.invoke('comunicaciones/enviar-aviso', {
    body: payload
  });

  if (error) throw new Error(error.message);
  return data.enviados;
}
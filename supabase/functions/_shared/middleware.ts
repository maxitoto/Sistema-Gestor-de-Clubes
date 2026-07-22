import { createMiddleware } from 'hono/factory';
import { getSupabaseClient } from './supabase.ts';
import { UnauthorizedError } from './errors.ts'; // Importamos tu clase base

export const supabaseMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    // Lanzamos el error, el manejador de server.ts se encarga de atraparlo
    throw new UnauthorizedError('No autorizado. Token faltante.');
  }

  try {
    const supabase = getSupabaseClient(authHeader);
    c.set('supabase', supabase);
    await next();
  } catch (error) {
    throw new UnauthorizedError('Error de autenticación con el proveedor.');
  }
});
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { supabaseMiddleware } from './middleware.ts';
import { AppError } from './errors.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type AppVariables = {
  supabase: SupabaseClient;
};

export const createApp = (serviceName: string) => {
  
  const app = new Hono<{ Variables: AppVariables }>({ strict: false }).basePath(`/${serviceName}`);

  app.use('*', cors());
  app.use('*', supabaseMiddleware);

  app.onError((err, c) => { 
    if (err instanceof AppError) {
      return c.json({ error: err.message }, err.statusCode as any);
    }
    
    console.error('[Unhandled Error]:', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  });

  app.notFound((c) => {
    console.error('[HONO 404 DEBUG] Method:', c.req.method);
    console.error('[HONO 404 DEBUG] Full URL:', c.req.url);
    console.error('[HONO 404 DEBUG] Evaluated Path:', c.req.path);
    
    return c.json({ 
      error: 'Ruta no encontrada por Hono',
      metodo: c.req.method,
      pathQueHonoVe: c.req.path
    }, 404);
  });

  return app;
};
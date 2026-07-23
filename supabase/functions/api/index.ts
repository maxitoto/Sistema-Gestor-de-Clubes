import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createCrudApp } from './_shared/server.ts';

import emailApp from './enviar-email/index.ts';

// 1. EL TRUCO: Le decimos a Hono que TODO en esta app empieza con '/api'
const app = new Hono({ strict: false }).basePath('/api');

app.use('*', cors());

// ==========================================
// EL ENRUTAMIENTO MAESTRO AUTOMATIZADO
// ==========================================

// 2. Lista de tablas estándar. ¡Agregar una tabla nueva es solo escribir su nombre aquí!
const tablasCrud = ['socios', 'club'];

tablasCrud.forEach((tabla) => {
  // Como Hono ya tiene el basePath global, aquí solo usamos '/'
  app.route('/', createCrudApp(tabla));
});

// 3. Servicios con lógica a medida
app.route('/', emailApp);


// ==========================================
// SEGURO DE VIDA
// ==========================================
app.notFound((c) => {
  return c.json({ 
    error: 'Ruta no encontrada en la API Maestra', 
    ruta_solicitada: c.req.path 
  }, 404);
});

app.onError((err, c) => {
  console.error('[Error Crítico Hono]:', err);
  return c.json({ error: 'Error interno de enrutamiento' }, 500);
});

Deno.serve(app.fetch);
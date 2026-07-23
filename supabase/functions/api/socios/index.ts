import { createApp } from '../_shared/server.ts'; // Ajusta la ruta a tu server.ts
import { AppError, NotFoundError } from '../_shared/errors.ts'; // Ajusta la ruta a tus errores

// 1. Instanciamos la app de Hono usando tu fábrica. 
// Esto ya incluye CORS, el middleware de Supabase y el app.onError.
const app = createApp('socios');

// ==========================================
// RUTAS CRUD (El Contrato)
// ==========================================

// GET ALL
app.get('/', async (c) => {
  // El cliente de Supabase ya viene autenticado gracias a tu middleware
  const supabase = c.get('supabase');
  
  const { data, error } = await supabase.from('socios').select('*');

  // Si hay error en la DB, lanzamos un AppError. 
  // Tu app.onError en server.ts lo atrapará y lo mandará al frontend como { error: "mensaje" }
  if (error) throw new AppError(error.message, 400);

  // CONTRATO PURO: Devolvemos el array directo. Sin envoltorios raros.
  return c.json(data);
});

// GET BY ID
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = c.get('supabase');
  
  const { data, error } = await supabase
    .from('socios')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new AppError(error.message, 400);
  
  // Usamos tu error personalizado si el id no existe
  if (!data) throw new NotFoundError('El socio solicitado no existe.');

  return c.json(data);
});

// CREATE
app.post('/', async (c) => {
  const supabase = c.get('supabase');
  const body = await c.req.json();

  const { data, error } = await supabase
    .from('socios')
    .insert(body)
    .select()
    .single();

  if (error) throw new AppError(error.message, 400);

  return c.json(data);
});

// UPDATE
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = c.get('supabase');
  const body = await c.req.json();

  const { data, error } = await supabase
    .from('socios')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new AppError(error.message, 400);

  return c.json(data);
});

// DELETE
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = c.get('supabase');

  const { error } = await supabase
    .from('socios')
    .delete()
    .eq('id', id);

  if (error) throw new AppError(error.message, 400);

  // Para DELETE, el estándar REST es devolver un 204 No Content
  return c.body(null, 204);
});

export default app;
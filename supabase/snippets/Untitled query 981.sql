INSERT INTO public.usuarios (id, nombre, apellido, email, rol, estado)
SELECT id, 'Administrador', 'Principal', email, 'admin', 'activo'
FROM auth.users
WHERE email = 'admin@clublosandes.com'
ON CONFLICT (id) DO UPDATE SET rol = 'admin';
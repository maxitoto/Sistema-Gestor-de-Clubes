--POLITICAS!!
-- 1. Permisos base (Siguen siendo necesarios para que PostgreSQL te deje llegar al RLS)
GRANT ALL ON TABLE public.club TO authenticated;
GRANT ALL ON TABLE public.club TO service_role;

-- 2. Aseguramos que RLS esté activado
ALTER TABLE public.club ENABLE ROW LEVEL SECURITY;

-- 3. Limpiamos cualquier política parche que hayamos creado antes
DROP POLICY IF EXISTS "Permitir lectura de club" ON public.club;
DROP POLICY IF EXISTS "Permitir modificar club" ON public.club;
DROP POLICY IF EXISTS "Acceso total a la configuracion del club" ON public.club;

-- ========================================================
-- 4. LAS POLÍTICAS CORRECTAS (Verificación estricta de rol)
-- ========================================================

-- A. Solo los Administradores pueden LEER la configuración
CREATE POLICY "Admins pueden leer club" 
ON public.club 
FOR SELECT 
TO authenticated 
USING (
  (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
);

-- B. Solo los Administradores pueden CREAR, MODIFICAR o BORRAR
CREATE POLICY "Admins pueden modificar club" 
ON public.club 
FOR ALL 
TO authenticated 
USING (
  (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
);

-- 5. Forzamos la actualización de la caché de permisos
NOTIFY pgrst, 'reload schema';
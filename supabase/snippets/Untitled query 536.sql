GRANT SELECT ON public.socios TO authenticated;

-- 2. Asegurar que RLS esté activo
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

-- 3. Crear una política para permitir la lectura (SELECT)
-- Esto permite que cualquier usuario autenticado vea los socios.
-- Si en el futuro quieres que solo vean sus propios datos, aquí filtrarías por auth.uid()
CREATE POLICY "Permitir lectura de socios a usuarios autenticados"
ON public.socios
FOR SELECT
TO authenticated
USING (true);
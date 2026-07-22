GRANT ALL ON TABLE public.socios TO authenticated;
GRANT ALL ON TABLE public.socios TO service_role;
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura a usuarios autenticados" 
ON public.socios 
FOR SELECT 
TO authenticated 
USING (true);
ALTER TABLE socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios logueados pueden ver socios" 
ON socios FOR SELECT 
TO authenticated 
USING (true);
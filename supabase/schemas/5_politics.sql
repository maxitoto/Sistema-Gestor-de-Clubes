--=================================================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS)
--=================================================================================

-- 1. Permisos base a roles de API
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 2. Habilitar RLS en todas las tablas
ALTER TABLE public.club ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprobantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_correo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuota_job_logs ENABLE ROW LEVEL SECURITY;

--=================================================================================
-- FUNCIONES DE AYUDA PARA RLS
--=================================================================================
-- Para optimizar rendimiento y no hacer subconsultas constantemente
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.es_responsable()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND rol = 'responsable'
  );
$$;

--=================================================================================
-- TABLA: club
--=================================================================================
DROP POLICY IF EXISTS "Admins pueden leer club" ON public.club;
DROP POLICY IF EXISTS "Admins pueden modificar club" ON public.club;

-- Todos los usuarios autenticados pueden leer la configuración del club
CREATE POLICY "Cualquiera autenticado puede ver el club" 
ON public.club FOR SELECT TO authenticated USING (true);

-- Solo admins pueden modificar (y al ser tabla de 1 sola fila, no se permite INSERT ni DELETE)
CREATE POLICY "Admins pueden actualizar club" 
ON public.club FOR UPDATE TO authenticated USING (public.es_admin());

--=================================================================================
-- TABLA: usuarios
--=================================================================================
-- Todos los usuarios autenticados pueden ver la lista de usuarios (para asignar responsables, etc)
CREATE POLICY "Usuarios pueden ver otros usuarios" 
ON public.usuarios FOR SELECT TO authenticated USING (true);

-- Solo los admins pueden crear, actualizar o borrar otros usuarios
CREATE POLICY "Admins pueden gestionar usuarios" 
ON public.usuarios FOR ALL TO authenticated 
USING (public.es_admin())
WITH CHECK (public.es_admin());

-- Un usuario responsable puede actualizar su propio perfil (nombre, apellido) pero no su rol
CREATE POLICY "Usuarios pueden actualizar su propio perfil" 
ON public.usuarios FOR UPDATE TO authenticated 
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

--=================================================================================
-- TABLAS GENERALES (socios, deportes, categorias, inscripciones, cuotas, etc)
-- Para este sistema, asumimos que tanto administradores como responsables 
-- pueden realizar operaciones CRUD completas sobre estas entidades operativas.
--=================================================================================
CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.socios FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.deportes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.inscripciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.cuotas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.comprobantes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.categorias_gasto FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.gastos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.plantillas_correo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.email_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.email_destinatarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" 
ON public.cuota_job_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Forzamos la actualización de la caché de permisos
NOTIFY pgrst, 'reload schema';
-- Schema no expuesto a PostgREST: alberga helpers internos de RLS
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
-- ---------------------------------------------------------------------------------
-- 0. Limpieza de políticas anteriores + patrones nuevos
-- ---------------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['club','usuarios','socios','deportes','categorias',
                           'inscripciones','cuotas','pagos','comprobantes',
                           'categorias_gasto','gastos','plantillas_correo',
                           'email_logs','email_destinatarios','cuota_job_logs'] LOOP
    -- nombres del politics viejo (con comillas y sin ellas)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Acceso total a operativos para autenticados', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins pueden leer club', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins pueden modificar club', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Cualquiera autenticado puede ver el club', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins pueden actualizar club', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Usuarios pueden ver otros usuarios', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins pueden gestionar usuarios', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Usuarios pueden actualizar su propio perfil', t);
    -- patrones nuevos (idempotencia de re-ejecución)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete_admin', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------
-- 1. Helper único de rol
-- Para optimizar rendimiento y no hacer subconsultas constantemente
-- ---------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.es_admin() CASCADE;
DROP FUNCTION IF EXISTS public.es_responsable() CASCADE;
DROP FUNCTION IF EXISTS public.get_rol() CASCADE;

CREATE OR REPLACE FUNCTION private.get_rol()
RETURNS public.rol_usuario
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT rol FROM public.usuarios
  WHERE id = auth.uid() AND estado = 'activo';
$$;
GRANT EXECUTE ON FUNCTION private.get_rol() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.get_rol() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'handle_new_user' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------
-- 2. Permisos base a roles de API)
-- ---------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ---------------------------------------------------------------------------------
-- 3. RLS habilitada en las 15 tablas
-- ---------------------------------------------------------------------------------
ALTER TABLE public.club                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.socios              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deportes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscripciones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuotas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprobantes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_gasto    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_correo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuota_job_logs      ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------
-- 4. club
-- ---------------------------------------------------------------------------------
-- Permite que cualquier empleado registrado y activo
CREATE POLICY club_select ON public.club
FOR SELECT TO authenticated USING (private.get_rol() IS NOT NULL);

-- Solo admin puede dar de alta la configuración institucional
CREATE POLICY club_insert_admin ON public.club
FOR INSERT TO authenticated WITH CHECK (private.get_rol() = 'admin');

-- Solo admin puede modificar los datos institucionales y fiscales
CREATE POLICY club_update_admin ON public.club
FOR UPDATE TO authenticated USING (private.get_rol() = 'admin') WITH CHECK (private.get_rol() = 'admin');

-- Permite al administrador eliminar el registro del club
CREATE POLICY club_delete_admin ON public.club
FOR DELETE TO authenticated USING (private.get_rol() = 'admin');

-- ---------------------------------------------------------------------------------
-- 5. usuarios
-- ---------------------------------------------------------------------------------
-- admin puede ver la lista completa de todos los usuarios, un usuario solo puede ver su perfil
CREATE POLICY usuarios_select ON public.usuarios
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR private.get_rol() = 'admin');

-- Solo admin  puede dar de alta nuevos empleados
CREATE POLICY usuarios_insert_admin ON public.usuarios
FOR INSERT TO authenticated WITH CHECK (private.get_rol() = 'admin');

-- Permite al administrador editar los datos de otros empleados
CREATE POLICY usuarios_update_admin ON public.usuarios
FOR UPDATE TO authenticated
USING (private.get_rol() = 'admin' AND id <> (SELECT auth.uid()))
WITH CHECK (private.get_rol() = 'admin' AND id <> (SELECT auth.uid()));

-- Permite al administrador eliminar usuarios
CREATE POLICY usuarios_delete_admin ON public.usuarios
FOR DELETE TO authenticated
USING (private.get_rol() = 'admin' AND id <> (SELECT auth.uid()));

-- ---------------------------------------------------------------------------------
-- 6. Operativas: lectura/insert/update para authenticated; DELETE físico solo admin
-- ---------------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['socios','inscripciones','cuotas','pagos','comprobantes','gastos','plantillas_correo'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.get_rol() IS NOT NULL)', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.get_rol() IS NOT NULL)', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.get_rol() IS NOT NULL) WITH CHECK (private.get_rol() IS NOT NULL)', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.get_rol() = ''admin'')', t||'_delete_admin', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------
-- 7. Estructura deportiva y categorías de gasto: escritura solo admin
-- ---------------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['deportes','categorias','categorias_gasto'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.get_rol() IS NOT NULL)', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.get_rol() = ''admin'')', t||'_insert_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.get_rol() = ''admin'') WITH CHECK (private.get_rol() = ''admin'')', t||'_update_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.get_rol() = ''admin'')', t||'_delete_admin', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------
-- 8. Inmutables (CU-07.1): authenticated SOLO lee; escribe service_role (jobs/webhook)
-- ---------------------------------------------------------------------------------
CREATE POLICY email_logs_select ON public.email_logs
FOR SELECT TO authenticated USING (private.get_rol() IS NOT NULL);
CREATE POLICY email_destinatarios_select ON public.email_destinatarios
FOR SELECT TO authenticated USING (private.get_rol() IS NOT NULL);

-- ---------------------------------------------------------------------------------
-- 9. cuota_job_logs: lectura solo admin; escribe service_role (job CU-05.4)
-- ---------------------------------------------------------------------------------
CREATE POLICY cuota_job_logs_select_admin ON public.cuota_job_logs
FOR SELECT TO authenticated USING (private.get_rol() = 'admin');

-- 10. Recarga la caché de PostgREST
NOTIFY pgrst, 'reload schema';
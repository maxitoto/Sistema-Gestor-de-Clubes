-- =================================================================================
-- SISTEMA DE GESTIÓN DE CLUBES — RLS COMPLETO (rollout firmado, DECISIONES.md §3.4)
-- Archivo canónico: supabase/migrations/02_rls.sql
-- Reemplaza al Politics.sql parche (solo club). Ejecutar DESPUÉS del schema.
-- =================================================================================

-- -----------------------------------------------------------------------------
-- 0. Limpieza de políticas parche anteriores (idempotencia sobre BD ya parcheadas)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Permitir lectura de club" ON public.club;
DROP POLICY IF EXISTS "Permitir modificar club" ON public.club;
DROP POLICY IF EXISTS "Acceso total a la configuracion del club" ON public.club;
DROP POLICY IF EXISTS "Admins pueden leer club" ON public.club;
DROP POLICY IF EXISTS "Admins pueden modificar club" ON public.club;

-- -----------------------------------------------------------------------------
-- 1. Helper anti-recursión: única fuente de la regla de rol
--    SECURITY DEFINER lee public.usuarios como dueño → sin recursión infinita
--    cuando usuarios tenga RLS. estado='activo' ⇒ una cuenta desactivada pierde
--    el acceso a nivel BD aunque tenga JWT vivo (refuerza CU-02.7).
--    Sin fila en usuarios → NULL → todo denegado (default seguro).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_rol()
RETURNS public.rol_usuario
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT rol FROM public.usuarios
  WHERE id = auth.uid() AND estado = 'activo';
$$;

GRANT EXECUTE ON FUNCTION public.get_rol() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Permisos base (RLS filtra filas; esto habilita llegar al schema)
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Habilitar RLS en TODAS las tablas
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. club: lectura ambos roles; escritura solo admin (singleton)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS club_select ON public.club;
DROP POLICY IF EXISTS club_modify_admin ON public.club;
CREATE POLICY club_select ON public.club
  FOR SELECT TO authenticated
  USING (public.get_rol() IS NOT NULL);
CREATE POLICY club_modify_admin ON public.club
  FOR ALL TO authenticated
  USING (public.get_rol() = 'admin')
  WITH CHECK (public.get_rol() = 'admin');

-- -----------------------------------------------------------------------------
-- 5. usuarios: self o admin leen; admin gestiona a OTROS (nunca su propia cuenta,
--    para no autobloquearse ni quitarse permisos, CU-02.6/CU-02.7)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
DROP POLICY IF EXISTS usuarios_insert_admin ON public.usuarios;
DROP POLICY IF EXISTS usuarios_update_admin ON public.usuarios;
DROP POLICY IF EXISTS usuarios_delete_admin ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.get_rol() = 'admin');
CREATE POLICY usuarios_insert_admin ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (public.get_rol() = 'admin');
CREATE POLICY usuarios_update_admin ON public.usuarios
  FOR UPDATE TO authenticated
  USING (public.get_rol() = 'admin' AND id <> auth.uid())
  WITH CHECK (public.get_rol() = 'admin' AND id <> auth.uid());
CREATE POLICY usuarios_delete_admin ON public.usuarios
  FOR DELETE TO authenticated
  USING (public.get_rol() = 'admin' AND id <> auth.uid());

-- -----------------------------------------------------------------------------
-- 6. Operativas: authenticated lee/inserta/actualiza; DELETE físico solo admin
--    (la norma es baja lógica; el borrado físico queda reservado)
-- -----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['socios','inscripciones','cuotas','pagos','comprobantes','gastos','plantillas_correo'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.get_rol() IS NOT NULL)', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.get_rol() IS NOT NULL)', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.get_rol() IS NOT NULL) WITH CHECK (public.get_rol() IS NOT NULL)', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.get_rol() = ''admin'')', t||'_delete_admin', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Estructura deportiva y categorías de gasto: solo admin escribe; ambos leen
-- -----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['deportes','categorias','categorias_gasto'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.get_rol() IS NOT NULL)', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.get_rol() = ''admin'')', t||'_insert_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.get_rol() = ''admin'') WITH CHECK (public.get_rol() = ''admin'')', t||'_update_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.get_rol() = ''admin'')', t||'_delete_admin', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 8. Inmutables (CU-07.1): authenticated SOLO lee.
--    Las escrituras las hace service_role (jobs/webhook), que bypassea RLS por diseño.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS email_logs_select ON public.email_logs;
DROP POLICY IF EXISTS email_destinatarios_select ON public.email_destinatarios;
CREATE POLICY email_logs_select ON public.email_logs
  FOR SELECT TO authenticated
  USING (public.get_rol() IS NOT NULL);
CREATE POLICY email_destinatarios_select ON public.email_destinatarios
  FOR SELECT TO authenticated
  USING (public.get_rol() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 9. cuota_job_logs: solo admin lee; escribe service_role (job CU-05.4)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS cuota_job_logs_select_admin ON public.cuota_job_logs;
CREATE POLICY cuota_job_logs_select_admin ON public.cuota_job_logs
  FOR SELECT TO authenticated
  USING (public.get_rol() = 'admin');

-- -----------------------------------------------------------------------------
-- 10. Recargar caché de PostgREST para que tome las políticas nuevas
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
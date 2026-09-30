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

-- No existe un caso de uso de eliminacion de la configuracion institucional.
DROP POLICY IF EXISTS club_delete_admin ON public.club;

-- ---------------------------------------------------------------------------------
-- 5. usuarios
-- ---------------------------------------------------------------------------------
-- admin puede ver la lista completa de todos los usuarios, un usuario solo puede ver su perfil
CREATE POLICY usuarios_select ON public.usuarios
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR private.get_rol() = 'admin');

-- El alta de empleados entra por Auth y handle_new_user; sin INSERT directo de API.

-- Permite al administrador editar los datos de otros empleados
CREATE POLICY usuarios_update_admin ON public.usuarios
FOR UPDATE TO authenticated
USING (private.get_rol() = 'admin' AND id <> (SELECT auth.uid()))
WITH CHECK (private.get_rol() = 'admin' AND id <> (SELECT auth.uid()));

-- La baja de empleados utiliza estado; sin DELETE directo de API.

-- 6. Lectura operativa; cobros e inscripciones se escriben solo mediante RPC.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['socios','inscripciones','cuotas','pagos','comprobantes',
                           'deportes','categorias','categorias_gasto','plantillas_correo'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.get_rol() IS NOT NULL)', t||'_select', t);
  END LOOP;
END $$;

CREATE POLICY socios_insert ON public.socios FOR INSERT TO authenticated
WITH CHECK (private.get_rol() IS NOT NULL);
CREATE POLICY socios_update ON public.socios FOR UPDATE TO authenticated
USING (private.get_rol() IS NOT NULL) WITH CHECK (private.get_rol() IS NOT NULL);

CREATE POLICY plantillas_correo_insert ON public.plantillas_correo FOR INSERT TO authenticated
WITH CHECK (private.get_rol() IS NOT NULL);
CREATE POLICY plantillas_correo_update ON public.plantillas_correo FOR UPDATE TO authenticated
USING (private.get_rol() IS NOT NULL) WITH CHECK (private.get_rol() IS NOT NULL);
CREATE POLICY plantillas_correo_delete_admin ON public.plantillas_correo FOR DELETE TO authenticated
USING (private.get_rol() = 'admin');

-- Campos operativos de estructura: solo admin; el estado se cambia por RPC.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['deportes','categorias','categorias_gasto'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.get_rol() = ''admin'')', t||'_insert_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.get_rol() = ''admin'') WITH CHECK (private.get_rol() = ''admin'')', t||'_update_admin', t);
  END LOOP;
END $$;
CREATE POLICY categorias_gasto_delete_admin ON public.categorias_gasto FOR DELETE TO authenticated
USING (private.get_rol() = 'admin');

CREATE POLICY gastos_select ON public.gastos FOR SELECT TO authenticated
USING (private.get_rol() IS NOT NULL);
CREATE POLICY gastos_insert ON public.gastos FOR INSERT TO authenticated
WITH CHECK (private.get_rol() IS NOT NULL AND usuario_id = (SELECT auth.uid()) AND estado = 'activo');
CREATE POLICY gastos_update ON public.gastos FOR UPDATE TO authenticated
USING (private.get_rol() IS NOT NULL AND estado = 'activo'
  AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    = (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
WITH CHECK (private.get_rol() IS NOT NULL AND estado = 'activo'
  AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    = (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date);

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


ALTER TABLE public.email_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_eventos_select ON public.email_eventos FOR SELECT TO authenticated
 USING (private.get_rol() IS NOT NULL);

-- 10. Permisos efectivos: DESPUES de las concesiones generales de seccion 2.
-- Ningun caso de uso humano o anonimo necesita privilegios tecnicos de tabla.
-- La lista explicita evita modificar tablas de extensiones u otros esquemas.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON public.club, public.usuarios, public.socios, public.deportes, public.categorias,
   public.inscripciones, public.cuotas, public.pagos, public.comprobantes,
   public.categorias_gasto, public.gastos, public.plantillas_correo,
   public.email_logs, public.email_destinatarios, public.cuota_job_logs,
   public.email_eventos
FROM PUBLIC, anon, authenticated;

-- Los logs del job solo se escriben desde el backend; RLS conserva la lectura admin.
REVOKE INSERT, UPDATE, DELETE ON public.cuota_job_logs
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.cuotas, public.pagos, public.comprobantes, public.inscripciones,
   public.socios, public.deportes, public.categorias, public.gastos, public.usuarios
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.email_eventos FROM PUBLIC,anon,authenticated;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
 ON public.email_logs,public.email_destinatarios FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION private.correo_etiquetas(text,jsonb),private.actualizar_estado_correo(uuid),private.aplicar_eventos_correo(uuid)
 FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.crear_comunicacion(jsonb) FROM PUBLIC,anon,service_role;

REVOKE ALL ON FUNCTION public.reservar_correos(text),public.finalizar_correo(uuid,uuid,text,text,text),
 public.registrar_evento_correo(text,text,text,timestamptz,text),public.desuscribir_correo(uuid)
 FROM PUBLIC,anon,authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.club FROM PUBLIC, anon, authenticated;

GRANT INSERT (dni, nombre, apellido, fecha_nacimiento, email, telefono, direccion,
  foto_url, acepta_comunicaciones, contacto_emergencia_nombre, contacto_emergencia_telefono)
ON public.socios TO authenticated;

GRANT UPDATE (dni, nombre, apellido, fecha_nacimiento, email, telefono, direccion,
  foto_url, acepta_comunicaciones, contacto_emergencia_nombre, contacto_emergencia_telefono)
ON public.socios TO authenticated;

GRANT INSERT (nombre, descripcion) ON public.deportes TO authenticated;

GRANT UPDATE (nombre, descripcion) ON public.deportes TO authenticated;

GRANT INSERT (deporte_id, nombre, arancel_mensual, edad_min, edad_max)
ON public.categorias TO authenticated;

GRANT UPDATE (nombre, arancel_mensual, edad_min, edad_max)
ON public.categorias TO authenticated;

GRANT INSERT (categoria_id, fecha, concepto, monto, metodo_pago,
  referencia_banco, descripcion, evidencia_url) ON public.gastos TO authenticated;

GRANT UPDATE (categoria_id, fecha, concepto, monto, metodo_pago,
  referencia_banco, descripcion, evidencia_url) ON public.gastos TO authenticated;

GRANT UPDATE (nombre, apellido, rol, estado) ON public.usuarios TO authenticated;

GRANT SELECT ON public.email_eventos TO authenticated;

GRANT ALL ON public.email_eventos TO service_role;

GRANT EXECUTE ON FUNCTION private.correo_etiquetas(text,jsonb),private.actualizar_estado_correo(uuid),private.aplicar_eventos_correo(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.crear_comunicacion(jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.reservar_correos(text),public.finalizar_correo(uuid,uuid,text,text,text),
 public.registrar_evento_correo(text,text,text,timestamptz,text),public.desuscribir_correo(uuid) TO service_role;

GRANT SELECT (id, nombre, cuit, domicilio_fiscal, email_contacto, logo_url,
  punto_venta, certificado_vencimiento, updated_at) ON public.club TO authenticated;

GRANT INSERT (nombre, cuit, domicilio_fiscal, email_contacto, logo_url, punto_venta)
ON public.club TO authenticated;

GRANT UPDATE (nombre, cuit, domicilio_fiscal, email_contacto, logo_url, punto_venta)
ON public.club TO authenticated;

-- 11. Recarga de la cache de PostgREST.
NOTIFY pgrst, 'reload schema';
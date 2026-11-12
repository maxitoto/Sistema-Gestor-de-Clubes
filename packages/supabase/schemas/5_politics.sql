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
-- 1. Limpieza de funciones de rol obsoletas (private.get_rol() se define en 3_functions.sql)
-- ---------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.es_admin() CASCADE;
DROP FUNCTION IF EXISTS public.es_responsable() CASCADE;
DROP FUNCTION IF EXISTS public.get_rol() CASCADE;

-- ---------------------------------------------------------------------------------
-- 2. Permisos base a roles de API
-- ---------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categorias_gasto, public.plantillas_correo TO authenticated;
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

REVOKE ALL ON FUNCTION public.fecha_actual_club() FROM PUBLIC, anon, service_role;

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

GRANT EXECUTE ON FUNCTION public.fecha_actual_club() TO authenticated;

-- permisos de tabla, funciones y columnas de referencias de archivos privados.
REVOKE ALL ON private.archivos_cargas FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.archivos_cargas TO service_role;

REVOKE ALL ON FUNCTION private.archivo_prefijo(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validar_archivo_asociado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archivo_autorizar_carga(text, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archivo_registrar_validado(text, uuid, uuid, text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archivo_reservar_descarte(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archivo_finalizar_descarte(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.archivo_autorizar_carga(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivo_registrar_validado(text, uuid, uuid, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.archivo_reservar_descarte(text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archivo_finalizar_descarte(uuid, text) TO service_role;

GRANT UPDATE (foto_storage_path) ON public.socios TO authenticated;
GRANT SELECT (logo_storage_path), UPDATE (logo_storage_path) ON public.club TO authenticated;
GRANT UPDATE (evidencia_storage_path) ON public.gastos TO authenticated;

-- RLS y permisos de operaciones administrativas de usuarios y límites de acceso.
ALTER TABLE private.usuarios_operaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.usuarios_operaciones FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE private.acceso_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.acceso_intentos FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION private.usuarios_registrar_credencial_inicial() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.usuarios_exigir_admin(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.usuarios_operacion_reservar(uuid, uuid, text, uuid, jsonb),
  public.usuarios_operacion_leer(uuid, uuid, uuid),
  public.usuarios_operacion_guardar(uuid, uuid, uuid, text, boolean, boolean),
  public.usuarios_revocar_sesiones(uuid, uuid),
  public.usuarios_enlace_pendiente(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usuarios_operacion_reservar(uuid, uuid, text, uuid, jsonb),
  public.usuarios_operacion_leer(uuid, uuid, uuid),
  public.usuarios_operacion_guardar(uuid, uuid, uuid, text, boolean, boolean),
  public.usuarios_revocar_sesiones(uuid, uuid),
  public.usuarios_enlace_pendiente(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.acceso_limitar(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acceso_limitar(text, text, text) TO service_role;

-- RLS, permisos de tablas/funciones y privilegios de columna (Cobranza, Caja y Gastos).
ALTER TABLE private.gasto_altas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.gasto_altas FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.consultar_cobranza(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consultar_cobranza(text,jsonb) TO authenticated,service_role;

REVOKE ALL ON FUNCTION public.consultar_caja(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_caja(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.registrar_gasto_idempotente(uuid,jsonb),public.consultar_alta_gasto(uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_gasto_idempotente(uuid,jsonb),public.consultar_alta_gasto(uuid)TO authenticated;

REVOKE ALL ON FUNCTION private.gastos_bloquear_categoria_activa() FROM PUBLIC,anon,authenticated,service_role;

REVOKE INSERT,UPDATE,DELETE ON public.categorias_gasto FROM PUBLIC,anon,authenticated;
GRANT INSERT(nombre,descripcion) ON public.categorias_gasto TO authenticated;
GRANT UPDATE(nombre,descripcion,estado) ON public.categorias_gasto TO authenticated;

-- RLS y permisos de coordinación fiscal durable, caché WSAA y publicación PDF.
ALTER TABLE private.fiscal_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.fiscal_receptores ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.fiscal_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.fiscal_ejecuciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.wsaa_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.fiscal_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.fiscal_configuracion,private.fiscal_receptores,private.fiscal_series,private.fiscal_ejecuciones,private.wsaa_tickets,private.fiscal_auditoria FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.fiscal_configuracion,private.fiscal_receptores,private.fiscal_series,private.fiscal_ejecuciones,private.wsaa_tickets,private.fiscal_auditoria TO service_role;
REVOKE ALL ON FUNCTION private.fiscal_objeto_cerrado(jsonb,text[],text[]),private.fiscal_fecha_valida(text,boolean),private.fiscal_perfil_valido(jsonb),private.fiscal_ejecucion_json(uuid),private.fiscal_bloquear_ejecucion(uuid,bigint,boolean),private.fiscal_solicitud_valida(jsonb),private.fiscal_codigos_validos(jsonb),private.fiscal_preservar_snapshot(),private.trg_socios_auto_receptor_fiscal(),private.fiscal_proximo(timestamptz,timestamptz),private.fiscal_elegible(public.comprobantes,public.pagos),private.fiscal_actor_admin(uuid),private.fiscal_crear_nc(public.comprobantes) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.consultar_ejecucion_fiscal(uuid),public.leer_contexto_fiscal(uuid),public.iniciar_ejecucion_fiscal(uuid,text,uuid),public.preparar_solicitud_fiscal(uuid,bigint,text,jsonb),public.marcar_envio_fiscal(uuid,bigint),public.confirmar_resultado_fiscal(uuid,bigint,jsonb),public.registrar_incidencia_fiscal(uuid,bigint,text),public.adquirir_ticket_wsaa(text,uuid),public.guardar_ticket_wsaa(text,uuid,integer,text,timestamptz),public.registrar_pdf_comprobante(uuid,text,text,jsonb),public.expirar_comprobante_fiscal(uuid),public.listar_candidatos_fiscales(integer),public.resolver_anulacion_fiscal(uuid,bigint,jsonb,uuid),public.reabrir_verificado_fiscal(uuid,uuid,bigint,uuid),public.reabrir_regularizacion_fiscal(uuid),public.registrar_autorizacion_verificada_fiscal(uuid,uuid,bigint,jsonb,uuid),public.iniciar_ejecucion_fiscal_administrativa(uuid,text,uuid,uuid),public.reabrir_sin_envio_fiscal(uuid,uuid,bigint,uuid),public.resolver_rechazo_anulado_fiscal(uuid,uuid,bigint,uuid),public.resolver_anulacion_sin_envio_fiscal(uuid,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_ejecucion_fiscal(uuid),public.leer_contexto_fiscal(uuid),public.iniciar_ejecucion_fiscal(uuid,text,uuid),public.preparar_solicitud_fiscal(uuid,bigint,text,jsonb),public.marcar_envio_fiscal(uuid,bigint),public.confirmar_resultado_fiscal(uuid,bigint,jsonb),public.registrar_incidencia_fiscal(uuid,bigint,text),public.adquirir_ticket_wsaa(text,uuid),public.guardar_ticket_wsaa(text,uuid,integer,text,timestamptz),public.registrar_pdf_comprobante(uuid,text,text,jsonb),public.expirar_comprobante_fiscal(uuid),public.listar_candidatos_fiscales(integer),public.resolver_anulacion_fiscal(uuid,bigint,jsonb,uuid),public.reabrir_verificado_fiscal(uuid,uuid,bigint,uuid),public.reabrir_regularizacion_fiscal(uuid),public.registrar_autorizacion_verificada_fiscal(uuid,uuid,bigint,jsonb,uuid),public.iniciar_ejecucion_fiscal_administrativa(uuid,text,uuid,uuid),public.reabrir_sin_envio_fiscal(uuid,uuid,bigint,uuid),public.resolver_rechazo_anulado_fiscal(uuid,uuid,bigint,uuid),public.resolver_anulacion_sin_envio_fiscal(uuid,uuid,bigint,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.consultar_monitoreo_fiscal(integer,integer,text,text,text,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consultar_monitoreo_fiscal(integer,integer,text,text,text,date,date) TO authenticated,service_role;

-- 11. Recarga de la cache de PostgREST.
NOTIFY pgrst, 'reload schema';

SET local check_function_bodies = off;

CREATE SCHEMA "private";

CREATE EXTENSION "pg_trgm" SCHEMA "extensions";

CREATE SEQUENCE "public"."socios_numero_socio_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."categorias_gasto" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "nombre"      character varying(100)   NOT NULL,
  "descripcion" text,
  "created_at"  timestamp with time zone DEFAULT now(),
  "updated_at"  timestamp with time zone DEFAULT now(),
  CONSTRAINT "categorias_gasto_nombre_key" UNIQUE (nombre),
  CONSTRAINT "categorias_gasto_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."categorias_gasto"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."categorias" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "deporte_id"      uuid                     NOT NULL,
  "nombre"          character varying(100)   NOT NULL,
  "arancel_mensual" numeric(10,2)            NOT NULL,
  "edad_min"        integer,
  "edad_max"        integer,
  "created_at"      timestamp with time zone DEFAULT now(),
  "updated_at"      timestamp with time zone DEFAULT now(),
  CONSTRAINT "categorias_arancel_mensual_check" CHECK ((arancel_mensual > (0)::numeric)),
  CONSTRAINT "categorias_deporte_id_nombre_key" UNIQUE (deporte_id, nombre),
  CONSTRAINT "categorias_pkey" PRIMARY KEY (id),
  CONSTRAINT "chk_categorias_rango_etario" CHECK ((((edad_min IS NULL) AND (edad_max IS NULL)) OR ((edad_min IS NOT NULL) AND (edad_max IS
    NOT NULL) AND (edad_min >= 0) AND (edad_max >= edad_min))))
);

ALTER TABLE "public"."categorias"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."club" (
  "id"                      uuid                     NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  "nombre"                  character varying(255)   NOT NULL,
  "cuit"                    character varying(20)    NOT NULL,
  "domicilio_fiscal"        text                     NOT NULL,
  "email_contacto"          character varying(255)   NOT NULL,
  "logo_url"                text,
  "punto_venta"             integer                  NOT NULL,
  "certificado_arca"        text,
  "certificado_key"         text,
  "certificado_vencimiento" date,
  "updated_at"              timestamp with time zone DEFAULT now(),
  CONSTRAINT "chk_punto_venta" CHECK (((punto_venta >= 1) AND (punto_venta <= 99999))),
  CONSTRAINT "club_cuit_key" UNIQUE (cuit),
  CONSTRAINT "club_pkey" PRIMARY KEY (id),
  CONSTRAINT "unica_configuracion_club" CHECK ((id = '00000000-0000-0000-0000-000000000000'::uuid))
);

ALTER TABLE "public"."club"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."club" FROM "anon", "authenticated";

CREATE TABLE "public"."comprobantes" (
  "id"                                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "pago_id"                            uuid                     NOT NULL,
  "comprobante_origen_id"              uuid,
  "punto_venta"                        integer                  NOT NULL DEFAULT 1,
  "numero_comprobante"                 character varying(50),
  "cae"                                character varying(50),
  "cae_vencimiento"                    date,
  "pdf_url"                            text,
  "motivo_anulacion"                   text,
  "detalle_error_fiscal"               text,
  "numero_solicitado"                  character varying(50),
  "solicitud_fiscal"                   jsonb,
  "ventana_regularizacion_iniciada_en" timestamp with time zone NOT NULL DEFAULT now(),
  "intentos_reintento"                 smallint                 NOT NULL DEFAULT 0,
  "proximo_reintento_en"               timestamp with time zone,
  "created_at"                         timestamp with time zone DEFAULT now(),
  "updated_at"                         timestamp with time zone DEFAULT now(),
  CONSTRAINT "chk_intentos_reintento" CHECK (((intentos_reintento >= 0) AND (intentos_reintento <= 6))),
  CONSTRAINT "comprobantes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."comprobantes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."cuota_job_logs" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "periodo_mes"      integer                  NOT NULL,
  "periodo_anio"     integer                  NOT NULL,
  "cuotas_generadas" integer                  DEFAULT 0,
  "cuotas_omitidas"  integer                  DEFAULT 0,
  "fecha_inicio"     timestamp with time zone NOT NULL DEFAULT now(),
  "fecha_fin"        timestamp with time zone,
  CONSTRAINT "cuota_job_logs_periodo_anio_check" CHECK ((periodo_anio > 2000)),
  CONSTRAINT "cuota_job_logs_periodo_mes_check" CHECK (((periodo_mes >= 1) AND (periodo_mes <= 12))),
  CONSTRAINT "cuota_job_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."cuota_job_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."cuotas" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "socio_id"     uuid                     NOT NULL,
  "categoria_id" uuid                     NOT NULL,
  "periodo_mes"  integer                  NOT NULL,
  "periodo_anio" integer                  NOT NULL,
  "monto"        numeric(10,2)            NOT NULL,
  "created_at"   timestamp with time zone DEFAULT now(),
  "updated_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "cuotas_monto_check" CHECK ((monto >= (0)::numeric)),
  CONSTRAINT "cuotas_periodo_anio_check" CHECK ((periodo_anio > 2000)),
  CONSTRAINT "cuotas_periodo_mes_check" CHECK (((periodo_mes >= 1) AND (periodo_mes <= 12))),
  CONSTRAINT "cuotas_pkey" PRIMARY KEY (id),
  CONSTRAINT "cuotas_socio_id_categoria_id_periodo_mes_periodo_anio_key" UNIQUE (socio_id, categoria_id, periodo_mes, periodo_anio)
);

ALTER TABLE "public"."cuotas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."deportes" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "nombre"      character varying(100)   NOT NULL,
  "descripcion" text,
  "created_at"  timestamp with time zone DEFAULT now(),
  "updated_at"  timestamp with time zone DEFAULT now(),
  CONSTRAINT "deportes_nombre_key" UNIQUE (nombre),
  CONSTRAINT "deportes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."deportes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_destinatarios" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "email_log_id"        uuid                     NOT NULL,
  "socio_id"            uuid,
  "email"               character varying(255),
  "created_at"          timestamp with time zone DEFAULT now(),
  "estado_envio"        text                     NOT NULL DEFAULT 'pendiente'::text,
  "motivo"              text,
  "asunto_snapshot"     text,
  "cuerpo_snapshot"     text,
  "proveedor"           text,
  "provider_message_id" text,
  "entrega_estado"      text                     NOT NULL DEFAULT 'sin_confirmar'::text,
  "reservado_en"        timestamp with time zone,
  "reserva_id"          uuid,
  "aceptado_en"         timestamp with time zone,
  CONSTRAINT "email_destinatarios_entrega_estado_check"
    CHECK ((entrega_estado = ANY (ARRAY['sin_confirmar'::text, 'demorada'::text, 'entregada'::text, 'rebote_duro'::text, 'fallida'::text]))),
  CONSTRAINT "email_destinatarios_estado_envio_check"
    CHECK ((estado_envio = ANY (ARRAY['pendiente'::text, 'procesando'::text, 'aceptado'::text, 'fallido'::text, 'excluido'::text, 'incierto'::text]))),
  CONSTRAINT "email_destinatarios_message_unique" UNIQUE (proveedor, provider_message_id),
  CONSTRAINT "email_destinatarios_pkey" PRIMARY KEY (id),
  CONSTRAINT "email_destinatarios_por_socio" UNIQUE (email_log_id, socio_id),
  CONSTRAINT "email_destinatarios_proveedor_check" CHECK ((proveedor = ANY (ARRAY['resend'::text, 'mailpit'::text])))
);

ALTER TABLE "public"."email_destinatarios"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_eventos" (
  "proveedor"           text                     NOT NULL DEFAULT 'resend'::text,
  "event_id"            text                     NOT NULL,
  "provider_message_id" text                     NOT NULL,
  "destinatario_id"     uuid,
  "tipo"                text                     NOT NULL,
  "bounce_tipo"         text,
  "ocurrido_en"         timestamp with time zone NOT NULL,
  "recibido_en"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_eventos_bounce_tipo_check" CHECK ((bounce_tipo = ANY (ARRAY['Permanent'::text, 'Transient'::text, 'Undetermined'::text]))),
  CONSTRAINT "email_eventos_pkey" PRIMARY KEY (proveedor, event_id),
  CONSTRAINT "email_eventos_proveedor_check" CHECK ((proveedor = 'resend'::text))
);

ALTER TABLE "public"."email_eventos"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."email_eventos" FROM "anon";

CREATE TABLE "public"."email_logs" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plantilla_id"         uuid,
  "usuario_id"           uuid,
  "asunto"               character varying(255)   NOT NULL,
  "cuerpo"               text                     NOT NULL,
  "destinatarios_count"  integer                  NOT NULL DEFAULT 0,
  "fecha_envio"          timestamp with time zone NOT NULL DEFAULT now(),
  "origen"               text                     NOT NULL DEFAULT 'manual'::text,
  "tipo"                 text                     NOT NULL DEFAULT 'general'::text,
  "request_id"           uuid,
  "solicitud"            jsonb,
  "incluir_desuscriptos" boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "email_logs_autoria" CHECK ((((origen = 'manual'::text) AND (usuario_id IS NOT NULL)) OR ((origen = 'automatico'::text) AND (usuario_id IS NULL)))),
  CONSTRAINT "email_logs_excepcion_deuda" CHECK (((NOT incluir_desuscriptos) OR (tipo = 'deuda'::text))),
  CONSTRAINT "email_logs_origen_check" CHECK ((origen = ANY (ARRAY['manual'::text, 'automatico'::text]))),
  CONSTRAINT "email_logs_pkey" PRIMARY KEY (id),
  CONSTRAINT "email_logs_request_id_key" UNIQUE (request_id),
  CONSTRAINT "email_logs_tipo_check" CHECK ((tipo = ANY (ARRAY['general'::text, 'deuda'::text, 'transaccional'::text])))
);

ALTER TABLE "public"."email_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gastos" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "categoria_id"     uuid                     NOT NULL,
  "usuario_id"       uuid                     NOT NULL,
  "fecha"            date                     NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date,
  "concepto"         character varying(255)   NOT NULL,
  "monto"            numeric(10,2)            NOT NULL,
  "referencia_banco" character varying(255),
  "descripcion"      text,
  "evidencia_url"    text,
  "motivo_anulacion" text,
  "anulado_at"       timestamp with time zone,
  "anulado_por"      uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gastos_monto_check" CHECK ((monto > (0)::numeric)),
  CONSTRAINT "gastos_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."gastos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."inscripciones" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "socio_id"     uuid                     NOT NULL,
  "categoria_id" uuid                     NOT NULL,
  "fecha_alta"   date                     NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date,
  "fecha_baja"   date,
  "created_at"   timestamp with time zone DEFAULT now(),
  "updated_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "inscripciones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."inscripciones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pagos" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "cuota_id"         uuid                     NOT NULL,
  "usuario_id"       uuid                     NOT NULL,
  "monto"            numeric(10,2)            NOT NULL,
  "referencia_pago"  character varying(255),
  "fecha_pago"       timestamp with time zone NOT NULL DEFAULT now(),
  "anulado_at"       timestamp with time zone,
  "anulado_por"      uuid,
  "motivo_anulacion" text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pagos_monto_check" CHECK ((monto > (0)::numeric)),
  CONSTRAINT "pagos_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pagos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."plantillas_correo" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "nombre_interno" character varying(150)   NOT NULL,
  "asunto"         character varying(255)   NOT NULL,
  "cuerpo"         text                     NOT NULL,
  "created_at"     timestamp with time zone DEFAULT now(),
  "updated_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "plantilla_asunto_valido" CHECK ((((length(btrim((asunto)::text)) >= 1) AND (length(btrim((asunto)::text)) <= 255)) AND ((asunto)::text !~ '[
]'::text))),
  CONSTRAINT "plantilla_cuerpo_valido" CHECK (((length(btrim(cuerpo)) >= 1) AND (length(btrim(cuerpo)) <= 10000))),
  CONSTRAINT "plantilla_etiquetas_validas"
    CHECK ((regexp_replace(((asunto)::text || cuerpo), '\{\{(nombre|apellido|deporte|deuda)\}\}'::text, ''::text, 'g'::text) !~ '\{\{|\}\}'::text)),
  CONSTRAINT "plantilla_nombre_no_vacio" CHECK ((length(btrim((nombre_interno)::text)) > 0)),
  CONSTRAINT "plantillas_correo_nombre_interno_key" UNIQUE (nombre_interno),
  CONSTRAINT "plantillas_correo_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."plantillas_correo"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."socios" (
  "id"                           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "numero_socio"                 integer                  NOT NULL DEFAULT nextval('public.socios_numero_socio_seq'::regclass),
  "dni"                          character varying(20)    NOT NULL,
  "dni_anterior"                 character varying(20),
  "dni_corregido_at"             timestamp with time zone,
  "dni_corregido_por"            uuid,
  "nombre"                       character varying(100)   NOT NULL,
  "apellido"                     character varying(100)   NOT NULL,
  "fecha_nacimiento"             date                     NOT NULL,
  "email"                        character varying(255),
  "telefono"                     character varying(50),
  "direccion"                    text,
  "foto_url"                     text,
  "acepta_comunicaciones"        boolean                  NOT NULL DEFAULT true,
  "email_invalido"               boolean                  NOT NULL DEFAULT false,
  "contacto_emergencia_nombre"   character varying(150),
  "contacto_emergencia_telefono" character varying(50),
  "fecha_alta"                   date                     NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date,
  "fecha_baja"                   date,
  "created_at"                   timestamp with time zone DEFAULT now(),
  "updated_at"                   timestamp with time zone DEFAULT now(),
  CONSTRAINT "socios_dni_key" UNIQUE (dni),
  CONSTRAINT "socios_numero_socio_key" UNIQUE (numero_socio),
  CONSTRAINT "socios_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."socios"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."usuarios" (
  "id"         uuid                     NOT NULL,
  "nombre"     character varying(100)   NOT NULL,
  "apellido"   character varying(100)   NOT NULL,
  "email"      character varying(255)   NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "usuarios_email_key" UNIQUE (email),
  CONSTRAINT "usuarios_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."usuarios"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."socios_numero_socio_seq" OWNED BY "public"."socios"."numero_socio";

CREATE TYPE "public"."estado_basico" AS ENUM (
  'activo',
  'inactivo'
);

ALTER TABLE "public"."categorias"
  ADD COLUMN "estado" public.estado_basico NOT NULL DEFAULT 'activo'::public.estado_basico;

ALTER TABLE "public"."categorias_gasto"
  ADD COLUMN "estado" public.estado_basico NOT NULL DEFAULT 'activo'::public.estado_basico;

ALTER TABLE "public"."deportes"
  ADD COLUMN "estado" public.estado_basico NOT NULL DEFAULT 'activo'::public.estado_basico;

ALTER TABLE "public"."plantillas_correo"
  ADD COLUMN "estado" public.estado_basico NOT NULL DEFAULT 'activo'::public.estado_basico;

ALTER TABLE "public"."socios"
  ADD COLUMN "estado" public.estado_basico NOT NULL DEFAULT 'activo'::public.estado_basico;

ALTER TABLE "public"."usuarios"
  ADD COLUMN "estado" public.estado_basico NOT NULL DEFAULT 'activo'::public.estado_basico;

CREATE TYPE "public"."estado_cuota" AS ENUM (
  'pendiente',
  'pagada'
);

ALTER TABLE "public"."cuotas"
  ADD COLUMN "estado" public.estado_cuota NOT NULL DEFAULT 'pendiente'::public.estado_cuota;

CREATE TYPE "public"."estado_email" AS ENUM (
  'enviado',
  'fallido',
  'procesando'
);

ALTER TABLE "public"."email_destinatarios"
  ADD COLUMN "estado" public.estado_email NOT NULL DEFAULT 'procesando'::public.estado_email;

ALTER TABLE "public"."email_logs"
  ADD COLUMN "estado" public.estado_email NOT NULL DEFAULT 'procesando'::public.estado_email;

CREATE TYPE "public"."estado_fiscal" AS ENUM (
  'valido',
  'pendiente_cae',
  'anulacion_pendiente',
  'anulado',
  'fallido'
);

ALTER TABLE "public"."comprobantes"
  ADD COLUMN "estado_fiscal" public.estado_fiscal NOT NULL DEFAULT 'pendiente_cae'::public.estado_fiscal;

CREATE TYPE "public"."estado_gasto" AS ENUM (
  'activo',
  'anulado'
);

ALTER TABLE "public"."gastos"
  ADD COLUMN "estado" public.estado_gasto NOT NULL DEFAULT 'activo'::public.estado_gasto;

CREATE TYPE "public"."estado_inscripcion" AS ENUM (
  'activa',
  'inactiva'
);

ALTER TABLE "public"."inscripciones"
  ADD COLUMN "estado" public.estado_inscripcion NOT NULL DEFAULT 'activa'::public.estado_inscripcion;

CREATE TYPE "public"."estado_job" AS ENUM (
  'procesando',
  'exitoso',
  'fallido'
);

ALTER TABLE "public"."cuota_job_logs"
  ADD COLUMN "estado" public.estado_job NOT NULL DEFAULT 'procesando'::public.estado_job;

CREATE TYPE "public"."estado_pago" AS ENUM (
  'completado',
  'anulado'
);

ALTER TABLE "public"."pagos"
  ADD COLUMN "estado" public.estado_pago NOT NULL DEFAULT 'completado'::public.estado_pago;

CREATE TYPE "public"."medio_pago" AS ENUM (
  'efectivo',
  'transferencia'
);

ALTER TABLE "public"."gastos"
  ADD COLUMN "metodo_pago" public.medio_pago NOT NULL;

ALTER TABLE "public"."pagos"
  ADD COLUMN "medio_pago" public.medio_pago NOT NULL;

CREATE TYPE "public"."rol_usuario" AS ENUM (
  'admin',
  'responsable'
);

ALTER TABLE "public"."usuarios"
  ADD COLUMN "rol" public.rol_usuario NOT NULL DEFAULT 'responsable'::public.rol_usuario;

CREATE TYPE "public"."tipo_comprobante" AS ENUM (
  'factura',
  'nota_credito'
);

ALTER TABLE "public"."comprobantes"
  ADD COLUMN "tipo" public.tipo_comprobante NOT NULL;

CREATE OR REPLACE FUNCTION private.actualizar_estado_correo (
  p_log uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
 UPDATE public.email_logs SET estado=CASE
  WHEN EXISTS(SELECT 1 FROM public.email_destinatarios WHERE email_log_id=p_log AND estado_envio IN ('pendiente','procesando','incierto')) THEN 'procesando'::public.estado_email
  WHEN EXISTS(SELECT 1 FROM public.email_destinatarios WHERE email_log_id=p_log AND (estado_envio='fallido' OR entrega_estado IN ('rebote_duro','fallida'))) THEN 'fallido'::public.estado_email
  WHEN NOT EXISTS(SELECT 1 FROM public.email_destinatarios WHERE email_log_id=p_log AND estado_envio='aceptado') THEN 'fallido'::public.estado_email
  ELSE 'enviado'::public.estado_email END WHERE id=p_log;
$function$;

CREATE OR REPLACE FUNCTION private.aplicar_eventos_correo (
  p_destinatario uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_dest public.email_destinatarios%ROWTYPE; v_tipo text; v_bounce text;
BEGIN
 SELECT * INTO v_dest FROM public.email_destinatarios WHERE id=p_destinatario FOR UPDATE;
 IF NOT FOUND OR v_dest.provider_message_id IS NULL THEN RETURN; END IF;
 UPDATE public.email_eventos SET destinatario_id=v_dest.id WHERE proveedor=v_dest.proveedor
   AND provider_message_id=v_dest.provider_message_id AND destinatario_id IS NULL;
 -- Prioridad de resultados, independiente del orden de llegada de webhooks.
 SELECT tipo,bounce_tipo INTO v_tipo,v_bounce FROM public.email_eventos WHERE destinatario_id=v_dest.id
 ORDER BY CASE WHEN tipo='email.bounced' AND bounce_tipo='Permanent' THEN 5
 WHEN tipo='email.failed' OR (tipo='email.bounced' AND bounce_tipo IS DISTINCT FROM 'Transient') THEN 4
 WHEN tipo='email.delivered' THEN 3 WHEN tipo IN ('email.delivery_delayed','email.bounced') THEN 2 ELSE 1 END DESC,ocurrido_en DESC LIMIT 1;
 UPDATE public.email_destinatarios SET entrega_estado=CASE v_tipo
  WHEN 'email.bounced' THEN CASE WHEN v_bounce='Permanent' THEN 'rebote_duro' WHEN v_bounce='Transient' THEN 'demorada' ELSE 'fallida' END WHEN 'email.failed' THEN 'fallida'
  WHEN 'email.delivered' THEN 'entregada' WHEN 'email.delivery_delayed' THEN 'demorada'
  ELSE entrega_estado END WHERE id=v_dest.id;
 IF v_tipo='email.bounced' AND v_bounce='Permanent' THEN
   UPDATE public.socios SET email_invalido=true WHERE id=v_dest.socio_id
    AND lower(btrim(email))=lower(btrim(v_dest.email));
 END IF;
 PERFORM private.actualizar_estado_correo(v_dest.email_log_id);
END; $function$;

CREATE OR REPLACE FUNCTION private.bloquear_estructura_deportiva()
  RETURNS void
  LANGUAGE sql
  SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT pg_catalog.pg_advisory_xact_lock(73120, 12); $function$;

CREATE OR REPLACE FUNCTION private.correo_etiquetas (
  p_texto text,
  p_datos jsonb
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
 SELECT replace(replace(replace(replace(p_texto,'{{nombre}}',coalesce(p_datos->>'nombre','')),
 '{{apellido}}',coalesce(p_datos->>'apellido','')),'{{deporte}}',coalesce(p_datos->>'deporte','')),
 '{{deuda}}',coalesce(p_datos->>'deuda','0.00'));
$function$;

CREATE OR REPLACE FUNCTION private.get_rol()
  RETURNS public.rol_usuario
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT rol FROM public.usuarios
  WHERE id = auth.uid() AND estado = 'activo';
$function$;

CREATE OR REPLACE FUNCTION private.require_operador (
  p_solo_admin boolean DEFAULT false
)
  RETURNS public.rol_usuario
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_rol public.rol_usuario;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;
  SELECT rol INTO v_rol FROM public.usuarios
  WHERE id = auth.uid() AND estado = 'activo';
  IF v_rol IS NULL OR (p_solo_admin AND v_rol <> 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  RETURN v_rol;
END;
$function$;

CREATE OR REPLACE FUNCTION private.trg_bloquear_estructura_deportiva()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  PERFORM private.bloquear_estructura_deportiva();
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION private.trg_categorias_estructura_consistente()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.deporte_id IS DISTINCT FROM OLD.deporte_id THEN
    RAISE EXCEPTION 'El deporte de una categoria no puede modificarse: conserva su historial';
  END IF;
  IF NEW.estado = 'activo' AND NOT EXISTS (
    SELECT 1 FROM public.deportes WHERE id = NEW.deporte_id AND estado = 'activo'
  ) THEN RAISE EXCEPTION 'Una categoria activa requiere un deporte activo'; END IF;
  IF NEW.estado = 'inactivo' AND EXISTS (
    SELECT 1 FROM public.inscripciones WHERE categoria_id = NEW.id AND estado = 'activa'
  ) THEN RAISE EXCEPTION 'No se puede inactivar una categoria con inscripciones activas'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.trg_deportes_baja_consistente()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF NEW.estado = 'inactivo' AND EXISTS (
    SELECT 1 FROM public.categorias WHERE deporte_id = NEW.id AND estado = 'activo'
  ) THEN RAISE EXCEPTION 'No se puede inactivar un deporte con categorias activas'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.trg_impedir_borrado_historico()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$ BEGIN
  RAISE EXCEPTION 'No se permite el borrado fisico de %; utilice la baja logica', TG_TABLE_NAME;
END; $function$;

CREATE OR REPLACE FUNCTION private.trg_inscripciones_estructura_consistente()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.socio_id IS DISTINCT FROM OLD.socio_id
       OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id
       OR NEW.fecha_alta IS DISTINCT FROM OLD.fecha_alta THEN
      RAISE EXCEPTION 'Socio, categoria y fecha de alta de la inscripcion son inmutables';
    END IF;
    IF OLD.estado = 'inactiva' AND (NEW.estado IS DISTINCT FROM OLD.estado
       OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja) THEN
      RAISE EXCEPTION 'La inscripcion dada de baja es historica; una reinscripcion crea otro registro';
    END IF;
  END IF;
  IF NEW.estado = 'activa' AND (
    NOT EXISTS (SELECT 1 FROM public.socios WHERE id = NEW.socio_id AND estado = 'activo')
    OR NOT EXISTS (
      SELECT 1 FROM public.categorias c JOIN public.deportes d ON d.id = c.deporte_id
      WHERE c.id = NEW.categoria_id AND c.estado = 'activo' AND d.estado = 'activo'
    )
  ) THEN RAISE EXCEPTION 'La inscripcion activa requiere socio, categoria y deporte activos'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.trg_socios_baja_consistente()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF NEW.estado = 'inactivo' AND EXISTS (
    SELECT 1 FROM public.inscripciones WHERE socio_id = NEW.id AND estado = 'activa'
  ) THEN RAISE EXCEPTION 'La baja del socio debe cerrar sus inscripciones en la misma transaccion'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.anular_gasto (
  p_gasto_id uuid,
  p_motivo   text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_rol public.rol_usuario;
  v_gasto public.gastos%ROWTYPE;
BEGIN
  v_rol := private.require_operador();
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de anulacion es obligatorio';
  END IF;

  SELECT * INTO v_gasto FROM public.gastos
  WHERE id = p_gasto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gasto inexistente';
  END IF;
  IF v_gasto.estado <> 'activo' THEN
    RAISE EXCEPTION 'El gasto ya fue anulado';
  END IF;
  IF v_rol = 'responsable'
     AND (v_gasto.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
         <> (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Solo un Administrador puede anular gastos de dias anteriores';
  END IF;

  -- El trigger asigna anulado_at/anulado_por en la misma transacción.
  UPDATE public.gastos
  SET estado = 'anulado', motivo_anulacion = btrim(p_motivo)
  WHERE id = p_gasto_id;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."anular_gasto"(uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.anular_pago (
  p_pago_id uuid,
  p_motivo  text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
v_pago     pagos%ROWTYPE;
v_original comprobantes%ROWTYPE;
v_nc_id    uuid;
v_rol      public.rol_usuario;
BEGIN
v_rol := private.require_operador();
IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
RAISE EXCEPTION 'El motivo de anulacion es obligatorio (CU-05.3)';
END IF;

SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Pago inexistente'; END IF;
IF v_rol = 'responsable'
   AND (v_pago.fecha_pago AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
       <> (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
  RAISE EXCEPTION 'El Responsable solo puede anular cobros del dia' USING ERRCODE = '42501';
END IF;
IF v_pago.estado <> 'completado' THEN
RAISE EXCEPTION 'El pago ya fue anulado: no se permite una segunda anulacion (CU-05.3)';
END IF;

SELECT * INTO v_original FROM comprobantes
WHERE pago_id = p_pago_id AND tipo = 'factura' FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'El pago no tiene factura asociada'; END IF;

-- guardas de estado fiscal de la factura, después de bloquearla y ANTES de modificar pago/cuota.
IF v_original.estado_fiscal NOT IN ('valido', 'fallido') THEN
RAISE EXCEPTION 'La factura no admite anulacion en su estado actual';
END IF;
IF v_original.estado_fiscal = 'valido' AND v_original.cae IS NULL THEN
RAISE EXCEPTION 'Factura valida sin CAE: requiere revisar la inconsistencia';
END IF;

-- (1) Caja y deuda: el reverso lo DERIVA la vista flujo_caja al quedar anulado;
--     la cuota vuelve a 'pendiente' y el indice uq_pago_vigente_por_cuota
--     habilita el recobro inmediato.
-- El trigger completa anulado_at/anulado_por usando la sesión validada.
UPDATE pagos SET estado = 'anulado', motivo_anulacion = btrim(p_motivo)
WHERE id = p_pago_id;
UPDATE cuotas SET estado = 'pendiente' WHERE id = v_pago.cuota_id;

IF v_original.cae IS NOT NULL THEN
-- (2) Rama 4.a: hubo CAE => corresponde NC. El original NO se reintenta:
--     queda 'anulacion_pendiente' con proximo_reintento_en NULL y espera
--     el resultado de la NC (el estado pendiente vive en el documento fiscal).
UPDATE comprobantes
SET estado_fiscal = 'anulacion_pendiente',
motivo_anulacion = p_motivo,
proximo_reintento_en = NULL
WHERE id = v_original.id;
INSERT INTO comprobantes (pago_id, tipo, comprobante_origen_id, punto_venta,
                          estado_fiscal, motivo_anulacion, proximo_reintento_en)
VALUES (p_pago_id, 'nota_credito', v_original.id, v_original.punto_venta,
        'pendiente_cae', p_motivo, NOW() + interval '10 min')
RETURNING id INTO v_nc_id;
-- dos ramas:
ELSIF v_original.numero_solicitado IS NULL THEN
-- (3) Rama 4.b: bajo ND-15, sin solicitud previa no hubo envio desde este
--     sistema => ausencia de autorizacion confirmada => anulacion local sin NC.
UPDATE comprobantes
SET estado_fiscal = 'anulado',
motivo_anulacion = p_motivo,
proximo_reintento_en = NULL
WHERE id = v_original.id;
ELSE
-- (4) Rama 4.c: hubo una solicitud y su resultado es desconocido: el CAE
--     local NULL no prueba que ARCA no autorizo. La anulacion financiera ya
--     quedo consumada arriba; solo se posterga la resolucion fiscal.
UPDATE comprobantes
SET estado_fiscal = 'anulacion_pendiente',
motivo_anulacion = p_motivo,
proximo_reintento_en = NULL,
detalle_error_fiscal = concat_ws(
  E'\n',
  detalle_error_fiscal,
  'Pago anulado; falta conciliar la autorizacion de la factura original'
)
WHERE id = v_original.id;
END IF;

RETURN v_nc_id;
END; $function$;

REVOKE ALL ON FUNCTION "public"."anular_pago"(uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.baja_categoria (
  p_categoria_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_estado public.estado_basico;
BEGIN
  PERFORM private.bloquear_estructura_deportiva();
  PERFORM private.require_operador(true);
  SELECT estado INTO v_estado FROM public.categorias WHERE id = p_categoria_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria inexistente'; END IF;
  IF v_estado <> 'activo' THEN RAISE EXCEPTION 'La categoria ya esta inactiva'; END IF;
  IF EXISTS (SELECT 1 FROM public.inscripciones WHERE categoria_id = p_categoria_id AND estado = 'activa') THEN
    RAISE EXCEPTION 'No se puede dar de baja la categoria porque existen socios inscriptos activos en la misma. Desvinculelos primero (CU-03.6)';
  END IF;
  UPDATE public.categorias SET estado = 'inactivo' WHERE id = p_categoria_id;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."baja_categoria"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.baja_deporte (
  p_deporte_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_estado public.estado_basico;
BEGIN
  PERFORM private.bloquear_estructura_deportiva();
  PERFORM private.require_operador(true);
  SELECT estado INTO v_estado FROM public.deportes WHERE id = p_deporte_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deporte inexistente'; END IF;
  IF v_estado <> 'activo' THEN RAISE EXCEPTION 'El deporte ya esta inactivo'; END IF;
  IF EXISTS (SELECT 1 FROM public.categorias WHERE deporte_id = p_deporte_id AND estado = 'activo') THEN
    RAISE EXCEPTION 'No se puede dar de baja el deporte porque posee categorias activas. De de baja primero esas categorias (CU-03.3)';
  END IF;
  UPDATE public.deportes SET estado = 'inactivo' WHERE id = p_deporte_id;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."baja_deporte"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.baja_inscripcion (
  p_inscripcion_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_estado public.estado_inscripcion; v_hoy date;
BEGIN
  PERFORM private.bloquear_estructura_deportiva();
  PERFORM private.require_operador(false);
  v_hoy := (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  SELECT estado INTO v_estado FROM public.inscripciones WHERE id = p_inscripcion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscripcion inexistente'; END IF;
  IF v_estado <> 'activa' THEN RAISE EXCEPTION 'La inscripcion ya esta inactiva'; END IF;
  UPDATE public.inscripciones SET estado = 'inactiva', fecha_baja = v_hoy
  WHERE id = p_inscripcion_id;
  -- No anula ni recalcula cuotas del mes o de períodos anteriores.
END;
$function$;

REVOKE ALL ON FUNCTION "public"."baja_inscripcion"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.baja_socio (
  p_socio_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_estado public.estado_basico; v_hoy date;
BEGIN
  PERFORM private.bloquear_estructura_deportiva();
  PERFORM private.require_operador(false);
  v_hoy := (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  SELECT estado INTO v_estado FROM public.socios WHERE id = p_socio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Socio inexistente'; END IF;
  IF v_estado <> 'activo' THEN RAISE EXCEPTION 'El socio ya esta inactivo'; END IF;
  UPDATE public.inscripciones SET estado = 'inactiva', fecha_baja = v_hoy
  WHERE socio_id = p_socio_id AND estado = 'activa';
  UPDATE public.socios SET estado = 'inactivo', fecha_baja = v_hoy WHERE id = p_socio_id;
  -- No modifica cuotas, pagos ni comprobantes.
END;
$function$;

REVOKE ALL ON FUNCTION "public"."baja_socio"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.categoria_edad_fuera_de_rango (
  p_fecha_alta       date,
  p_fecha_nacimiento date,
  p_edad_min         integer,
  p_edad_max         integer
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
  AS $function$
SELECT p_edad_min IS NOT NULL AND p_edad_max IS NOT NULL
   AND ( date_part('year', age(p_fecha_alta, p_fecha_nacimiento)) < p_edad_min
      OR date_part('year', age(p_fecha_alta, p_fecha_nacimiento)) > p_edad_max );
$function$;

CREATE OR REPLACE FUNCTION public.categorias_rango_superpuesto (
  p_deporte_id        uuid,
  p_edad_min          integer,
  p_edad_max          integer,
  p_excluir_categoria uuid    DEFAULT NULL::uuid
)
  RETURNS TABLE (
    categoria_id uuid,
    nombre       character varying,
    edad_min     integer,
    edad_max     integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
SELECT c.id, c.nombre, c.edad_min, c.edad_max
FROM categorias c
WHERE c.deporte_id = p_deporte_id
  AND c.estado = 'activo'
  AND (p_excluir_categoria IS NULL OR c.id <> p_excluir_categoria)
  AND (p_edad_min IS NULL OR p_edad_max IS NULL
       OR c.edad_min IS NULL OR c.edad_max IS NULL
       OR (p_edad_min <= c.edad_max AND c.edad_min <= p_edad_max));
$function$;

CREATE OR REPLACE FUNCTION public.cobrar_cuota (
  p_cuota_id   uuid,
  p_usuario_id uuid,
  p_medio_pago public.medio_pago,
  p_referencia character varying DEFAULT NULL::character varying
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_cuota public.cuotas%ROWTYPE;
  v_pago_id uuid;
  v_comprobante_id uuid;
  v_punto_venta integer;
BEGIN
  PERFORM private.require_operador();
  IF p_usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puede registrar cobros en nombre de otro usuario';
  END IF;
  IF p_medio_pago IS NULL THEN
    RAISE EXCEPTION 'El medio de pago es obligatorio';
  END IF;

  SELECT * INTO v_cuota FROM public.cuotas WHERE id = p_cuota_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota inexistente'; END IF;
  IF v_cuota.estado <> 'pendiente' THEN RAISE EXCEPTION 'Cuota ya pagada'; END IF;
  IF v_cuota.monto <= 0 THEN RAISE EXCEPTION 'La cuota no tiene un importe cobrable'; END IF;

  SELECT punto_venta INTO v_punto_venta FROM public.club
  WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Falta la configuracion del club'; END IF;

  INSERT INTO public.pagos (cuota_id, usuario_id, monto, medio_pago, referencia_pago)
  VALUES (p_cuota_id, auth.uid(), v_cuota.monto, p_medio_pago, p_referencia)
  RETURNING id INTO v_pago_id;

  INSERT INTO public.comprobantes
    (pago_id, tipo, punto_venta, estado_fiscal, proximo_reintento_en)
  VALUES (v_pago_id, 'factura', v_punto_venta, 'pendiente_cae', NOW() + interval '10 min')
  RETURNING id INTO v_comprobante_id;

  UPDATE public.cuotas SET estado = 'pagada' WHERE id = p_cuota_id;
  RETURN v_comprobante_id;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."cobrar_cuota"(uuid, uuid, public.medio_pago, character varying) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.confirmar_inscripcion (
  p_socio_id     uuid,
  p_categoria_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_hoy date; v_mes integer; v_anio integer;
  v_socio public.socios%ROWTYPE; v_categoria public.categorias%ROWTYPE;
  v_inscripcion_id uuid; v_cuota public.cuotas%ROWTYPE; v_creada boolean;
BEGIN
  PERFORM private.bloquear_estructura_deportiva();
  PERFORM private.require_operador(false);
  v_hoy := (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_mes := extract(month FROM v_hoy)::integer;
  v_anio := extract(year FROM v_hoy)::integer;
  SELECT * INTO v_socio FROM public.socios WHERE id = p_socio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Socio inexistente'; END IF;
  IF v_socio.estado <> 'activo' THEN RAISE EXCEPTION 'El socio debe estar activo'; END IF;
  SELECT * INTO v_categoria FROM public.categorias WHERE id = p_categoria_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria inexistente'; END IF;
  IF v_categoria.estado <> 'activo' OR NOT EXISTS (
    SELECT 1 FROM public.deportes WHERE id = v_categoria.deporte_id AND estado = 'activo'
  ) THEN RAISE EXCEPTION 'La categoria y su deporte deben estar activos'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.inscripciones
    WHERE socio_id = p_socio_id AND categoria_id = p_categoria_id AND estado = 'activa'
  ) THEN RAISE EXCEPTION 'El socio ya se encuentra inscripto activamente en esta categoria'; END IF;

  INSERT INTO public.inscripciones (socio_id, categoria_id, fecha_alta, estado)
  VALUES (p_socio_id, p_categoria_id, v_hoy, 'activa') RETURNING id INTO v_inscripcion_id;
  INSERT INTO public.cuotas (socio_id, categoria_id, periodo_mes, periodo_anio, monto, estado)
  VALUES (p_socio_id, p_categoria_id, v_mes, v_anio,
          public.cuota_proporcional(v_hoy, v_mes, v_anio, v_categoria.arancel_mensual), 'pendiente')
  ON CONFLICT (socio_id, categoria_id, periodo_mes, periodo_anio) DO NOTHING
  RETURNING * INTO v_cuota;
  v_creada := FOUND;
  IF NOT v_creada THEN
    SELECT * INTO STRICT v_cuota FROM public.cuotas
    WHERE socio_id = p_socio_id AND categoria_id = p_categoria_id
      AND periodo_mes = v_mes AND periodo_anio = v_anio;
  END IF;
  RETURN jsonb_build_object('inscripcion_id', v_inscripcion_id, 'cuota_id', v_cuota.id,
    'cuota_creada', v_creada, 'monto_cuota', v_cuota.monto, 'estado_cuota', v_cuota.estado);
END;
$function$;

REVOKE ALL ON FUNCTION "public"."confirmar_inscripcion"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.crear_comunicacion (
  p_solicitud jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_id uuid; v_request uuid; v_tipo text; v_incluir boolean; v_asunto text; v_cuerpo text;
 v_plantilla uuid; v_prev public.email_logs%ROWTYPE; v_ids uuid[]; v_socio record;
 v_deuda numeric; v_deportes text; v_motivo text; v_datos jsonb; v_elegibles int:=0; v_solicitud jsonb;
BEGIN
 PERFORM private.require_operador();
 IF jsonb_typeof(p_solicitud) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_solicitud->'requestId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_solicitud->'sociosIds') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_solicitud->'tipo') IS DISTINCT FROM 'string'
 OR (p_solicitud ? 'incluirDesuscriptos' AND jsonb_typeof(p_solicitud->'incluirDesuscriptos') IS DISTINCT FROM 'boolean')
 THEN RAISE EXCEPTION 'Solicitud de correo inválida'; END IF;
 v_request := (p_solicitud->>'requestId')::uuid;
 v_tipo := p_solicitud->>'tipo';
 v_incluir := coalesce((p_solicitud->>'incluirDesuscriptos')::boolean,false);
 IF v_tipo NOT IN ('general','deuda') OR (v_incluir AND v_tipo<>'deuda')
 THEN RAISE EXCEPTION 'La excepción de desuscripción solo corresponde a avisos de deuda'; END IF;
 IF jsonb_array_length(p_solicitud->'sociosIds') NOT BETWEEN 1 AND 1000
 THEN RAISE EXCEPTION 'Seleccione entre 1 y 1000 socios'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_solicitud->'sociosIds') t(x)
   WHERE jsonb_typeof(x) IS DISTINCT FROM 'string')
 THEN RAISE EXCEPTION 'Identificador de socio inválido'; END IF;
 SELECT array_agg(DISTINCT x::uuid ORDER BY x::uuid) INTO v_ids
 FROM jsonb_array_elements_text(p_solicitud->'sociosIds') t(x);
 IF v_tipo='deuda' THEN
   v_asunto := 'Aviso de cuotas pendientes';
   v_cuerpo := E'Hola {{nombre}} {{apellido}}.\nAl preparar este aviso registramos cuotas pendientes por ${{deuda}} correspondientes a {{deporte}}.\nPor favor, comuníquese con el club para consultar o regularizar su situación.';
   v_plantilla := NULL; -- Nunca habilita contenido general por una etiqueta del cliente.
 ELSE
   IF jsonb_typeof(p_solicitud->'asunto') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_solicitud->'cuerpo') IS DISTINCT FROM 'string'
   THEN RAISE EXCEPTION 'Asunto y cuerpo deben ser texto'; END IF;
   v_asunto:=btrim(p_solicitud->>'asunto'); v_cuerpo:=p_solicitud->>'cuerpo';
   IF length(v_asunto) NOT BETWEEN 1 AND 255 OR length(btrim(v_cuerpo)) NOT BETWEEN 1 AND 10000
      OR v_asunto ~ E'[\r\n]' THEN RAISE EXCEPTION 'Asunto o cuerpo inválidos'; END IF;
   IF private.correo_etiquetas(v_asunto||v_cuerpo,'{}'::jsonb) ~ '\{\{|\}\}'
   THEN RAISE EXCEPTION 'Etiqueta desconocida en la plantilla'; END IF;
   IF p_solicitud ? 'plantillaId' AND jsonb_typeof(p_solicitud->'plantillaId') NOT IN ('string','null')
   THEN RAISE EXCEPTION 'Identificador de plantilla inválido'; END IF;
   v_plantilla := nullif(p_solicitud->>'plantillaId','')::uuid;
 END IF;
 v_solicitud:=jsonb_build_object('requestId',v_request,'tipo',v_tipo,'asunto',v_asunto,'cuerpo',v_cuerpo,
   'sociosIds',to_jsonb(v_ids),'plantillaId',v_plantilla,'incluirDesuscriptos',v_incluir);
 -- La exclusión por requestId serializa doble clic/reintento antes de crear filas.
 -- Solo se guarda el contenido canónico necesario, nunca campos arbitrarios del cliente.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_request::text,73121));
 SELECT * INTO v_prev FROM public.email_logs WHERE request_id=v_request;
 IF FOUND THEN
   IF v_prev.usuario_id IS DISTINCT FROM auth.uid() OR v_prev.solicitud IS DISTINCT FROM v_solicitud
   THEN RAISE EXCEPTION 'El identificador de solicitud ya tiene otro contenido o autor'; END IF;
   RETURN v_prev.id;
 END IF;
 IF v_plantilla IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.plantillas_correo WHERE id=v_plantilla AND estado='activo')
 THEN RAISE EXCEPTION 'La plantilla no está disponible'; END IF;
 INSERT INTO public.email_logs(plantilla_id,usuario_id,asunto,cuerpo,destinatarios_count,
   origen,tipo,request_id,solicitud,incluir_desuscriptos)
 VALUES(v_plantilla,auth.uid(),v_asunto,v_cuerpo,cardinality(v_ids),'manual',v_tipo,v_request,v_solicitud,v_incluir)
 RETURNING id INTO v_id;
 FOR v_socio IN SELECT wanted.id AS solicitado,s.* FROM unnest(v_ids) wanted(id)
   LEFT JOIN public.socios s ON s.id=wanted.id ORDER BY wanted.id LOOP
   SELECT coalesce(sum(q.monto),0),string_agg(DISTINCT d.nombre,', ' ORDER BY d.nombre)
   INTO v_deuda,v_deportes FROM public.cuotas q JOIN public.categorias c ON c.id=q.categoria_id
   JOIN public.deportes d ON d.id=c.deporte_id WHERE q.socio_id=v_socio.id AND q.estado='pendiente';
   v_motivo:=CASE WHEN v_socio.id IS NULL THEN 'Socio inexistente'
     WHEN v_tipo='general' AND v_socio.estado<>'activo' THEN 'Socio inactivo para comunicaciones generales'
     WHEN v_socio.email IS NULL OR btrim(v_socio.email) !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' THEN 'Sin correo válido'
     WHEN v_socio.email_invalido THEN 'Correo marcado inválido'
     WHEN NOT v_socio.acepta_comunicaciones AND NOT v_incluir THEN 'Socio desuscripto'
     WHEN v_tipo='deuda' AND v_deuda<=0 THEN 'Sin deuda pendiente'
     ELSE NULL END;
   IF v_motivo IS NULL THEN v_elegibles:=v_elegibles+1; END IF;
   v_datos:=jsonb_build_object('nombre',v_socio.nombre,'apellido',v_socio.apellido,
     'deporte',coalesce(v_deportes,''),'deuda',to_char(v_deuda,'FM999999999990.00'));
   INSERT INTO public.email_destinatarios(email_log_id,socio_id,email,estado_envio,motivo,asunto_snapshot,cuerpo_snapshot)
   VALUES(v_id,v_socio.id,nullif(btrim(v_socio.email),''),CASE WHEN v_motivo IS NULL THEN 'pendiente' ELSE 'excluido' END,
    v_motivo,private.correo_etiquetas(v_asunto,v_datos),private.correo_etiquetas(v_cuerpo,v_datos)
      ||CASE WHEN v_tipo='deuda' THEN E'\nAviso preparado el '
        ||to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI')
        ||' (hora de Buenos Aires).' ELSE '' END);
 END LOOP;
 IF v_elegibles=0 THEN RAISE EXCEPTION 'No hay destinatarios que cumplan con estos criterios'; END IF;
 RETURN v_id;
END; $function$;

REVOKE ALL ON FUNCTION "public"."crear_comunicacion"(jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.cuit_valido (
  p_cuit character varying
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_digitos text;
  v_pesos constant int[] := ARRAY[5,4,3,2,7,6,5,4,3,2];
  v_sum int := 0;
  v_i int;
  v_dv int;
BEGIN
  IF p_cuit IS NULL OR p_cuit !~ '^\d{2}-\d{8}-\d{1}$' THEN
    RETURN false;
  END IF;
  v_digitos := regexp_replace(p_cuit, '\D', '', 'g');
  FOR v_i IN 1..10 LOOP
    v_sum := v_sum + (substr(v_digitos, v_i, 1)::int * v_pesos[v_i]);
  END LOOP;
  v_dv := mod(11 - mod(v_sum, 11), 11);   -- dv=10 => CUIT inexistente => false abajo
  RETURN v_dv = substr(v_digitos, 11, 1)::int;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cuota_proporcional (
  p_fecha_alta   date,
  p_periodo_mes  integer,
  p_periodo_anio integer,
  p_arancel      numeric
)
  RETURNS numeric
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
  AS $function$
SELECT CASE WHEN tramo_proporcional(p_fecha_alta, p_periodo_mes, p_periodo_anio) = 0
            THEN NULL                                   -- alta posterior al período: sin cuota
            ELSE round(p_arancel * tramo_proporcional(p_fecha_alta, p_periodo_mes, p_periodo_anio) / 100.0, 2)
       END;
$function$;

CREATE OR REPLACE FUNCTION public.cuotas_del_periodo (
  p_socio_id uuid,
  p_mes      integer,
  p_anio     integer
)
  RETURNS TABLE (
    cuota_id         uuid,
    categoria_id     uuid,
    categoria_nombre character varying,
    estado           public.estado_cuota,
    monto            numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
SELECT q.id, q.categoria_id, c.nombre, q.estado, q.monto
FROM cuotas q JOIN categorias c ON c.id = q.categoria_id
WHERE q.socio_id = p_socio_id
  AND q.periodo_mes = p_mes AND q.periodo_anio = p_anio
ORDER BY c.nombre;
$function$;

CREATE OR REPLACE FUNCTION public.desuscribir_correo (
  p_destinatario uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
 UPDATE public.socios s SET acepta_comunicaciones=false FROM public.email_destinatarios e
 WHERE e.id=p_destinatario AND e.socio_id=s.id AND lower(btrim(e.email))=lower(btrim(s.email));
END; $function$;

REVOKE ALL ON FUNCTION "public"."desuscribir_correo"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.es_socio_moroso (
  p_socio_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
SELECT EXISTS (
  SELECT 1 FROM cuotas
  WHERE socio_id = p_socio_id
    AND estado = 'pendiente'
    AND created_at < now() - interval '30 days'
);
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_correo (
  p_id         uuid,
  p_reserva    uuid,
  p_estado     text,
  p_message_id text,
  p_motivo     text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_dest public.email_destinatarios%ROWTYPE;
BEGIN
 IF p_estado NOT IN ('aceptado','fallido','incierto') OR (p_estado='aceptado' AND nullif(p_message_id,'') IS NULL)
 THEN RAISE EXCEPTION 'Resultado de transporte inválido'; END IF;
 -- El webhook y la respuesta del proveedor comparten este mutex antes de
 -- bloquear la fila. Así ambos ven el evento aunque terminen simultáneamente.
 IF nullif(p_message_id,'') IS NOT NULL THEN
   SELECT * INTO v_dest FROM public.email_destinatarios WHERE id=p_id;
   PERFORM pg_advisory_xact_lock(hashtextextended(v_dest.proveedor||':'||p_message_id,73122));
 END IF;
 SELECT * INTO v_dest FROM public.email_destinatarios WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v_dest.reserva_id IS DISTINCT FROM p_reserva THEN RAISE EXCEPTION 'Reserva inválida'; END IF;
 IF v_dest.estado_envio NOT IN ('procesando','incierto') THEN RETURN; END IF;
 UPDATE public.email_destinatarios SET estado_envio=p_estado,provider_message_id=p_message_id,
  motivo=p_motivo,aceptado_en=CASE WHEN p_estado='aceptado' THEN now() END,
  estado=CASE WHEN p_estado='aceptado' THEN 'enviado'::public.estado_email WHEN p_estado='fallido' THEN 'fallido'::public.estado_email ELSE 'procesando'::public.estado_email END
 WHERE id=p_id;
 PERFORM private.aplicar_eventos_correo(p_id);
 PERFORM private.actualizar_estado_correo(v_dest.email_log_id);
END; $function$;

REVOKE ALL ON FUNCTION "public"."finalizar_correo"(uuid, uuid, text, text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.generar_cuotas_mes_actual()
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_inicio timestamptz;
  v_hoy date;
  v_mes integer;
  v_anio integer;
  v_log public.cuota_job_logs%ROWTYPE;
  v_total integer := 0;
  v_generadas integer := 0;
  v_codigo_error text;
BEGIN
  -- Igual mutex y orden que altas, bajas y cambios de arancel (ND-1).
  -- Se adquiere ANTES de leer el periodo, los logs o las inscripciones.
  PERFORM private.bloquear_estructura_deportiva();
  v_inicio := clock_timestamp();
  v_hoy := (v_inicio AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_mes := extract(month FROM v_hoy)::integer;
  v_anio := extract(year FROM v_hoy)::integer;

  SELECT * INTO v_log
  FROM public.cuota_job_logs
  WHERE periodo_mes = v_mes AND periodo_anio = v_anio AND estado = 'exitoso';
  IF FOUND THEN
    RETURN jsonb_build_object(
      'resultado', 'ya_ejecutado', 'job_id', v_log.id,
      'periodo_mes', v_mes, 'periodo_anio', v_anio,
      'cuotas_generadas', v_log.cuotas_generadas,
      'cuotas_omitidas', v_log.cuotas_omitidas
    );
  END IF;

  INSERT INTO public.cuota_job_logs
    (periodo_mes, periodo_anio, estado, cuotas_generadas, cuotas_omitidas, fecha_inicio)
  VALUES (v_mes, v_anio, 'procesando', 0, 0, v_inicio)
  RETURNING * INTO v_log;

  BEGIN
    WITH elegibles AS MATERIALIZED (
      SELECT i.socio_id, i.categoria_id,
        public.cuota_proporcional(i.fecha_alta, v_mes, v_anio, c.arancel_mensual) AS monto
      FROM public.inscripciones i
      JOIN public.socios s ON s.id = i.socio_id
      JOIN public.categorias c ON c.id = i.categoria_id
      JOIN public.deportes d ON d.id = c.deporte_id
      WHERE i.estado = 'activa' AND i.fecha_alta <= v_hoy
        AND s.estado = 'activo' AND c.estado = 'activo' AND d.estado = 'activo'
    ), insertadas AS (
      INSERT INTO public.cuotas
        (socio_id, categoria_id, periodo_mes, periodo_anio, monto, estado, created_at, updated_at)
      SELECT socio_id, categoria_id, v_mes, v_anio, monto, 'pendiente', v_inicio, v_inicio
      FROM elegibles
      ON CONFLICT (socio_id, categoria_id, periodo_mes, periodo_anio) DO NOTHING
      RETURNING id
    )
    SELECT (SELECT count(*)::integer FROM elegibles),
           (SELECT count(*)::integer FROM insertadas)
      INTO v_total, v_generadas;

    UPDATE public.cuota_job_logs
    SET estado = 'exitoso', cuotas_generadas = v_generadas,
        cuotas_omitidas = v_total - v_generadas, fecha_fin = clock_timestamp()
    WHERE id = v_log.id;
  EXCEPTION WHEN OTHERS THEN
    -- Este subbloque revierte TODAS las cuotas del intento, no las anteriores.
    -- El log exterior puede confirmar el fallo sin dejar deuda parcial.
    GET STACKED DIAGNOSTICS v_codigo_error = RETURNED_SQLSTATE;
    UPDATE public.cuota_job_logs
    SET estado = 'fallido', cuotas_generadas = 0,
        cuotas_omitidas = 0, fecha_fin = clock_timestamp()
    WHERE id = v_log.id;
    RETURN jsonb_build_object(
      'resultado', 'fallido', 'job_id', v_log.id,
      'periodo_mes', v_mes, 'periodo_anio', v_anio,
      'cuotas_generadas', 0, 'cuotas_omitidas', 0,
      'codigo_error', v_codigo_error
    );
  END;

  RETURN jsonb_build_object(
    'resultado', 'generado', 'job_id', v_log.id,
    'periodo_mes', v_mes, 'periodo_anio', v_anio,
    'cuotas_generadas', v_generadas, 'cuotas_omitidas', v_total - v_generadas
  );
END;
$function$;

REVOKE ALL ON FUNCTION "public"."generar_cuotas_mes_actual"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.generar_cuotas_mes_manual()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  PERFORM private.require_operador(true);
  RETURN public.generar_cuotas_mes_actual();
END;
$function$;

REVOKE ALL ON FUNCTION "public"."generar_cuotas_mes_manual"() FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  UPDATE public.usuarios
     SET email = NEW.email
   WHERE id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el perfil del usuario: no se cambio el correo';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."handle_auth_user_email_changed"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre, apellido)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Sin Nombre'),
    COALESCE(NEW.raw_user_meta_data->>'apellido', 'Sin Apellido')
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.previsualizar_inscripcion (
  p_socio_id     uuid,
  p_categoria_id uuid
)
  RETURNS TABLE (
    monto_proporcional numeric,
    tramo_pct          integer,
    advertencia_edad   boolean,
    edad_socio_anios   integer,
    rango_min          integer,
    rango_max          integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
WITH fecha AS (
  SELECT (statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS hoy
)
SELECT
  public.cuota_proporcional(f.hoy, extract(month FROM f.hoy)::int,
                           extract(year FROM f.hoy)::int, c.arancel_mensual),
  public.tramo_proporcional(f.hoy, extract(month FROM f.hoy)::int, extract(year FROM f.hoy)::int),
  public.categoria_edad_fuera_de_rango(f.hoy, s.fecha_nacimiento, c.edad_min, c.edad_max),
  date_part('year', age(f.hoy, s.fecha_nacimiento))::int, c.edad_min, c.edad_max
FROM public.socios s CROSS JOIN public.categorias c CROSS JOIN fecha f
JOIN public.deportes d ON d.id = c.deporte_id
WHERE s.id = p_socio_id AND c.id = p_categoria_id
  AND s.estado = 'activo' AND c.estado = 'activo' AND d.estado = 'activo';
$function$;

CREATE OR REPLACE FUNCTION public.reabrir_regularizacion_fiscal (
  p_comprobante_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
DECLARE
v_ref    comprobantes%ROWTYPE;
v_comp   comprobantes%ROWTYPE;
v_pago   pagos%ROWTYPE;
v_origen comprobantes%ROWTYPE;
BEGIN
-- Lectura orientativa, sin bloqueo; no autoriza ni confirma cambios.
SELECT * INTO v_ref FROM comprobantes WHERE id = p_comprobante_id;
IF NOT FOUND THEN
  RAISE EXCEPTION 'El comprobante no existe';
END IF;

-- Orden comun de bloqueos: pago -> factura original -> NC, cuando corresponda.
SELECT * INTO v_pago FROM pagos WHERE id = v_ref.pago_id FOR UPDATE;
IF NOT FOUND THEN
  RAISE EXCEPTION 'El pago no existe';
END IF;

SELECT * INTO v_origen FROM comprobantes
WHERE id = CASE
             WHEN v_ref.tipo = 'factura' THEN v_ref.id
             ELSE v_ref.comprobante_origen_id
           END
  AND pago_id = v_pago.id
  AND tipo = 'factura'
FOR UPDATE;
IF NOT FOUND THEN
  RAISE EXCEPTION 'La factura original no corresponde al pago';
END IF;

IF v_ref.tipo = 'factura' THEN
  v_comp := v_origen;
ELSE
  SELECT * INTO v_comp FROM comprobantes
  WHERE id = p_comprobante_id
    AND tipo = 'nota_credito'
    AND pago_id = v_pago.id
    AND comprobante_origen_id = v_origen.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La nota de credito cambio o no corresponde al origen';
  END IF;
END IF;

IF v_comp.estado_fiscal <> 'fallido' THEN
  RAISE EXCEPTION 'El comprobante no esta en estado fallido';
END IF;

IF v_comp.tipo = 'factura' THEN
  IF v_pago.estado <> 'completado' THEN
    RAISE EXCEPTION 'No se reabre una factura de pago anulado';
  END IF;
ELSE
  IF v_pago.estado <> 'anulado'
     OR v_origen.estado_fiscal <> 'anulacion_pendiente'
     OR v_origen.cae IS NULL THEN
    RAISE EXCEPTION 'La nota de credito no tiene una anulacion fiscal elegible';
  END IF;
END IF;

UPDATE comprobantes
   SET estado_fiscal = 'pendiente_cae',
       intentos_reintento = 0,
       ventana_regularizacion_iniciada_en = NOW(),
       proximo_reintento_en = NOW() + interval '10 min'
 WHERE id = p_comprobante_id;
END; $function$;

REVOKE ALL ON FUNCTION "public"."reabrir_regularizacion_fiscal"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.reactivar_socio (
  p_socio_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_estado public.estado_basico;
BEGIN
  PERFORM private.bloquear_estructura_deportiva();
  PERFORM private.require_operador(false);
  SELECT estado INTO v_estado FROM public.socios WHERE id = p_socio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Socio inexistente'; END IF;
  IF v_estado <> 'inactivo' THEN RAISE EXCEPTION 'El socio ya esta activo'; END IF;
  UPDATE public.socios SET estado = 'activo', fecha_baja = NULL WHERE id = p_socio_id;
  -- Las inscripciones históricas permanecen inactivas.
END;
$function$;

REVOKE ALL ON FUNCTION "public"."reactivar_socio"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.registrar_evento_correo (
  p_event_id    text,
  p_message_id  text,
  p_tipo        text,
  p_ocurrido    timestamp with time zone,
  p_bounce_tipo text                     DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_id uuid;
BEGIN
 IF nullif(p_event_id,'') IS NULL OR nullif(p_message_id,'') IS NULL OR p_ocurrido IS NULL
 THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 IF p_tipo NOT IN ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.failed')
 THEN RAISE EXCEPTION 'Tipo de evento no admitido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resend:'||p_message_id,73122));
 INSERT INTO public.email_eventos(event_id,provider_message_id,tipo,ocurrido_en,bounce_tipo)
 VALUES(p_event_id,p_message_id,p_tipo,p_ocurrido,p_bounce_tipo) ON CONFLICT(proveedor,event_id) DO NOTHING;
 SELECT id INTO v_id FROM public.email_destinatarios WHERE proveedor='resend' AND provider_message_id=p_message_id;
 IF FOUND THEN PERFORM private.aplicar_eventos_correo(v_id); END IF;
END; $function$;

REVOKE ALL ON FUNCTION "public"."registrar_evento_correo"(text, text, text, timestamp WITH time zone, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.reservar_correos (
  p_proveedor text
)
  RETURNS SETOF public.email_destinatarios
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_libres int; v_log uuid;
BEGIN
 IF p_proveedor IS NULL OR p_proveedor NOT IN ('resend','mailpit') THEN RAISE EXCEPTION 'Proveedor inválido'; END IF;
 PERFORM pg_advisory_xact_lock(73121,19);
 -- No se reenvía automáticamente un envío cuya aceptación se desconoce.
 UPDATE public.email_destinatarios SET estado_envio='incierto',motivo='Ejecución interrumpida; verificar aceptación antes de reenviar'
 WHERE estado_envio='procesando' AND reservado_en<now()-interval '5 minutes';
 -- Cambios de correo, baja, desuscripción y deuda pagada antes de despachar se respetan.
 UPDATE public.email_destinatarios e SET estado_envio='excluido',motivo='El destinatario dejó de cumplir las condiciones antes del envío'
 FROM public.email_logs l WHERE e.email_log_id=l.id AND e.estado_envio='pendiente' AND NOT EXISTS (
  SELECT 1 FROM public.socios s WHERE s.id=e.socio_id AND (s.estado='activo' OR l.tipo='deuda') AND NOT s.email_invalido
   AND lower(btrim(s.email))=lower(btrim(e.email))
   AND (s.acepta_comunicaciones OR l.incluir_desuscriptos)
   AND (l.tipo<>'deuda' OR EXISTS (SELECT 1 FROM public.cuotas q WHERE q.socio_id=s.id AND q.estado='pendiente' AND q.monto>0)));
 SELECT greatest(0,50-count(*))::int INTO v_libres FROM public.email_destinatarios
 WHERE reservado_en>now()-interval '1 minute';
 FOR v_log IN SELECT id FROM public.email_logs WHERE estado='procesando' LOOP
  PERFORM private.actualizar_estado_correo(v_log);
 END LOOP;
 -- Evita ráfagas si dos invocaciones del worker coinciden.
 IF EXISTS (SELECT 1 FROM public.email_destinatarios WHERE reservado_en>now()-interval '600 milliseconds') THEN RETURN; END IF;
 RETURN QUERY WITH candidatos AS (
  SELECT id FROM public.email_destinatarios WHERE estado_envio='pendiente'
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT least(v_libres,1)
 ) UPDATE public.email_destinatarios e SET estado_envio='procesando',proveedor=p_proveedor,
  reservado_en=now(),reserva_id=gen_random_uuid() FROM candidatos c WHERE e.id=c.id RETURNING e.*;
END; $function$;

REVOKE ALL ON FUNCTION "public"."reservar_correos"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.tramo_proporcional (
  p_fecha date,
  p_mes   integer,
  p_anio  integer
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
  AS $function$
SELECT CASE
  WHEN p_fecha < make_date(p_anio, p_mes, 1) THEN 100
  WHEN p_fecha > (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date THEN 0
  WHEN extract(day FROM p_fecha) <= 10 THEN 100
  WHEN extract(day FROM p_fecha) <= 20 THEN 50
  ELSE 25
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_comprobantes_integridad()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_pago public.pagos%ROWTYPE;
  v_origen public.comprobantes%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se borran comprobantes: se conserva su historial';
  END IF;
  IF TG_OP = 'UPDATE' AND
     (NEW.id IS DISTINCT FROM OLD.id
      OR NEW.pago_id IS DISTINCT FROM OLD.pago_id
      OR NEW.tipo IS DISTINCT FROM OLD.tipo
      OR NEW.comprobante_origen_id IS DISTINCT FROM OLD.comprobante_origen_id
      OR NEW.punto_venta IS DISTINCT FROM OLD.punto_venta
      OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'La identidad y el origen del comprobante son inmutables';
  END IF;
  IF NEW.tipo = 'nota_credito' AND TG_OP = 'INSERT' THEN
    -- Mismo orden pago -> factura que las operaciones de anulación/reapertura.
    SELECT * INTO v_pago FROM public.pagos WHERE id = NEW.pago_id FOR UPDATE;
    IF NOT FOUND OR v_pago.estado <> 'anulado' THEN
      RAISE EXCEPTION 'Una nota de credito requiere un pago anulado';
    END IF;
    SELECT * INTO v_origen FROM public.comprobantes
    WHERE id = NEW.comprobante_origen_id FOR UPDATE;
    IF NOT FOUND
       OR v_origen.tipo <> 'factura'
       OR v_origen.pago_id <> NEW.pago_id
       OR v_origen.punto_venta <> NEW.punto_venta
       OR NULLIF(btrim(v_origen.cae), '') IS NULL
       OR v_origen.estado_fiscal <> 'anulacion_pendiente' THEN
      RAISE EXCEPTION 'El origen de la NC debe ser la factura autorizada del mismo pago';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_cuotas_campos_inmutables()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se borran cuotas: se conserva la deuda y el historial';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.socio_id IS DISTINCT FROM OLD.socio_id
     OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id
     OR NEW.periodo_mes IS DISTINCT FROM OLD.periodo_mes
     OR NEW.periodo_anio IS DISTINCT FROM OLD.periodo_anio
     OR NEW.monto IS DISTINCT FROM OLD.monto THEN
    RAISE EXCEPTION 'Campos inmutables de la cuota: solo puede cambiar su estado (snapshot de arancel, CU-03.5)';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_gastos_edicion_mismo_dia()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_rol public.rol_usuario;
  v_ahora timestamptz;
  v_dia_registro date;
  v_operativos_cambiaron boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se permite borrar gastos: utilice la anulacion con motivo';
  END IF;

  v_rol := private.require_operador();
  v_ahora := clock_timestamp();

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IS DISTINCT FROM 'activo'::public.estado_gasto
       OR NEW.motivo_anulacion IS NOT NULL
       OR NEW.anulado_at IS NOT NULL OR NEW.anulado_por IS NOT NULL THEN
      RAISE EXCEPTION 'Un gasto nuevo debe estar activo y sin datos de anulacion';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.categorias_gasto
      WHERE id = NEW.categoria_id AND estado = 'activo'
    ) THEN
      RAISE EXCEPTION 'La categoria del gasto debe existir y estar activa';
    END IF;
    NEW.usuario_id := auth.uid();
    NEW.created_at := v_ahora;
    NEW.updated_at := v_ahora;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'No se modifican el identificador, autor ni fecha de carga del gasto';
  END IF;
  IF OLD.estado = 'anulado' THEN
    RAISE EXCEPTION 'Un gasto anulado no se puede modificar ni reactivar';
  END IF;

  v_dia_registro := (OLD.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_operativos_cambiaron := ROW(
    NEW.fecha, NEW.categoria_id, NEW.concepto, NEW.monto, NEW.metodo_pago,
    NEW.referencia_banco, NEW.descripcion, NEW.evidencia_url
  ) IS DISTINCT FROM ROW(
    OLD.fecha, OLD.categoria_id, OLD.concepto, OLD.monto, OLD.metodo_pago,
    OLD.referencia_banco, OLD.descripcion, OLD.evidencia_url
  );

  IF NEW.estado = 'anulado' THEN
    IF v_operativos_cambiaron THEN
      RAISE EXCEPTION 'La anulacion conserva los datos originales del gasto';
    END IF;
    IF v_rol = 'responsable'
       AND v_dia_registro <> (v_ahora AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'Solo un Administrador puede anular gastos de dias anteriores';
    END IF;
    IF NEW.motivo_anulacion IS NULL OR btrim(NEW.motivo_anulacion) = '' THEN
      RAISE EXCEPTION 'El motivo de anulacion es obligatorio';
    END IF;
    NEW.motivo_anulacion := btrim(NEW.motivo_anulacion);
    NEW.anulado_at := v_ahora;
    NEW.anulado_por := auth.uid();
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at
     OR NEW.anulado_por IS DISTINCT FROM OLD.anulado_por
     OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion THEN
    RAISE EXCEPTION 'Los datos de anulacion solo se completan al anular el gasto';
  END IF;
  IF v_dia_registro <> (v_ahora AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
    RAISE EXCEPTION 'Los gastos de dias anteriores se corrigen por anulacion y nuevo registro';
  END IF;
  IF NEW.categoria_id IS DISTINCT FROM OLD.categoria_id
     AND NOT EXISTS (
       SELECT 1 FROM public.categorias_gasto
       WHERE id = NEW.categoria_id AND estado = 'activo'
     ) THEN
    RAISE EXCEPTION 'La nueva categoria del gasto debe existir y estar activa';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_pagos_campos_inmutables()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_rol public.rol_usuario;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se borran pagos: se conserva su historial';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.cuota_id IS DISTINCT FROM OLD.cuota_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.monto IS DISTINCT FROM OLD.monto
     OR NEW.medio_pago IS DISTINCT FROM OLD.medio_pago
     OR NEW.referencia_pago IS DISTINCT FROM OLD.referencia_pago
     OR NEW.fecha_pago IS DISTINCT FROM OLD.fecha_pago
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Los datos originales del pago son inmutables';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    v_rol := private.require_operador();
    IF OLD.estado <> 'completado' OR NEW.estado <> 'anulado' THEN
      RAISE EXCEPTION 'Transicion de pago no permitida';
    END IF;
    IF v_rol = 'responsable'
       AND (OLD.fecha_pago AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
           <> (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
      RAISE EXCEPTION 'El Responsable solo puede anular cobros del dia';
    END IF;
    IF NULLIF(btrim(NEW.motivo_anulacion), '') IS NULL THEN
      RAISE EXCEPTION 'El motivo de anulacion es obligatorio';
    END IF;
    NEW.anulado_at := clock_timestamp();
    NEW.anulado_por := auth.uid();
    NEW.motivo_anulacion := btrim(NEW.motivo_anulacion);
  ELSIF NEW.anulado_at IS DISTINCT FROM OLD.anulado_at
     OR NEW.anulado_por IS DISTINCT FROM OLD.anulado_por
     OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion THEN
    RAISE EXCEPTION 'La auditoria de anulacion del pago es inmutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_socios_campos_inmutables()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.numero_socio IS DISTINCT FROM OLD.numero_socio
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'La identidad y la fecha de registro del socio son inmutables';
  END IF;

  IF NEW.dni IS DISTINCT FROM OLD.dni THEN
    PERFORM private.require_operador(true);
    NEW.dni_anterior := OLD.dni;
    NEW.dni_corregido_at := now();
    NEW.dni_corregido_por := auth.uid();
  ELSIF ROW(NEW.dni_anterior, NEW.dni_corregido_at, NEW.dni_corregido_por)
        IS DISTINCT FROM
        ROW(OLD.dni_anterior, OLD.dni_corregido_at, OLD.dni_corregido_por) THEN
    RAISE EXCEPTION 'La auditoria del DNI solo cambia al corregir el DNI';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_socios_validar_datos()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  -- La correccion de email ya prevista en CU-01.2 restablece su validez.
  -- El cliente no necesita permiso para editar email_invalido por separado.
  IF TG_OP = 'UPDATE' AND NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_invalido := false;
  END IF;
  IF NEW.fecha_nacimiento > v_hoy THEN
    RAISE EXCEPTION 'La fecha de nacimiento no puede ser futura';
  END IF;
  IF age(v_hoy, NEW.fecha_nacimiento) < interval '18 years'
     AND (
       NULLIF(btrim(NEW.contacto_emergencia_nombre), '') IS NULL
       OR NULLIF(btrim(NEW.contacto_emergencia_telefono), '') IS NULL
     ) THEN
    RAISE EXCEPTION 'Los menores requieren nombre y telefono de contacto de emergencia';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_usuarios_email_solo_flujo_admin()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'El correo del perfil se sincroniza desde Supabase Auth';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$function$;

ALTER TABLE "public"."comprobantes"
  ADD CONSTRAINT "chk_nc_origen"
    CHECK ((((tipo = 'factura'::public.tipo_comprobante) AND (comprobante_origen_id IS NULL)) OR ((tipo = 'nota_credito'::public.tipo_comprobante) AND (comprobante_origen_id IS
    NOT NULL))));

ALTER TABLE "public"."comprobantes"
  ADD CONSTRAINT "comprobantes_comprobante_origen_id_fkey" FOREIGN KEY (comprobante_origen_id) REFERENCES public.comprobantes(id) ON DELETE RESTRICT;

ALTER TABLE "public"."comprobantes"
  ADD CONSTRAINT "unique_comprobante_pv_tipo_num" UNIQUE (punto_venta, tipo, numero_comprobante);

ALTER TABLE "public"."cuotas"
  ADD CONSTRAINT "cuotas_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE RESTRICT;

ALTER TABLE "public"."categorias"
  ADD CONSTRAINT "categorias_deporte_id_fkey" FOREIGN KEY (deporte_id) REFERENCES public.deportes(id) ON DELETE RESTRICT;

ALTER TABLE "public"."email_eventos"
  ADD CONSTRAINT "email_eventos_destinatario_id_fkey" FOREIGN KEY (destinatario_id) REFERENCES public.email_destinatarios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."email_destinatarios"
  ADD CONSTRAINT "email_destinatarios_email_log_id_fkey" FOREIGN KEY (email_log_id) REFERENCES public.email_logs(id) ON DELETE CASCADE;

ALTER TABLE "public"."gastos"
  ADD CONSTRAINT "chk_gasto_anulacion"
    CHECK
    ((((estado = 'activo'::public.estado_gasto) AND (anulado_at IS NULL) AND (anulado_por IS NULL) AND (motivo_anulacion IS NULL)) OR ((estado = 'anulado'::public.estado_gasto) AND
    (anulado_at IS NOT NULL) AND (anulado_por IS NOT NULL) AND (motivo_anulacion IS NOT NULL) AND (btrim(motivo_anulacion) <> ''::text))));

ALTER TABLE "public"."gastos"
  ADD CONSTRAINT "chk_gastos_transferencia_referencia" CHECK (((metodo_pago <> 'transferencia'::public.medio_pago) OR (NULLIF(btrim((referencia_banco)::text), ''::text) IS
    NOT NULL)));

ALTER TABLE "public"."gastos"
  ADD CONSTRAINT "gastos_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES public.categorias_gasto(id) ON DELETE RESTRICT;

ALTER TABLE "public"."inscripciones"
  ADD CONSTRAINT "chk_inscripcion_estado_fecha"
    CHECK ((((estado = 'activa'::public.estado_inscripcion) AND (fecha_baja IS NULL)) OR ((estado = 'inactiva'::public.estado_inscripcion) AND (fecha_baja IS NOT NULL))));

ALTER TABLE "public"."inscripciones"
  ADD CONSTRAINT "inscripciones_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE RESTRICT;

ALTER TABLE "public"."pagos"
  ADD CONSTRAINT "chk_pago_anulacion"
    CHECK
    ((((estado = 'completado'::public.estado_pago) AND (anulado_at IS NULL) AND (anulado_por IS NULL) AND (motivo_anulacion IS NULL)) OR ((estado = 'anulado'::public.estado_pago)
    AND (anulado_at IS NOT NULL) AND (anulado_por IS NOT NULL) AND (motivo_anulacion IS NOT NULL) AND (btrim(motivo_anulacion) <> ''::text))));

ALTER TABLE "public"."pagos"
  ADD CONSTRAINT "pagos_cuota_id_fkey" FOREIGN KEY (cuota_id) REFERENCES public.cuotas(id) ON DELETE RESTRICT;

ALTER TABLE "public"."comprobantes"
  ADD CONSTRAINT "comprobantes_pago_id_fkey" FOREIGN KEY (pago_id) REFERENCES public.pagos(id) ON DELETE RESTRICT;

ALTER TABLE "public"."email_logs"
  ADD CONSTRAINT "email_logs_plantilla_id_fkey" FOREIGN KEY (plantilla_id) REFERENCES public.plantillas_correo(id) ON DELETE RESTRICT;

ALTER TABLE "public"."socios"
  ADD CONSTRAINT "chk_estado_fecha_baja"
    CHECK ((((estado = 'activo'::public.estado_basico) AND (fecha_baja IS NULL)) OR ((estado = 'inactivo'::public.estado_basico) AND (fecha_baja IS NOT NULL))));

ALTER TABLE "public"."cuotas"
  ADD CONSTRAINT "cuotas_socio_id_fkey" FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."email_destinatarios"
  ADD CONSTRAINT "email_destinatarios_socio_id_fkey" FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE SET NULL;

ALTER TABLE "public"."inscripciones"
  ADD CONSTRAINT "inscripciones_socio_id_fkey" FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."usuarios"
  ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."email_logs"
  ADD CONSTRAINT "email_logs_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."gastos"
  ADD CONSTRAINT "gastos_anulado_por_fkey" FOREIGN KEY (anulado_por) REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."gastos"
  ADD CONSTRAINT "gastos_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."pagos"
  ADD CONSTRAINT "pagos_anulado_por_fkey" FOREIGN KEY (anulado_por) REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."pagos"
  ADD CONSTRAINT "pagos_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."socios"
  ADD CONSTRAINT "socios_dni_corregido_por_fkey" FOREIGN KEY (dni_corregido_por) REFERENCES public.usuarios(id) ON DELETE RESTRICT;

CREATE VIEW "public"."flujo_caja" WITH (security_invoker=true) AS  SELECT 'ingreso'::text AS tipo_movimiento,
    p.id AS movimiento_id,
    p.fecha_pago AS fecha,
    p.monto,
    p.medio_pago AS metodo,
    p.referencia_pago AS referencia,
    'Cobro Cuota'::character varying AS concepto,
    (p.estado)::text AS estado,
    p.usuario_id,
    false AS es_reverso
   FROM public.pagos p
  WHERE (p.estado = ANY (ARRAY['completado'::public.estado_pago, 'anulado'::public.estado_pago]))
UNION ALL
 SELECT 'egreso'::text AS tipo_movimiento,
    g.id AS movimiento_id,
    ((g.fecha)::timestamp without time zone AT TIME ZONE 'America/Argentina/Buenos_Aires'::text) AS fecha,
    g.monto,
    g.metodo_pago AS metodo,
    g.referencia_banco AS referencia,
    g.concepto,
    (g.estado)::text AS estado,
    g.usuario_id,
    false AS es_reverso
   FROM public.gastos g
UNION ALL
 SELECT 'egreso'::text AS tipo_movimiento,
    p.id AS movimiento_id,
    p.anulado_at AS fecha,
    p.monto,
    p.medio_pago AS metodo,
    p.referencia_pago AS referencia,
    'Anulacion de cobro'::character varying AS concepto,
    (p.estado)::text AS estado,
    p.anulado_por AS usuario_id,
    true AS es_reverso
   FROM public.pagos p
  WHERE (p.estado = 'anulado'::public.estado_pago)
UNION ALL
 SELECT 'ingreso'::text AS tipo_movimiento,
    g.id AS movimiento_id,
    g.anulado_at AS fecha,
    g.monto,
    g.metodo_pago AS metodo,
    g.referencia_banco AS referencia,
    'Anulacion de gasto'::character varying AS concepto,
    (g.estado)::text AS estado,
    g.anulado_por AS usuario_id,
    true AS es_reverso
   FROM public.gastos g
  WHERE (g.estado = 'anulado'::public.estado_gasto);

CREATE VIEW "public"."v_morosidad_por_deporte" WITH (security_invoker=true) AS  SELECT d.id AS deporte_id,
    d.nombre AS deporte,
    (count(*))::integer AS cuotas_morosas,
    COALESCE(sum(q.monto), (0)::numeric) AS deuda_morosa
   FROM ((public.deportes d
     JOIN public.categorias c ON ((c.deporte_id = d.id)))
     JOIN public.cuotas q ON ((q.categoria_id = c.id)))
  WHERE ((q.estado = 'pendiente'::public.estado_cuota) AND (q.created_at < (now() - '30 days'::interval)))
  GROUP BY d.id, d.nombre;

CREATE VIEW "public"."v_pagos_etiqueta_fiscal" WITH (security_invoker=true) AS  SELECT p.id,
    p.cuota_id,
    p.usuario_id,
    p.monto,
    p.medio_pago,
    p.referencia_pago,
    p.fecha_pago,
    p.estado AS estado_pago,
    c.id AS comprobante_id,
    c.tipo AS tipo_comprobante,
    c.numero_comprobante,
    c.estado_fiscal,
    c.intentos_reintento,
    c.proximo_reintento_en,
    s.id AS socio_id,
    s.dni AS socio_dni,
    s.nombre AS socio_nombre,
    s.apellido AS socio_apellido,
    s.estado AS socio_estado,
        CASE
            WHEN (p.estado = 'anulado'::public.estado_pago) THEN 'anulado'::text
            WHEN (c.estado_fiscal = 'valido'::public.estado_fiscal) THEN 'activo'::text
            WHEN (c.estado_fiscal = ANY (ARRAY['pendiente_cae'::public.estado_fiscal, 'anulacion_pendiente'::public.estado_fiscal])) THEN 'pendiente_cae'::text
            ELSE 'fallido'::text
        END AS etiqueta_recibo
   FROM (((public.pagos p
     JOIN public.comprobantes c ON (((c.pago_id = p.id) AND (c.tipo = 'factura'::public.tipo_comprobante))))
     JOIN public.cuotas q ON ((q.id = p.cuota_id)))
     JOIN public.socios s ON ((s.id = q.socio_id)));

CREATE VIEW "public"."v_socios_estado_pago" WITH (security_invoker=true) AS  SELECT s.id,
    s.numero_socio,
    s.dni,
    s.dni_anterior,
    s.dni_corregido_at,
    s.dni_corregido_por,
    s.nombre,
    s.apellido,
    s.fecha_nacimiento,
    s.email,
    s.telefono,
    s.direccion,
    s.foto_url,
    s.estado,
    s.acepta_comunicaciones,
    s.email_invalido,
    s.contacto_emergencia_nombre,
    s.contacto_emergencia_telefono,
    s.fecha_alta,
    s.fecha_baja,
    s.created_at,
    s.updated_at,
    m.es_moroso,
        CASE
            WHEN m.es_moroso THEN 'moroso'::text
            ELSE 'al_dia'::text
        END AS estado_pago,
    d.pendientes_count,
    d.deuda_pendiente
   FROM ((public.socios s
     CROSS JOIN LATERAL ( SELECT public.es_socio_moroso(s.id) AS es_moroso) m)
     CROSS JOIN LATERAL ( SELECT (count(*))::integer AS pendientes_count,
            COALESCE(sum(cuotas.monto), (0)::numeric) AS deuda_pendiente
           FROM public.cuotas
          WHERE ((cuotas.socio_id = s.id) AND (cuotas.estado = 'pendiente'::public.estado_cuota))) d);

CREATE INDEX email_destinatarios_cola_idx ON public.email_destinatarios USING btree (created_at, id)
  WHERE (estado_envio = 'pendiente'::text);

CREATE INDEX email_destinatarios_reserva_idx ON public.email_destinatarios USING btree (reservado_en);

CREATE INDEX email_eventos_message_idx ON public.email_eventos USING btree (proveedor, provider_message_id);

CREATE INDEX idx_categorias_deporte ON public.categorias USING btree (deporte_id);

CREATE INDEX idx_comprobantes_pago ON public.comprobantes USING btree (pago_id);

CREATE INDEX idx_comprobantes_reintento ON public.comprobantes USING btree (proximo_reintento_en)
  WHERE (estado_fiscal = ANY (ARRAY['pendiente_cae'::public.estado_fiscal, 'anulacion_pendiente'::public.estado_fiscal]));

CREATE INDEX idx_cuotas_estado ON public.cuotas USING btree (estado);

CREATE INDEX idx_cuotas_pendientes_socio ON public.cuotas USING btree (socio_id)
  WHERE (estado = 'pendiente'::public.estado_cuota);

CREATE INDEX idx_cuotas_periodo ON public.cuotas USING btree (periodo_mes, periodo_anio);

CREATE INDEX idx_email_dest_email ON public.email_destinatarios USING btree (email);

CREATE INDEX idx_email_dest_log ON public.email_destinatarios USING btree (email_log_id);

CREATE INDEX idx_email_logs_fecha ON public.email_logs USING btree (fecha_envio);

CREATE INDEX idx_gastos_descripcion_trgm ON public.gastos USING gin (descripcion extensions.gin_trgm_ops);

CREATE INDEX idx_gastos_fecha ON public.gastos USING btree (fecha);

CREATE UNIQUE INDEX idx_inscripcion_activa_unica ON public.inscripciones USING btree (socio_id, categoria_id)
  WHERE (estado = 'activa'::public.estado_inscripcion);

CREATE INDEX idx_pagos_cuota ON public.pagos USING btree (cuota_id);

CREATE INDEX idx_pagos_fecha ON public.pagos USING btree (fecha_pago);

CREATE INDEX idx_socios_apellido ON public.socios USING btree (apellido);

CREATE INDEX idx_socios_dni ON public.socios USING btree (dni);

CREATE INDEX idx_socios_numero ON public.socios USING btree (numero_socio);

CREATE UNIQUE INDEX uq_factura_por_pago ON public.comprobantes USING btree (pago_id)
  WHERE (tipo = 'factura'::public.tipo_comprobante);

CREATE UNIQUE INDEX uq_job_exitoso ON public.cuota_job_logs USING btree (periodo_mes, periodo_anio)
  WHERE (estado = 'exitoso'::public.estado_job);

CREATE UNIQUE INDEX uq_nc_por_comprobante_origen ON public.comprobantes USING btree (comprobante_origen_id)
  WHERE (tipo = 'nota_credito'::public.tipo_comprobante);

CREATE UNIQUE INDEX uq_pago_vigente_por_cuota ON public.pagos USING btree (cuota_id)
  WHERE (estado = 'completado'::public.estado_pago);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text))
  EXECUTE FUNCTION public.handle_auth_user_email_changed();

CREATE TRIGGER categorias_estructura_consistente
  BEFORE INSERT OR UPDATE ON public.categorias
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_categorias_estructura_consistente();

CREATE TRIGGER categorias_no_borrar
  BEFORE DELETE ON public.categorias
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_impedir_borrado_historico();

CREATE TRIGGER estructura_serializada_categorias
  BEFORE INSERT OR DELETE OR UPDATE ON public.categorias
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.trg_bloquear_estructura_deportiva();

CREATE TRIGGER update_categorias_modtime
  BEFORE UPDATE ON public.categorias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_categorias_gasto_modtime
  BEFORE UPDATE ON public.categorias_gasto
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_club_modtime
  BEFORE UPDATE ON public.club
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER comprobantes_integridad
  BEFORE INSERT OR DELETE OR UPDATE ON public.comprobantes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_comprobantes_integridad();

CREATE TRIGGER update_comprobantes_modtime
  BEFORE UPDATE ON public.comprobantes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER cuotas_inmutabilidad
  BEFORE DELETE OR UPDATE ON public.cuotas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cuotas_campos_inmutables();

CREATE TRIGGER update_cuotas_modtime
  BEFORE UPDATE ON public.cuotas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER deportes_baja_consistente
  BEFORE INSERT OR UPDATE ON public.deportes
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_deportes_baja_consistente();

CREATE TRIGGER deportes_no_borrar
  BEFORE DELETE ON public.deportes
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_impedir_borrado_historico();

CREATE TRIGGER estructura_serializada_deportes
  BEFORE INSERT OR DELETE OR UPDATE ON public.deportes
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.trg_bloquear_estructura_deportiva();

CREATE TRIGGER update_deportes_modtime
  BEFORE UPDATE ON public.deportes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER gastos_edicion_ventana
  BEFORE INSERT OR DELETE OR UPDATE ON public.gastos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_gastos_edicion_mismo_dia();

CREATE TRIGGER update_gastos_modtime
  BEFORE UPDATE ON public.gastos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER estructura_serializada_inscripciones
  BEFORE INSERT OR DELETE OR UPDATE ON public.inscripciones
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.trg_bloquear_estructura_deportiva();

CREATE TRIGGER inscripciones_estructura_consistente
  BEFORE INSERT OR UPDATE ON public.inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_inscripciones_estructura_consistente();

CREATE TRIGGER inscripciones_no_borrar
  BEFORE DELETE ON public.inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_impedir_borrado_historico();

CREATE TRIGGER update_inscripciones_modtime
  BEFORE UPDATE ON public.inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER pagos_inmutabilidad
  BEFORE DELETE OR UPDATE ON public.pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_pagos_campos_inmutables();

CREATE TRIGGER update_pagos_modtime
  BEFORE UPDATE ON public.pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plantillas_correo_modtime
  BEFORE UPDATE ON public.plantillas_correo
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER estructura_serializada_socios
  BEFORE INSERT OR DELETE OR UPDATE ON public.socios
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.trg_bloquear_estructura_deportiva();

CREATE TRIGGER socios_baja_consistente
  BEFORE INSERT OR UPDATE ON public.socios
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_socios_baja_consistente();

CREATE TRIGGER socios_inmutabilidad
  BEFORE UPDATE ON public.socios
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_socios_campos_inmutables();

CREATE TRIGGER socios_no_borrar
  BEFORE DELETE ON public.socios
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_impedir_borrado_historico();

CREATE TRIGGER socios_validacion_datos
  BEFORE INSERT OR UPDATE ON public.socios
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_socios_validar_datos();

CREATE TRIGGER update_socios_modtime
  BEFORE UPDATE ON public.socios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_usuarios_modtime
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER usuarios_email_sync_guard
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_usuarios_email_solo_flujo_admin();

CREATE POLICY "categorias_insert_admin" ON "public"."categorias"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "categorias_select" ON "public"."categorias"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "categorias_update_admin" ON "public"."categorias"
  FOR UPDATE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario))
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "categorias_gasto_delete_admin" ON "public"."categorias_gasto"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "categorias_gasto_insert_admin" ON "public"."categorias_gasto"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "categorias_gasto_select" ON "public"."categorias_gasto"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "categorias_gasto_update_admin" ON "public"."categorias_gasto"
  FOR UPDATE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario))
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "club_insert_admin" ON "public"."club"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "club_select" ON "public"."club"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "club_update_admin" ON "public"."club"
  FOR UPDATE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario))
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "comprobantes_select" ON "public"."comprobantes"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "cuota_job_logs_select_admin" ON "public"."cuota_job_logs"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "cuotas_select" ON "public"."cuotas"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "deportes_insert_admin" ON "public"."deportes"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "deportes_select" ON "public"."deportes"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "deportes_update_admin" ON "public"."deportes"
  FOR UPDATE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario))
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "email_destinatarios_select" ON "public"."email_destinatarios"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "email_eventos_select" ON "public"."email_eventos"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "email_logs_select" ON "public"."email_logs"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "gastos_insert" ON "public"."gastos"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((private.get_rol() IS NOT NULL) AND (usuario_id = ( SELECT auth.uid() AS uid)) AND (estado = 'activo'::public.estado_gasto)));

CREATE POLICY "gastos_select" ON "public"."gastos"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "gastos_update" ON "public"."gastos"
  FOR UPDATE
  TO "authenticated"
  USING (((private.get_rol() IS
    NOT NULL) AND (estado = 'activo'::public.estado_gasto) AND
    (((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date = ((clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date)))
  WITH CHECK (((private.get_rol() IS
    NOT NULL) AND (estado = 'activo'::public.estado_gasto) AND
    (((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date = ((clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date)));

CREATE POLICY "inscripciones_select" ON "public"."inscripciones"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "pagos_select" ON "public"."pagos"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "plantillas_correo_delete_admin" ON "public"."plantillas_correo"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "plantillas_correo_insert" ON "public"."plantillas_correo"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "plantillas_correo_select" ON "public"."plantillas_correo"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "plantillas_correo_update" ON "public"."plantillas_correo"
  FOR UPDATE
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL))
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "socios_insert" ON "public"."socios"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "socios_select" ON "public"."socios"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "socios_update" ON "public"."socios"
  FOR UPDATE
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL))
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "usuarios_select" ON "public"."usuarios"
  FOR SELECT
  TO "authenticated"
  USING (((id = ( SELECT auth.uid() AS uid)) OR (private.get_rol() = 'admin'::public.rol_usuario)));

CREATE POLICY "usuarios_update_admin" ON "public"."usuarios"
  FOR UPDATE
  TO "authenticated"
  USING (((private.get_rol() = 'admin'::public.rol_usuario) AND (id <> ( SELECT auth.uid() AS uid))))
  WITH CHECK (((private.get_rol() = 'admin'::public.rol_usuario) AND (id <> ( SELECT auth.uid() AS uid))));

COMMENT ON EXTENSION "pg_trgm" IS 'text similarity measurement and index searching based on trigrams';

REVOKE ALL ON FUNCTION "private"."actualizar_estado_correo"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."actualizar_estado_correo"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."aplicar_eventos_correo"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."aplicar_eventos_correo"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."bloquear_estructura_deportiva"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."bloquear_estructura_deportiva"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."correo_etiquetas"(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."correo_etiquetas"(text, jsonb) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."get_rol"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_rol"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."require_operador"(boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."require_operador"(boolean) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."trg_bloquear_estructura_deportiva"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."trg_bloquear_estructura_deportiva"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."trg_categorias_estructura_consistente"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."trg_categorias_estructura_consistente"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."trg_deportes_baja_consistente"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."trg_deportes_baja_consistente"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."trg_impedir_borrado_historico"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."trg_impedir_borrado_historico"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."trg_inscripciones_estructura_consistente"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."trg_inscripciones_estructura_consistente"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."trg_socios_baja_consistente"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."trg_socios_baja_consistente"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."anular_gasto"(uuid, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."anular_pago"(uuid, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."baja_categoria"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."baja_deporte"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."baja_inscripcion"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."baja_socio"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."categoria_edad_fuera_de_rango"(date, date, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."categoria_edad_fuera_de_rango"(date, date, integer, integer) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."categorias_rango_superpuesto"(uuid, integer, integer, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."categorias_rango_superpuesto"(uuid, integer, integer, uuid) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."cobrar_cuota"(uuid, uuid, public.medio_pago, character varying) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."confirmar_inscripcion"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."crear_comunicacion"(jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cuit_valido"(character varying) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cuit_valido"(character varying) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cuota_proporcional"(date, integer, integer, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cuota_proporcional"(date, integer, integer, numeric) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cuotas_del_periodo"(uuid, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cuotas_del_periodo"(uuid, integer, integer) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."desuscribir_correo"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."es_socio_moroso"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."es_socio_moroso"(uuid) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."finalizar_correo"(uuid, uuid, text, text, text) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."generar_cuotas_mes_actual"() TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."generar_cuotas_mes_manual"() TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_auth_user_email_changed"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."previsualizar_inscripcion"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."previsualizar_inscripcion"(uuid, uuid) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."reabrir_regularizacion_fiscal"(uuid) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."reactivar_socio"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."registrar_evento_correo"(text, text, text, timestamp WITH time zone, text) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."reservar_correos"(text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."tramo_proporcional"(date, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."tramo_proporcional"(date, integer, integer) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_comprobantes_integridad"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_cuotas_campos_inmutables"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_gastos_edicion_mismo_dia"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_pagos_campos_inmutables"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_socios_campos_inmutables"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_socios_validar_datos"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_usuarios_email_solo_flujo_admin"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

GRANT CREATE, USAGE ON SCHEMA "private" TO "postgres";

GRANT USAGE ON SCHEMA "private" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."socios_numero_socio_seq" TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."categorias" FROM "anon";

GRANT SELECT ON TABLE "public"."categorias" TO "anon";

REVOKE ALL ("arancel_mensual") ON TABLE "public"."categorias" FROM "authenticated";

GRANT INSERT ("arancel_mensual"), UPDATE ("arancel_mensual") ON TABLE "public"."categorias" TO "authenticated";

REVOKE ALL ("deporte_id") ON TABLE "public"."categorias" FROM "authenticated";

GRANT INSERT ("deporte_id") ON TABLE "public"."categorias" TO "authenticated";

REVOKE ALL ("edad_max") ON TABLE "public"."categorias" FROM "authenticated";

GRANT INSERT ("edad_max"), UPDATE ("edad_max") ON TABLE "public"."categorias" TO "authenticated";

REVOKE ALL ("edad_min") ON TABLE "public"."categorias" FROM "authenticated";

GRANT INSERT ("edad_min"), UPDATE ("edad_min") ON TABLE "public"."categorias" TO "authenticated";

REVOKE ALL ("nombre") ON TABLE "public"."categorias" FROM "authenticated";

GRANT INSERT ("nombre"), UPDATE ("nombre") ON TABLE "public"."categorias" TO "authenticated";

REVOKE ALL ON TABLE "public"."categorias" FROM "authenticated";

GRANT SELECT ON TABLE "public"."categorias" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categorias" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."categorias_gasto" FROM "anon";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."categorias_gasto" TO "anon";

REVOKE ALL ON TABLE "public"."categorias_gasto" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."categorias_gasto" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categorias_gasto" TO "postgres", "service_role";

REVOKE ALL ("certificado_vencimiento") ON TABLE "public"."club" FROM "authenticated";

GRANT SELECT ("certificado_vencimiento") ON TABLE "public"."club" TO "authenticated";

REVOKE ALL ("cuit") ON TABLE "public"."club" FROM "authenticated";

GRANT INSERT ("cuit"), SELECT ("cuit"), UPDATE ("cuit") ON TABLE "public"."club" TO "authenticated";

REVOKE ALL ("domicilio_fiscal") ON TABLE "public"."club" FROM "authenticated";

GRANT INSERT ("domicilio_fiscal"), SELECT ("domicilio_fiscal"), UPDATE ("domicilio_fiscal") ON TABLE "public"."club" TO "authenticated";

REVOKE ALL ("email_contacto") ON TABLE "public"."club" FROM "authenticated";

GRANT INSERT ("email_contacto"), SELECT ("email_contacto"), UPDATE ("email_contacto") ON TABLE "public"."club" TO "authenticated";

REVOKE ALL ("id") ON TABLE "public"."club" FROM "authenticated";

GRANT SELECT ("id") ON TABLE "public"."club" TO "authenticated";

REVOKE ALL ("logo_url") ON TABLE "public"."club" FROM "authenticated";

GRANT INSERT ("logo_url"), SELECT ("logo_url"), UPDATE ("logo_url") ON TABLE "public"."club" TO "authenticated";

REVOKE ALL ("nombre") ON TABLE "public"."club" FROM "authenticated";

GRANT INSERT ("nombre"), SELECT ("nombre"), UPDATE ("nombre") ON TABLE "public"."club" TO "authenticated";

REVOKE ALL ("punto_venta") ON TABLE "public"."club" FROM "authenticated";

GRANT INSERT ("punto_venta"), SELECT ("punto_venta"), UPDATE ("punto_venta") ON TABLE "public"."club" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."club" FROM "authenticated";

GRANT SELECT ("updated_at") ON TABLE "public"."club" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."comprobantes" FROM "anon";

GRANT SELECT ON TABLE "public"."comprobantes" TO "anon";

REVOKE ALL ON TABLE "public"."comprobantes" FROM "authenticated";

GRANT SELECT ON TABLE "public"."comprobantes" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."comprobantes" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."cuota_job_logs" FROM "anon";

GRANT SELECT ON TABLE "public"."cuota_job_logs" TO "anon";

REVOKE ALL ON TABLE "public"."cuota_job_logs" FROM "authenticated";

GRANT SELECT ON TABLE "public"."cuota_job_logs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cuota_job_logs" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."cuotas" FROM "anon";

GRANT SELECT ON TABLE "public"."cuotas" TO "anon";

REVOKE ALL ON TABLE "public"."cuotas" FROM "authenticated";

GRANT SELECT ON TABLE "public"."cuotas" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cuotas" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."deportes" FROM "anon";

GRANT SELECT ON TABLE "public"."deportes" TO "anon";

REVOKE ALL ("descripcion") ON TABLE "public"."deportes" FROM "authenticated";

GRANT INSERT ("descripcion"), UPDATE ("descripcion") ON TABLE "public"."deportes" TO "authenticated";

REVOKE ALL ("nombre") ON TABLE "public"."deportes" FROM "authenticated";

GRANT INSERT ("nombre"), UPDATE ("nombre") ON TABLE "public"."deportes" TO "authenticated";

REVOKE ALL ON TABLE "public"."deportes" FROM "authenticated";

GRANT SELECT ON TABLE "public"."deportes" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deportes" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."email_destinatarios" FROM "anon";

GRANT SELECT ON TABLE "public"."email_destinatarios" TO "anon";

REVOKE ALL ON TABLE "public"."email_destinatarios" FROM "authenticated";

GRANT SELECT ON TABLE "public"."email_destinatarios" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_destinatarios" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."email_eventos" FROM "authenticated";

GRANT SELECT ON TABLE "public"."email_eventos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_eventos" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."email_logs" FROM "anon";

GRANT SELECT ON TABLE "public"."email_logs" TO "anon";

REVOKE ALL ON TABLE "public"."email_logs" FROM "authenticated";

GRANT SELECT ON TABLE "public"."email_logs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_logs" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."gastos" FROM "anon";

GRANT SELECT ON TABLE "public"."gastos" TO "anon";

REVOKE ALL ("categoria_id") ON TABLE "public"."gastos" FROM "authenticated";

GRANT INSERT ("categoria_id"), UPDATE ("categoria_id") ON TABLE "public"."gastos" TO "authenticated";

REVOKE ALL ("concepto") ON TABLE "public"."gastos" FROM "authenticated";

GRANT INSERT ("concepto"), UPDATE ("concepto") ON TABLE "public"."gastos" TO "authenticated";

REVOKE ALL ("descripcion") ON TABLE "public"."gastos" FROM "authenticated";

GRANT INSERT ("descripcion"), UPDATE ("descripcion") ON TABLE "public"."gastos" TO "authenticated";

REVOKE ALL ("evidencia_url") ON TABLE "public"."gastos" FROM "authenticated";

GRANT INSERT ("evidencia_url"), UPDATE ("evidencia_url") ON TABLE "public"."gastos" TO "authenticated";

REVOKE ALL ("fecha") ON TABLE "public"."gastos" FROM "authenticated";

GRANT INSERT ("fecha"), UPDATE ("fecha") ON TABLE "public"."gastos" TO "authenticated";

REVOKE ALL ("metodo_pago") ON TABLE "public"."gastos" FROM "authenticated";

GRANT INSERT ("metodo_pago"), UPDATE ("metodo_pago") ON TABLE "public"."gastos" TO "authenticated";

REVOKE ALL ("monto") ON TABLE "public"."gastos" FROM "authenticated";

GRANT INSERT ("monto"), UPDATE ("monto") ON TABLE "public"."gastos" TO "authenticated";

REVOKE ALL ("referencia_banco") ON TABLE "public"."gastos" FROM "authenticated";

GRANT INSERT ("referencia_banco"), UPDATE ("referencia_banco") ON TABLE "public"."gastos" TO "authenticated";

REVOKE ALL ON TABLE "public"."gastos" FROM "authenticated";

GRANT SELECT ON TABLE "public"."gastos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gastos" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."inscripciones" FROM "anon";

GRANT SELECT ON TABLE "public"."inscripciones" TO "anon";

REVOKE ALL ON TABLE "public"."inscripciones" FROM "authenticated";

GRANT SELECT ON TABLE "public"."inscripciones" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inscripciones" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."pagos" FROM "anon";

GRANT SELECT ON TABLE "public"."pagos" TO "anon";

REVOKE ALL ON TABLE "public"."pagos" FROM "authenticated";

GRANT SELECT ON TABLE "public"."pagos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pagos" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."plantillas_correo" FROM "anon";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."plantillas_correo" TO "anon";

REVOKE ALL ON TABLE "public"."plantillas_correo" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."plantillas_correo" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."plantillas_correo" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."socios" FROM "anon";

GRANT SELECT ON TABLE "public"."socios" TO "anon";

REVOKE ALL ("acepta_comunicaciones") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("acepta_comunicaciones"), UPDATE ("acepta_comunicaciones") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("apellido") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("apellido"), UPDATE ("apellido") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("contacto_emergencia_nombre") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("contacto_emergencia_nombre"), UPDATE ("contacto_emergencia_nombre") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("contacto_emergencia_telefono") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("contacto_emergencia_telefono"), UPDATE ("contacto_emergencia_telefono") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("direccion") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("direccion"), UPDATE ("direccion") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("dni") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("dni"), UPDATE ("dni") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("email") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("email"), UPDATE ("email") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("fecha_nacimiento") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("fecha_nacimiento"), UPDATE ("fecha_nacimiento") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("foto_url") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("foto_url"), UPDATE ("foto_url") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("nombre") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("nombre"), UPDATE ("nombre") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ("telefono") ON TABLE "public"."socios" FROM "authenticated";

GRANT INSERT ("telefono"), UPDATE ("telefono") ON TABLE "public"."socios" TO "authenticated";

REVOKE ALL ON TABLE "public"."socios" FROM "authenticated";

GRANT SELECT ON TABLE "public"."socios" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."socios" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."usuarios" FROM "anon";

GRANT SELECT ON TABLE "public"."usuarios" TO "anon";

REVOKE ALL ("apellido") ON TABLE "public"."usuarios" FROM "authenticated";

GRANT UPDATE ("apellido") ON TABLE "public"."usuarios" TO "authenticated";

REVOKE ALL ("estado") ON TABLE "public"."usuarios" FROM "authenticated";

GRANT UPDATE ("estado") ON TABLE "public"."usuarios" TO "authenticated";

REVOKE ALL ("nombre") ON TABLE "public"."usuarios" FROM "authenticated";

GRANT UPDATE ("nombre") ON TABLE "public"."usuarios" TO "authenticated";

REVOKE ALL ("rol") ON TABLE "public"."usuarios" FROM "authenticated";

GRANT UPDATE ("rol") ON TABLE "public"."usuarios" TO "authenticated";

REVOKE ALL ON TABLE "public"."usuarios" FROM "authenticated";

GRANT SELECT ON TABLE "public"."usuarios" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."usuarios" TO "postgres", "service_role";

GRANT USAGE ON TYPE "public"."estado_basico" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_cuota" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_email" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_fiscal" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_gasto" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_inscripcion" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_job" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_pago" TO "postgres";

GRANT USAGE ON TYPE "public"."medio_pago" TO "postgres";

GRANT USAGE ON TYPE "public"."rol_usuario" TO "postgres";

GRANT USAGE ON TYPE "public"."tipo_comprobante" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."flujo_caja" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_morosidad_por_deporte" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_pagos_etiqueta_fiscal" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_socios_estado_pago" TO "anon", "authenticated", "postgres", "service_role";

ALTER TABLE "public"."club"
  ADD CONSTRAINT "chk_cuit_valido" CHECK (public.cuit_valido(cuit));

-- BEGIN ACL FINALES DESDE 5_POLITICS
-- Generado desde schemas/5_politics.sql; editar la fuente, no esta copia.
DROP POLICY IF EXISTS club_delete_admin ON public.club;

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

NOTIFY pgrst, 'reload schema';
-- END ACL FINALES DESDE 5_POLITICS

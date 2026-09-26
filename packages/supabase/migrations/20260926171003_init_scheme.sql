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
  CONSTRAINT "categorias_check" CHECK ((edad_max >= edad_min)),
  CONSTRAINT "categorias_deporte_id_nombre_key" UNIQUE (deporte_id, nombre),
  CONSTRAINT "categorias_edad_min_check" CHECK ((edad_min >= 0)),
  CONSTRAINT "categorias_pkey" PRIMARY KEY (id)
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

CREATE TABLE "public"."comprobantes" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "pago_id"               uuid                     NOT NULL,
  "comprobante_origen_id" uuid,
  "punto_venta"           integer                  NOT NULL DEFAULT 1,
  "numero_comprobante"    character varying(50),
  "cae"                   character varying(50),
  "cae_vencimiento"       date,
  "pdf_url"               text,
  "motivo_anulacion"      text,
  "intentos_reintento"    smallint                 NOT NULL DEFAULT 0,
  "proximo_reintento_en"  timestamp with time zone,
  "created_at"            timestamp with time zone DEFAULT now(),
  "updated_at"            timestamp with time zone DEFAULT now(),
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
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "email_log_id" uuid                     NOT NULL,
  "socio_id"     uuid,
  "email"        character varying(255)   NOT NULL,
  "event_id"     character varying(150),
  "created_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "email_destinatarios_event_id_key" UNIQUE (event_id),
  CONSTRAINT "email_destinatarios_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."email_destinatarios"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_logs" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plantilla_id"        uuid,
  "usuario_id"          uuid                     NOT NULL,
  "asunto"              character varying(255)   NOT NULL,
  "cuerpo"              text                     NOT NULL,
  "destinatarios_count" integer                  NOT NULL DEFAULT 0,
  "fecha_envio"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."email_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gastos" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "categoria_id"     uuid                     NOT NULL,
  "usuario_id"       uuid                     NOT NULL,
  "fecha"            date                     NOT NULL DEFAULT CURRENT_DATE,
  "concepto"         character varying(255)   NOT NULL,
  "monto"            numeric(10,2)            NOT NULL,
  "referencia_banco" character varying(255),
  "descripcion"      text,
  "evidencia_url"    text,
  "motivo_anulacion" text,
  "created_at"       timestamp with time zone DEFAULT now(),
  "updated_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "gastos_monto_check" CHECK ((monto > (0)::numeric)),
  CONSTRAINT "gastos_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."gastos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."inscripciones" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "socio_id"     uuid                     NOT NULL,
  "categoria_id" uuid                     NOT NULL,
  "fecha_alta"   date                     NOT NULL DEFAULT CURRENT_DATE,
  "fecha_baja"   date,
  "created_at"   timestamp with time zone DEFAULT now(),
  "updated_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "inscripciones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."inscripciones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pagos" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "cuota_id"        uuid                     NOT NULL,
  "usuario_id"      uuid                     NOT NULL,
  "monto"           numeric(10,2)            NOT NULL,
  "referencia_pago" character varying(255),
  "fecha_pago"      timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"      timestamp with time zone DEFAULT now(),
  "updated_at"      timestamp with time zone DEFAULT now(),
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
  "fecha_alta"                   date                     NOT NULL DEFAULT CURRENT_DATE,
  "fecha_baja"                   date,
  "created_at"                   timestamp with time zone DEFAULT now(),
  "updated_at"                   timestamp with time zone DEFAULT now(),
  CONSTRAINT "chk_contacto_emergencia_menor" CHECK (((age((fecha_nacimiento)::timestamp with time zone) >= '18 years'::interval) OR ((contacto_emergencia_nombre IS
    NOT NULL) AND (contacto_emergencia_telefono IS NOT NULL)))),
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

CREATE OR REPLACE FUNCTION public.baja_categoria (
  p_categoria_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM inscripciones WHERE categoria_id = p_categoria_id AND estado = 'activa') THEN
    RAISE EXCEPTION 'No se puede dar de baja la categoria porque existen socios inscriptos activos en la misma. Desvinculelos primero (CU-03.6)';
  END IF;
  UPDATE categorias SET estado = 'inactivo' WHERE id = p_categoria_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.baja_deporte (
  p_deporte_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM categorias WHERE deporte_id = p_deporte_id AND estado = 'activo') THEN
    RAISE EXCEPTION 'No se puede dar de baja el deporte porque posee categorias activas. De de baja primero esas categorias (CU-03.3)';
  END IF;
  UPDATE deportes SET estado = 'inactivo' WHERE id = p_deporte_id;
END;
$function$;

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
  SET search_path TO 'public'
  AS $function$   -- SECURITY INVOKER (default): respeta RLS
DECLARE
  v_cuota cuotas%ROWTYPE; v_pago_id uuid; v_comprobante_id uuid;
BEGIN

  -- Hardening: el cobrador debe ser el usuario de la sesión
  IF p_usuario_id <> auth.uid() THEN
    RAISE EXCEPTION 'No puede registrar cobros en nombre de otro usuario';
  END IF;

   -- Bloqueo pesimista: serializa cobros simultáneos (ND-2)
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id FOR UPDATE;  -- ND-2
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota inexistente'; END IF;
  IF v_cuota.estado <> 'pendiente' THEN RAISE EXCEPTION 'Cuota ya pagada';  -- error de negocio limpio para el segundo cobro
  END IF;

  INSERT INTO pagos (cuota_id, usuario_id, monto, medio_pago, referencia_pago)
  VALUES (p_cuota_id, p_usuario_id, v_cuota.monto, p_medio_pago, p_referencia)
  RETURNING id INTO v_pago_id;

  INSERT INTO comprobantes (pago_id, tipo, punto_venta, estado_fiscal, proximo_reintento_en)
  VALUES (v_pago_id, 'factura', (SELECT punto_venta FROM club), 'pendiente_cae',
  NOW() + interval '10 min')   
  RETURNING id INTO v_comprobante_id;

  UPDATE cuotas SET estado = 'pagada' WHERE id = p_cuota_id;
  RETURN v_comprobante_id;  -- la Edge Function sigue con ARCA fuera del lock
END; $function$;

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
  SET search_path TO 'public'
  AS $function$
SELECT
  cuota_proporcional(CURRENT_DATE, extract(month FROM CURRENT_DATE)::int,
                     extract(year FROM CURRENT_DATE)::int, c.arancel_mensual),
  tramo_proporcional(CURRENT_DATE, extract(month FROM CURRENT_DATE)::int,
                     extract(year FROM CURRENT_DATE)::int),
  categoria_edad_fuera_de_rango(CURRENT_DATE, s.fecha_nacimiento, c.edad_min, c.edad_max),
  date_part('year', age(CURRENT_DATE, s.fecha_nacimiento))::int,
  c.edad_min, c.edad_max
FROM socios s CROSS JOIN categorias c
WHERE s.id = p_socio_id AND c.id = p_categoria_id;
$function$;

CREATE OR REPLACE FUNCTION public.reabrir_regularizacion_fiscal (
  p_comprobante_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF private.get_rol() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el Administrador puede reabrir la regularizacion fiscal (CU-05.7)';
  END IF;
  UPDATE comprobantes
     SET estado_fiscal = 'pendiente_cae',
         intentos_reintento = 0,
         proximo_reintento_en = NOW() + interval '10 min'
   WHERE id = p_comprobante_id AND estado_fiscal = 'fallido';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El comprobante no existe o no esta en estado fallido';
  END IF;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.trg_cuotas_campos_inmutables()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF NEW.socio_id IS DISTINCT FROM OLD.socio_id
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
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_rol text := COALESCE(current_setting('request.role', true), 'postgres');
  v_hoy date := (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_dia_registro date := (OLD.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF (NEW.fecha IS DISTINCT FROM OLD.fecha
      OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id
      OR NEW.concepto IS DISTINCT FROM OLD.concepto
      OR NEW.monto IS DISTINCT FROM OLD.monto
      OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago
      OR NEW.referencia_banco IS DISTINCT FROM OLD.referencia_banco
      OR NEW.descripcion IS DISTINCT FROM OLD.descripcion
      OR NEW.evidencia_url IS DISTINCT FROM OLD.evidencia_url)
     AND v_dia_registro <> v_hoy
     AND v_rol NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Los gastos de dias anteriores se corrigen por anulacion y nuevo registro (CU-06.4)';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_pagos_campos_inmutables()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF NEW.cuota_id IS DISTINCT FROM OLD.cuota_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.monto IS DISTINCT FROM OLD.monto
     OR NEW.medio_pago IS DISTINCT FROM OLD.medio_pago
     OR NEW.referencia_pago IS DISTINCT FROM OLD.referencia_pago
     OR NEW.fecha_pago IS DISTINCT FROM OLD.fecha_pago THEN
    RAISE EXCEPTION 'Campos inmutables del pago: solo puede cambiar su estado (integridad del Libro Mayor, ND-6)';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_socios_campos_inmutables()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_rol text := COALESCE(current_setting('request.role', true), 'postgres');
BEGIN
  -- Matrícula: inmutable absoluta (identificador externo en recibos)
  IF NEW.numero_socio IS DISTINCT FROM OLD.numero_socio THEN
    RAISE EXCEPTION 'Campo inmutable: el numero de socio no puede modificarse (CU-01.2)';
  END IF;
  -- DNI: inmutable para operativos; solo Admin (o service_role / psql de runbook) lo corrige
  IF NEW.dni IS DISTINCT FROM OLD.dni THEN
    IF v_rol NOT IN ('service_role', 'postgres')
       AND private.get_rol() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'El DNI solo puede corregirlo un Administrador (CU-01.2)';
    END IF;
    NEW.dni_anterior      := OLD.dni;
    NEW.dni_corregido_at  := NOW();
    NEW.dni_corregido_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_usuarios_email_solo_flujo_admin()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_rol text := COALESCE(current_setting('request.role', true), 'postgres');
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND v_rol NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'El cambio de correo debe realizarse por el flujo de administracion (CU-02.6)';
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
  ADD CONSTRAINT "comprobantes_comprobante_origen_id_fkey" FOREIGN KEY (comprobante_origen_id) REFERENCES public.comprobantes(id) ON DELETE SET NULL;

ALTER TABLE "public"."comprobantes"
  ADD CONSTRAINT "unique_comprobante_pv_tipo_num" UNIQUE (punto_venta, tipo, numero_comprobante);

ALTER TABLE "public"."cuotas"
  ADD CONSTRAINT "cuotas_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE RESTRICT;

ALTER TABLE "public"."categorias"
  ADD CONSTRAINT "categorias_deporte_id_fkey" FOREIGN KEY (deporte_id) REFERENCES public.deportes(id) ON DELETE RESTRICT;

ALTER TABLE "public"."email_destinatarios"
  ADD CONSTRAINT "email_destinatarios_email_log_id_fkey" FOREIGN KEY (email_log_id) REFERENCES public.email_logs(id) ON DELETE CASCADE;

ALTER TABLE "public"."gastos"
  ADD CONSTRAINT "gastos_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES public.categorias_gasto(id) ON DELETE RESTRICT;

ALTER TABLE "public"."inscripciones"
  ADD CONSTRAINT "chk_inscripcion_estado_fecha"
    CHECK ((((estado = 'activa'::public.estado_inscripcion) AND (fecha_baja IS NULL)) OR ((estado = 'inactiva'::public.estado_inscripcion) AND (fecha_baja IS NOT NULL))));

ALTER TABLE "public"."inscripciones"
  ADD CONSTRAINT "inscripciones_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE RESTRICT;

ALTER TABLE "public"."pagos"
  ADD CONSTRAINT "pagos_cuota_id_fkey" FOREIGN KEY (cuota_id) REFERENCES public.cuotas(id) ON DELETE RESTRICT;

ALTER TABLE "public"."comprobantes"
  ADD CONSTRAINT "comprobantes_pago_id_fkey" FOREIGN KEY (pago_id) REFERENCES public.pagos(id) ON DELETE RESTRICT;

ALTER TABLE "public"."email_logs"
  ADD CONSTRAINT "email_logs_plantilla_id_fkey" FOREIGN KEY (plantilla_id) REFERENCES public.plantillas_correo(id) ON DELETE SET NULL;

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
  ADD CONSTRAINT "gastos_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."pagos"
  ADD CONSTRAINT "pagos_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE "public"."socios"
  ADD CONSTRAINT "socios_dni_corregido_por_fkey" FOREIGN KEY (dni_corregido_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

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
    (g.fecha)::timestamp with time zone AS fecha,
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
    p.updated_at AS fecha,
    p.monto,
    p.medio_pago AS metodo,
    p.referencia_pago AS referencia,
    'Anulacion de cobro'::character varying AS concepto,
    (p.estado)::text AS estado,
    p.usuario_id,
    true AS es_reverso
   FROM public.pagos p
  WHERE (p.estado = 'anulado'::public.estado_pago)
UNION ALL
 SELECT 'ingreso'::text AS tipo_movimiento,
    g.id AS movimiento_id,
    g.updated_at AS fecha,
    g.monto,
    g.metodo_pago AS metodo,
    g.referencia_banco AS referencia,
    'Anulacion de gasto'::character varying AS concepto,
    (g.estado)::text AS estado,
    g.usuario_id,
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

CREATE UNIQUE INDEX uq_job_exitoso ON public.cuota_job_logs USING btree (periodo_mes, periodo_anio)
  WHERE (estado = 'exitoso'::public.estado_job);

CREATE UNIQUE INDEX uq_pago_vigente_por_cuota ON public.pagos USING btree (cuota_id)
  WHERE (estado = 'completado'::public.estado_pago);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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

CREATE TRIGGER update_comprobantes_modtime
  BEFORE UPDATE ON public.comprobantes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER cuotas_inmutabilidad
  BEFORE UPDATE ON public.cuotas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cuotas_campos_inmutables();

CREATE TRIGGER update_cuotas_modtime
  BEFORE UPDATE ON public.cuotas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deportes_modtime
  BEFORE UPDATE ON public.deportes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER gastos_edicion_ventana
  BEFORE UPDATE ON public.gastos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_gastos_edicion_mismo_dia();

CREATE TRIGGER update_gastos_modtime
  BEFORE UPDATE ON public.gastos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inscripciones_modtime
  BEFORE UPDATE ON public.inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER pagos_inmutabilidad
  BEFORE UPDATE ON public.pagos
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

CREATE TRIGGER socios_inmutabilidad
  BEFORE UPDATE ON public.socios
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_socios_campos_inmutables();

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

CREATE POLICY "categorias_delete_admin" ON "public"."categorias"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

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

CREATE POLICY "club_delete_admin" ON "public"."club"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

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

CREATE POLICY "comprobantes_delete_admin" ON "public"."comprobantes"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "comprobantes_insert" ON "public"."comprobantes"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "comprobantes_select" ON "public"."comprobantes"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "cuota_job_logs_select_admin" ON "public"."cuota_job_logs"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "cuotas_delete_admin" ON "public"."cuotas"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "cuotas_insert" ON "public"."cuotas"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "cuotas_select" ON "public"."cuotas"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "cuotas_update" ON "public"."cuotas"
  FOR UPDATE
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL))
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "deportes_delete_admin" ON "public"."deportes"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

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

CREATE POLICY "email_logs_select" ON "public"."email_logs"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "gastos_delete_admin" ON "public"."gastos"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "gastos_insert" ON "public"."gastos"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "gastos_select" ON "public"."gastos"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "gastos_update" ON "public"."gastos"
  FOR UPDATE
  TO "authenticated"
  USING
    (((private.get_rol() = 'admin'::public.rol_usuario) OR ((private.get_rol() = 'responsable'::public.rol_usuario) AND (((created_at AT TIME ZONE
    'America/Argentina/Buenos_Aires'::text))::date = ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date))))
  WITH
    CHECK
    (((private.get_rol() = 'admin'::public.rol_usuario) OR ((private.get_rol() = 'responsable'::public.rol_usuario) AND (((created_at AT TIME ZONE
    'America/Argentina/Buenos_Aires'::text))::date = ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date))));

CREATE POLICY "inscripciones_delete_admin" ON "public"."inscripciones"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "inscripciones_insert" ON "public"."inscripciones"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "inscripciones_select" ON "public"."inscripciones"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "inscripciones_update" ON "public"."inscripciones"
  FOR UPDATE
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL))
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "pagos_delete_admin" ON "public"."pagos"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

CREATE POLICY "pagos_insert" ON "public"."pagos"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() IS NOT NULL));

CREATE POLICY "pagos_select" ON "public"."pagos"
  FOR SELECT
  TO "authenticated"
  USING ((private.get_rol() IS NOT NULL));

CREATE POLICY "pagos_update" ON "public"."pagos"
  FOR UPDATE
  TO "authenticated"
  USING
    (((private.get_rol() = 'admin'::public.rol_usuario) OR ((private.get_rol() = 'responsable'::public.rol_usuario) AND (((fecha_pago AT TIME ZONE
    'America/Argentina/Buenos_Aires'::text))::date = ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date))))
  WITH
    CHECK
    (((private.get_rol() = 'admin'::public.rol_usuario) OR ((private.get_rol() = 'responsable'::public.rol_usuario) AND (((fecha_pago AT TIME ZONE
    'America/Argentina/Buenos_Aires'::text))::date = ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date))));

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

CREATE POLICY "socios_delete_admin" ON "public"."socios"
  FOR DELETE
  TO "authenticated"
  USING ((private.get_rol() = 'admin'::public.rol_usuario));

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

CREATE POLICY "usuarios_delete_admin" ON "public"."usuarios"
  FOR DELETE
  TO "authenticated"
  USING (((private.get_rol() = 'admin'::public.rol_usuario) AND (id <> ( SELECT auth.uid() AS uid))));

CREATE POLICY "usuarios_insert_admin" ON "public"."usuarios"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.get_rol() = 'admin'::public.rol_usuario));

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

REVOKE ALL ON FUNCTION "private"."get_rol"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_rol"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."baja_categoria"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."baja_categoria"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."baja_deporte"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."baja_deporte"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."categoria_edad_fuera_de_rango"(date, date, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."categoria_edad_fuera_de_rango"(date, date, integer, integer) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."categorias_rango_superpuesto"(uuid, integer, integer, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."categorias_rango_superpuesto"(uuid, integer, integer, uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cobrar_cuota"(uuid, uuid, public.medio_pago, character varying) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cobrar_cuota"(uuid, uuid, public.medio_pago, character varying) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cuit_valido"(character varying) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cuit_valido"(character varying) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cuota_proporcional"(date, integer, integer, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cuota_proporcional"(date, integer, integer, numeric) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."es_socio_moroso"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."es_socio_moroso"(uuid) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."previsualizar_inscripcion"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."previsualizar_inscripcion"(uuid, uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."reabrir_regularizacion_fiscal"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."reabrir_regularizacion_fiscal"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."tramo_proporcional"(date, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."tramo_proporcional"(date, integer, integer) TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_cuotas_campos_inmutables"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_gastos_edicion_mismo_dia"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_pagos_campos_inmutables"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_socios_campos_inmutables"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."trg_usuarios_email_solo_flujo_admin"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

GRANT CREATE, USAGE ON SCHEMA "private" TO "postgres";

GRANT USAGE ON SCHEMA "private" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."socios_numero_socio_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categorias" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categorias_gasto" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."comprobantes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cuota_job_logs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cuotas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deportes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_destinatarios" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_logs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gastos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inscripciones" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pagos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."plantillas_correo" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."socios" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."usuarios" TO "anon", "authenticated", "postgres", "service_role";

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

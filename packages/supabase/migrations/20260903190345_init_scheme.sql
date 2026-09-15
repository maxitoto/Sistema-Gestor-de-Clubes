SET local check_function_bodies = off;

CREATE EXTENSION "pg_trgm" SCHEMA "public";

ALTER EXTENSION "uuid-ossp" SET SCHEMA "public";

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
  CONSTRAINT "categorias_arancel_mensual_check" CHECK ((arancel_mensual >= (0)::numeric)),
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

CREATE OR REPLACE FUNCTION public.cobrar_cuota (
  p_cuota_id   uuid,
  p_usuario_id uuid,
  p_medio_pago public.medio_pago,
  p_referencia character varying DEFAULT NULL::character varying
)
  RETURNS uuid
  LANGUAGE plpgsql
  AS $function$   -- SECURITY INVOKER (default): respeta RLS
DECLARE
  v_cuota cuotas%ROWTYPE; v_pago_id uuid; v_comprobante_id uuid;
BEGIN
   -- Bloqueo pesimista: serializa cobros simultáneos (ND-2)
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id FOR UPDATE;  -- ND-2
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota inexistente'; END IF;
  IF v_cuota.estado <> 'pendiente' THEN RAISE EXCEPTION 'Cuota ya pagada';  -- error de negocio limpio para el segundo cobro
  END IF;

  INSERT INTO pagos (cuota_id, usuario_id, monto, medio_pago, referencia_pago)
  VALUES (p_cuota_id, p_usuario_id, v_cuota.monto, p_medio_pago, p_referencia)
  RETURNING id INTO v_pago_id;

  INSERT INTO comprobantes (pago_id, tipo, punto_venta, estado_fiscal)
  VALUES (v_pago_id, 'factura', (SELECT punto_venta FROM club), 'pendiente_cae')
  RETURNING id INTO v_comprobante_id;

  UPDATE cuotas SET estado = 'pagada' WHERE id = p_cuota_id;
  RETURN v_comprobante_id;  -- la Edge Function sigue con ARCA fuera del lock
END; $function$;

CREATE OR REPLACE FUNCTION public.es_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND rol = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.es_responsable()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND rol = 'responsable'
  );
$function$;

CREATE OR REPLACE FUNCTION public.es_socio_moroso (
  p_socio_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $function$
  SELECT COALESCE(
    (count(*) >= 2) OR (min(created_at) < now() - interval '30 days'),
    false
  )
  FROM cuotas
  WHERE socio_id = p_socio_id AND estado = 'pendiente';
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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
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

CREATE VIEW "public"."flujo_caja" AS  SELECT 'ingreso'::text AS tipo_movimiento,
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

CREATE INDEX idx_gastos_descripcion_trgm ON public.gastos USING gin (descripcion public.gin_trgm_ops);

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

CREATE TRIGGER update_cuotas_modtime
  BEFORE UPDATE ON public.cuotas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deportes_modtime
  BEFORE UPDATE ON public.deportes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gastos_modtime
  BEFORE UPDATE ON public.gastos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inscripciones_modtime
  BEFORE UPDATE ON public.inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pagos_modtime
  BEFORE UPDATE ON public.pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plantillas_correo_modtime
  BEFORE UPDATE ON public.plantillas_correo
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_socios_modtime
  BEFORE UPDATE ON public.socios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_usuarios_modtime
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."categorias"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."categorias_gasto"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins pueden actualizar club" ON "public"."club"
  FOR UPDATE
  TO "authenticated"
  USING (public.es_admin());

CREATE POLICY "Cualquiera autenticado puede ver el club" ON "public"."club"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."comprobantes"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."cuota_job_logs"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."cuotas"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."deportes"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."email_destinatarios"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."email_logs"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."gastos"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."inscripciones"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."pagos"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."plantillas_correo"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Acceso total a operativos para autenticados" ON "public"."socios"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins pueden gestionar usuarios" ON "public"."usuarios"
  FOR ALL
  TO "authenticated"
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON "public"."usuarios"
  FOR UPDATE
  TO "authenticated"
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "Usuarios pueden ver otros usuarios" ON "public"."usuarios"
  FOR SELECT
  TO "authenticated"
  USING (true);

COMMENT ON EXTENSION "pg_trgm" IS 'text similarity measurement and index searching based on trigrams';

GRANT EXECUTE ON FUNCTION "public"."cobrar_cuota"(uuid, uuid, public.medio_pago, character varying) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."es_admin"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."es_responsable"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."es_socio_moroso"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

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

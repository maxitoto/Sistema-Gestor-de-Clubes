CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
-- Habilitar extensión para búsquedas de texto avanzadas (Trigramas)
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
--=================================================================================
-- 1. TIPOS DE DATOS (ENUMS)
--=================================================================================
CREATE TYPE rol_usuario AS ENUM ('admin', 'responsable');
CREATE TYPE estado_basico AS ENUM ('activo', 'inactivo');
CREATE TYPE estado_cuota AS ENUM ('pendiente', 'pagada');
CREATE TYPE medio_pago AS ENUM ('efectivo', 'transferencia');
CREATE TYPE estado_pago AS ENUM ('completado', 'anulado');
CREATE TYPE tipo_comprobante AS ENUM ('factura', 'nota_credito');
CREATE TYPE estado_fiscal AS ENUM ('valido', 'pendiente_cae', 'anulacion_pendiente','anulado','fallido');
CREATE TYPE estado_gasto AS ENUM ('activo', 'anulado');
CREATE TYPE estado_inscripcion AS ENUM ('activa', 'inactiva');
CREATE TYPE estado_job AS ENUM ('procesando', 'exitoso', 'fallido');
CREATE TYPE estado_email AS ENUM ('enviado', 'fallido', 'procesando');
--=================================================================================
-- 2. MÓDULO INSTITUCIONAL Y USUARIOS
--=================================================================================
CREATE TABLE club (
id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
nombre VARCHAR(255) NOT NULL,
cuit VARCHAR(20) NOT NULL UNIQUE,
domicilio_fiscal TEXT NOT NULL,
email_contacto VARCHAR(255) NOT NULL,
logo_url TEXT,
logo_storage_path TEXT,
punto_venta INTEGER NOT NULL,
certificado_arca TEXT, -- Encriptado en aplicación
certificado_key TEXT, -- Encriptado en aplicación
certificado_vencimiento DATE,
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
CONSTRAINT chk_punto_venta CHECK (punto_venta BETWEEN 1 AND 99999)
);
-- Asegurar que solo exista una configuración de club
ALTER TABLE club ADD CONSTRAINT unica_configuracion_club CHECK (id = '00000000-0000-0000-0000-000000000000'::uuid);

CREATE TABLE usuarios (
-- El ID debe coincidir con auth.users.id de Supabase
id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
nombre VARCHAR(100) NOT NULL,
apellido VARCHAR(100) NOT NULL,
email VARCHAR(255) NOT NULL UNIQUE,
rol rol_usuario NOT NULL DEFAULT 'responsable',
estado estado_basico NOT NULL DEFAULT 'activo',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
--=================================================================================
-- 3. MÓDULO DE SOCIOS
--=================================================================================
CREATE TABLE socios (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
numero_socio SERIAL UNIQUE,
dni VARCHAR(20) NOT NULL UNIQUE,
dni_anterior VARCHAR(20),                          -- auditoría: valor previo a la última corrección
dni_corregido_at TIMESTAMP WITH TIME ZONE,         -- auditoría: cuándo se corrigió
dni_corregido_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT, -- auditoría: quién corrigió
nombre VARCHAR(100) NOT NULL,
apellido VARCHAR(100) NOT NULL,
fecha_nacimiento DATE NOT NULL,
email VARCHAR(255),
telefono VARCHAR(50),
direccion TEXT,
foto_url TEXT,
foto_storage_path TEXT,
estado estado_basico NOT NULL DEFAULT 'activo',
acepta_comunicaciones BOOLEAN NOT NULL DEFAULT TRUE,
email_invalido BOOLEAN NOT NULL DEFAULT FALSE,
contacto_emergencia_nombre VARCHAR(150),
contacto_emergencia_telefono VARCHAR(50),
fecha_alta DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
fecha_baja DATE,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
CONSTRAINT chk_estado_fecha_baja CHECK (
  (estado = 'activo'   AND fecha_baja IS NULL) OR
  (estado = 'inactivo' AND fecha_baja IS NOT NULL)
)
);
--=================================================================================
-- 4. MÓDULO DEPORTIVO
--=================================================================================
CREATE TABLE deportes (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
nombre VARCHAR(100) NOT NULL UNIQUE,
descripcion TEXT,
estado estado_basico NOT NULL DEFAULT 'activo',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE categorias (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
deporte_id UUID NOT NULL REFERENCES deportes(id) ON DELETE RESTRICT,
nombre VARCHAR(100) NOT NULL,
arancel_mensual DECIMAL(10,2) NOT NULL CHECK (arancel_mensual > 0),
edad_min INTEGER,
edad_max INTEGER,
CONSTRAINT chk_categorias_rango_etario CHECK (
  (edad_min IS NULL AND edad_max IS NULL)
  OR (
    edad_min IS NOT NULL AND edad_max IS NOT NULL
    AND edad_min >= 0 AND edad_max >= edad_min
  )
),
estado estado_basico NOT NULL DEFAULT 'activo',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
UNIQUE(deporte_id, nombre) -- No pueden haber dos "Sub-17" en Fútbol
);
CREATE TABLE inscripciones (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
socio_id UUID NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
fecha_alta DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
fecha_baja DATE,
estado estado_inscripcion NOT NULL DEFAULT 'activa',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
CONSTRAINT chk_inscripcion_estado_fecha CHECK (
    (estado = 'activa'   AND fecha_baja IS NULL) OR
    (estado = 'inactiva' AND fecha_baja IS NOT NULL)
)
);
--=================================================================================
-- 5. MÓDULO FINANCIERO (FACTURACIÓN Y PAGOS)
--=================================================================================
CREATE TABLE cuotas (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
socio_id UUID NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
periodo_mes INTEGER NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
periodo_anio INTEGER NOT NULL CHECK (periodo_anio > 2000),
monto DECIMAL(10,2) NOT NULL CHECK (monto >= 0),
estado estado_cuota NOT NULL DEFAULT 'pendiente',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
UNIQUE(socio_id, categoria_id, periodo_mes, periodo_anio) -- Evita cuotas duplicadas
);
CREATE TABLE pagos (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
cuota_id UUID NOT NULL REFERENCES cuotas(id) ON DELETE RESTRICT,
usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT, -- Quién cobró
monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
medio_pago medio_pago NOT NULL,
referencia_pago VARCHAR(255),
fecha_pago TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
estado estado_pago NOT NULL DEFAULT 'completado',
anulado_at TIMESTAMP WITH TIME ZONE,
anulado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
motivo_anulacion TEXT,
created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
CONSTRAINT chk_pago_anulacion CHECK (
  (estado = 'completado' AND anulado_at IS NULL AND anulado_por IS NULL
    AND motivo_anulacion IS NULL)
  OR
  (estado = 'anulado' AND anulado_at IS NOT NULL AND anulado_por IS NOT NULL
    AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
)
);

CREATE TABLE comprobantes (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
pago_id UUID NOT NULL REFERENCES pagos(id) ON DELETE RESTRICT,
comprobante_origen_id UUID REFERENCES comprobantes(id) ON DELETE RESTRICT, -- Relaciona Nota de Crédito con Factura Original, null si es tipo factura
tipo tipo_comprobante NOT NULL,
punto_venta INTEGER NOT NULL DEFAULT 1,
numero_comprobante VARCHAR(50),
cae VARCHAR(50),
cae_vencimiento DATE,
estado_fiscal estado_fiscal NOT NULL DEFAULT 'pendiente_cae',
pdf_url TEXT,
motivo_anulacion TEXT,
detalle_error_fiscal TEXT,
numero_solicitado VARCHAR(50),
solicitud_fiscal jsonb, -- copia exacta de la solicitud enviada a ARCA (sin credenciales), inmutable mientras el resultado sea desconocido (ND-15)
ventana_regularizacion_iniciada_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
intentos_reintento SMALLINT NOT NULL DEFAULT 0,
proximo_reintento_en TIMESTAMP WITH TIME ZONE,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
CONSTRAINT unique_comprobante_pv_tipo_num UNIQUE (punto_venta, tipo, numero_comprobante), -- Impide que existan dos Facturas con el mismo número en el mismo Punto de Venta
CONSTRAINT chk_nc_origen CHECK (
  (tipo = 'factura'      AND comprobante_origen_id IS NULL) OR
  (tipo = 'nota_credito' AND comprobante_origen_id IS NOT NULL)
),
CONSTRAINT chk_intentos_reintento CHECK (intentos_reintento BETWEEN 0 AND 6)
);

--=================================================================================
-- 6. MÓDULO DE GASTOS
--=================================================================================
CREATE TABLE categorias_gasto (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
nombre VARCHAR(100) NOT NULL UNIQUE,
descripcion TEXT,
estado estado_basico NOT NULL DEFAULT 'activo',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID NOT NULL REFERENCES categorias_gasto(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
  concepto VARCHAR(255) NOT NULL,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  metodo_pago medio_pago NOT NULL,
  referencia_banco VARCHAR(255),
  CONSTRAINT chk_gastos_transferencia_referencia CHECK (
    metodo_pago <> 'transferencia'
    OR NULLIF(btrim(referencia_banco), '') IS NOT NULL
  ),
  descripcion TEXT,
  evidencia_url TEXT,
  evidencia_storage_path TEXT,
  estado estado_gasto NOT NULL DEFAULT 'activo',
  motivo_anulacion TEXT,
  anulado_at TIMESTAMP WITH TIME ZONE,
  anulado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gasto_anulacion CHECK (
    (estado = 'activo' AND anulado_at IS NULL AND anulado_por IS NULL
      AND motivo_anulacion IS NULL)
    OR
    (estado = 'anulado' AND anulado_at IS NOT NULL AND anulado_por IS NOT NULL
      AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '')
  )
);

--=================================================================================
-- 7. MÓDULO DE SISTEMA (LOGS Y COMUNICACIONES)
--=================================================================================
CREATE TABLE plantillas_correo (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
nombre_interno VARCHAR(150) NOT NULL UNIQUE,
asunto VARCHAR(255) NOT NULL,
cuerpo TEXT NOT NULL,
estado estado_basico NOT NULL DEFAULT 'activo',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE email_logs (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
plantilla_id UUID REFERENCES plantillas_correo(id) ON DELETE SET NULL,
usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
asunto VARCHAR(255) NOT NULL,
cuerpo TEXT NOT NULL,
destinatarios_count INTEGER NOT NULL DEFAULT 0,
estado estado_email NOT NULL DEFAULT 'procesando',
fecha_envio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE TABLE email_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_log_id UUID NOT NULL REFERENCES email_logs(id) ON DELETE CASCADE,
  socio_id UUID REFERENCES socios(id) ON DELETE SET NULL, -- -- NULL si se mandó a un maiL suelto
  email VARCHAR(255) NOT NULL,
  estado estado_email NOT NULL DEFAULT 'procesando',
  event_id VARCHAR(150) UNIQUE, -- id evento Resend (CU-07.4)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE cuota_job_logs (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
periodo_mes INTEGER NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
periodo_anio INTEGER NOT NULL CHECK (periodo_anio > 2000),
estado estado_job NOT NULL DEFAULT 'procesando',
cuotas_generadas INTEGER DEFAULT 0,
cuotas_omitidas INTEGER DEFAULT 0,
fecha_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
fecha_fin TIMESTAMP WITH TIME ZONE
);

-- persistencia de comunicaciones.
ALTER TABLE public.plantillas_correo
  ADD CONSTRAINT plantilla_nombre_no_vacio CHECK (length(btrim(nombre_interno))>0),
  ADD CONSTRAINT plantilla_asunto_valido CHECK (length(btrim(asunto)) BETWEEN 1 AND 255 AND asunto !~ E'[\r\n]'),
  ADD CONSTRAINT plantilla_cuerpo_valido CHECK (length(btrim(cuerpo)) BETWEEN 1 AND 10000),
  ADD CONSTRAINT plantilla_etiquetas_validas CHECK (
    regexp_replace(asunto||cuerpo,'\{\{(nombre|apellido|deporte|deuda)\}\}','','g') !~ '\{\{|\}\}');
ALTER TABLE public.email_logs DROP CONSTRAINT email_logs_plantilla_id_fkey;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_plantilla_id_fkey
  FOREIGN KEY (plantilla_id) REFERENCES public.plantillas_correo(id) ON DELETE RESTRICT;
ALTER TABLE public.email_logs ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE public.email_logs
  ADD COLUMN origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','automatico')),
  ADD COLUMN tipo text NOT NULL DEFAULT 'general' CHECK (tipo IN ('general','deuda','transaccional')),
  ADD COLUMN request_id uuid UNIQUE,
  ADD COLUMN solicitud jsonb,
  ADD COLUMN incluir_desuscriptos boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT email_logs_autoria CHECK (
    (origen='manual' AND usuario_id IS NOT NULL) OR (origen='automatico' AND usuario_id IS NULL)),
  ADD CONSTRAINT email_logs_excepcion_deuda CHECK (NOT incluir_desuscriptos OR tipo='deuda');
ALTER TABLE public.email_destinatarios DROP COLUMN event_id;
ALTER TABLE public.email_destinatarios ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.email_destinatarios
  ADD COLUMN estado_envio text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_envio IN ('pendiente','procesando','aceptado','fallido','excluido','incierto')),
  ADD COLUMN motivo text,
  ADD COLUMN asunto_snapshot text,
  ADD COLUMN cuerpo_snapshot text,
  ADD COLUMN proveedor text CHECK (proveedor IN ('resend','mailpit')),
  ADD COLUMN provider_message_id text,
  ADD COLUMN entrega_estado text NOT NULL DEFAULT 'sin_confirmar'
    CHECK (entrega_estado IN ('sin_confirmar','demorada','entregada','rebote_duro','fallida')),
  ADD COLUMN reservado_en timestamptz,
  ADD COLUMN reserva_id uuid,
  ADD COLUMN aceptado_en timestamptz,
  ADD CONSTRAINT email_destinatarios_por_socio UNIQUE (email_log_id,socio_id),
  ADD CONSTRAINT email_destinatarios_message_unique UNIQUE (proveedor,provider_message_id);
CREATE TABLE public.email_eventos (
  proveedor text NOT NULL DEFAULT 'resend' CHECK (proveedor='resend'),
  event_id text NOT NULL,
  provider_message_id text NOT NULL,
  destinatario_id uuid REFERENCES public.email_destinatarios(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  bounce_tipo text CHECK (bounce_tipo IN ('Permanent','Transient','Undetermined')),
  ocurrido_en timestamptz NOT NULL,
  recibido_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proveedor,event_id)
);


-- ---------------------------------------------------------------------------------
-- Cargas validadas de archivos privados
-- ---------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.archivos_cargas (
  storage_path TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('socio-foto', 'club-logo', 'gasto-evidencia')),
  entidad_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  tipo_mime TEXT NOT NULL CHECK (tipo_mime IN ('image/jpeg', 'image/png', 'application/pdf')),
  tamano BIGINT NOT NULL CHECK (tamano > 0 AND tamano <= 10485760),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'asociado', 'descartando', 'descartado')),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------------
-- Operaciones administrativas recuperables de usuarios y límites locales de acceso
-- No almacena contraseñas, tokens de sesión ni enlaces de Auth.
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.usuarios_operaciones (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.usuarios(id),
  usuario_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('crear','editar','desactivar','reactivar','restablecer','reenviar')),
  datos jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'ejecutando' CHECK (estado IN ('ejecutando','enviando','completo','enlace_pendiente','sesiones_pendientes','datos_pendientes','rechazado')),
  lease uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_hasta timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '2 minutes'),
  enlace_enviado_en timestamptz,
  identidad_creada boolean NOT NULL DEFAULT false,
  clave_establecida boolean NOT NULL DEFAULT false,
  revocacion_pendiente boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS private.acceso_intentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo text NOT NULL,
  ip_hash text NOT NULL,
  email_hash text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
--=================================================================================
-- ÍNDICES DE RENDIMIENTO Y BÚSQUEDA
--=================================================================================
-- Índice único parcial: Solo puede haber una inscripción 'activa' por socio y categoría.
CREATE UNIQUE INDEX idx_inscripcion_activa_unica ON inscripciones(socio_id, categoria_id) 
WHERE estado = 'activa';

CREATE UNIQUE INDEX uq_pago_vigente_por_cuota
ON pagos(cuota_id) WHERE estado = 'completado'; -- indice para como maximo un pago completado

-- Bloqueo de segunda anulacion a nivel motor:
-- una unica nota de credito por comprobante de origen.
CREATE UNIQUE INDEX uq_nc_por_comprobante_origen
    ON comprobantes (comprobante_origen_id)
    WHERE tipo = 'nota_credito';

-- Cola del job CU-05.6: solo filas que esperan reintento
CREATE INDEX IF NOT EXISTS idx_comprobantes_reintento
  ON comprobantes (proximo_reintento_en)
  WHERE estado_fiscal IN ('pendiente_cae', 'anulacion_pendiente');
  
CREATE INDEX idx_email_dest_log ON email_destinatarios(email_log_id);
CREATE INDEX idx_email_dest_email ON email_destinatarios(email);  -- consulta de historial por direccion; el webhook usa identidad del mensaje

CREATE UNIQUE INDEX uq_job_exitoso ON cuota_job_logs(periodo_mes, periodo_anio)
WHERE estado = 'exitoso';   -- idempotencia: previene ejecucion dobles el mismo mes y permite reintentos fallidos

-- Índice GIN para búsquedas avanzadas (texto libre) en la descripción del gasto
CREATE INDEX idx_gastos_descripcion_trgm ON gastos USING GIN (descripcion extensions.gin_trgm_ops);

-- Índices de rendimiento y búsqueda generales
CREATE INDEX idx_socios_dni ON socios(dni);
CREATE INDEX idx_socios_numero ON socios(numero_socio);
CREATE INDEX idx_socios_apellido ON socios(apellido);
CREATE INDEX idx_categorias_deporte ON categorias(deporte_id);
CREATE INDEX idx_cuotas_periodo ON cuotas(periodo_mes, periodo_anio);
CREATE INDEX idx_cuotas_estado ON cuotas(estado);
CREATE INDEX idx_pagos_cuota ON pagos(cuota_id);
CREATE INDEX idx_pagos_fecha ON pagos(fecha_pago);
CREATE INDEX idx_comprobantes_pago ON comprobantes(pago_id);
CREATE INDEX idx_gastos_fecha ON gastos(fecha);
CREATE INDEX idx_email_logs_fecha ON email_logs(fecha_envio);

CREATE INDEX idx_cuotas_pendientes_socio
ON cuotas (socio_id)
WHERE estado = 'pendiente';
-- el historial de cobros une una sola factura original por pago.
CREATE UNIQUE INDEX uq_factura_por_pago
ON public.comprobantes(pago_id) WHERE tipo = 'factura';

-- consulta de eventos y cola.
CREATE INDEX email_eventos_message_idx ON public.email_eventos(proveedor,provider_message_id);
CREATE INDEX email_destinatarios_cola_idx ON public.email_destinatarios(created_at,id)
  WHERE estado_envio='pendiente';
CREATE INDEX email_destinatarios_reserva_idx ON public.email_destinatarios(reservado_en);

-- indices para control de tasa de intentos de acceso y recuperacion
CREATE INDEX IF NOT EXISTS acceso_intentos_busqueda ON private.acceso_intentos(tipo,ip_hash,creado_en);
CREATE INDEX IF NOT EXISTS acceso_intentos_email ON private.acceso_intentos(tipo,email_hash,creado_en);
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.get_rol()
RETURNS public.rol_usuario
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT rol FROM public.usuarios
  WHERE id = auth.uid() AND estado = 'activo';
$$;
REVOKE EXECUTE ON FUNCTION private.get_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_rol() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.bloquear_estructura_deportiva()
RETURNS void
LANGUAGE sql VOLATILE SET search_path = public, pg_temp
AS $$ SELECT pg_catalog.pg_advisory_xact_lock(73120, 12); $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.bloquear_estructura_deportiva()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.bloquear_estructura_deportiva() TO service_role;
-- La identidad humana viene del JWT de la petición, nunca de un parámetro libre.
CREATE OR REPLACE FUNCTION private.require_operador(p_solo_admin boolean DEFAULT false)
RETURNS public.rol_usuario
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;
REVOKE ALL ON FUNCTION private.require_operador(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.require_operador(boolean) TO authenticated, service_role;

--=================================================================================
-- FUNCIONES DE NEGOCIO
--=================================================================================
CREATE OR REPLACE FUNCTION es_socio_moroso(p_socio_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
SELECT EXISTS (
  SELECT 1 FROM cuotas
  WHERE socio_id = p_socio_id
    AND estado = 'pendiente'
    AND created_at < now() - interval '30 days'
);
$$;

CREATE OR REPLACE FUNCTION public.cobrar_cuota(
  p_cuota_id uuid, p_usuario_id uuid,
  p_medio_pago public.medio_pago, p_referencia varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

-- VALIDACIÓN DE CUIT (CU-00.1: formato y dígito verificador por módulo 11)

CREATE OR REPLACE FUNCTION public.cuit_valido(p_cuit varchar)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = public
AS $$
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
$$;

--=================================================================================
-- SUPERPOSICIÓN DE RANGOS ETARIOS (CU-03.4 / CU-03.5, advertencia no bloqueante)
-- Ambos extremos NULL = sin restriccion etaria: solapa con cualquier rango del deporte
--=================================================================================
CREATE OR REPLACE FUNCTION categorias_rango_superpuesto(
    p_deporte_id uuid,
    p_edad_min integer,
    p_edad_max integer,
    p_excluir_categoria uuid DEFAULT NULL
)
RETURNS TABLE (categoria_id uuid, nombre varchar, edad_min integer, edad_max integer)
LANGUAGE sql STABLE SET search_path = public
AS $$
SELECT c.id, c.nombre, c.edad_min, c.edad_max
FROM categorias c
WHERE c.deporte_id = p_deporte_id
  AND c.estado = 'activo'
  AND (p_excluir_categoria IS NULL OR c.id <> p_excluir_categoria)
  AND (p_edad_min IS NULL OR p_edad_max IS NULL
       OR c.edad_min IS NULL OR c.edad_max IS NULL
       OR (p_edad_min <= c.edad_max AND c.edad_min <= p_edad_max));
$$;

--=================================================================================
-- TRAMO DE PROPORCIONALIDAD (ND-13): fuente única del porcentaje, reutilizada
-- por cuota_proporcional y por la previsualización de inscripción (modal)
--=================================================================================
CREATE OR REPLACE FUNCTION tramo_proporcional(p_fecha date, p_mes integer, p_anio integer)
RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
SELECT CASE
  WHEN p_fecha < make_date(p_anio, p_mes, 1) THEN 100
  WHEN p_fecha > (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date THEN 0
  WHEN extract(day FROM p_fecha) <= 10 THEN 100
  WHEN extract(day FROM p_fecha) <= 20 THEN 50
  ELSE 25
END;
$$;

CREATE OR REPLACE FUNCTION cuota_proporcional(
  p_fecha_alta date, p_periodo_mes integer, p_periodo_anio integer, p_arancel numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
SELECT CASE WHEN tramo_proporcional(p_fecha_alta, p_periodo_mes, p_periodo_anio) = 0
            THEN NULL                                   -- alta posterior al período: sin cuota
            ELSE round(p_arancel * tramo_proporcional(p_fecha_alta, p_periodo_mes, p_periodo_anio) / 100.0, 2)
       END;
$$;

--=================================================================================
-- RANGO ETARIO EN LA INSCRIPCIÓN (CU-04.1): advertencia NO bloqueante
-- Se evalua a la fecha de alta; ambos extremos NULL = sin restriccion etaria
--=================================================================================
CREATE OR REPLACE FUNCTION categoria_edad_fuera_de_rango(
  p_fecha_alta date, p_fecha_nacimiento date, p_edad_min integer, p_edad_max integer
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
SELECT p_edad_min IS NOT NULL AND p_edad_max IS NOT NULL
   AND ( date_part('year', age(p_fecha_alta, p_fecha_nacimiento)) < p_edad_min
      OR date_part('year', age(p_fecha_alta, p_fecha_nacimiento)) > p_edad_max );
$$;

--=================================================================================
-- PREVISUALIZACIÓN DE INSCRIPCIÓN (CU-04.1 paso 3-5):
-- monto y tramo server-side (ND-13) + advertencia de edad en una sola ida
--=================================================================================
CREATE OR REPLACE FUNCTION public.previsualizar_inscripcion(p_socio_id uuid, p_categoria_id uuid)
RETURNS TABLE (monto_proporcional numeric, tramo_pct integer, advertencia_edad boolean,
               edad_socio_anios integer, rango_min integer, rango_max integer)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
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
$$;

--=================================================================================
-- BAJAS UNIFICADAS DE DEPORTES Y CATEGORÍAS (CU-03.3 / CU-03.6)
-- Baja SIEMPRE lógica; el historial se conserva; guarda de dos niveles en el motor
--=================================================================================
CREATE OR REPLACE FUNCTION public.baja_deporte(p_deporte_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.baja_categoria(p_categoria_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

--=================================================================================
-- REAPERTURA DE REGULARIZACIÓN FISCAL (CU-05.7)
--=================================================================================
CREATE OR REPLACE FUNCTION reabrir_regularizacion_fiscal(p_comprobante_id uuid)
RETURNS void
LANGUAGE plpgsql SET search_path = public
AS $$
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
END; $$;

--=================================================================================
-- ANULACIÓN DE PAGO (CU-05.3): transacción local ÚNICA y atómica
-- Caja+deuda se resuelven en el mismo COMMIT; lo fiscal queda en el comprobante.
-- SECURITY DEFINER + actor humano tomado de auth.uid(). La RPC valida rol y
-- ventana del Responsable. La EF la invoca con el JWT del operador, no con
-- el cliente de service_role. La conciliación de ARCA sigue fuera de esta TX.
--=================================================================================
CREATE OR REPLACE FUNCTION anular_pago(p_pago_id uuid, p_motivo text)
RETURNS uuid  -- id de la NC creada; NULL significa "no se creó NC en esta llamada"
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END; $$;

--=================================================================================
-- CUOTAS EXISTENTES DEL PERÍODO (CU-04.1 paso 5):
-- alimenta el modal de advertencia con los cargos del mes antes de confirmar
--=================================================================================
CREATE OR REPLACE FUNCTION cuotas_del_periodo(p_socio_id uuid, p_mes integer, p_anio integer)
RETURNS TABLE (cuota_id uuid, categoria_id uuid, categoria_nombre varchar,
               estado estado_cuota, monto numeric)
LANGUAGE sql STABLE SET search_path = public
AS $$
SELECT q.id, q.categoria_id, c.nombre, q.estado, q.monto
FROM cuotas q JOIN categorias c ON c.id = q.categoria_id
WHERE q.socio_id = p_socio_id
  AND q.periodo_mes = p_mes AND q.periodo_anio = p_anio
ORDER BY c.nombre;
$$;

REVOKE EXECUTE ON FUNCTION public.cuotas_del_periodo(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cuotas_del_periodo(uuid, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reabrir_regularizacion_fiscal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reabrir_regularizacion_fiscal(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_regularizacion_fiscal(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.tramo_proporcional(date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tramo_proporcional(date, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.categoria_edad_fuera_de_rango(date, date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categoria_edad_fuera_de_rango(date, date, integer, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.previsualizar_inscripcion(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.previsualizar_inscripcion(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cuota_proporcional(date, integer, integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cuota_proporcional(date, integer, integer, numeric) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.categorias_rango_superpuesto(uuid, integer, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categorias_rango_superpuesto(uuid, integer, integer, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cuit_valido(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cuit_valido(varchar) TO authenticated, service_role;

-- El CHECK se agrega acá porque la función recién existe en este archivo
ALTER TABLE public.club DROP CONSTRAINT IF EXISTS chk_cuit_valido;
ALTER TABLE public.club ADD CONSTRAINT chk_cuit_valido CHECK (public.cuit_valido(cuit));

-- Le quita permisos a public: los usuarios anónimos (anon / visitantes sin login) quedan bloqueados y no pueden ejecutar estas funciones por la API
REVOKE EXECUTE ON FUNCTION public.es_socio_moroso(uuid) FROM PUBLIC;

-- Le da permiso de ejecución a solo dos roles: el responsable y el backend interno (taras programadas y edge functions)
GRANT EXECUTE ON FUNCTION public.es_socio_moroso(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.anular_gasto(
  p_gasto_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;


CREATE OR REPLACE FUNCTION public.baja_socio(p_socio_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.reactivar_socio(p_socio_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.baja_inscripcion(p_inscripcion_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.confirmar_inscripcion(p_socio_id uuid, p_categoria_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

-- las operaciones humanas se invocan con el JWT del operador.
-- Estos permisos finales sustituyen las concesiones antiguas de estas RPC.
REVOKE ALL ON FUNCTION public.cobrar_cuota(uuid, uuid, public.medio_pago, varchar),
  public.anular_pago(uuid, text), public.anular_gasto(uuid, text),
  public.baja_deporte(uuid), public.baja_categoria(uuid), public.baja_socio(uuid),
  public.reactivar_socio(uuid), public.baja_inscripcion(uuid),
  public.confirmar_inscripcion(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cobrar_cuota(uuid, uuid, public.medio_pago, varchar),
  public.anular_pago(uuid, text), public.anular_gasto(uuid, text),
  public.baja_deporte(uuid), public.baja_categoria(uuid), public.baja_socio(uuid),
  public.reactivar_socio(uuid), public.baja_inscripcion(uuid),
  public.confirmar_inscripcion(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.bloquear_estructura_deportiva()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.bloquear_estructura_deportiva() TO service_role;


CREATE OR REPLACE FUNCTION private.correo_etiquetas(p_texto text,p_datos jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT replace(replace(replace(replace(p_texto,'{{nombre}}',coalesce(p_datos->>'nombre','')),
 '{{apellido}}',coalesce(p_datos->>'apellido','')),'{{deporte}}',coalesce(p_datos->>'deporte','')),
 '{{deuda}}',coalesce(p_datos->>'deuda','0.00'));
$$;

CREATE OR REPLACE FUNCTION public.crear_comunicacion(p_solicitud jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION private.actualizar_estado_correo(p_log uuid)
RETURNS void LANGUAGE sql SET search_path=public,pg_temp AS $$
 UPDATE public.email_logs SET estado=CASE
  WHEN EXISTS(SELECT 1 FROM public.email_destinatarios WHERE email_log_id=p_log AND estado_envio IN ('pendiente','procesando','incierto')) THEN 'procesando'::public.estado_email
  WHEN EXISTS(SELECT 1 FROM public.email_destinatarios WHERE email_log_id=p_log AND (estado_envio='fallido' OR entrega_estado IN ('rebote_duro','fallida'))) THEN 'fallido'::public.estado_email
  WHEN NOT EXISTS(SELECT 1 FROM public.email_destinatarios WHERE email_log_id=p_log AND estado_envio='aceptado') THEN 'fallido'::public.estado_email
  ELSE 'enviado'::public.estado_email END WHERE id=p_log;
$$;

CREATE OR REPLACE FUNCTION public.reservar_correos(p_proveedor text)
RETURNS SETOF public.email_destinatarios LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION private.aplicar_eventos_correo(p_destinatario uuid)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION public.finalizar_correo(p_id uuid,p_reserva uuid,p_estado text,p_message_id text,p_motivo text)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_evento_correo(p_event_id text,p_message_id text,p_tipo text,p_ocurrido timestamptz,p_bounce_tipo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION public.desuscribir_correo(p_destinatario uuid)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.socios s SET acepta_comunicaciones=false FROM public.email_destinatarios e
 WHERE e.id=p_destinatario AND e.socio_id=s.id AND lower(btrim(e.email))=lower(btrim(s.email));
END; $$;

-- Generacion mensual atomica, sin llamadas de red dentro de la transaccion.
-- Entrada tecnica: solamente service_role (cron o EF interna).
CREATE OR REPLACE FUNCTION public.generar_cuotas_mes_actual()
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.generar_cuotas_mes_actual()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_cuotas_mes_actual() TO service_role;

-- Entrada humana ya prevista en CU-05.4: JWT del Administrador activo.
-- Comparte exactamente la misma transaccion, mutex e idempotencia del cron.
CREATE OR REPLACE FUNCTION public.generar_cuotas_mes_manual()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM private.require_operador(true);
  RETURN public.generar_cuotas_mes_actual();
END;
$$;

REVOKE ALL ON FUNCTION public.generar_cuotas_mes_manual()
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.generar_cuotas_mes_manual() TO authenticated;

-- devuelve exactamente la fecha calendario canónica de Buenos Aires que utilizan internamente otras funciones como previsualizar_inscripcion y confirmar_inscripcion
CREATE OR REPLACE FUNCTION public.fecha_actual_club()
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF private.get_rol() IS NULL THEN
    RAISE EXCEPTION 'Se requiere un operador activo' USING ERRCODE = '42501';
  END IF;
  RETURN (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
END;
$$;

-- autoridad y ciclo de vida de referencias de archivos privados.
CREATE OR REPLACE FUNCTION private.archivo_prefijo(p_tipo text, p_entidad_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_tipo
    WHEN 'socio-foto' THEN 'socios/'
    WHEN 'club-logo' THEN 'club/'
    WHEN 'gasto-evidencia' THEN 'gastos/'
  END || p_entidad_id::text || '/';
$$;

CREATE OR REPLACE FUNCTION public.archivo_autorizar_carga(p_tipo text, p_entidad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_rol public.rol_usuario;
  v_estado public.estado_gasto;
  v_registro timestamptz;
BEGIN
  v_rol := private.require_operador();
  IF p_tipo = 'socio-foto' THEN
    PERFORM 1 FROM public.socios WHERE id = p_entidad_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Socio no encontrado';
    END IF;
  ELSIF p_tipo = 'club-logo' THEN
    IF v_rol <> 'admin' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo Administrador puede cambiar el logo';
    END IF;
    PERFORM 1 FROM public.club WHERE id = p_entidad_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Club no encontrado';
    END IF;
  ELSIF p_tipo = 'gasto-evidencia' THEN
    SELECT estado, created_at INTO v_estado, v_registro FROM public.gastos WHERE id = p_entidad_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Gasto no encontrado';
    END IF;
    IF v_estado <> 'activo'
       OR (v_registro AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <> (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
      RAISE EXCEPTION 'El gasto no admite cambios de evidencia';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de archivo invalido';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.archivo_registrar_validado(
  p_tipo text,
  p_entidad_id uuid,
  p_actor_id uuid,
  p_storage_path text,
  p_mime text,
  p_tamano bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_prefijo text;
  v_extension text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo autoridad de archivos';
  END IF;
  v_prefijo := private.archivo_prefijo(p_tipo, p_entidad_id);
  v_extension := CASE p_mime
    WHEN 'image/png' THEN 'png'
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'application/pdf' THEN 'pdf'
  END;
  IF v_prefijo IS NULL
     OR v_extension IS NULL
     OR p_storage_path !~ ('^' || v_prefijo || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.' || v_extension || '$')
     OR p_tamano <= 0
     OR p_tamano > (CASE WHEN p_tipo = 'gasto-evidencia' THEN 10485760 ELSE 5242880 END)
     OR (p_tipo <> 'gasto-evidencia' AND p_mime = 'application/pdf') THEN
    RAISE EXCEPTION 'Archivo validado invalido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_actor_id AND estado = 'activo')
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'club-archivos' AND name = p_storage_path) THEN
    RAISE EXCEPTION 'Actor u objeto no disponible';
  END IF;
  INSERT INTO private.archivos_cargas (storage_path, tipo, entidad_id, actor_id, tipo_mime, tamano)
  VALUES (p_storage_path, p_tipo, p_entidad_id, p_actor_id, p_mime, p_tamano);
END;
$$;

CREATE OR REPLACE FUNCTION public.archivo_reservar_descarte(
  p_tipo text,
  p_entidad_id uuid,
  p_actor_id uuid,
  p_storage_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_carga private.archivos_cargas%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo autoridad de archivos';
  END IF;
  SELECT * INTO v_carga FROM private.archivos_cargas WHERE storage_path = p_storage_path FOR UPDATE;
  IF NOT FOUND
     OR v_carga.actor_id IS DISTINCT FROM p_actor_id
     OR v_carga.tipo IS DISTINCT FROM p_tipo
     OR v_carga.entidad_id IS DISTINCT FROM p_entidad_id
     OR v_carga.estado NOT IN ('pendiente', 'descartando', 'descartado')
     OR EXISTS (SELECT 1 FROM public.socios WHERE foto_storage_path = p_storage_path)
     OR EXISTS (SELECT 1 FROM public.club WHERE logo_storage_path = p_storage_path)
     OR EXISTS (SELECT 1 FROM public.gastos WHERE evidencia_storage_path = p_storage_path) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo se descarta la carga propia que no este asociada';
  END IF;
  UPDATE private.archivos_cargas
  SET estado = 'descartando'
  WHERE storage_path = p_storage_path AND estado <> 'descartado';
END;
$$;

CREATE OR REPLACE FUNCTION public.archivo_finalizar_descarte(
  p_actor_id uuid,
  p_storage_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo autoridad de archivos';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'club-archivos' AND name = p_storage_path) THEN
    RAISE EXCEPTION 'El objeto aun existe';
  END IF;
  UPDATE private.archivos_cargas
  SET estado = 'descartado'
  WHERE storage_path = p_storage_path
    AND actor_id = p_actor_id
    AND estado IN ('descartando', 'descartado');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'La carga no pertenece a este descarte';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------
-- Operaciones administrativas recuperables de usuarios y límites locales de acceso
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.usuarios_exigir_admin(p_actor uuid, p_destino uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_actor AND rol='admin' AND estado='activo') THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501';
  END IF;
  IF p_actor = p_destino THEN
    RAISE EXCEPTION 'Esta gestión no modifica la cuenta propia' USING ERRCODE='42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.usuarios_operacion_reservar(
 p_actor uuid,p_operacion_id uuid,p_tipo text,p_usuario_id uuid,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v private.usuarios_operaciones; v_ejecutar boolean := false;
BEGIN
  PERFORM private.usuarios_exigir_admin(p_actor,p_usuario_id);
  IF p_tipo NOT IN ('crear','editar','desactivar','reactivar','restablecer','reenviar') OR
     (p_tipo='crear') <> (p_usuario_id IS NULL) OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'Operación inválida' USING ERRCODE='22023';
  END IF;
  IF p_tipo='reenviar' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('usuarios:reenviar:'||p_usuario_id::text,0));
    IF NOT EXISTS(SELECT 1 FROM private.usuarios_operaciones WHERE id=p_operacion_id) AND
       (SELECT count(*) FROM private.usuarios_operaciones WHERE tipo='reenviar' AND usuario_id=p_usuario_id AND creado_en>clock_timestamp()-interval '1 hour')>=3 THEN
      RAISE EXCEPTION 'Límite de reenvíos alcanzado para esta cuenta' USING ERRCODE='54000';
    END IF;
  END IF;
  INSERT INTO private.usuarios_operaciones(id,actor_id,usuario_id,tipo,datos)
    VALUES(p_operacion_id,p_actor,coalesce(p_usuario_id,gen_random_uuid()),p_tipo,p_datos)
    ON CONFLICT(id) DO NOTHING RETURNING * INTO v;
  IF FOUND THEN v_ejecutar := true;
  ELSE
    SELECT * INTO STRICT v FROM private.usuarios_operaciones WHERE id=p_operacion_id FOR UPDATE;
    IF v.actor_id<>p_actor OR v.tipo<>p_tipo OR v.datos<>p_datos OR
       (p_tipo<>'crear' AND v.usuario_id<>p_usuario_id) THEN
      RAISE EXCEPTION 'Identidad de operación reutilizada con otros datos' USING ERRCODE='23505';
    END IF;
    IF v.estado IN ('ejecutando','datos_pendientes','sesiones_pendientes') AND v.lease_hasta<=clock_timestamp() THEN
      UPDATE private.usuarios_operaciones SET lease=gen_random_uuid(),lease_hasta=clock_timestamp()+interval '2 minutes',estado='ejecutando',actualizado_en=clock_timestamp()
       WHERE id=v.id RETURNING * INTO v;
      v_ejecutar := true;
    END IF;
  END IF;
  RETURN to_jsonb(v) || jsonb_build_object('ejecutar',v_ejecutar);
END;
$$;

CREATE OR REPLACE FUNCTION public.usuarios_operacion_leer(p_actor uuid,p_operacion_id uuid DEFAULT NULL,p_usuario_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v private.usuarios_operaciones;
BEGIN
  PERFORM private.usuarios_exigir_admin(p_actor,p_usuario_id);
  IF (p_operacion_id IS NULL) = (p_usuario_id IS NULL) THEN RAISE EXCEPTION 'Filtro inválido'; END IF;
  SELECT * INTO v FROM private.usuarios_operaciones WHERE
   (p_operacion_id IS NOT NULL AND id=p_operacion_id AND actor_id=p_actor) OR
   (p_usuario_id IS NOT NULL AND usuario_id=p_usuario_id)
   ORDER BY creado_en DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v) - 'lease' - 'datos' - 'identidad_creada' - 'clave_establecida';
END;
$$;

CREATE OR REPLACE FUNCTION public.usuarios_operacion_guardar(
 p_actor uuid,p_operacion_id uuid,p_lease uuid,p_estado text,p_revocacion_pendiente boolean DEFAULT false,p_enlace_enviado boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.usuarios_exigir_admin(p_actor);
  IF p_estado NOT IN ('enviando','completo','enlace_pendiente','sesiones_pendientes','datos_pendientes','rechazado') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  UPDATE private.usuarios_operaciones SET estado=p_estado,revocacion_pendiente=p_revocacion_pendiente,
   enlace_enviado_en=CASE WHEN p_enlace_enviado THEN clock_timestamp() ELSE enlace_enviado_en END,
   lease_hasta=CASE WHEN p_estado='enviando' THEN clock_timestamp()+interval '2 minutes' ELSE clock_timestamp() END,
   actualizado_en=clock_timestamp()
   WHERE id=p_operacion_id AND actor_id=p_actor AND lease=p_lease;
  IF NOT FOUND THEN RAISE EXCEPTION 'La operación cambió; consulte su estado' USING ERRCODE='40001'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.usuarios_revocar_sesiones(p_actor uuid,p_usuario_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.usuarios_exigir_admin(p_actor,p_usuario_id);
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_usuario_id) THEN RAISE EXCEPTION 'Usuario no disponible'; END IF;
  -- Auth Admin signOut requiere el JWT del destinatario. Esta operación técnica local
  -- elimina sus refresh tokens/sesiones por identidad; no necesita ni expone ese JWT.
  DELETE FROM auth.refresh_tokens WHERE user_id::text=p_usuario_id::text;
  DELETE FROM auth.sessions WHERE user_id=p_usuario_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.usuarios_enlace_pendiente(p_actor uuid,p_usuario_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.usuarios_exigir_admin(p_actor,p_usuario_id);
  RETURN EXISTS(
    SELECT 1 FROM public.usuarios u JOIN auth.users a ON a.id=u.id
    WHERE u.id=p_usuario_id AND u.estado='activo' AND (
      -- Un alta inicial sin contraseña puede reenviar también después de expirar su enlace.
      (EXISTS(
        SELECT 1 FROM private.usuarios_operaciones inicial WHERE inicial.usuario_id=u.id AND inicial.tipo='crear' AND inicial.estado<>'rechazado'
          AND inicial.identidad_creada=true AND inicial.clave_establecida=false))
      OR (u.rol='responsable' AND EXISTS(
        SELECT 1 FROM private.usuarios_operaciones o WHERE o.usuario_id=u.id
        AND (o.estado='enlace_pendiente' OR (o.estado='enviando' AND o.lease_hasta<=clock_timestamp()))
        AND NOT EXISTS(SELECT 1 FROM private.usuarios_operaciones posterior WHERE posterior.usuario_id=u.id
          AND posterior.enlace_enviado_en>o.actualizado_en)))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.acceso_limitar(p_tipo text,p_ip_hash text,p_email_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_hoy timestamptz:=clock_timestamp(); v_ip integer; v_email integer;
BEGIN
 IF p_tipo NOT IN ('login','recuperar') OR p_ip_hash !~ '^[a-f0-9]{64}$' OR p_email_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Límite inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('acceso:ip:'||p_tipo||p_ip_hash,0));
 IF p_tipo='recuperar' THEN PERFORM pg_advisory_xact_lock(hashtextextended('acceso:email:'||p_email_hash,0)); END IF;
 DELETE FROM private.acceso_intentos WHERE creado_en < v_hoy-interval '1 hour';
 SELECT count(*) INTO v_ip FROM private.acceso_intentos WHERE tipo=p_tipo AND ip_hash=p_ip_hash
   AND creado_en>v_hoy-CASE WHEN p_tipo='login' THEN interval '1 minute' ELSE interval '1 hour' END;
 SELECT count(*) INTO v_email FROM private.acceso_intentos WHERE tipo='recuperar' AND email_hash=p_email_hash AND creado_en>v_hoy-interval '1 hour';
 IF (p_tipo='login' AND v_ip>=5) OR (p_tipo='recuperar' AND (v_ip>=3 OR v_email>=3)) THEN RETURN false; END IF;
 INSERT INTO private.acceso_intentos(tipo,ip_hash,email_hash) VALUES(p_tipo,p_ip_hash,p_email_hash);
 RETURN true;
END;
$$;
--=================================================================================
-- VISTAS SQL REQUERIDAS (LIBRO MAYOR CONTINUO)
--=================================================================================
-- Esta vista consolida los pagos (ingresos) y gastos (egresos) en un solo flujo de caja.
CREATE OR REPLACE VIEW public.flujo_caja WITH (security_invoker = true) AS
SELECT
  'ingreso' AS tipo_movimiento,
  p.id AS movimiento_id,
  p.fecha_pago AS fecha,
  p.monto AS monto,
  p.medio_pago AS metodo,
  p.referencia_pago AS referencia,
  'Cobro Cuota' AS concepto,
  p.estado::text AS estado,
  p.usuario_id AS usuario_id,
  false AS es_reverso
FROM public.pagos p
WHERE p.estado IN ('completado', 'anulado')
UNION ALL
SELECT
  'egreso', g.id,
  g.fecha::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires',
  g.monto, g.metodo_pago, g.referencia_banco, g.concepto,
  g.estado::text, g.usuario_id, false
FROM public.gastos g
UNION ALL
SELECT
  'egreso', p.id, p.anulado_at,
  p.monto, p.medio_pago, p.referencia_pago, 'Anulacion de cobro',
  p.estado::text, p.anulado_por, true
FROM public.pagos p
WHERE p.estado = 'anulado'
UNION ALL
SELECT
  'ingreso', g.id, g.anulado_at,
  g.monto, g.metodo_pago, g.referencia_banco, 'Anulacion de gasto',
  g.estado::text, g.anulado_por, true
FROM public.gastos g
WHERE g.estado = 'anulado';

--=================================================================================
-- VISTAS DE LECTURA PARA FILTROS POR ESTADO DERIVADO (ND-17, CU-01.4, CU-05.1)
--=================================================================================
-- Padrón con estado de pago: la morosidad sale de la ÚNICA regla (es_socio_moroso, ND-12)
CREATE OR REPLACE VIEW v_socios_estado_pago WITH (security_invoker = true) AS
SELECT
  s.*,
  m.es_moroso,
  CASE WHEN m.es_moroso THEN 'moroso' ELSE 'al_dia' END AS estado_pago,
  d.pendientes_count,
  d.deuda_pendiente
FROM socios s
CROSS JOIN LATERAL (SELECT es_socio_moroso(s.id) AS es_moroso) m
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS pendientes_count,
         COALESCE(sum(monto), 0) AS deuda_pendiente
  FROM cuotas
  WHERE socio_id = s.id AND estado = 'pendiente'
) d;

-- Historial de cobros con la etiqueta de pantalla del filtro (equivalencia CU-05.1)
CREATE OR REPLACE VIEW v_pagos_etiqueta_fiscal WITH (security_invoker = true) AS
SELECT
  p.id, p.cuota_id, p.usuario_id, p.monto, p.medio_pago, p.referencia_pago,
  p.fecha_pago, p.estado AS estado_pago,
  c.id AS comprobante_id, c.tipo AS tipo_comprobante, c.numero_comprobante,
  c.estado_fiscal, c.intentos_reintento, c.proximo_reintento_en,
  s.id AS socio_id, s.dni AS socio_dni, s.nombre AS socio_nombre,
  s.apellido AS socio_apellido, s.estado AS socio_estado,
  CASE
    WHEN p.estado = 'anulado' THEN 'anulado'                                  -- "Anulado"
    WHEN c.estado_fiscal = 'valido' THEN 'activo'                             -- "Activo"
    WHEN c.estado_fiscal IN ('pendiente_cae','anulacion_pendiente')
         THEN 'pendiente_cae'                                                -- "Pendiente de CAE"
    ELSE 'fallido'                                                            -- "Fallido"
  END AS etiqueta_recibo
FROM pagos p
JOIN comprobantes c ON c.pago_id = p.id AND c.tipo = 'factura'  -- 1 factura por pago
JOIN cuotas q        ON q.id = p.cuota_id
JOIN socios s        ON s.id = q.socio_id;

--=================================================================================
-- MOROSIDAD POR DEPORTE (CU-09.1): importe de cuotas EN MORA por deporte
-- Misma regla temporal única: 1 cuota pendiente y >30 días emitida); aditiva por deporte
--=================================================================================
CREATE OR REPLACE VIEW v_morosidad_por_deporte WITH (security_invoker = true) AS
SELECT
  d.id AS deporte_id,
  d.nombre AS deporte,
  count(*)::integer AS cuotas_morosas,
  COALESCE(SUM(q.monto), 0) AS deuda_morosa
FROM deportes d
JOIN categorias c ON c.deporte_id = d.id
JOIN cuotas q   ON q.categoria_id = c.id
WHERE q.estado = 'pendiente'
  AND q.created_at < NOW() - interval '30 days'
GROUP BY d.id, d.nombre;

GRANT SELECT ON public.flujo_caja              TO authenticated, service_role;
GRANT SELECT ON public.v_morosidad_por_deporte TO authenticated, service_role;

GRANT SELECT ON public.v_socios_estado_pago    TO authenticated, service_role;
GRANT SELECT ON public.v_pagos_etiqueta_fiscal TO authenticated, service_role;
--=================================================================================
-- TRIGGERS PARA UPDATED_AT
--=================================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language plpgsql SET search_path = public;

CREATE TRIGGER update_club_modtime BEFORE UPDATE ON club FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_usuarios_modtime BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_socios_modtime BEFORE UPDATE ON socios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deportes_modtime BEFORE UPDATE ON deportes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categorias_modtime BEFORE UPDATE ON categorias FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inscripciones_modtime BEFORE UPDATE ON inscripciones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cuotas_modtime BEFORE UPDATE ON cuotas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pagos_modtime BEFORE UPDATE ON pagos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comprobantes_modtime BEFORE UPDATE ON comprobantes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categorias_gasto_modtime BEFORE UPDATE ON categorias_gasto FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_gastos_modtime BEFORE UPDATE ON gastos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_plantillas_correo_modtime BEFORE UPDATE ON plantillas_correo FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

--=================================================================================
-- TRIGGERS DE INMUTABILIDAD (CU-01.2, CU-03.5, ND-6)
--=================================================================================
CREATE OR REPLACE FUNCTION public.trg_socios_campos_inmutables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
$$;

CREATE TRIGGER socios_inmutabilidad
BEFORE UPDATE ON socios FOR EACH ROW EXECUTE FUNCTION trg_socios_campos_inmutables();

CREATE OR REPLACE FUNCTION trg_cuotas_campos_inmutables()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER cuotas_inmutabilidad
BEFORE UPDATE OR DELETE ON public.cuotas
FOR EACH ROW EXECUTE FUNCTION public.trg_cuotas_campos_inmutables();

CREATE OR REPLACE FUNCTION public.trg_pagos_campos_inmutables()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
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
$$;

CREATE TRIGGER pagos_inmutabilidad
BEFORE UPDATE OR DELETE ON public.pagos
FOR EACH ROW EXECUTE FUNCTION public.trg_pagos_campos_inmutables();

--=================================================================================
-- GUARDA DE SINCRONIZACIÓN DE CREDENCIAL (CU-02.6)
-- Auth es la fuente del email: su trigger propaga el cambio al perfil en
-- la misma transaccion. La EF administrativa actualiza Auth una sola vez.
--=================================================================================
CREATE OR REPLACE FUNCTION public.trg_usuarios_email_solo_flujo_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'El correo del perfil se sincroniza desde Supabase Auth';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER usuarios_email_sync_guard
BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION trg_usuarios_email_solo_flujo_admin();

--=================================================================================
-- VENTANA DE CORRECCIÓN DE GASTOS (CU-06.4)
-- Fuera del día de REGISTRO, los campos operativos no se editan:
-- la corrección es por anulación + nuevo registro (trazabilidad del Libro Mayor).
-- La anulacion valida motivo/rol y completa auditoria; no modifica datos originales.
--=================================================================================
CREATE OR REPLACE FUNCTION public.trg_gastos_edicion_mismo_dia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
    NEW.referencia_banco, NEW.descripcion, NEW.evidencia_url, NEW.evidencia_storage_path
  ) IS DISTINCT FROM ROW(
    OLD.fecha, OLD.categoria_id, OLD.concepto, OLD.monto, OLD.metodo_pago,
    OLD.referencia_banco, OLD.descripcion, OLD.evidencia_url, OLD.evidencia_storage_path
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
$$;

CREATE TRIGGER gastos_edicion_ventana
BEFORE INSERT OR UPDATE OR DELETE ON public.gastos
FOR EACH ROW EXECUTE FUNCTION public.trg_gastos_edicion_mismo_dia();

--=================================================================================
-- TRIGGER PARA SINCRONIZAR USUARIOS DE AUTH A LA TABLA PÚBLICA
--=================================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rol public.rol_usuario;
BEGIN
  -- Serializa el alta inicial para que solo la primera cuenta reciba rol 'admin'
  PERFORM pg_advisory_xact_lock(hashtextextended('usuarios:primer_admin', 0));

  IF NOT EXISTS (SELECT 1 FROM public.usuarios) THEN
    v_rol := 'admin';
  ELSE
    v_rol := 'responsable';
  END IF;

  INSERT INTO public.usuarios (id, email, nombre, apellido, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'nombre'), ''), 'Sin Nombre'),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'apellido'), ''), 'Sin Apellido'),
    v_rol
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, service_role;

-- Trigger que se dispara automáticamente cada vez que un usuario se registra o es creado en Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


CREATE OR REPLACE FUNCTION public.trg_comprobantes_integridad()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
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
$$;
CREATE TRIGGER comprobantes_integridad
BEFORE INSERT OR UPDATE OR DELETE ON public.comprobantes
FOR EACH ROW EXECUTE FUNCTION public.trg_comprobantes_integridad();

CREATE OR REPLACE FUNCTION public.trg_socios_validar_datos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
$$;

CREATE TRIGGER socios_validacion_datos
BEFORE INSERT OR UPDATE ON public.socios
FOR EACH ROW EXECUTE FUNCTION public.trg_socios_validar_datos();

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.usuarios
     SET email = NEW.email
   WHERE id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el perfil del usuario: no se cambio el correo';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_auth_user_email_changed() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_auth_user_email_changed()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.handle_auth_user_email_changed();

-- BEFORE STATEMENT: tomar el bloqueo antes de que UPDATE bloquee cualquier fila.
CREATE OR REPLACE FUNCTION private.trg_bloquear_estructura_deportiva()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM private.bloquear_estructura_deportiva();
  RETURN NULL;
END;
$$;
CREATE TRIGGER estructura_serializada_socios BEFORE INSERT OR UPDATE OR DELETE ON public.socios
FOR EACH STATEMENT EXECUTE FUNCTION private.trg_bloquear_estructura_deportiva();
CREATE TRIGGER estructura_serializada_deportes BEFORE INSERT OR UPDATE OR DELETE ON public.deportes
FOR EACH STATEMENT EXECUTE FUNCTION private.trg_bloquear_estructura_deportiva();
CREATE TRIGGER estructura_serializada_categorias BEFORE INSERT OR UPDATE OR DELETE ON public.categorias
FOR EACH STATEMENT EXECUTE FUNCTION private.trg_bloquear_estructura_deportiva();
CREATE TRIGGER estructura_serializada_inscripciones BEFORE INSERT OR UPDATE OR DELETE ON public.inscripciones
FOR EACH STATEMENT EXECUTE FUNCTION private.trg_bloquear_estructura_deportiva();

CREATE OR REPLACE FUNCTION private.trg_socios_baja_consistente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado = 'inactivo' AND EXISTS (
    SELECT 1 FROM public.inscripciones WHERE socio_id = NEW.id AND estado = 'activa'
  ) THEN RAISE EXCEPTION 'La baja del socio debe cerrar sus inscripciones en la misma transaccion'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER socios_baja_consistente BEFORE INSERT OR UPDATE ON public.socios
FOR EACH ROW EXECUTE FUNCTION private.trg_socios_baja_consistente();

CREATE OR REPLACE FUNCTION private.trg_deportes_baja_consistente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado = 'inactivo' AND EXISTS (
    SELECT 1 FROM public.categorias WHERE deporte_id = NEW.id AND estado = 'activo'
  ) THEN RAISE EXCEPTION 'No se puede inactivar un deporte con categorias activas'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER deportes_baja_consistente BEFORE INSERT OR UPDATE ON public.deportes
FOR EACH ROW EXECUTE FUNCTION private.trg_deportes_baja_consistente();

CREATE OR REPLACE FUNCTION private.trg_categorias_estructura_consistente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;
CREATE TRIGGER categorias_estructura_consistente BEFORE INSERT OR UPDATE ON public.categorias
FOR EACH ROW EXECUTE FUNCTION private.trg_categorias_estructura_consistente();

CREATE OR REPLACE FUNCTION private.trg_inscripciones_estructura_consistente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;
CREATE TRIGGER inscripciones_estructura_consistente BEFORE INSERT OR UPDATE ON public.inscripciones
FOR EACH ROW EXECUTE FUNCTION private.trg_inscripciones_estructura_consistente();

REVOKE EXECUTE ON FUNCTION private.trg_bloquear_estructura_deportiva(),
  private.trg_socios_baja_consistente(), private.trg_deportes_baja_consistente(),
  private.trg_categorias_estructura_consistente(), private.trg_inscripciones_estructura_consistente()
FROM PUBLIC, anon, authenticated, service_role;


-- Historial deportivo: la API utiliza baja lógica; tampoco el backend lo borra.
CREATE OR REPLACE FUNCTION private.trg_impedir_borrado_historico()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$ BEGIN
  RAISE EXCEPTION 'No se permite el borrado fisico de %; utilice la baja logica', TG_TABLE_NAME;
END; $$;
CREATE TRIGGER socios_no_borrar BEFORE DELETE ON public.socios
FOR EACH ROW EXECUTE FUNCTION private.trg_impedir_borrado_historico();
CREATE TRIGGER deportes_no_borrar BEFORE DELETE ON public.deportes
FOR EACH ROW EXECUTE FUNCTION private.trg_impedir_borrado_historico();
CREATE TRIGGER categorias_no_borrar BEFORE DELETE ON public.categorias
FOR EACH ROW EXECUTE FUNCTION private.trg_impedir_borrado_historico();
CREATE TRIGGER inscripciones_no_borrar BEFORE DELETE ON public.inscripciones
FOR EACH ROW EXECUTE FUNCTION private.trg_impedir_borrado_historico();
REVOKE ALL ON FUNCTION private.trg_impedir_borrado_historico()
FROM PUBLIC, anon, authenticated, service_role;

-- validación de referencia de archivo validado al asociar en socios, club o gastos.
CREATE OR REPLACE FUNCTION private.validar_archivo_asociado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_tipo text;
  v_path text;
  v_old text;
  v_carga private.archivos_cargas%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'socios' THEN
    v_tipo := 'socio-foto';
    v_path := NEW.foto_storage_path;
    IF TG_OP = 'UPDATE' THEN v_old := OLD.foto_storage_path; END IF;
  ELSIF TG_TABLE_NAME = 'club' THEN
    v_tipo := 'club-logo';
    v_path := NEW.logo_storage_path;
    IF TG_OP = 'UPDATE' THEN v_old := OLD.logo_storage_path; END IF;
  ELSIF TG_TABLE_NAME = 'gastos' THEN
    v_tipo := 'gasto-evidencia';
    v_path := NEW.evidencia_storage_path;
    IF TG_OP = 'UPDATE' THEN v_old := OLD.evidencia_storage_path; END IF;
  END IF;

  IF (TG_OP = 'UPDATE' AND v_path IS NOT DISTINCT FROM v_old) OR (TG_OP = 'INSERT' AND v_path IS NULL) THEN
    RETURN NEW;
  END IF;

  PERFORM public.archivo_autorizar_carga(v_tipo, NEW.id);
  -- replacement never deletes an associated object.
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'Para reemplazar el archivo, cargue otro archivo validado';
  END IF;

  SELECT * INTO v_carga FROM private.archivos_cargas WHERE storage_path = v_path FOR UPDATE;
  IF NOT FOUND
     OR v_carga.tipo IS DISTINCT FROM v_tipo
     OR v_carga.entidad_id IS DISTINCT FROM NEW.id
     OR v_carga.actor_id IS DISTINCT FROM auth.uid()
     OR v_carga.estado NOT IN ('pendiente', 'asociado')
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'club-archivos' AND name = v_path) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'La referencia requiere una carga validada del actor para esta entidad';
  END IF;

  UPDATE private.archivos_cargas SET estado = 'asociado' WHERE storage_path = v_path;
  RETURN NEW;
END;
$$;

CREATE TRIGGER socios_archivo_asociado
BEFORE INSERT OR UPDATE OF foto_storage_path ON public.socios
FOR EACH ROW EXECUTE FUNCTION private.validar_archivo_asociado();

CREATE TRIGGER club_archivo_asociado
BEFORE INSERT OR UPDATE OF logo_storage_path ON public.club
FOR EACH ROW EXECUTE FUNCTION private.validar_archivo_asociado();

CREATE TRIGGER gastos_archivo_asociado
BEFORE INSERT OR UPDATE OF evidencia_storage_path ON public.gastos
FOR EACH ROW EXECUTE FUNCTION private.validar_archivo_asociado();

-- ---------------------------------------------------------------------------------
-- Seguimiento de establecimiento de contraseña inicial sobre auth.users
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.usuarios_registrar_credencial_inicial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    -- Auth Admin aplica app_metadata después del INSERT. El UUID ya fue reservado
    -- por el servicio autorizado y se pasa a createUser; no depende de metadata tardía.
    UPDATE private.usuarios_operaciones SET identidad_creada=true,clave_establecida=false
     WHERE tipo='crear' AND usuario_id=NEW.id AND estado='ejecutando' AND identidad_creada=false;
  ELSE
    -- Sólo compara NEW/OLD dentro del trigger; no copia hash, huella o contraseña.
    UPDATE private.usuarios_operaciones SET clave_establecida=true
     WHERE tipo='crear' AND usuario_id=NEW.id AND identidad_creada=true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usuarios_registrar_credencial_creada ON auth.users;
CREATE TRIGGER usuarios_registrar_credencial_creada AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.usuarios_registrar_credencial_inicial();

DROP TRIGGER IF EXISTS usuarios_registrar_credencial_establecida ON auth.users;
CREATE TRIGGER usuarios_registrar_credencial_establecida AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW WHEN (NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password)
EXECUTE FUNCTION private.usuarios_registrar_credencial_inicial();
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

-- 11. Recarga de la cache de PostgREST.
NOTIFY pgrst, 'reload schema';
-- bucket privado club-archivos y políticas RESTRICTIVE sobre storage.objects.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club-archivos', 'club-archivos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Restrictive policies remain effective even if another permissive bucket policy is later added.
CREATE POLICY club_archivos_lectura_por_autoridad ON storage.objects AS RESTRICTIVE
FOR SELECT TO authenticated, anon USING (bucket_id <> 'club-archivos');

CREATE POLICY club_archivos_insert_por_autoridad ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated, anon WITH CHECK (bucket_id <> 'club-archivos');

CREATE POLICY club_archivos_update_por_autoridad ON storage.objects AS RESTRICTIVE
FOR UPDATE TO authenticated, anon USING (bucket_id <> 'club-archivos') WITH CHECK (bucket_id <> 'club-archivos');

CREATE POLICY club_archivos_delete_por_autoridad ON storage.objects AS RESTRICTIVE
FOR DELETE TO authenticated, anon USING (bucket_id <> 'club-archivos');
-- programador mensual de cuotas en pg_cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $scheduler$
DECLARE
  v_timezone text := current_setting('cron.timezone', true);
BEGIN
  IF v_timezone IS NULL OR v_timezone NOT IN ('GMT', 'UTC', 'Etc/UTC', 'Etc/GMT') THEN
    RAISE EXCEPTION 'Se requiere cron.timezone UTC/GMT para esta programación local';
  END IF;
  IF current_setting('cron.database_name', true) IS DISTINCT FROM current_database() THEN
    RAISE EXCEPTION 'pg_cron debe usar la base local actual';
  END IF;
  -- El worker de PostgreSQL usa la identidad técnica del propietario del job.
  -- No envía JWT humano ni inventa usuario_id; el log mensual no tiene actor humano.
  -- 03:00 UTC/GMT del día 1 = 00:00 America/Argentina/Buenos_Aires (-03).
  PERFORM cron.schedule(
    'sistema-club-los-andes-cuotas-mensuales',
    '0 3 1 * *',
    'SELECT public.generar_cuotas_mes_actual();'
  );
END;
$scheduler$;

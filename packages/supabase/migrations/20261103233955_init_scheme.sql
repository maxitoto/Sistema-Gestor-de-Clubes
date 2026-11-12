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

-- ---------------------------------------------------------------------------------
-- Registro idempotente de altas de gastos e invariantes de texto no vacío 
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.gasto_altas (
 solicitud uuid PRIMARY KEY,
 usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
 datos jsonb NOT NULL,
 gasto_id uuid NOT NULL UNIQUE REFERENCES public.gastos(id),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- NOT VALID conserva legados sin iniciar una corrección masiva; sí protege toda escritura nueva.
ALTER TABLE public.gastos ADD CONSTRAINT chk_gastos_concepto_no_vacio
 CHECK (NULLIF(btrim(concepto),'') IS NOT NULL) NOT VALID;

ALTER TABLE public.categorias_gasto ADD CONSTRAINT chk_categoria_gasto_nombre_no_vacio
 CHECK(NULLIF(btrim(nombre),'') IS NOT NULL) NOT VALID;

-- ---------------------------------------------------------------------------------
-- Coordinación fiscal durable, series, receptores y caché cifrada de tickets WSAA
-- ---------------------------------------------------------------------------------
CREATE TABLE private.fiscal_configuracion(
 club_id uuid PRIMARY KEY REFERENCES public.club(id) ON DELETE RESTRICT,
 ambiente text NOT NULL CHECK(ambiente='homologacion'),
 tipo_factura integer NOT NULL CHECK(tipo_factura BETWEEN 1 AND 999),
 concepto integer NOT NULL CHECK(concepto BETWEEN 1 AND 3),
 moneda text NOT NULL CHECK(moneda='PES'),
 cotizacion numeric(18,6) NOT NULL CHECK(cotizacion=1.000000),
 perfil_importes jsonb NOT NULL,
 usar_periodo_cuota boolean NOT NULL,
 vencimiento_pago text NOT NULL CHECK(vencimiento_pago IN('fecha_comprobante','fin_periodo')),
 confirmado boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((concepto=1 AND NOT usar_periodo_cuota) OR (concepto IN(2,3) AND usar_periodo_cuota))
);

CREATE TABLE private.fiscal_receptores(
 socio_id uuid PRIMARY KEY REFERENCES public.socios(id) ON DELETE RESTRICT,
 doc_tipo integer NOT NULL CHECK(doc_tipo BETWEEN 1 AND 999),
 doc_numero text NOT NULL CHECK(doc_numero~'^(0|[1-9]\d{0,19})$'),
 condicion_iva_id integer NOT NULL CHECK(condicion_iva_id BETWEEN 1 AND 99),
 confirmado boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE private.fiscal_series(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cuit text NOT NULL CHECK(cuit~'^\d{11}$'),
 ambiente text NOT NULL CHECK(ambiente='homologacion'),
 punto_venta integer NOT NULL CHECK(punto_venta BETWEEN 1 AND 99999),
 tipo_comprobante integer NOT NULL CHECK(tipo_comprobante BETWEEN 1 AND 999),
 version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
 ejecucion_activa uuid,
 ultimo_autorizado numeric(12,0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cuit,ambiente,punto_venta,tipo_comprobante)
);

CREATE TABLE private.fiscal_ejecuciones(
 id uuid PRIMARY KEY,
 comprobante_id uuid NOT NULL REFERENCES public.comprobantes(id) ON DELETE RESTRICT,
 serie_id uuid NOT NULL REFERENCES private.fiscal_series(id) ON DELETE RESTRICT,
 version bigint NOT NULL CHECK(version>0),
 clase text NOT NULL CHECK(clase IN('inicial','conciliacion')),
 estado text NOT NULL CHECK(estado IN('adquirida','preparada','posible_envio','desconocido','autorizado','rechazado','transitorio','incidencia')),
 numero text CHECK(numero~'^[1-9]\d{0,11}$'),
 solicitud jsonb,
 posible_envio boolean NOT NULL DEFAULT false,
 resultado jsonb,
 iniciado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 cerrado_en timestamptz,
 actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 recuperaciones integer NOT NULL DEFAULT 0 CHECK(recuperaciones>=0),
 CHECK((numero IS NULL)=(solicitud IS NULL)),
 CHECK(NOT posible_envio OR solicitud IS NOT NULL)
);

ALTER TABLE private.fiscal_series ADD CONSTRAINT fiscal_serie_ejecucion_fk FOREIGN KEY(ejecucion_activa)
 REFERENCES private.fiscal_ejecuciones(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- El índice original sólo distinguía el enum local factura/NC, no la serie fiscal.
ALTER TABLE public.comprobantes ADD COLUMN emisor_cuit text,
 ADD COLUMN ambiente_fiscal text,ADD COLUMN tipo_fiscal integer;
ALTER TABLE public.comprobantes ADD CONSTRAINT comprobante_identidad_fiscal_completa CHECK(
 (emisor_cuit IS NULL AND ambiente_fiscal IS NULL AND tipo_fiscal IS NULL) OR
 (emisor_cuit IS NOT NULL AND ambiente_fiscal IS NOT NULL AND tipo_fiscal IS NOT NULL AND emisor_cuit~'^\d{11}$' AND ambiente_fiscal='homologacion' AND tipo_fiscal BETWEEN 1 AND 999));
ALTER TABLE public.comprobantes DROP CONSTRAINT unique_comprobante_pv_tipo_num;

-- Cache compartida: únicamente sobres cifrados, nunca token/sign en texto plano.
CREATE TABLE private.wsaa_tickets(
 clave text PRIMARY KEY CHECK(clave~'^[0-9a-f]{64}$'),
 sobre text,vence_en timestamptz,
 propietario uuid,version integer NOT NULL DEFAULT 0 CHECK(version>=0),lease_hasta timestamptz,
 CHECK((sobre IS NULL)=(vence_en IS NULL)),CHECK((propietario IS NULL)=(lease_hasta IS NULL))
);

-- Regularización, Nota de Crédito y auditoría de acciones fiscales administrativas.
ALTER TABLE private.fiscal_configuracion ADD COLUMN tipo_nota_credito integer CHECK(tipo_nota_credito BETWEEN 1 AND 999);
ALTER TABLE private.fiscal_configuracion ADD CONSTRAINT tipo_nc_distinto_factura CHECK(tipo_nota_credito IS NULL OR tipo_nota_credito<>tipo_factura);
ALTER TABLE private.fiscal_ejecuciones DROP CONSTRAINT fiscal_ejecuciones_clase_check;
ALTER TABLE private.fiscal_ejecuciones ADD CONSTRAINT fiscal_ejecuciones_clase_check CHECK(clase IN('inicial','conciliacion','manual','automatico'));
CREATE TABLE private.fiscal_auditoria(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comprobante_id uuid NOT NULL REFERENCES public.comprobantes(id),
 actor_id uuid REFERENCES public.usuarios(id),accion text NOT NULL CHECK(accion IN('reabrir','resolver_anulacion','forzar','registrar_externo')),
 ejecucion_id uuid REFERENCES private.fiscal_ejecuciones(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
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

-- índices de exclusión de ejecución fiscal e identidad de numeración por serie
CREATE UNIQUE INDEX fiscal_ejecucion_activa_comprobante ON private.fiscal_ejecuciones(comprobante_id)
 WHERE estado IN('adquirida','preparada','posible_envio','desconocido','incidencia');
CREATE UNIQUE INDEX comprobante_numero_identidad_fiscal ON public.comprobantes(emisor_cuit,ambiente_fiscal,punto_venta,tipo_fiscal,numero_comprobante)
 WHERE tipo_fiscal IS NOT NULL AND numero_comprobante IS NOT NULL;
CREATE UNIQUE INDEX comprobante_numero_identidad_legada ON public.comprobantes(punto_venta,tipo,numero_comprobante)
 WHERE tipo_fiscal IS NULL AND numero_comprobante IS NOT NULL;
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
-- El nombre legacy no puede saltarse la comprobación durable nueva.
--=================================================================================
CREATE OR REPLACE FUNCTION public.reabrir_regularizacion_fiscal(p_comprobante_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ex private.fiscal_ejecuciones%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE comprobante_id=p_comprobante_id ORDER BY iniciado_en DESC,id DESC LIMIT 1;
 result:=public.reabrir_verificado_fiscal(p_comprobante_id,ex.id,ex.version,NULL);
 IF NOT(result->>'reabierto')::boolean THEN RAISE EXCEPTION 'El comprobante no es elegible para reapertura' USING ERRCODE='40001';END IF;
END;$$;

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

-- =================================================================================
-- CONSULTA PAGINADA Y FILTRADA DE COBRANZA (CU-05.1)
-- =================================================================================
CREATE OR REPLACE FUNCTION public.consultar_cobranza(p_vista text,p_criterios jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
 v_page integer;v_limit integer;v_search text;v_number text;v_from date;v_to date;
 v_method text;v_receipt text;v_quota text;v_member text;v_sport uuid;v_category uuid;
 v_socio uuid;v_cuota uuid;v_pago uuid;v_comprobante uuid;v_month integer;v_year integer;
 v_sort text;v_direction text;v_view text;v_column text;v_result jsonb;
BEGIN
 PERFORM private.require_operador();
 IF p_vista NOT IN ('cuotas','pagos') OR p_vista IS NULL OR jsonb_typeof(p_criterios) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Consulta de cobranza inválida' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_criterios)k WHERE k NOT IN
 ('pagina','limite','buscar','comprobante','desde','hasta','medio','estado_recibo','estado_cuota','estado_socio',
 'deporte_id','categoria_id','socio_id','cuota_id','pago_id','comprobante_id','periodo_mes','periodo_anio','orden','direccion')) THEN
  RAISE EXCEPTION 'Filtro no permitido' USING ERRCODE='22023';
 END IF;
 v_page:=coalesce((p_criterios->>'pagina')::integer,0);v_limit:=coalesce((p_criterios->>'limite')::integer,20);
 v_search:=btrim(coalesce(p_criterios->>'buscar',''));v_number:=btrim(coalesce(p_criterios->>'comprobante',''));
 v_from:=nullif(p_criterios->>'desde','')::date;v_to:=nullif(p_criterios->>'hasta','')::date;
 v_method:=coalesce(p_criterios->>'medio','todos');v_receipt:=coalesce(p_criterios->>'estado_recibo','todos');
 v_quota:=coalesce(p_criterios->>'estado_cuota','todos');v_member:=coalesce(p_criterios->>'estado_socio','todos');
 v_sport:=nullif(p_criterios->>'deporte_id','')::uuid;v_category:=nullif(p_criterios->>'categoria_id','')::uuid;
 v_socio:=nullif(p_criterios->>'socio_id','')::uuid;v_cuota:=nullif(p_criterios->>'cuota_id','')::uuid;
 v_pago:=nullif(p_criterios->>'pago_id','')::uuid;v_comprobante:=nullif(p_criterios->>'comprobante_id','')::uuid;
 v_month:=(p_criterios->>'periodo_mes')::integer;v_year:=(p_criterios->>'periodo_anio')::integer;
 v_sort:=coalesce(p_criterios->>'orden','fecha');v_direction:=coalesce(p_criterios->>'direccion','desc');
 IF v_page<0 OR v_page>100000 OR v_limit NOT IN(20,50,100) OR length(v_search)>100 OR length(v_number)>100
  OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_from>v_to)
  OR v_method NOT IN('todos','efectivo','transferencia')
  OR v_receipt NOT IN('todos','activo','pendiente_cae','fallido','anulado')
  OR v_quota NOT IN('todos','pendiente','pagada') OR v_member NOT IN('todos','activo','inactivo')
  OR v_month NOT BETWEEN 1 AND 12 OR v_year NOT BETWEEN 2001 AND 9999
  OR v_direction NOT IN('asc','desc') OR v_sort NOT IN('fecha','socio','periodo','monto','medio','numero','estado') THEN
   RAISE EXCEPTION 'Criterios de cobranza inválidos' USING ERRCODE='22023';
 END IF;
 v_search:='%'||replace(replace(replace(v_search,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 v_number:='%'||replace(replace(replace(v_number,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 v_view:=CASE p_vista WHEN 'cuotas' THEN 'v_cuotas_cobranza' ELSE 'v_pagos_cobranza' END;
 v_column:=CASE v_sort WHEN 'socio' THEN 'lower(socio_apellido || '' '' || socio_nombre)' WHEN 'periodo' THEN '(periodo_anio*12+periodo_mes)'
  WHEN 'numero' THEN 'numero_comprobante' WHEN 'estado' THEN 'coalesce(etiqueta_recibo,estado_cuota)' ELSE v_sort END;
 EXECUTE format($query$
 WITH filtradas AS MATERIALIZED(
  SELECT * FROM public.%I
  WHERE ($1='%%%%' OR socio_dni ILIKE $1 ESCAPE E'\\' OR socio_numero::text ILIKE $1 ESCAPE E'\\'
   OR socio_nombre ILIKE $1 ESCAPE E'\\' OR socio_apellido ILIKE $1 ESCAPE E'\\'
   OR (socio_apellido||' '||socio_nombre) ILIKE $1 ESCAPE E'\\')
  AND ($2='%%%%' OR numero_comprobante ILIKE $2 ESCAPE E'\\')
  AND ($3 IS NULL OR fecha>=($3::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))
  AND ($4 IS NULL OR fecha<(($4+1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))
  AND ($5='todos' OR medio=$5) AND ($6='todos' OR etiqueta_recibo=$6)
  AND ($7='todos' OR estado_cuota=$7) AND ($8='todos' OR socio_estado=$8)
  AND ($9 IS NULL OR deporte_id=$9) AND ($10 IS NULL OR categoria_id=$10)
  AND ($11 IS NULL OR socio_id=$11) AND ($12 IS NULL OR cuota_id=$12)
  AND ($13 IS NULL OR pago_id=$13) AND ($14 IS NULL OR comprobante_id=$14)
  AND ($15 IS NULL OR periodo_mes=$15) AND ($16 IS NULL OR periodo_anio=$16)
 ),pagina AS(
  SELECT f.*,row_number()OVER(ORDER BY %s %s NULLS LAST,id ASC)AS _pos
  FROM filtradas f ORDER BY %s %s NULLS LAST,id ASC LIMIT $17 OFFSET $18
 )
 SELECT jsonb_build_object('filas',coalesce((SELECT jsonb_agg(to_jsonb(p)-'_pos' ORDER BY _pos)FROM pagina p),'[]'::jsonb),
  'total',(SELECT count(*)FROM filtradas),
  'deuda_filtrada',(SELECT coalesce(sum(monto)FILTER(WHERE $19 AND estado_cuota='pendiente'),0)::numeric::text FROM filtradas))
 $query$,v_view,v_column,v_direction,v_column,v_direction)
 INTO v_result USING v_search,v_number,v_from,v_to,v_method,v_receipt,v_quota,v_member,v_sport,v_category,
  v_socio,v_cuota,v_pago,v_comprobante,v_month,v_year,v_limit,v_page*v_limit,p_vista='cuotas';
 RETURN v_result;
END;
$$;

-- =================================================================================
-- CONSULTA DE MOVIMIENTOS DE CAJA CONTINUA (CU-06.6, RN-01, RN-13, ND-6)
-- =================================================================================
CREATE OR REPLACE FUNCTION public.consultar_caja(p_criterios jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_rol text := private.get_rol();
  v_desde date; v_hasta date;
  v_desde_instante timestamptz; v_hasta_instante timestamptz;
  v_pagina integer := 0; v_limite integer := 20;
  v_tipo text := coalesce(p_criterios->>'tipo','todos');
  v_metodo text := coalesce(p_criterios->>'metodo','todos');
  v_origen text := coalesce(p_criterios->>'origen','todos');
  v_reversos text := coalesce(p_criterios->>'reversos','todos');
  v_estado text := coalesce(p_criterios->>'estado','todos');
  v_texto text := coalesce(btrim(p_criterios->>'texto'),'');
  v_orden text := coalesce(p_criterios->>'orden','fecha');
  v_direccion text := coalesce(p_criterios->>'direccion','desc');
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','responsable') THEN
    RAISE EXCEPTION 'Se requiere una cuenta activa para consultar movimientos' USING ERRCODE='42501';
  END IF;
  IF p_criterios IS NULL OR jsonb_typeof(p_criterios)<>'object'
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_criterios) k WHERE k NOT IN
       ('desde','hasta','pagina','limite','tipo','metodo','origen','reversos','estado','texto','orden','direccion'))
     OR EXISTS(SELECT 1 FROM jsonb_each(p_criterios) x WHERE x.key NOT IN ('pagina','limite') AND jsonb_typeof(x.value)<>'string') THEN
    RAISE EXCEPTION 'Filtros de movimientos no permitidos' USING ERRCODE='22023';
  END IF;
  IF p_criterios ? 'pagina' THEN
    IF jsonb_typeof(p_criterios->'pagina')<>'number' OR p_criterios->>'pagina' !~ '^(0|[1-9][0-9]{0,6})$' THEN
      RAISE EXCEPTION 'Página inválida' USING ERRCODE='22023';
    END IF;
    v_pagina := (p_criterios->>'pagina')::integer;
  END IF;
  IF p_criterios ? 'limite' THEN
    IF jsonb_typeof(p_criterios->'limite')<>'number' OR p_criterios->>'limite' NOT IN ('20','50','100') THEN
      RAISE EXCEPTION 'Seleccione 20, 50 o 100 movimientos por página' USING ERRCODE='22023';
    END IF;
    v_limite := (p_criterios->>'limite')::integer;
  END IF;
  IF v_tipo NOT IN ('todos','ingreso','egreso') OR v_metodo NOT IN ('todos','efectivo','transferencia')
     OR v_origen NOT IN ('todos','cobro','gasto') OR v_reversos NOT IN ('todos','originales','reversos')
     OR v_estado NOT IN ('todos','vigente','anulado') OR char_length(v_texto)>255
     OR v_orden NOT IN ('fecha','monto','concepto','tipo','metodo','estado') OR v_direccion NOT IN ('asc','desc') THEN
    RAISE EXCEPTION 'Filtros de movimientos inválidos' USING ERRCODE='22023';
  END IF;
  IF coalesce(p_criterios->>'desde','')<>'' THEN
    IF p_criterios->>'desde' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Fecha inicial inválida' USING ERRCODE='22023';
    END IF;
    v_desde := (p_criterios->>'desde')::date;
    v_desde_instante := v_desde::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires';
  END IF;
  IF coalesce(p_criterios->>'hasta','')<>'' THEN
    IF p_criterios->>'hasta' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Fecha final inválida' USING ERRCODE='22023';
    END IF;
    v_hasta := (p_criterios->>'hasta')::date;
    v_hasta_instante := (v_hasta+1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires';
  END IF;
  IF v_desde IS NOT NULL AND v_hasta IS NOT NULL AND v_desde>v_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la final' USING ERRCODE='22023';
  END IF;

  -- Una única consulta: página, conteo y totales comparten el mismo conjunto y snapshot.
  -- La proyección de nombre/apellido del autor es exclusiva del hecho financiero:
  -- no amplía SELECT de usuarios ni expone correo, Auth o identidad administrativa.
  WITH filtrados AS MATERIALIZED (
    SELECT f.tipo_movimiento, f.movimiento_id, f.fecha, f.monto, f.metodo,
      f.referencia, f.concepto, f.estado, f.es_reverso,
      CASE WHEN (f.tipo_movimiento='ingreso')<>f.es_reverso THEN 'cobro' ELSE 'gasto' END AS origen,
      coalesce(nullif(btrim(concat_ws(' ',u.nombre,u.apellido)),''),'Usuario del club') AS autor,
      coalesce(p.created_at,g.created_at) AS cargado_en,
      g.fecha AS fecha_negocio
    FROM public.flujo_caja f
    LEFT JOIN public.usuarios u ON u.id=f.usuario_id
    LEFT JOIN public.pagos p ON p.id=f.movimiento_id AND ((f.tipo_movimiento='ingreso')<>f.es_reverso)
    LEFT JOIN public.gastos g ON g.id=f.movimiento_id AND NOT ((f.tipo_movimiento='ingreso')<>f.es_reverso)
    WHERE (v_desde_instante IS NULL OR f.fecha>=v_desde_instante)
      AND (v_hasta_instante IS NULL OR f.fecha<v_hasta_instante)
      AND (v_tipo='todos' OR f.tipo_movimiento=v_tipo)
      AND (v_metodo='todos' OR f.metodo::text=v_metodo)
      AND (v_origen='todos' OR CASE WHEN (f.tipo_movimiento='ingreso')<>f.es_reverso THEN 'cobro' ELSE 'gasto' END=v_origen)
      AND (v_reversos='todos' OR f.es_reverso=(v_reversos='reversos'))
      AND (v_estado='todos' OR (v_estado='anulado' AND f.estado='anulado') OR (v_estado='vigente' AND f.estado IN ('activo','completado')))
      AND (v_texto='' OR strpos(lower(f.concepto),lower(v_texto))>0 OR strpos(lower(coalesce(f.referencia,'')),lower(v_texto))>0)
  ), ordenados AS (
    SELECT f.*,row_number() OVER(ORDER BY
      CASE WHEN v_orden='fecha' AND v_direccion='asc' THEN f.fecha END ASC NULLS LAST,
      CASE WHEN v_orden='fecha' AND v_direccion='desc' THEN f.fecha END DESC NULLS LAST,
      CASE WHEN v_orden='monto' AND v_direccion='asc' THEN f.monto END ASC NULLS LAST,
      CASE WHEN v_orden='monto' AND v_direccion='desc' THEN f.monto END DESC NULLS LAST,
      CASE WHEN v_orden='concepto' AND v_direccion='asc' THEN f.concepto END ASC NULLS LAST,
      CASE WHEN v_orden='concepto' AND v_direccion='desc' THEN f.concepto END DESC NULLS LAST,
      CASE WHEN v_orden='tipo' AND v_direccion='asc' THEN f.tipo_movimiento END ASC NULLS LAST,
      CASE WHEN v_orden='tipo' AND v_direccion='desc' THEN f.tipo_movimiento END DESC NULLS LAST,
      CASE WHEN v_orden='metodo' AND v_direccion='asc' THEN f.metodo END ASC NULLS LAST,
      CASE WHEN v_orden='metodo' AND v_direccion='desc' THEN f.metodo END DESC NULLS LAST,
      CASE WHEN v_orden='estado' AND v_direccion='asc' THEN f.estado END ASC NULLS LAST,
      CASE WHEN v_orden='estado' AND v_direccion='desc' THEN f.estado END DESC NULLS LAST,
      f.tipo_movimiento,f.movimiento_id,f.es_reverso) AS posicion
    FROM filtrados f
  ), pagina AS (
    SELECT * FROM ordenados WHERE posicion>v_pagina::bigint*v_limite AND posicion<=(v_pagina::bigint+1)*v_limite
  ), totales AS (
    SELECT count(*) AS cantidad,
      coalesce(sum(monto)FILTER(WHERE tipo_movimiento='ingreso'),0)::numeric(24,2)::text AS ingresos,
      coalesce(sum(monto)FILTER(WHERE tipo_movimiento='egreso'),0)::numeric(24,2)::text AS egresos,
      coalesce(sum(CASE WHEN tipo_movimiento='ingreso' THEN monto ELSE -monto END),0)::numeric(24,2)::text AS neto
    FROM filtrados
  )
  SELECT jsonb_build_object('version',1,'total',t.cantidad,'pagina',v_pagina,'limite',v_limite,
    'totales',CASE WHEN v_rol='admin' THEN jsonb_build_object('ingresos',t.ingresos,'egresos',t.egresos,'neto',t.neto) ELSE NULL END,
    'filas',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'tipo',p.tipo_movimiento,'movimientoId',p.movimiento_id,'fecha',p.fecha,
      'monto',p.monto::text,'metodo',p.metodo,'referencia',p.referencia,'concepto',p.concepto,
      'estado',p.estado,'autor',p.autor,'esReverso',p.es_reverso,'origen',p.origen,
      'origenId',p.movimiento_id,'cargadoEn',p.cargado_en,'fechaNegocio',p.fecha_negocio
    ) ORDER BY p.posicion)FROM pagina p),'[]'::jsonb)
  ) INTO v_resultado FROM totales t;
  RETURN v_resultado;
END;
$$;

ALTER FUNCTION public.consultar_caja(jsonb) OWNER TO postgres;

-- =================================================================================
-- ALTA IDEMPOTENTE Y CONCILIACIÓN DE GASTOS (CU-06.3, RN-15, RN-17)
-- =================================================================================
CREATE OR REPLACE FUNCTION public.registrar_gasto_idempotente(p_solicitud uuid,p_datos jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_actor uuid:=auth.uid(); v_existente private.gasto_altas; v_datos jsonb;
 v_categoria uuid; v_fecha date; v_concepto text; v_monto numeric;
 v_metodo public.medio_pago; v_referencia text; v_descripcion text; v_id uuid;
BEGIN
 PERFORM private.require_operador();
 IF p_solicitud IS NULL OR jsonb_typeof(p_datos)<>'object' OR
   (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_datos) key)
     IS DISTINCT FROM ARRAY['categoria_id','concepto','descripcion','fecha','metodo_pago','monto','referencia_banco']::text[] THEN
   RAISE EXCEPTION 'Campos de gasto no permitidos' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p_datos->'categoria_id')<>'string' OR
    jsonb_typeof(p_datos->'fecha')<>'string' OR (p_datos->>'fecha')!~'^\d{4}-\d{2}-\d{2}$' OR
    jsonb_typeof(p_datos->'concepto')<>'string' OR
    jsonb_typeof(p_datos->'monto')<>'number' OR
    jsonb_typeof(p_datos->'metodo_pago')<>'string' OR
    jsonb_typeof(p_datos->'referencia_banco') NOT IN ('null','string') OR
    jsonb_typeof(p_datos->'descripcion') NOT IN ('null','string') THEN
   RAISE EXCEPTION 'Datos de gasto inválidos' USING ERRCODE='22023';
 END IF;
 v_categoria:=(p_datos->>'categoria_id')::uuid; v_fecha:=(p_datos->>'fecha')::date;
 v_concepto:=btrim(p_datos->>'concepto');v_monto:=(p_datos->>'monto')::numeric;
 v_referencia:=NULLIF(btrim(p_datos->>'referencia_banco'),'');
 v_descripcion:=NULLIF(btrim(p_datos->>'descripcion'),'');
 IF v_concepto='' OR length(v_concepto)>255 OR v_monto<=0 OR v_monto>99999999.99 OR scale(v_monto)>2 OR
    length(v_referencia)>255 OR (p_datos->>'metodo_pago') NOT IN ('efectivo','transferencia') THEN
   RAISE EXCEPTION 'Revisá concepto, importe, medio o referencia del gasto' USING ERRCODE='22023';
 END IF;
 v_metodo:=(p_datos->>'metodo_pago')::public.medio_pago;
 IF v_metodo='transferencia' AND v_referencia IS NULL THEN
   RAISE EXCEPTION 'La transferencia requiere referencia o banco' USING ERRCODE='23514';
 END IF;
 v_datos:=jsonb_build_object('categoria_id',v_categoria,'fecha',v_fecha,'concepto',v_concepto,
   'monto',v_monto,'metodo_pago',v_metodo,'referencia_banco',v_referencia,'descripcion',v_descripcion);
 -- La identidad se serializa antes de consultar/insertar. El gasto y la reserva confirman juntos.
 PERFORM pg_advisory_xact_lock(hashtextextended('gasto-alta:'||p_solicitud::text,0));
 SELECT * INTO v_existente FROM private.gasto_altas WHERE solicitud=p_solicitud;
 IF FOUND THEN
   IF v_existente.usuario_id<>v_actor OR v_existente.datos<>v_datos THEN
     RAISE EXCEPTION 'La identidad del intento pertenece a otros datos' USING ERRCODE='23505';
   END IF;
   RETURN v_existente.gasto_id;
 END IF;
 -- El bloqueo de categoría coordina altas con una baja concurrente. El trigger vuelve a validar.
 PERFORM 1 FROM public.categorias_gasto WHERE id=v_categoria AND estado='activo' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'La categoría debe estar activa' USING ERRCODE='23514'; END IF;
 INSERT INTO public.gastos(categoria_id,fecha,concepto,monto,metodo_pago,referencia_banco,descripcion)
 VALUES(v_categoria,v_fecha,v_concepto,v_monto,v_metodo,v_referencia,v_descripcion) RETURNING id INTO v_id;
 INSERT INTO private.gasto_altas(solicitud,usuario_id,datos,gasto_id)VALUES(p_solicitud,v_actor,v_datos,v_id);
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_alta_gasto(p_solicitud uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 PERFORM private.require_operador();
 SELECT gasto_id INTO v_id FROM private.gasto_altas WHERE solicitud=p_solicitud AND usuario_id=auth.uid();
 RETURN v_id;
END;
$$;

-- =================================================================================
-- MOTOR FISCAL DURABLE ARCA (4 FASES), CACHÉ WSAA Y PUBLICACIÓN DOCUMENTAL PDF
-- =================================================================================
CREATE OR REPLACE FUNCTION private.fiscal_objeto_cerrado(p_value jsonb,p_required text[],p_optional text[] DEFAULT '{}')
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_typeof(p_value)='object' AND p_value ?& p_required
   AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(p_value)='object' THEN p_value ELSE '{}'::jsonb END) AS k WHERE NOT(k=ANY(p_required||p_optional))),false)
$$;
CREATE OR REPLACE FUNCTION private.fiscal_fecha_valida(p_value text,p_iso boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_date date; v_format text:=CASE WHEN p_iso THEN 'YYYY-MM-DD' ELSE 'YYYYMMDD' END;
BEGIN
 IF p_value IS NULL OR NOT(p_value~CASE WHEN p_iso THEN '^\d{4}-\d{2}-\d{2}$' ELSE '^\d{8}$' END) THEN RETURN false;END IF;
 v_date:=to_date(p_value,v_format);RETURN to_char(v_date,v_format)=p_value;
EXCEPTION WHEN OTHERS THEN RETURN false;END;$$;
CREATE OR REPLACE FUNCTION private.fiscal_perfil_valido(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF NOT private.fiscal_objeto_cerrado(p_value,ARRAY['modo'],ARRAY['ivaId','porcentajeIva']) THEN RETURN false;END IF;
 IF p_value->>'modo' IN('neto_sin_iva','exento','no_gravado') THEN RETURN NOT(p_value ?| ARRAY['ivaId','porcentajeIva']);END IF;
 RETURN p_value->>'modo'='iva_incluido' AND jsonb_typeof(p_value->'ivaId')='number'
  AND p_value->>'ivaId'~'^[1-9]\d{0,2}$' AND (p_value->>'ivaId')::integer<=999
  AND jsonb_typeof(p_value->'porcentajeIva')='string' AND p_value->>'porcentajeIva'~'^(0|[1-9]\d{0,2})\.\d{2}$'
  AND (p_value->>'porcentajeIva')::numeric<=100;
EXCEPTION WHEN OTHERS THEN RETURN false;END;$$;

ALTER TABLE private.fiscal_configuracion
 ADD CONSTRAINT chk_fiscal_configuracion_perfil_valido CHECK(private.fiscal_perfil_valido(perfil_importes));

ALTER TABLE private.fiscal_series
 ADD CONSTRAINT chk_fiscal_series_cuit_valido CHECK(public.cuit_valido((substr(cuit,1,2)||'-'||substr(cuit,3,8)||'-'||substr(cuit,11,1))::varchar));

CREATE OR REPLACE FUNCTION private.fiscal_ejecucion_json(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',e.id,'comprobanteId',e.comprobante_id,'serieId',e.serie_id,'version',e.version::text,
 'estado',e.estado,'identidad',jsonb_build_object('cuit',s.cuit,'ambiente',s.ambiente,'puntoVenta',s.punto_venta,'tipoComprobante',s.tipo_comprobante),
 'numero',e.numero,'solicitud',e.solicitud,'posibleEnvio',e.posible_envio,'resultado',e.resultado,'iniciadoEn',e.iniciado_en,'cerradoEn',e.cerrado_en)
 FROM private.fiscal_ejecuciones e JOIN private.fiscal_series s ON s.id=e.serie_id WHERE e.id=p_id
$$;
CREATE OR REPLACE FUNCTION public.consultar_ejecucion_fiscal(p_comprobante_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.fiscal_ejecucion_json(e.id) FROM private.fiscal_ejecuciones e
 WHERE e.comprobante_id=p_comprobante_id ORDER BY e.iniciado_en DESC,e.id DESC LIMIT 1
$$;
CREATE OR REPLACE FUNCTION private.fiscal_proximo(p_inicio timestamptz,p_ahora timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT min(p_inicio+make_interval(mins=>m)) FROM unnest(ARRAY[10,30,120,360,720,1380])m
 WHERE p_inicio+make_interval(mins=>m)>p_ahora AND p_ahora<p_inicio+interval '24 hours'
$$;
CREATE OR REPLACE FUNCTION private.fiscal_elegible(p_cb public.comprobantes,p_pago public.pagos)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (p_cb.tipo='factura' AND p_pago.estado='completado') OR
 (p_cb.tipo='nota_credito' AND p_pago.estado='anulado' AND EXISTS(
 SELECT 1 FROM public.comprobantes o WHERE o.id=p_cb.comprobante_origen_id AND o.pago_id=p_pago.id AND o.tipo='factura'
 AND o.estado_fiscal='anulacion_pendiente' AND o.cae IS NOT NULL AND o.numero_comprobante IS NOT NULL AND o.solicitud_fiscal IS NOT NULL))
$$;
CREATE OR REPLACE FUNCTION private.fiscal_actor_admin(p_actor uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p_actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor AND rol='admin' AND estado='activo') THEN RAISE EXCEPTION 'Se requiere administrador activo' USING ERRCODE='42501';END IF;
END;$$;
CREATE OR REPLACE FUNCTION private.fiscal_crear_nc(p_origen public.comprobantes)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 SELECT id INTO result FROM public.comprobantes WHERE comprobante_origen_id=p_origen.id AND tipo='nota_credito';
 IF result IS NOT NULL THEN RETURN result;END IF;
 IF p_origen.tipo<>'factura' OR p_origen.estado_fiscal<>'anulacion_pendiente' OR p_origen.cae IS NULL THEN RAISE EXCEPTION 'El original no habilita nota de crédito';END IF;
 INSERT INTO public.comprobantes(pago_id,tipo,comprobante_origen_id,punto_venta,estado_fiscal,motivo_anulacion,proximo_reintento_en)
 VALUES(p_origen.pago_id,'nota_credito',p_origen.id,p_origen.punto_venta,'pendiente_cae',p_origen.motivo_anulacion,clock_timestamp()+interval '10 minutes') RETURNING id INTO result;
 RETURN result;
END;$$;
CREATE OR REPLACE FUNCTION public.leer_contexto_fiscal(p_comprobante_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'comprobante',jsonb_build_object('id',c.id,'pago_id',c.pago_id,'tipo',c.tipo,'punto_venta',c.punto_venta,'estado_fiscal',c.estado_fiscal,
 'numero_comprobante',c.numero_comprobante,'cae',c.cae,'cae_vencimiento',c.cae_vencimiento,'numero_solicitado',c.numero_solicitado,
 'solicitud_fiscal',c.solicitud_fiscal,'pdf_url',c.pdf_url,'created_at',c.created_at,'updated_at',c.updated_at,'comprobante_origen_id',c.comprobante_origen_id,'ventana_regularizacion_iniciada_en',c.ventana_regularizacion_iniciada_en,'intentos_reintento',c.intentos_reintento,'proximo_reintento_en',c.proximo_reintento_en,'detalle_error_fiscal',c.detalle_error_fiscal),
 'pago',jsonb_build_object('id',p.id,'cuota_id',p.cuota_id,'usuario_id',p.usuario_id,'monto',p.monto::text,'fecha_pago',p.fecha_pago,'estado',p.estado,'medio_pago',p.medio_pago,'referencia_pago',p.referencia_pago),
 'cuota',jsonb_build_object('id',q.id,'socio_id',q.socio_id,'categoria_id',q.categoria_id,'periodo_mes',q.periodo_mes,'periodo_anio',q.periodo_anio),
 'socio',jsonb_build_object('id',s.id,'nombre',s.nombre,'apellido',s.apellido,'dni',s.dni,'direccion',s.direccion),
 'club',jsonb_build_object('id',cl.id,'nombre',cl.nombre,'cuit',cl.cuit,'domicilio_fiscal',cl.domicilio_fiscal,'punto_venta',cl.punto_venta,'email_contacto',cl.email_contacto,'logo_storage_path',cl.logo_storage_path),
 'configuracion',CASE WHEN cf.club_id IS NULL THEN NULL ELSE jsonb_build_object('ambiente',cf.ambiente,'tipo_factura',cf.tipo_factura,'tipo_nota_credito',cf.tipo_nota_credito,'concepto',cf.concepto,'moneda',cf.moneda,'cotizacion',cf.cotizacion::text,'perfil_importes',cf.perfil_importes,'usar_periodo_cuota',cf.usar_periodo_cuota,'vencimiento_pago',cf.vencimiento_pago,'confirmado',cf.confirmado) END,
 'receptor',CASE WHEN rf.socio_id IS NULL THEN NULL ELSE jsonb_build_object('doc_tipo',rf.doc_tipo,'doc_numero',rf.doc_numero,'condicion_iva_id',rf.condicion_iva_id,'confirmado',rf.confirmado) END,
 'ejecucion',public.consultar_ejecucion_fiscal(c.id),
 'notaCreditoId',(SELECT n.id FROM public.comprobantes n WHERE n.comprobante_origen_id=c.id AND n.tipo='nota_credito'),
 'origen',(SELECT jsonb_build_object('id',o.id,'pago_id',o.pago_id,'tipo',o.tipo,'estado_fiscal',o.estado_fiscal,'emisor_cuit',o.emisor_cuit,'ambiente_fiscal',o.ambiente_fiscal,'tipo_fiscal',o.tipo_fiscal,'punto_venta',o.punto_venta,'numero_comprobante',o.numero_comprobante,'cae',o.cae,'cae_vencimiento',o.cae_vencimiento,'solicitud_fiscal',o.solicitud_fiscal) FROM public.comprobantes o WHERE o.id=c.comprobante_origen_id))
 FROM public.comprobantes c JOIN public.pagos p ON p.id=c.pago_id JOIN public.cuotas q ON q.id=p.cuota_id
 JOIN public.socios s ON s.id=q.socio_id CROSS JOIN public.club cl
 LEFT JOIN private.fiscal_configuracion cf ON cf.club_id=cl.id LEFT JOIN private.fiscal_receptores rf ON rf.socio_id=s.id
 WHERE c.id=p_comprobante_id
$$;

CREATE OR REPLACE FUNCTION public.iniciar_ejecucion_fiscal(p_comprobante_id uuid,p_modo text,p_ejecucion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref public.comprobantes%ROWTYPE;cb public.comprobantes%ROWTYPE;pg public.pagos%ROWTYPE;o public.comprobantes%ROWTYPE;
 cl public.club%ROWTYPE;cf private.fiscal_configuracion%ROWTYPE;rf private.fiscal_receptores%ROWTYPE;se private.fiscal_series%ROWTYPE;ex private.fiscal_ejecuciones%ROWTYPE;
 socio uuid;vcuit text;vtipo integer;vamb text;vpv integer;hoy timestamptz;activo boolean;
BEGIN
 IF p_modo IS NULL OR p_modo NOT IN('inicial','conciliacion','manual','automatico') OR p_ejecucion_id IS NULL THEN RAISE EXCEPTION 'Modo o identidad inválidos' USING ERRCODE='22023';END IF;
 SELECT * INTO ref FROM public.comprobantes WHERE id=p_comprobante_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('estado','no_elegible','motivo','comprobante_inexistente','ejecucion',NULL);END IF;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE comprobante_id=ref.id ORDER BY iniciado_en DESC,id DESC LIMIT 1;
 IF FOUND THEN
  SELECT * INTO se FROM private.fiscal_series WHERE id=ex.serie_id FOR UPDATE;
 ELSE
  SELECT * INTO cl FROM public.club WHERE id='00000000-0000-0000-0000-000000000000';
  SELECT * INTO cf FROM private.fiscal_configuracion WHERE club_id=cl.id;
  SELECT q.socio_id INTO socio FROM public.pagos p JOIN public.cuotas q ON q.id=p.cuota_id WHERE p.id=ref.pago_id;
  SELECT * INTO rf FROM private.fiscal_receptores WHERE socio_id=socio;
  IF ref.tipo='nota_credito' THEN
   SELECT * INTO o FROM public.comprobantes WHERE id=ref.comprobante_origen_id;
   vcuit:=o.emisor_cuit;vamb:=o.ambiente_fiscal;vpv:=o.punto_venta;vtipo:=cf.tipo_nota_credito;
   IF cf.club_id IS NULL OR NOT cf.confirmado OR vtipo IS NULL OR o.solicitud_fiscal IS NULL OR o.cae IS NULL OR o.numero_comprobante IS NULL OR vcuit IS NULL THEN
    RETURN jsonb_build_object('estado','pendiente_configuracion','motivo','tipo_nc_o_snapshot_original_sin_confirmar','ejecucion',NULL);END IF;
  ELSE
   IF cf.club_id IS NULL OR NOT cf.confirmado OR rf.socio_id IS NULL OR NOT rf.confirmado THEN RETURN jsonb_build_object('estado','pendiente_configuracion','motivo','perfil_fiscal_o_receptor_sin_confirmar','ejecucion',NULL);END IF;
   vcuit:=regexp_replace(cl.cuit,'[^0-9]','','g');vamb:=cf.ambiente;vpv:=cl.punto_venta;vtipo:=cf.tipo_factura;
   IF cl.id IS NULL OR NOT public.cuit_valido(cl.cuit) OR cl.punto_venta<>ref.punto_venta THEN RETURN jsonb_build_object('estado','pendiente_configuracion','motivo','identidad_club_no_coincide_con_cobro','ejecucion',NULL);END IF;
  END IF;
  IF vamb IS DISTINCT FROM 'homologacion' THEN RETURN jsonb_build_object('estado','pendiente_configuracion','motivo','ambiente_no_habilitado','ejecucion',NULL);END IF;
  INSERT INTO private.fiscal_series(cuit,ambiente,punto_venta,tipo_comprobante) VALUES(vcuit,vamb,vpv,vtipo) ON CONFLICT DO NOTHING;
  SELECT * INTO se FROM private.fiscal_series WHERE cuit=vcuit AND ambiente=vamb AND punto_venta=vpv AND tipo_comprobante=vtipo FOR UPDATE;
 END IF;
 SELECT * INTO pg FROM public.pagos WHERE id=ref.pago_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=CASE WHEN ref.tipo='factura' THEN ref.id ELSE ref.comprobante_origen_id END FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.id FOR UPDATE;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE comprobante_id=ref.id ORDER BY iniciado_en DESC,id DESC LIMIT 1 FOR UPDATE;
 activo:=FOUND AND ex.estado IN('adquirida','preparada','posible_envio','desconocido','incidencia');
 IF activo THEN
  IF ex.serie_id<>se.id OR se.ejecucion_activa IS DISTINCT FROM ex.id THEN RAISE EXCEPTION 'La adquisición cambió, consultar' USING ERRCODE='40001';END IF;
  IF p_ejecucion_id<>ex.id OR p_modo='inicial' THEN RETURN jsonb_build_object('estado','en_curso','motivo','consultar_ejecucion_existente','ejecucion',private.fiscal_ejecucion_json(ex.id));END IF;
  UPDATE private.fiscal_series SET version=version+1 WHERE id=se.id RETURNING * INTO se;
  UPDATE private.fiscal_ejecuciones SET version=se.version,recuperaciones=recuperaciones+1,actualizado_en=clock_timestamp() WHERE id=ex.id RETURNING * INTO ex;
  RETURN jsonb_build_object('estado',CASE WHEN ex.posible_envio OR ex.estado='incidencia' THEN 'conciliacion' ELSE 'adquirida' END,'motivo',CASE WHEN ex.posible_envio THEN 'solo_consulta_no_reenvio' ELSE NULL END,'ejecucion',private.fiscal_ejecucion_json(ex.id));
 END IF;
 IF cb.estado_fiscal<>'pendiente_cae' OR NOT private.fiscal_elegible(cb,pg) OR cb.cae IS NOT NULL OR cb.numero_comprobante IS NOT NULL THEN RETURN jsonb_build_object('estado','no_elegible','motivo','estado_no_elegible','ejecucion',CASE WHEN ex.id IS NULL THEN NULL ELSE private.fiscal_ejecucion_json(ex.id) END);END IF;
 IF p_modo='conciliacion' OR (p_modo='inicial' AND ex.id IS NOT NULL) THEN RETURN jsonb_build_object('estado','finalizada','motivo','usar_regularizacion','ejecucion',CASE WHEN ex.id IS NULL THEN NULL ELSE private.fiscal_ejecucion_json(ex.id) END);END IF;
 IF ex.id IS NULL AND (cb.numero_solicitado IS NOT NULL OR cb.solicitud_fiscal IS NOT NULL) THEN RETURN jsonb_build_object('estado','no_elegible','motivo','legado_requiere_conciliacion','ejecucion',NULL);END IF;
 IF ex.id IS NOT NULL AND ex.posible_envio AND ex.estado<>'rechazado' THEN RETURN jsonb_build_object('estado','no_elegible','motivo','incertidumbre_no_resuelta','ejecucion',private.fiscal_ejecucion_json(ex.id));END IF;
 IF se.ejecucion_activa IS NOT NULL THEN RETURN jsonb_build_object('estado','en_curso','motivo','serie_ocupada','ejecucion',NULL);END IF;
 hoy:=clock_timestamp();
 IF hoy>=cb.ventana_regularizacion_iniciada_en+interval '24 hours' THEN
  UPDATE public.comprobantes SET estado_fiscal='fallido',proximo_reintento_en=NULL WHERE id=cb.id;
  RETURN jsonb_build_object('estado','no_elegible','motivo','ventana_o_presupuesto_agotados','ejecucion',NULL);
 END IF;
 IF p_modo IN('manual','automatico') THEN
  IF hoy>=cb.ventana_regularizacion_iniciada_en+interval '24 hours' OR cb.intentos_reintento>=6 THEN
   UPDATE public.comprobantes SET estado_fiscal='fallido',proximo_reintento_en=NULL WHERE id=cb.id;
   RETURN jsonb_build_object('estado','no_elegible','motivo','ventana_o_presupuesto_agotados','ejecucion',NULL);
  END IF;
  IF p_modo='automatico' AND (cb.proximo_reintento_en IS NULL OR cb.proximo_reintento_en>hoy) THEN RETURN jsonb_build_object('estado','no_elegible','motivo','aun_no_programado','ejecucion',NULL);END IF;
  UPDATE public.comprobantes SET intentos_reintento=intentos_reintento+1,proximo_reintento_en=NULL WHERE id=cb.id;
 END IF;
 IF EXISTS(SELECT 1 FROM private.fiscal_ejecuciones WHERE id=p_ejecucion_id) THEN RAISE EXCEPTION 'Identidad de ejecución reutilizada' USING ERRCODE='22023';END IF;
 UPDATE private.fiscal_series SET version=version+1 WHERE id=se.id RETURNING * INTO se;
 INSERT INTO private.fiscal_ejecuciones(id,comprobante_id,serie_id,version,clase,estado) VALUES(p_ejecucion_id,cb.id,se.id,se.version,p_modo,'adquirida');
 UPDATE private.fiscal_series SET ejecucion_activa=p_ejecucion_id WHERE id=se.id;
 UPDATE public.comprobantes SET emisor_cuit=se.cuit,ambiente_fiscal=se.ambiente,tipo_fiscal=se.tipo_comprobante WHERE id=cb.id;
 RETURN jsonb_build_object('estado','adquirida','motivo',NULL,'ejecucion',private.fiscal_ejecucion_json(p_ejecucion_id));
END;$$;

CREATE OR REPLACE FUNCTION private.fiscal_bloquear_ejecucion(p_ejecucion_id uuid,p_version bigint,p_permitir_final boolean DEFAULT false)
RETURNS private.fiscal_ejecuciones LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ref private.fiscal_ejecuciones%ROWTYPE; ex private.fiscal_ejecuciones%ROWTYPE; se private.fiscal_series%ROWTYPE; cb public.comprobantes%ROWTYPE;
BEGIN
 SELECT * INTO ref FROM private.fiscal_ejecuciones WHERE id=p_ejecucion_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución inexistente' USING ERRCODE='22023';END IF;
 SELECT * INTO se FROM private.fiscal_series WHERE id=ref.serie_id FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id;
 PERFORM 1 FROM public.pagos WHERE id=cb.pago_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=CASE WHEN cb.tipo='factura' THEN cb.id ELSE cb.comprobante_origen_id END FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=cb.id FOR UPDATE;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE id=ref.id FOR UPDATE;
 IF p_version IS NULL OR ex.version<>p_version THEN RAISE EXCEPTION 'La versión de ejecución ya no es vigente' USING ERRCODE='40001';END IF;
 IF p_permitir_final AND ex.estado IN('autorizado','rechazado','transitorio') THEN RETURN ex;END IF;
 IF se.version<>p_version OR se.ejecucion_activa IS DISTINCT FROM ex.id THEN
  RAISE EXCEPTION 'Adquisición fiscal vencida por una recuperación, consultar nuevamente' USING ERRCODE='40001';
 END IF;
 RETURN ex;
END;$$;

CREATE OR REPLACE FUNCTION private.fiscal_solicitud_valida(p_solicitud jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE d jsonb; x jsonb; v_total numeric; v_parts numeric:=0; v_iva numeric:=0; v_trib numeric:=0; k text;
BEGIN
 IF NOT private.fiscal_objeto_cerrado(p_solicitud,ARRAY['version','identidad','emisor','receptor','detalle']) OR p_solicitud->'version'<>'1'::jsonb THEN RETURN false;END IF;
 IF NOT private.fiscal_objeto_cerrado(p_solicitud->'identidad',ARRAY['cuit','ambiente','puntoVenta','tipoComprobante']) OR NOT private.fiscal_objeto_cerrado(p_solicitud->'emisor',ARRAY['nombre','domicilio']) OR NOT private.fiscal_objeto_cerrado(p_solicitud->'receptor',ARRAY['nombre'],ARRAY['domicilio']) THEN RETURN false;END IF;
 IF jsonb_typeof(p_solicitud#>'{identidad,cuit}')<>'string' OR jsonb_typeof(p_solicitud#>'{identidad,ambiente}')<>'string' OR jsonb_typeof(p_solicitud#>'{identidad,puntoVenta}')<>'number' OR jsonb_typeof(p_solicitud#>'{identidad,tipoComprobante}')<>'number' THEN RETURN false;END IF;
 IF p_solicitud#>>'{identidad,cuit}'!~'^\d{11}$' OR p_solicitud#>>'{identidad,ambiente}'<>'homologacion' OR p_solicitud#>>'{identidad,puntoVenta}'!~'^[1-9]\d{0,4}$' OR p_solicitud#>>'{identidad,tipoComprobante}'!~'^[1-9]\d{0,2}$' THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['nombre','domicilio'] LOOP IF jsonb_typeof(p_solicitud->'emisor'->k)<>'string' OR nullif(btrim(p_solicitud->'emisor'->>k),'') IS NULL OR length(p_solicitud->'emisor'->>k)>500 THEN RETURN false;END IF;END LOOP;
 IF jsonb_typeof(p_solicitud#>'{receptor,nombre}')<>'string' OR nullif(btrim(p_solicitud#>>'{receptor,nombre}'),'') IS NULL OR length(p_solicitud#>>'{receptor,nombre}')>255 THEN RETURN false;END IF;
 d:=p_solicitud->'detalle';
 IF NOT private.fiscal_objeto_cerrado(d,ARRAY['Concepto','DocTipo','DocNro','CondicionIVAReceptorId','CbteDesde','CbteHasta','CbteFch','ImpTotal','ImpTotConc','ImpNeto','ImpOpEx','ImpTrib','ImpIVA','MonId','MonCotiz'],ARRAY['FchServDesde','FchServHasta','FchVtoPago','Iva','Tributos','CbtesAsoc']) THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['Concepto','DocTipo','CondicionIVAReceptorId'] LOOP IF jsonb_typeof(d->k)<>'number' THEN RETURN false;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['DocNro','CbteDesde','CbteHasta','CbteFch','MonId','MonCotiz'] LOOP IF jsonb_typeof(d->k)<>'string' THEN RETURN false;END IF;END LOOP;
 IF p_solicitud->'receptor'?'domicilio' AND (jsonb_typeof(p_solicitud#>'{receptor,domicilio}')<>'string' OR nullif(btrim(p_solicitud#>>'{receptor,domicilio}'),'') IS NULL) THEN RETURN false;END IF;
 IF d->>'Concepto' NOT IN('1','2','3') OR d->>'DocTipo'!~'^[1-9]\d{0,2}$' OR d->>'DocNro'!~'^(0|[1-9]\d{0,19})$' OR d->>'CondicionIVAReceptorId'!~'^[1-9]\d?$' OR d->>'CbteDesde'!~'^[1-9]\d{0,11}$' OR d->>'CbteDesde'<>d->>'CbteHasta' OR NOT private.fiscal_fecha_valida(d->>'CbteFch') THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['ImpTotal','ImpTotConc','ImpNeto','ImpOpEx','ImpTrib','ImpIVA'] LOOP IF jsonb_typeof(d->k)<>'string' OR d->>k!~'^(0|[1-9]\d{0,12})\.\d{2}$' THEN RETURN false;END IF;END LOOP;
 v_total:=(d->>'ImpTotal')::numeric;IF v_total<=0 THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['ImpTotConc','ImpNeto','ImpOpEx','ImpTrib','ImpIVA'] LOOP v_parts:=v_parts+(d->>k)::numeric;END LOOP;
 IF v_parts<>v_total OR d->>'MonId'!~'^[A-Z0-9]{3}$' OR d->>'MonCotiz'!~'^(0|[1-9]\d{0,7})\.\d{6}$' OR (d->>'MonCotiz')::numeric<=0 THEN RETURN false;END IF;
 IF d->>'Concepto' IN('2','3') OR d ?| ARRAY['FchServDesde','FchServHasta','FchVtoPago'] THEN
  IF NOT(private.fiscal_fecha_valida(d->>'FchServDesde') AND private.fiscal_fecha_valida(d->>'FchServHasta') AND private.fiscal_fecha_valida(d->>'FchVtoPago')) OR d->>'FchServDesde'>d->>'FchServHasta' OR d->>'FchVtoPago'<d->>'CbteFch' THEN RETURN false;END IF;
 END IF;
 IF d?'Iva' THEN
  IF jsonb_typeof(d->'Iva')<>'array' OR jsonb_array_length(d->'Iva') NOT BETWEEN 1 AND 20 THEN RETURN false;END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(d->'Iva') LOOP
   IF jsonb_typeof(x->'Id')<>'number' OR jsonb_typeof(x->'BaseImp')<>'string' OR jsonb_typeof(x->'Importe')<>'string' THEN RETURN false;END IF;
   IF NOT private.fiscal_objeto_cerrado(x,ARRAY['Id','BaseImp','Importe']) OR x->>'Id'!~'^[1-9]\d{0,2}$' OR x->>'BaseImp'!~'^(0|[1-9]\d{0,12})\.\d{2}$' OR x->>'Importe'!~'^(0|[1-9]\d{0,12})\.\d{2}$' THEN RETURN false;END IF;
   v_iva:=v_iva+(x->>'Importe')::numeric;
  END LOOP;
 END IF;
 IF v_iva<>(d->>'ImpIVA')::numeric THEN RETURN false;END IF;
 IF d?'Tributos' THEN
  IF jsonb_typeof(d->'Tributos')<>'array' OR jsonb_array_length(d->'Tributos') NOT BETWEEN 1 AND 20 THEN RETURN false;END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(d->'Tributos') LOOP
   IF jsonb_typeof(x->'Id')<>'number' OR jsonb_typeof(x->'BaseImp')<>'string' OR jsonb_typeof(x->'Importe')<>'string' OR jsonb_typeof(x->'Desc')<>'string' OR jsonb_typeof(x->'Alic')<>'string' THEN RETURN false;END IF;
   IF NOT private.fiscal_objeto_cerrado(x,ARRAY['Id','Desc','BaseImp','Alic','Importe']) OR x->>'Id'!~'^[1-9]\d{0,2}$' OR x->>'Alic'!~'^\d{1,3}\.\d{2}$' OR x->>'BaseImp'!~'^(0|[1-9]\d{0,12})\.\d{2}$' OR x->>'Importe'!~'^(0|[1-9]\d{0,12})\.\d{2}$' OR nullif(btrim(x->>'Desc'),'') IS NULL THEN RETURN false;END IF;
   v_trib:=v_trib+(x->>'Importe')::numeric;
  END LOOP;
 END IF;
 RETURN v_trib=(d->>'ImpTrib')::numeric;
EXCEPTION WHEN OTHERS THEN RETURN false;END;$$;

CREATE OR REPLACE FUNCTION public.preparar_solicitud_fiscal(p_ejecucion_id uuid,p_version bigint,p_numero text,p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ex private.fiscal_ejecuciones%ROWTYPE; se private.fiscal_series%ROWTYPE; pg public.pagos%ROWTYPE; cb public.comprobantes%ROWTYPE;
 cl public.club%ROWTYPE; cf private.fiscal_configuracion%ROWTYPE; rf private.fiscal_receptores%ROWTYPE; so public.socios%ROWTYPE; qu public.cuotas%ROWTYPE; d jsonb; v_total numeric; v_neto numeric; v_iva numeric; v_modo text;origen public.comprobantes%ROWTYPE;expected jsonb;
BEGIN
 ex:=private.fiscal_bloquear_ejecucion(p_ejecucion_id,p_version);
 IF ex.posible_envio THEN RAISE EXCEPTION 'No se cambia una solicitud posiblemente enviada' USING ERRCODE='40001';END IF;
 IF ex.estado NOT IN('adquirida','preparada') THEN RAISE EXCEPTION 'La ejecución no admite preparación' USING ERRCODE='40001';END IF;
 IF p_numero IS NULL OR p_numero!~'^[1-9]\d{0,11}$' OR NOT private.fiscal_solicitud_valida(p_solicitud) THEN RAISE EXCEPTION 'Solicitud fiscal inválida' USING ERRCODE='22023';END IF;
 IF ex.solicitud IS NOT NULL THEN
  IF ex.numero IS DISTINCT FROM p_numero OR ex.solicitud IS DISTINCT FROM p_solicitud THEN RAISE EXCEPTION 'El snapshot preparado es inmutable en esta ejecución' USING ERRCODE='40001';END IF;
  RETURN private.fiscal_ejecucion_json(ex.id);
 END IF;
 SELECT * INTO se FROM private.fiscal_series WHERE id=ex.serie_id;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ex.comprobante_id;
 SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id;
 IF NOT private.fiscal_elegible(cb,pg) OR cb.estado_fiscal<>'pendiente_cae' THEN RAISE EXCEPTION 'Estado financiero o fiscal no elegible' USING ERRCODE='40001';END IF;

 IF cb.tipo='nota_credito' THEN
  SELECT * INTO origen FROM public.comprobantes WHERE id=cb.comprobante_origen_id;
  SELECT * INTO cf FROM private.fiscal_configuracion WHERE club_id='00000000-0000-0000-0000-000000000000';
  IF cf.tipo_nota_credito IS DISTINCT FROM se.tipo_comprobante OR NOT cf.confirmado OR NOT private.fiscal_solicitud_valida(origen.solicitud_fiscal) THEN RAISE EXCEPTION 'Tipo NC y origen requieren confirmación' USING ERRCODE='22023';END IF;
  expected:=origen.solicitud_fiscal;
  expected:=jsonb_set(expected,'{identidad}',jsonb_build_object('cuit',se.cuit,'ambiente',se.ambiente,'puntoVenta',se.punto_venta,'tipoComprobante',se.tipo_comprobante));
  expected:=jsonb_set(expected,'{detalle,CbteDesde}',to_jsonb(p_numero));expected:=jsonb_set(expected,'{detalle,CbteHasta}',to_jsonb(p_numero));
  expected:=jsonb_set(expected,'{detalle,CbteFch}',to_jsonb(to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD')));
  IF expected#>>'{detalle,Concepto}' IN('2','3') THEN expected:=jsonb_set(expected,'{detalle,FchVtoPago}',to_jsonb(greatest(expected#>>'{detalle,FchVtoPago}',expected#>>'{detalle,CbteFch}')));END IF;
  expected:=jsonb_set(expected,'{detalle,CbtesAsoc}',jsonb_build_array(jsonb_build_object('Tipo',origen.tipo_fiscal,'PtoVta',origen.punto_venta,'Nro',origen.numero_comprobante,'Cuit',origen.emisor_cuit,'CbteFch',origen.solicitud_fiscal#>>'{detalle,CbteFch}')));
  IF p_solicitud IS DISTINCT FROM expected OR se.cuit IS DISTINCT FROM origen.emisor_cuit OR se.ambiente IS DISTINCT FROM origen.ambiente_fiscal OR se.punto_venta<>origen.punto_venta THEN RAISE EXCEPTION 'La NC no coincide con factura original y asociación exactas' USING ERRCODE='22023';END IF;
  UPDATE private.fiscal_ejecuciones SET numero=p_numero,solicitud=p_solicitud,estado='preparada',actualizado_en=clock_timestamp() WHERE id=ex.id;
  UPDATE public.comprobantes SET numero_solicitado=p_numero,solicitud_fiscal=p_solicitud WHERE id=cb.id;
  RETURN private.fiscal_ejecucion_json(ex.id);
 END IF;
 SELECT * INTO qu FROM public.cuotas WHERE id=pg.cuota_id;
 SELECT * INTO so FROM public.socios WHERE id=qu.socio_id;
 SELECT * INTO cl FROM public.club WHERE id='00000000-0000-0000-0000-000000000000';
 SELECT * INTO cf FROM private.fiscal_configuracion WHERE club_id=cl.id;
 SELECT * INTO rf FROM private.fiscal_receptores WHERE socio_id=so.id;
 d:=p_solicitud->'detalle';
 IF cf.club_id IS NULL OR rf.socio_id IS NULL OR NOT cf.confirmado OR NOT rf.confirmado OR p_solicitud->'identidad'<>jsonb_build_object('cuit',se.cuit,'ambiente',se.ambiente,'puntoVenta',se.punto_venta,'tipoComprobante',se.tipo_comprobante)
  OR cf.ambiente<>se.ambiente OR cf.tipo_factura<>se.tipo_comprobante OR regexp_replace(cl.cuit,'[^0-9]','','g')<>se.cuit OR cl.punto_venta<>se.punto_venta
  OR p_solicitud#>>'{emisor,nombre}'<>cl.nombre OR p_solicitud#>>'{emisor,domicilio}'<>cl.domicilio_fiscal OR p_solicitud#>>'{receptor,nombre}'<>btrim(so.nombre||' '||so.apellido)
  OR (p_solicitud#>>'{receptor,domicilio}') IS DISTINCT FROM nullif(btrim(so.direccion),'')
  OR (d->>'Concepto')::integer<>cf.concepto OR (d->>'DocTipo')::integer<>rf.doc_tipo OR d->>'DocNro'<>rf.doc_numero OR (d->>'CondicionIVAReceptorId')::integer<>rf.condicion_iva_id
  OR d->>'CbteDesde'<>p_numero OR (d->>'ImpTotal')::numeric<>pg.monto OR d->>'MonId'<>cf.moneda OR (d->>'MonCotiz')::numeric<>cf.cotizacion
  OR d?'CbtesAsoc' OR d?'Tributos' OR (d->>'ImpTrib')::numeric<>0 THEN RAISE EXCEPTION 'La solicitud no coincide con la fuente confiable' USING ERRCODE='22023';END IF;
 IF d->>'CbteFch'<>to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD') THEN RAISE EXCEPTION 'La fecha fiscal debe corresponder al día de preparación del club' USING ERRCODE='22023';END IF;
 IF cf.usar_periodo_cuota THEN
  IF d->>'FchServDesde'<>to_char(make_date(qu.periodo_anio,qu.periodo_mes,1),'YYYYMMDD') OR d->>'FchServHasta'<>to_char((make_date(qu.periodo_anio,qu.periodo_mes,1)+interval '1 month - 1 day')::date,'YYYYMMDD')
   OR d->>'FchVtoPago'<>(CASE WHEN cf.vencimiento_pago='fecha_comprobante' THEN d->>'CbteFch' ELSE greatest(d->>'CbteFch',d->>'FchServHasta') END) THEN RAISE EXCEPTION 'Los períodos no coinciden con la regla confirmada' USING ERRCODE='22023';END IF;
 ELSIF d ?| ARRAY['FchServDesde','FchServHasta','FchVtoPago'] THEN RAISE EXCEPTION 'La configuración no habilita períodos de servicio' USING ERRCODE='22023';END IF;
 v_total:=pg.monto;v_modo:=cf.perfil_importes->>'modo';
 v_neto:=CASE WHEN v_modo='neto_sin_iva' THEN v_total WHEN v_modo='iva_incluido' THEN round(v_total/(1+(cf.perfil_importes->>'porcentajeIva')::numeric/100),2) ELSE 0 END;
 v_iva:=CASE WHEN v_modo='iva_incluido' THEN v_total-v_neto ELSE 0 END;
 IF (d->>'ImpNeto')::numeric<>v_neto OR (d->>'ImpIVA')::numeric<>v_iva OR (d->>'ImpOpEx')::numeric<>(CASE WHEN v_modo='exento' THEN v_total ELSE 0 END) OR (d->>'ImpTotConc')::numeric<>(CASE WHEN v_modo='no_gravado' THEN v_total ELSE 0 END) THEN RAISE EXCEPTION 'Los importes no siguen el perfil confirmado' USING ERRCODE='22023';END IF;
 IF v_modo='iva_incluido' THEN
  IF NOT(d?'Iva') OR jsonb_array_length(d->'Iva')<>1 OR d#>>'{Iva,0,Id}'<>cf.perfil_importes->>'ivaId' OR (d#>>'{Iva,0,BaseImp}')::numeric<>v_neto OR (d#>>'{Iva,0,Importe}')::numeric<>v_iva THEN RAISE EXCEPTION 'La alícuota no coincide con la decisión explícita' USING ERRCODE='22023';END IF;
 ELSIF d?'Iva' THEN RAISE EXCEPTION 'El perfil no habilita detalle IVA' USING ERRCODE='22023';END IF;
 UPDATE private.fiscal_ejecuciones SET numero=p_numero,solicitud=p_solicitud,estado='preparada',actualizado_en=clock_timestamp() WHERE id=ex.id;
 UPDATE public.comprobantes SET numero_solicitado=p_numero,solicitud_fiscal=p_solicitud WHERE id=cb.id;
 RETURN private.fiscal_ejecucion_json(ex.id);
END;$$;

CREATE OR REPLACE FUNCTION public.marcar_envio_fiscal(p_ejecucion_id uuid,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ex private.fiscal_ejecuciones%ROWTYPE; cb public.comprobantes%ROWTYPE; pg public.pagos%ROWTYPE;
BEGIN
 ex:=private.fiscal_bloquear_ejecucion(p_ejecucion_id,p_version);
 IF ex.estado<>'preparada' OR ex.posible_envio OR ex.solicitud IS NULL THEN RAISE EXCEPTION 'No se autoriza un segundo envío de la ejecución' USING ERRCODE='40001';END IF;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ex.comprobante_id;SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id;
 IF cb.estado_fiscal<>'pendiente_cae' OR NOT private.fiscal_elegible(cb,pg) THEN RAISE EXCEPTION 'La operación cambió antes de enviar' USING ERRCODE='40001';END IF;
 UPDATE private.fiscal_ejecuciones SET posible_envio=true,estado='posible_envio',actualizado_en=clock_timestamp() WHERE id=ex.id;
 RETURN private.fiscal_ejecucion_json(ex.id);
END;$$;

CREATE OR REPLACE FUNCTION private.fiscal_codigos_validos(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE x jsonb;
BEGIN
 IF jsonb_typeof(p_value)<>'array' OR jsonb_array_length(p_value)>30 THEN RETURN false;END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_value) LOOP
  IF NOT private.fiscal_objeto_cerrado(x,ARRAY['codigo','mensaje']) OR jsonb_typeof(x->'codigo')<>'string' OR x->>'codigo'!~'^[0-9A-Za-z_.:-]{1,80}$' OR jsonb_typeof(x->'mensaje')<>'string' OR length(x->>'mensaje')>500 OR x->>'mensaje'~'[[:cntrl:]]' THEN RETURN false;END IF;
 END LOOP;RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;END;$$;

CREATE OR REPLACE FUNCTION public.confirmar_resultado_fiscal(p_ejecucion_id uuid,p_version bigint,p_resultado jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ex private.fiscal_ejecuciones%ROWTYPE; cb public.comprobantes%ROWTYPE; pg public.pagos%ROWTYPE; a jsonb; d jsonb; k text; v_tipo text; v_detalle text;origen public.comprobantes%ROWTYPE;hoy timestamptz:=clock_timestamp();
BEGIN
 ex:=private.fiscal_bloquear_ejecucion(p_ejecucion_id,p_version,true);
 v_tipo:=p_resultado->>'tipo';
 IF v_tipo='autorizado' THEN
  IF NOT private.fiscal_objeto_cerrado(p_resultado,ARRAY['tipo','autorizacion','observaciones']) OR NOT private.fiscal_codigos_validos(p_resultado->'observaciones') THEN RAISE EXCEPTION 'Resultado autorizado inválido' USING ERRCODE='22023';END IF;
 ELSE
  IF v_tipo IS NULL OR v_tipo NOT IN('rechazado','transitorio','desconocido') OR NOT private.fiscal_objeto_cerrado(p_resultado,ARRAY['tipo','codigos']) OR NOT private.fiscal_codigos_validos(p_resultado->'codigos') THEN RAISE EXCEPTION 'Resultado fiscal inválido' USING ERRCODE='22023';END IF;
 END IF;
 IF ex.estado IN('autorizado','rechazado','transitorio') THEN
  IF ex.resultado=p_resultado THEN RETURN private.fiscal_ejecucion_json(ex.id);END IF;
  RAISE EXCEPTION 'El resultado ya fue confirmado' USING ERRCODE='40001';
 END IF;
 IF v_tipo='transitorio' AND ex.posible_envio THEN RAISE EXCEPTION 'Después de posible envío el resultado es desconocido, no transitorio previo' USING ERRCODE='22023';END IF;
 IF v_tipo IN('autorizado','rechazado','desconocido') AND NOT ex.posible_envio THEN RAISE EXCEPTION 'No hubo una solicitud posiblemente enviada' USING ERRCODE='22023';END IF;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ex.comprobante_id;SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id;
 IF v_tipo='autorizado' THEN
  a:=p_resultado->'autorizacion';d:=ex.solicitud->'detalle';
  IF jsonb_typeof(a)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(a) AS x WHERE x.value='null'::jsonb) THEN RAISE EXCEPTION 'La autorización requiere todos sus campos' USING ERRCODE='22023';END IF;
  FOREACH k IN ARRAY ARRAY['numero','cae','vencimiento','fecha','docNro','moneda','cotizacion','importeTotal','importeNeto','importeNoGravado','importeExento','importeIva','importeTributos'] LOOP IF jsonb_typeof(a->k)<>'string' THEN RAISE EXCEPTION 'Los campos decimales, fecha y código de autorización requieren strings canónicos' USING ERRCODE='22023';END IF;END LOOP;
  IF jsonb_typeof(a->'docTipo')<>'number' OR jsonb_typeof(a->'concepto')<>'number' THEN RAISE EXCEPTION 'Los códigos del resultado requieren enteros' USING ERRCODE='22023';END IF;
  IF NOT private.fiscal_objeto_cerrado(a,ARRAY['identidad','numero','cae','vencimiento','fecha','docTipo','docNro','concepto','moneda','cotizacion','importeTotal','importeNeto','importeNoGravado','importeExento','importeIva','importeTributos','detalle'])
   OR a->'identidad'<>ex.solicitud->'identidad' OR a->>'numero'<>ex.numero OR a->>'cae'!~'^\d{14}$' OR NOT private.fiscal_fecha_valida(a->>'vencimiento',true)
   OR a->>'fecha'<>d->>'CbteFch' OR a->>'docTipo'<>d->>'DocTipo' OR a->>'docNro'<>d->>'DocNro' OR a->>'concepto'<>d->>'Concepto'
   OR a->>'moneda'<>d->>'MonId' OR a->>'cotizacion'<>d->>'MonCotiz' OR a->>'importeTotal'<>d->>'ImpTotal' OR a->>'importeNeto'<>d->>'ImpNeto'
   OR a->>'importeNoGravado'<>d->>'ImpTotConc' OR a->>'importeExento'<>d->>'ImpOpEx' OR a->>'importeIva'<>d->>'ImpIVA' OR a->>'importeTributos'<>d->>'ImpTrib' OR a->'detalle'<>d THEN
   RAISE EXCEPTION 'La autorización no coincide con el snapshot exacto' USING ERRCODE='22023';
  END IF;
 END IF;

 -- Una respuesta sobre factura financieramente anulada resuelve sólo documentos.
 IF cb.tipo='factura' AND pg.estado='anulado' AND cb.estado_fiscal='anulacion_pendiente' THEN
  IF v_tipo='autorizado' THEN
   UPDATE private.fiscal_ejecuciones SET estado='autorizado',resultado=p_resultado,cerrado_en=hoy,actualizado_en=hoy WHERE id=ex.id;
   UPDATE public.comprobantes SET numero_comprobante=ex.numero,cae=a->>'cae',cae_vencimiento=(a->>'vencimiento')::date,detalle_error_fiscal=NULL,proximo_reintento_en=NULL WHERE id=cb.id RETURNING * INTO cb;
   PERFORM private.fiscal_crear_nc(cb);
   UPDATE private.fiscal_series SET ejecucion_activa=NULL,ultimo_autorizado=greatest(coalesce(ultimo_autorizado,0),ex.numero::numeric) WHERE id=ex.serie_id;
  ELSIF v_tipo='rechazado' THEN
   UPDATE private.fiscal_ejecuciones SET estado='rechazado',resultado=p_resultado,cerrado_en=hoy,actualizado_en=hoy WHERE id=ex.id;
   UPDATE public.comprobantes SET estado_fiscal='anulado',proximo_reintento_en=NULL,detalle_error_fiscal=NULL WHERE id=cb.id;
   UPDATE private.fiscal_series SET ejecucion_activa=NULL WHERE id=ex.serie_id;
  ELSE
   UPDATE private.fiscal_ejecuciones SET estado='desconocido',resultado=p_resultado,actualizado_en=hoy WHERE id=ex.id;
  END IF;
  RETURN private.fiscal_ejecucion_json(ex.id);
 END IF;
 IF NOT private.fiscal_elegible(cb,pg) OR cb.estado_fiscal IN('anulado','anulacion_pendiente') THEN
  UPDATE private.fiscal_ejecuciones SET estado='incidencia',resultado=p_resultado,actualizado_en=hoy WHERE id=ex.id;
  RETURN private.fiscal_ejecucion_json(ex.id);
 END IF;
 IF v_tipo='desconocido' THEN
  UPDATE private.fiscal_ejecuciones SET estado='desconocido',resultado=p_resultado,actualizado_en=clock_timestamp() WHERE id=ex.id;
  UPDATE public.comprobantes SET detalle_error_fiscal='Resultado de emisión desconocido; consultar la misma identidad antes de continuar',proximo_reintento_en=NULL WHERE id=cb.id;
 ELSIF v_tipo='autorizado' THEN
  UPDATE private.fiscal_ejecuciones SET estado='autorizado',resultado=p_resultado,cerrado_en=clock_timestamp(),actualizado_en=clock_timestamp() WHERE id=ex.id;
  UPDATE public.comprobantes SET estado_fiscal=CASE WHEN cb.tipo='nota_credito' THEN 'anulado'::public.estado_fiscal ELSE 'valido'::public.estado_fiscal END,numero_comprobante=ex.numero,cae=a->>'cae',cae_vencimiento=(a->>'vencimiento')::date,detalle_error_fiscal=NULL,proximo_reintento_en=NULL WHERE id=cb.id;
  IF cb.tipo='nota_credito' THEN UPDATE public.comprobantes SET estado_fiscal='anulado',proximo_reintento_en=NULL,detalle_error_fiscal=NULL WHERE id=cb.comprobante_origen_id;END IF;
  UPDATE private.fiscal_series SET ejecucion_activa=NULL,ultimo_autorizado=greatest(coalesce(ultimo_autorizado,0),ex.numero::numeric) WHERE id=ex.serie_id;
 ELSE
  SELECT string_agg((x->>'codigo')||': '||(x->>'mensaje'),E'\n') INTO v_detalle FROM jsonb_array_elements(p_resultado->'codigos')x;
  UPDATE private.fiscal_ejecuciones SET estado=v_tipo,resultado=p_resultado,cerrado_en=clock_timestamp(),actualizado_en=clock_timestamp() WHERE id=ex.id;
  UPDATE public.comprobantes SET estado_fiscal=CASE WHEN v_tipo='rechazado' OR cb.intentos_reintento>=6 OR hoy>=cb.ventana_regularizacion_iniciada_en+interval '24 hours' THEN 'fallido'::public.estado_fiscal ELSE 'pendiente_cae'::public.estado_fiscal END,
   detalle_error_fiscal=coalesce(v_detalle,'Resultado fiscal sin detalle público'),proximo_reintento_en=CASE WHEN v_tipo='transitorio' AND cb.intentos_reintento<6 THEN private.fiscal_proximo(cb.ventana_regularizacion_iniciada_en,hoy) ELSE NULL END WHERE id=cb.id;
  UPDATE private.fiscal_series SET ejecucion_activa=NULL WHERE id=ex.serie_id;
 END IF;
 RETURN private.fiscal_ejecucion_json(ex.id);
END;$$;

CREATE OR REPLACE FUNCTION public.registrar_incidencia_fiscal(p_ejecucion_id uuid,p_version bigint,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ex private.fiscal_ejecuciones%ROWTYPE; mensaje text;
BEGIN
 ex:=private.fiscal_bloquear_ejecucion(p_ejecucion_id,p_version);
 mensaje:=CASE p_motivo WHEN 'numero_ocupado' THEN 'El número reservado ya fue utilizado; requiere revisión sin otro envío'
 WHEN 'consulta_incompatible' THEN 'La consulta remota no coincide con la solicitud conservada'
 WHEN 'ausencia_no_concluyente' THEN 'La ausencia consultada no acredita que el envío anterior haya terminado'
 WHEN 'pago_cambio' THEN 'El pago cambió; la resolución fiscal continúa sin modificar dinero' ELSE NULL END;
 IF mensaje IS NULL THEN RAISE EXCEPTION 'Motivo de incidencia no admitido' USING ERRCODE='22023';END IF;
 UPDATE private.fiscal_ejecuciones SET estado='incidencia',resultado=jsonb_build_object('tipo','desconocido','codigos',jsonb_build_array(jsonb_build_object('codigo',upper(p_motivo),'mensaje',mensaje))),actualizado_en=clock_timestamp() WHERE id=ex.id;
 UPDATE public.comprobantes SET detalle_error_fiscal=mensaje,proximo_reintento_en=NULL WHERE id=ex.comprobante_id;
 RETURN private.fiscal_ejecucion_json(ex.id);
END;$$;

CREATE OR REPLACE FUNCTION public.adquirir_ticket_wsaa(p_clave text,p_propietario uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t private.wsaa_tickets%ROWTYPE; ahora timestamptz:=clock_timestamp();
BEGIN
 IF p_clave IS NULL OR p_clave!~'^[0-9a-f]{64}$' OR p_propietario IS NULL THEN RAISE EXCEPTION 'Identidad de ticket inválida' USING ERRCODE='22023';END IF;
 INSERT INTO private.wsaa_tickets(clave) VALUES(p_clave) ON CONFLICT DO NOTHING;
 SELECT * INTO t FROM private.wsaa_tickets WHERE clave=p_clave FOR UPDATE;
 IF t.sobre IS NOT NULL AND t.vence_en>ahora+interval '60 seconds' THEN RETURN jsonb_build_object('tipo','vigente','sobre',t.sobre,'vencimiento',t.vence_en);END IF;
 IF t.lease_hasta>ahora THEN RETURN jsonb_build_object('tipo','en_curso');END IF;
 UPDATE private.wsaa_tickets SET propietario=p_propietario,version=version+1,lease_hasta=ahora+interval '60 seconds' WHERE clave=p_clave RETURNING * INTO t;
 RETURN jsonb_build_object('tipo','adquirido','version',t.version);
END;$$;
CREATE OR REPLACE FUNCTION public.guardar_ticket_wsaa(p_clave text,p_propietario uuid,p_version integer,p_sobre text,p_vencimiento timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t private.wsaa_tickets%ROWTYPE; ahora timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO t FROM private.wsaa_tickets WHERE clave=p_clave FOR UPDATE;
 IF NOT FOUND OR t.propietario IS DISTINCT FROM p_propietario OR t.version IS DISTINCT FROM p_version OR t.lease_hasta<=ahora THEN RAISE EXCEPTION 'La reserva del ticket no es vigente' USING ERRCODE='40001';END IF;
 IF p_sobre IS NULL OR length(p_sobre) NOT BETWEEN 40 AND 65536 OR p_sobre!~'^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$' OR p_vencimiento IS NULL OR p_vencimiento<=ahora+interval '60 seconds' OR p_vencimiento>ahora+interval '48 hours' THEN RAISE EXCEPTION 'Ticket cifrado o vencimiento inválidos' USING ERRCODE='22023';END IF;
 UPDATE private.wsaa_tickets SET sobre=p_sobre,vence_en=p_vencimiento,propietario=NULL,lease_hasta=NULL WHERE clave=p_clave;
END;$$;

CREATE OR REPLACE FUNCTION public.registrar_pdf_comprobante(
 p_comprobante_id uuid,p_tipo_version text,p_storage_path text,p_fuente_esperada jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 c public.comprobantes%ROWTYPE;
 ref public.comprobantes%ROWTYPE;
 origen public.comprobantes%ROWTYPE;
 p public.pagos%ROWTYPE;
 v_pago_id uuid;
 v_keys text[];
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operación documental técnica' USING ERRCODE='42501'; END IF;
 IF p_comprobante_id IS NULL OR p_tipo_version IS NULL OR p_tipo_version NOT IN ('provisional','autorizado')
 OR p_storage_path IS NULL
 OR p_storage_path !~ ('^comprobantes/'||p_comprobante_id::text||'/'||p_tipo_version||'/[0-9a-f]{64}\.pdf$')
 OR jsonb_typeof(p_fuente_esperada) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Contrato documental inválido' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(key ORDER BY key) INTO v_keys FROM jsonb_object_keys(p_fuente_esperada) AS keys(key);
 IF v_keys IS DISTINCT FROM ARRAY['cae','cae_vencimiento','estado_fiscal','numero_comprobante','pago_estado','pago_id','punto_venta','solicitud_fiscal','updated_at']::text[] THEN
  RAISE EXCEPTION 'Campos documentales inválidos' USING ERRCODE='22023';
 END IF;
 SELECT pago_id INTO v_pago_id FROM public.comprobantes WHERE id=p_comprobante_id;
 IF v_pago_id IS NULL THEN RAISE EXCEPTION 'Documento no disponible' USING ERRCODE='P0001'; END IF;
 SELECT * INTO p FROM public.pagos WHERE id=v_pago_id FOR UPDATE;
 SELECT * INTO ref FROM public.comprobantes WHERE id=p_comprobante_id;
 IF ref.tipo='nota_credito' THEN SELECT * INTO origen FROM public.comprobantes WHERE id=ref.comprobante_origen_id FOR UPDATE;END IF;
 SELECT * INTO c FROM public.comprobantes WHERE id=p_comprobante_id FOR UPDATE;
 IF c.pago_id IS DISTINCT FROM v_pago_id OR c.comprobante_origen_id IS DISTINCT FROM ref.comprobante_origen_id
 OR NOT ((c.tipo='factura' AND (p.estado='completado' OR(p.estado='anulado' AND c.estado_fiscal IN('anulacion_pendiente','anulado'))))
 OR(c.tipo='nota_credito' AND p.estado='anulado' AND origen.id IS NOT NULL AND origen.tipo='factura' AND origen.pago_id=p.id
 AND origen.cae IS NOT NULL AND origen.numero_comprobante IS NOT NULL AND origen.solicitud_fiscal IS NOT NULL)) THEN
  RAISE EXCEPTION 'El estado financiero o la relación original requiere revisión' USING ERRCODE='P0001';
 END IF;
 IF p_fuente_esperada->>'pago_id' IS DISTINCT FROM c.pago_id::text
 OR p_fuente_esperada->>'pago_estado' IS DISTINCT FROM p.estado::text
 OR p_fuente_esperada->>'estado_fiscal' IS DISTINCT FROM c.estado_fiscal::text
 OR p_fuente_esperada->'punto_venta' IS DISTINCT FROM to_jsonb(c.punto_venta)
 OR p_fuente_esperada->>'numero_comprobante' IS DISTINCT FROM c.numero_comprobante
 OR p_fuente_esperada->>'cae' IS DISTINCT FROM c.cae
 OR (p_fuente_esperada->>'cae_vencimiento')::date IS DISTINCT FROM c.cae_vencimiento
 OR p_fuente_esperada->'solicitud_fiscal' IS DISTINCT FROM coalesce(c.solicitud_fiscal,'null'::jsonb) THEN
  RAISE EXCEPTION 'El comprobante cambió durante la generación' USING ERRCODE='P0001';
 END IF;
 IF p_tipo_version='provisional' AND (NOT(c.estado_fiscal IN ('pendiente_cae','fallido') OR(c.tipo='factura' AND p.estado='anulado' AND c.estado_fiscal IN('anulacion_pendiente','anulado'))) OR c.cae IS NOT NULL OR c.numero_comprobante IS NOT NULL) THEN
  RAISE EXCEPTION 'No corresponde la versión provisional' USING ERRCODE='P0001';
 END IF;
 IF p_tipo_version='autorizado' AND (NOT((c.tipo='factura' AND c.estado_fiscal IN('valido','anulacion_pendiente','anulado')) OR(c.tipo='nota_credito' AND c.estado_fiscal='anulado')) OR c.cae IS NULL OR c.numero_comprobante IS NULL OR (c.cae !~ '^[0-9]{14}$' OR c.cae ~ '^0+$') OR c.numero_comprobante !~ '^[1-9][0-9]{0,7}$' OR c.cae_vencimiento IS NULL OR c.solicitud_fiscal IS NULL) THEN
  RAISE EXCEPTION 'Falta una autorización fiscal persistida' USING ERRCODE='P0001';
 END IF;
 -- A retried publication of the same immutable version is harmless even if its
 -- previous commit changed updated_at and the HTTP response was lost.
 IF c.pdf_url=p_storage_path THEN RETURN jsonb_build_object('storagePath',p_storage_path,'version',p_tipo_version); END IF;
 IF (p_fuente_esperada->>'updated_at')::timestamptz IS DISTINCT FROM c.updated_at THEN
  RAISE EXCEPTION 'La versión documental cambió; volver a consultar' USING ERRCODE='P0001';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='club-archivos' AND name=p_storage_path) THEN
  RAISE EXCEPTION 'El PDF privado no está guardado' USING ERRCODE='P0001';
 END IF;
 UPDATE public.comprobantes SET pdf_url=p_storage_path WHERE id=c.id;
 RETURN jsonb_build_object('storagePath',p_storage_path,'version',p_tipo_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.expirar_comprobante_fiscal(p_comprobante_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cb public.comprobantes%ROWTYPE;ex private.fiscal_ejecuciones%ROWTYPE;pg public.pagos%ROWTYPE;
BEGIN
 SELECT * INTO cb FROM public.comprobantes WHERE id=p_comprobante_id;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE comprobante_id=p_comprobante_id ORDER BY iniciado_en DESC,id DESC LIMIT 1;
 IF ex.id IS NOT NULL THEN PERFORM 1 FROM private.fiscal_series WHERE id=ex.serie_id FOR UPDATE;END IF;
 SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=CASE WHEN cb.tipo='factura' THEN cb.id ELSE cb.comprobante_origen_id END FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=p_comprobante_id FOR UPDATE;
 IF cb.id IS NULL OR cb.estado_fiscal<>'pendiente_cae' OR NOT private.fiscal_elegible(cb,pg) THEN RETURN jsonb_build_object('expirado',false);END IF;
 -- Un inicio anterior a la frontera conserva el derecho a terminar y guardar CAE.
 IF ex.id IS NOT NULL AND ex.estado IN('adquirida','preparada','posible_envio') THEN RETURN jsonb_build_object('expirado',false);END IF;
 IF cb.intentos_reintento>=6 OR clock_timestamp()>=cb.ventana_regularizacion_iniciada_en+interval '24 hours' THEN
  UPDATE public.comprobantes SET estado_fiscal='fallido',proximo_reintento_en=NULL WHERE id=cb.id;
  RETURN jsonb_build_object('expirado',true);
 END IF;
 RETURN jsonb_build_object('expirado',false);
END;$$;
CREATE OR REPLACE FUNCTION public.listar_candidatos_fiscales(p_limite integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Límite inválido' USING ERRCODE='22023';END IF;
 WITH candidatos AS(
 SELECT c.id,coalesce(c.proximo_reintento_en,c.ventana_regularizacion_iniciada_en+interval '24 hours')fecha,
  (ex.estado IN('adquirida','preparada','posible_envio','desconocido','incidencia'))recuperable
 FROM public.comprobantes c JOIN public.pagos p ON p.id=c.pago_id
 LEFT JOIN LATERAL(SELECT e.estado FROM private.fiscal_ejecuciones e WHERE e.comprobante_id=c.id ORDER BY e.iniciado_en DESC,e.id DESC LIMIT 1)ex ON true
 WHERE c.estado_fiscal IN('pendiente_cae','fallido') AND private.fiscal_elegible(c,p)
 AND ((c.estado_fiscal='pendiente_cae' AND(c.proximo_reintento_en<=now() OR c.ventana_regularizacion_iniciada_en+interval '24 hours'<=now() OR c.intentos_reintento>=6)) OR ex.estado IN('adquirida','preparada','posible_envio','desconocido','incidencia'))
 ),lote AS(SELECT * FROM candidatos ORDER BY fecha,id LIMIT p_limite)
 SELECT jsonb_build_object('candidatos',coalesce(jsonb_agg(jsonb_build_object('comprobanteId',id,'recuperable',coalesce(recuperable,false),'fechaElegible',fecha) ORDER BY fecha,id),'[]'::jsonb),'hayMas',(SELECT count(*)>p_limite FROM candidatos)) INTO result FROM lote;
 RETURN result;
END;$$;
CREATE OR REPLACE FUNCTION public.resolver_anulacion_fiscal(p_ejecucion_id uuid,p_version bigint,p_resultado jsonb,p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;ex private.fiscal_ejecuciones%ROWTYPE;cb public.comprobantes%ROWTYPE;pg public.pagos%ROWTYPE;
BEGIN
 PERFORM private.fiscal_actor_admin(p_actor_id);
 ex:=private.fiscal_bloquear_ejecucion(p_ejecucion_id,p_version,true);
 SELECT * INTO cb FROM public.comprobantes WHERE id=ex.comprobante_id;SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id;
 IF cb.tipo<>'factura' OR pg.estado<>'anulado' OR cb.estado_fiscal NOT IN('anulacion_pendiente','anulado') THEN RAISE EXCEPTION 'No hay anulación pendiente elegible' USING ERRCODE='40001';END IF;
 result:=public.confirmar_resultado_fiscal(p_ejecucion_id,p_version,p_resultado);
 INSERT INTO private.fiscal_auditoria(comprobante_id,actor_id,accion,ejecucion_id)VALUES(cb.id,p_actor_id,'resolver_anulacion',ex.id);
 RETURN result;
END;$$;
CREATE OR REPLACE FUNCTION public.reabrir_verificado_fiscal(p_comprobante_id uuid,p_ejecucion_id uuid DEFAULT NULL,p_version bigint DEFAULT NULL,p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref public.comprobantes%ROWTYPE;cb public.comprobantes%ROWTYPE;pg public.pagos%ROWTYPE;ex private.fiscal_ejecuciones%ROWTYPE;ahora timestamptz;
BEGIN
 PERFORM private.fiscal_actor_admin(p_actor_id);
 SELECT * INTO ref FROM public.comprobantes WHERE id=p_comprobante_id;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE comprobante_id=ref.id ORDER BY iniciado_en DESC,id DESC LIMIT 1;
 IF ex.id IS NOT NULL THEN PERFORM 1 FROM private.fiscal_series WHERE id=ex.serie_id FOR UPDATE;END IF;
 SELECT * INTO pg FROM public.pagos WHERE id=ref.pago_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=CASE WHEN ref.tipo='factura' THEN ref.id ELSE ref.comprobante_origen_id END FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.id FOR UPDATE;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE comprobante_id=ref.id ORDER BY iniciado_en DESC,id DESC LIMIT 1 FOR UPDATE;
 IF cb.id IS NULL OR cb.estado_fiscal<>'fallido' OR NOT private.fiscal_elegible(cb,pg) THEN RETURN jsonb_build_object('reabierto',false);END IF;
 IF ex.id IS DISTINCT FROM p_ejecucion_id OR ex.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'La ejecución cambió, consultar de nuevo' USING ERRCODE='40001';END IF;
 IF ex.id IS NULL AND(cb.numero_solicitado IS NOT NULL OR cb.solicitud_fiscal IS NOT NULL) THEN RAISE EXCEPTION 'Legado sin evidencia de ausencia: no se reabre' USING ERRCODE='40001';END IF;
 IF ex.id IS NOT NULL AND(ex.estado IN('adquirida','preparada','posible_envio','desconocido','incidencia') OR (ex.posible_envio AND ex.estado<>'rechazado')) THEN RAISE EXCEPTION 'Incertidumbre pendiente: no se reinicia la ventana' USING ERRCODE='40001';END IF;
 ahora:=clock_timestamp();
 UPDATE public.comprobantes SET estado_fiscal='pendiente_cae',intentos_reintento=0,ventana_regularizacion_iniciada_en=ahora,proximo_reintento_en=ahora+interval '10 minutes',detalle_error_fiscal=NULL WHERE id=cb.id;
 INSERT INTO private.fiscal_auditoria(comprobante_id,actor_id,accion,ejecucion_id)VALUES(cb.id,p_actor_id,'reabrir',ex.id);
 RETURN jsonb_build_object('reabierto',true);
END;$$;

CREATE OR REPLACE FUNCTION public.consultar_monitoreo_fiscal(p_page integer DEFAULT 1,p_page_size integer DEFAULT 20,p_estado text DEFAULT NULL,p_tipo text DEFAULT NULL,p_busqueda text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rol public.rol_usuario;result jsonb;
BEGIN
 rol:=private.require_operador();
 IF p_page IS NULL OR p_page<1 OR p_page_size IS NULL OR p_page_size NOT IN(20,50,100) OR p_estado IS NOT NULL AND p_estado NOT IN('pendiente_cae','fallido','anulacion_pendiente') OR p_tipo IS NOT NULL AND p_tipo NOT IN('factura','nota_credito') OR length(coalesce(p_busqueda,''))>100 OR p_desde>p_hasta THEN RAISE EXCEPTION 'Filtros fiscales inválidos' USING ERRCODE='22023';END IF;
 WITH filas AS(
 SELECT c.*,p.fecha_pago,p.monto,p.estado pago_estado,s.id socio_id,s.nombre,s.apellido,s.dni,s.numero_socio,
 ex.estado operacion,
 (SELECT n.id FROM public.comprobantes n WHERE n.comprobante_origen_id=c.id AND n.tipo='nota_credito')nc_id
 FROM public.comprobantes c JOIN public.pagos p ON p.id=c.pago_id JOIN public.cuotas q ON q.id=p.cuota_id JOIN public.socios s ON s.id=q.socio_id
 LEFT JOIN LATERAL(SELECT e.estado FROM private.fiscal_ejecuciones e WHERE e.comprobante_id=c.id ORDER BY e.iniciado_en DESC,e.id DESC LIMIT 1)ex ON true
 WHERE c.estado_fiscal IN('pendiente_cae','fallido','anulacion_pendiente') AND(p_estado IS NULL OR c.estado_fiscal::text=p_estado) AND(p_tipo IS NULL OR c.tipo::text=p_tipo)
 AND(nullif(btrim(p_busqueda),'')IS NULL OR s.nombre ILIKE '%'||p_busqueda||'%' OR s.apellido ILIKE '%'||p_busqueda||'%' OR s.dni ILIKE '%'||p_busqueda||'%' OR s.numero_socio::text=p_busqueda)
 AND(p_desde IS NULL OR p.fecha_pago>=p_desde::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
 AND(p_hasta IS NULL OR p.fecha_pago<(p_hasta+1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
 ),pagina AS(SELECT * FROM filas ORDER BY fecha_pago DESC,id DESC LIMIT p_page_size OFFSET (p_page-1)::bigint*p_page_size)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
 'comprobanteId',id,'pagoId',pago_id,'socio',jsonb_build_object('id',socio_id,'nombre',nombre,'apellido',apellido,'dni',dni,'nroSocio',numero_socio),
 'tipo',tipo,'estadoFiscal',estado_fiscal,'fechaCobro',fecha_pago,'monto',monto::text,'intentos',intentos_reintento,'ventanaInicio',ventana_regularizacion_iniciada_en,'ventanaFin',ventana_regularizacion_iniciada_en+interval '24 hours','proximoReintento',proximo_reintento_en,'numero',numero_comprobante,'cae',cae,'vencimiento',cae_vencimiento,'detalleError',detalle_error_fiscal,'origenId',comprobante_origen_id,'ncId',nc_id,'pagoEstado',pago_estado,'operacion',operacion,
 'acciones',jsonb_build_object('registrarExterno',rol='admin' AND numero_solicitado IS NOT NULL AND solicitud_fiscal IS NOT NULL AND estado_fiscal IN('fallido','anulacion_pendiente'),'forzar',rol='admin' AND estado_fiscal='pendiente_cae' AND intentos_reintento<6 AND now()<ventana_regularizacion_iniciada_en+interval '24 hours' AND(tipo='nota_credito' OR pago_estado='completado'),'reabrir',rol='admin' AND estado_fiscal='fallido' AND(tipo='nota_credito' OR pago_estado='completado'),'resolver',rol='admin' AND estado_fiscal='anulacion_pendiente' AND cae IS NULL),'bloqueo',CASE WHEN estado_fiscal='anulacion_pendiente' AND cae IS NOT NULL THEN 'La factura espera la Nota de Crédito; no se vuelve a emitir.' WHEN pago_estado='anulado' AND tipo='factura' THEN 'La anulación financiera está confirmada; sólo se resuelve el documento.' WHEN numero_solicitado IS NOT NULL AND solicitud_fiscal IS NULL THEN 'Documento legado sin snapshot verificable: requiere revisión.' ELSE NULL END
 ) ORDER BY fecha_pago DESC,id DESC),'[]'::jsonb),'page',p_page,'pageSize',p_page_size,'total',(SELECT count(*) FROM filas),'conteos',(SELECT jsonb_build_object('pendientes',count(*)FILTER(WHERE estado_fiscal='pendiente_cae'),'fallidos',count(*)FILTER(WHERE estado_fiscal='fallido'),'anulacionPendiente',count(*)FILTER(WHERE estado_fiscal='anulacion_pendiente'))FROM filas)) INTO result FROM pagina;
 RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.registrar_autorizacion_verificada_fiscal(p_comprobante_id uuid,p_ejecucion_id uuid,p_version bigint,p_resultado jsonb,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref private.fiscal_ejecuciones%ROWTYPE;ex private.fiscal_ejecuciones%ROWTYPE;se private.fiscal_series%ROWTYPE;cb public.comprobantes%ROWTYPE;pg public.pagos%ROWTYPE;new_id uuid:=gen_random_uuid();result jsonb;
BEGIN
 IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Se requiere administrador activo' USING ERRCODE='42501';END IF;
 PERFORM private.fiscal_actor_admin(p_actor_id);
 SELECT * INTO ref FROM private.fiscal_ejecuciones WHERE id=p_ejecucion_id AND comprobante_id=p_comprobante_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'El intento fiscal no corresponde al comprobante' USING ERRCODE='22023';END IF;
 SELECT * INTO se FROM private.fiscal_series WHERE id=ref.serie_id FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id;
 SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=CASE WHEN cb.tipo='factura' THEN cb.id ELSE cb.comprobante_origen_id END FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id FOR UPDATE;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE id=ref.id FOR UPDATE;
 IF ex.version IS DISTINCT FROM p_version OR EXISTS(SELECT 1 FROM private.fiscal_ejecuciones e WHERE e.comprobante_id=cb.id AND e.iniciado_en>ex.iniciado_en) THEN RAISE EXCEPTION 'El intento fiscal cambió, consultar de nuevo' USING ERRCODE='40001';END IF;
 IF ex.estado='autorizado' AND ex.resultado=p_resultado THEN RETURN private.fiscal_ejecucion_json(ex.id);END IF;
 IF ex.estado<>'rechazado' OR NOT ex.posible_envio OR ex.solicitud IS NULL OR se.ejecucion_activa IS NOT NULL OR p_resultado->>'tipo' IS DISTINCT FROM 'autorizado' THEN RAISE EXCEPTION 'No se admite atribuir esta autorización externa' USING ERRCODE='40001';END IF;
 IF NOT(private.fiscal_elegible(cb,pg) OR(cb.tipo='factura' AND pg.estado='anulado' AND cb.estado_fiscal='anulacion_pendiente')) THEN RAISE EXCEPTION 'La situación financiera no admite esta resolución' USING ERRCODE='40001';END IF;
 UPDATE private.fiscal_series SET version=version+1 WHERE id=se.id RETURNING * INTO se;
 INSERT INTO private.fiscal_ejecuciones(id,comprobante_id,serie_id,version,clase,estado,numero,solicitud,posible_envio)
 VALUES(new_id,cb.id,se.id,se.version,'conciliacion','posible_envio',ex.numero,ex.solicitud,true);
 UPDATE private.fiscal_series SET ejecucion_activa=new_id WHERE id=se.id;
 -- Valida todos los campos contra snapshot exacto antes de proyectar; cualquier error revierte todo.
 result:=public.confirmar_resultado_fiscal(new_id,se.version,p_resultado);
 INSERT INTO private.fiscal_auditoria(comprobante_id,actor_id,accion,ejecucion_id)VALUES(cb.id,p_actor_id,'registrar_externo',new_id);
 RETURN result;
END;$$;

CREATE OR REPLACE FUNCTION public.iniciar_ejecucion_fiscal_administrativa(p_comprobante_id uuid,p_modo text,p_ejecucion_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_actor_id IS NULL OR p_modo IS NULL OR p_modo NOT IN('manual','conciliacion') THEN RAISE EXCEPTION 'Acción administrativa inválida' USING ERRCODE='42501';END IF;
 PERFORM private.fiscal_actor_admin(p_actor_id);
 result:=public.iniciar_ejecucion_fiscal(p_comprobante_id,p_modo,p_ejecucion_id);
 IF result->>'estado' IN('adquirida','conciliacion') THEN
  INSERT INTO private.fiscal_auditoria(comprobante_id,actor_id,accion,ejecucion_id)VALUES(p_comprobante_id,p_actor_id,'forzar',(result#>>'{ejecucion,id}')::uuid);
 END IF;
 RETURN result;
END;$$;

-- Cierre administrativo de una ejecución confirmada sin posible envío tras consulta sin hallazgo.
CREATE OR REPLACE FUNCTION public.reabrir_sin_envio_fiscal(p_comprobante_id uuid,p_ejecucion_id uuid,p_version bigint,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref private.fiscal_ejecuciones%ROWTYPE;ex private.fiscal_ejecuciones%ROWTYPE;
 cb public.comprobantes%ROWTYPE;pg public.pagos%ROWTYPE;se private.fiscal_series%ROWTYPE;result jsonb;
BEGIN
 IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Se requiere administrador activo' USING ERRCODE='42501';END IF;
 PERFORM private.fiscal_actor_admin(p_actor_id);
 SELECT * INTO ref FROM private.fiscal_ejecuciones WHERE id=p_ejecucion_id AND comprobante_id=p_comprobante_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'La ejecución no corresponde al comprobante' USING ERRCODE='40001';END IF;
 SELECT * INTO se FROM private.fiscal_series WHERE id=ref.serie_id FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id;
 SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=CASE WHEN cb.tipo='factura' THEN cb.id ELSE cb.comprobante_origen_id END FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id FOR UPDATE;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE comprobante_id=cb.id ORDER BY iniciado_en DESC,id DESC LIMIT 1 FOR UPDATE;
 IF cb.estado_fiscal<>'fallido' OR NOT private.fiscal_elegible(cb,pg) THEN RETURN jsonb_build_object('reabierto',false);END IF;
 IF ex.id IS DISTINCT FROM p_ejecucion_id OR ex.version IS DISTINCT FROM p_version OR se.version IS DISTINCT FROM p_version OR se.ejecucion_activa IS DISTINCT FROM ex.id THEN RAISE EXCEPTION 'La adquisición cambió, consultar nuevamente' USING ERRCODE='40001';END IF;
 IF ex.posible_envio OR ex.estado NOT IN('adquirida','preparada','incidencia') THEN RAISE EXCEPTION 'No consta que el intento siga sin envío; no se reabre' USING ERRCODE='40001';END IF;
 -- Nuevo fence antes de liberar la serie: el antiguo trabajador ya no puede
 -- preparar, marcar ni confirmar. Snapshot y número anteriores quedan en historia.
 UPDATE private.fiscal_series SET version=version+1,ejecucion_activa=NULL WHERE id=se.id RETURNING * INTO se;
 UPDATE private.fiscal_ejecuciones SET version=se.version,estado='transitorio',cerrado_en=clock_timestamp(),actualizado_en=clock_timestamp(),
 resultado=jsonb_build_object('tipo','transitorio','codigos',jsonb_build_array(jsonb_build_object('codigo','CIERRE_SIN_ENVIO','mensaje','Consulta administrativa sin hallazgo y ejecución sin posible envío; adquisición anterior cerrada')))
 WHERE id=ex.id RETURNING * INTO ex;
 -- Reapertura y auditoría forman parte de la misma transacción, no otro commit.
 result:=public.reabrir_verificado_fiscal(cb.id,ex.id,ex.version,p_actor_id);
 IF result->>'reabierto' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'No se confirmó la reapertura' USING ERRCODE='40001';END IF;
 RETURN result;
END;$$;

-- Cerrar sólo el documento de una anulación posterior a rechazo terminal tras consulta sin hallazgo.
CREATE OR REPLACE FUNCTION public.resolver_rechazo_anulado_fiscal(
 p_comprobante_id uuid,p_ejecucion_id uuid,p_version bigint,p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref private.fiscal_ejecuciones%ROWTYPE;ex private.fiscal_ejecuciones%ROWTYPE;
 cb public.comprobantes%ROWTYPE;pg public.pagos%ROWTYPE;actual uuid;
BEGIN
 IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Se requiere administrador activo' USING ERRCODE='42501';END IF;
 PERFORM private.fiscal_actor_admin(p_actor_id);
 SELECT * INTO ref FROM private.fiscal_ejecuciones WHERE id=p_ejecucion_id AND comprobante_id=p_comprobante_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'La ejecución no corresponde al comprobante' USING ERRCODE='40001';END IF;
 PERFORM 1 FROM private.fiscal_series WHERE id=ref.serie_id FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id;
 SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=CASE WHEN cb.tipo='factura' THEN cb.id ELSE cb.comprobante_origen_id END FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE comprobante_origen_id=cb.id AND tipo='nota_credito' ORDER BY id FOR UPDATE;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE id=ref.id FOR UPDATE;
 SELECT id INTO actual FROM private.fiscal_ejecuciones WHERE comprobante_id=cb.id ORDER BY iniciado_en DESC,id DESC LIMIT 1;
 IF ex.id IS DISTINCT FROM actual OR ex.version IS DISTINCT FROM p_version THEN
  RAISE EXCEPTION 'El intento fiscal cambió, consultar nuevamente' USING ERRCODE='40001';END IF;
 IF ex.estado<>'rechazado' OR ex.resultado->>'tipo' IS DISTINCT FROM 'rechazado' OR ex.cerrado_en IS NULL
 OR NOT ex.posible_envio OR ex.numero IS NULL OR ex.solicitud IS NULL
 OR cb.tipo<>'factura' OR pg.estado<>'anulado' OR cb.cae IS NOT NULL OR cb.numero_comprobante IS NOT NULL
 OR cb.numero_solicitado IS DISTINCT FROM ex.numero OR cb.solicitud_fiscal IS DISTINCT FROM ex.solicitud
 OR EXISTS(SELECT 1 FROM public.comprobantes WHERE comprobante_origen_id=cb.id AND tipo='nota_credito') THEN
  RAISE EXCEPTION 'El documento no admite cierre por rechazo confirmado' USING ERRCODE='40001';END IF;
 IF cb.estado_fiscal='anulado' AND EXISTS(SELECT 1 FROM private.fiscal_auditoria WHERE comprobante_id=cb.id AND ejecucion_id=ex.id AND accion='resolver_anulacion') THEN
  RETURN jsonb_build_object('resuelto',true);END IF;
 IF cb.estado_fiscal<>'anulacion_pendiente' THEN
  RAISE EXCEPTION 'No hay anulación pendiente elegible' USING ERRCODE='40001';END IF;
 UPDATE public.comprobantes SET estado_fiscal='anulado',proximo_reintento_en=NULL,detalle_error_fiscal=NULL WHERE id=cb.id;
 INSERT INTO private.fiscal_auditoria(comprobante_id,actor_id,accion,ejecucion_id)VALUES(cb.id,p_actor_id,'resolver_anulacion',ex.id);
 RETURN jsonb_build_object('resuelto',true);
END;$$;

-- Cierre documental local de anulación sólo con historia íntegra sin envío.
CREATE OR REPLACE FUNCTION public.resolver_anulacion_sin_envio_fiscal(
 p_comprobante_id uuid,p_ejecucion_id uuid,p_version bigint,p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref private.fiscal_ejecuciones%ROWTYPE;ex private.fiscal_ejecuciones%ROWTYPE;
 cb public.comprobantes%ROWTYPE;pg public.pagos%ROWTYPE;se private.fiscal_series%ROWTYPE;actual uuid;
BEGIN
 IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Se requiere administrador activo' USING ERRCODE='42501';END IF;
 PERFORM private.fiscal_actor_admin(p_actor_id);
 SELECT * INTO ref FROM private.fiscal_ejecuciones WHERE id=p_ejecucion_id AND comprobante_id=p_comprobante_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'La ejecución no corresponde al comprobante' USING ERRCODE='40001';END IF;
 SELECT * INTO se FROM private.fiscal_series WHERE id=ref.serie_id FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id;
 SELECT * INTO pg FROM public.pagos WHERE id=cb.pago_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE id=CASE WHEN cb.tipo='factura' THEN cb.id ELSE cb.comprobante_origen_id END FOR UPDATE;
 SELECT * INTO cb FROM public.comprobantes WHERE id=ref.comprobante_id FOR UPDATE;
 PERFORM 1 FROM public.comprobantes WHERE comprobante_origen_id=cb.id AND tipo='nota_credito' ORDER BY id FOR UPDATE;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE id=ref.id FOR UPDATE;
 SELECT id INTO actual FROM private.fiscal_ejecuciones WHERE comprobante_id=cb.id ORDER BY iniciado_en DESC,id DESC LIMIT 1;
 IF ex.id IS DISTINCT FROM actual OR ex.version IS DISTINCT FROM p_version THEN
  RAISE EXCEPTION 'El intento fiscal cambió, consultar nuevamente' USING ERRCODE='40001';END IF;
 IF cb.tipo<>'factura' OR pg.estado<>'anulado' OR cb.estado_fiscal NOT IN('anulacion_pendiente','anulado')
 OR cb.cae IS NOT NULL OR cb.numero_comprobante IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.comprobantes WHERE comprobante_origen_id=cb.id AND tipo='nota_credito')
 OR EXISTS(SELECT 1 FROM private.fiscal_ejecuciones WHERE comprobante_id=cb.id AND(posible_envio OR estado NOT IN('adquirida','preparada','incidencia','transitorio')))
 OR EXISTS(SELECT 1 FROM private.fiscal_ejecuciones WHERE comprobante_id=cb.id AND(serie_id<>ref.serie_id OR(id<>ex.id AND(estado<>'transitorio' OR cerrado_en IS NULL))))
 OR cb.numero_solicitado IS NULL OR cb.solicitud_fiscal IS NULL
 OR NOT EXISTS(SELECT 1 FROM private.fiscal_ejecuciones WHERE comprobante_id=cb.id AND NOT posible_envio AND numero=cb.numero_solicitado AND solicitud=cb.solicitud_fiscal AND private.fiscal_solicitud_valida(solicitud)) THEN
  RETURN jsonb_build_object('resuelto',false);END IF;
 IF cb.estado_fiscal='anulado' THEN
  RETURN jsonb_build_object('resuelto',EXISTS(SELECT 1 FROM private.fiscal_auditoria WHERE comprobante_id=cb.id AND ejecucion_id=ex.id AND accion='resolver_anulacion'));END IF;
 IF se.ejecucion_activa=ex.id THEN
  IF se.version IS DISTINCT FROM ex.version THEN RAISE EXCEPTION 'La adquisición fiscal cambió' USING ERRCODE='40001';END IF;
  -- El fence y el puntero invalidan al trabajador anterior. La versión de la
  -- ejecución cerrada se conserva, como en otros resultados terminales, para
  -- recuperar una respuesta perdida sin volver a modificar el documento.
  UPDATE private.fiscal_series SET version=version+1,ejecucion_activa=NULL WHERE id=se.id;
  UPDATE private.fiscal_ejecuciones SET estado='transitorio',resultado=jsonb_build_object('tipo','transitorio','codigos',jsonb_build_array(jsonb_build_object('codigo','CIERRE_ANULACION_SIN_ENVIO','mensaje','Cierre administrativo de historia íntegra sin posible envío'))),cerrado_en=clock_timestamp(),actualizado_en=clock_timestamp() WHERE id=ex.id;
 ELSIF ex.estado<>'transitorio' OR ex.cerrado_en IS NULL THEN
  RAISE EXCEPTION 'La adquisición requiere revisión; no se libera otra ejecución' USING ERRCODE='40001';
 END IF;
 UPDATE public.comprobantes SET estado_fiscal='anulado',proximo_reintento_en=NULL,detalle_error_fiscal=NULL WHERE id=cb.id;
 INSERT INTO private.fiscal_auditoria(comprobante_id,actor_id,accion,ejecucion_id)VALUES(cb.id,p_actor_id,'resolver_anulacion',ex.id);
 RETURN jsonb_build_object('resuelto',true);
END;$$;
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

-- =================================================================================
-- VISTAS OPERATIVAS DE COBRANZA (CU-05.1, RN-04, RN-10, RN-12, ND-12, ND-17)
-- =================================================================================
CREATE OR REPLACE VIEW public.v_cuotas_cobranza WITH (security_invoker=true) AS
SELECT q.id,q.id AS cuota_id,p.id AS pago_id,p.comprobante_id,
 s.id AS socio_id,s.numero_socio AS socio_numero,s.dni AS socio_dni,
 s.nombre AS socio_nombre,s.apellido AS socio_apellido,s.estado::text AS socio_estado,
 c.id AS categoria_id,c.nombre AS categoria_nombre,d.id AS deporte_id,d.nombre AS deporte_nombre,
 q.periodo_mes,q.periodo_anio,q.monto,q.estado::text AS estado_cuota,
 p.estado_pago::text,p.estado_fiscal::text,p.etiqueta_recibo,p.numero_comprobante,
 q.created_at AS fecha,p.fecha_pago,p.medio_pago::text AS medio,p.referencia_pago AS referencia,
 p.usuario_id,s.es_moroso,s.deuda_pendiente,
 coalesce(q.estado='pendiente' AND q.created_at<now()-interval '30 days',false) AS cuota_en_mora
FROM public.cuotas q
JOIN public.v_socios_estado_pago s ON s.id=q.socio_id
JOIN public.categorias c ON c.id=q.categoria_id
JOIN public.deportes d ON d.id=c.deporte_id
LEFT JOIN public.v_pagos_etiqueta_fiscal p ON p.cuota_id=q.id AND p.estado_pago='completado';

CREATE OR REPLACE VIEW public.v_pagos_cobranza WITH (security_invoker=true) AS
SELECT p.id,p.cuota_id,p.id AS pago_id,p.comprobante_id,
 s.id AS socio_id,s.numero_socio AS socio_numero,s.dni AS socio_dni,
 s.nombre AS socio_nombre,s.apellido AS socio_apellido,s.estado::text AS socio_estado,
 c.id AS categoria_id,c.nombre AS categoria_nombre,d.id AS deporte_id,d.nombre AS deporte_nombre,
 q.periodo_mes,q.periodo_anio,p.monto,q.estado::text AS estado_cuota,
 p.estado_pago::text,p.estado_fiscal::text,p.etiqueta_recibo,p.numero_comprobante,
 p.fecha_pago AS fecha,p.fecha_pago,p.medio_pago::text AS medio,p.referencia_pago AS referencia,
 p.usuario_id,s.es_moroso,s.deuda_pendiente,
 coalesce(q.estado='pendiente' AND q.created_at<now()-interval '30 days',false) AS cuota_en_mora
FROM public.v_pagos_etiqueta_fiscal p
JOIN public.cuotas q ON q.id=p.cuota_id
JOIN public.v_socios_estado_pago s ON s.id=p.socio_id
JOIN public.categorias c ON c.id=q.categoria_id
JOIN public.deportes d ON d.id=c.deporte_id;

GRANT SELECT ON public.v_cuotas_cobranza,public.v_pagos_cobranza TO authenticated,service_role;
REVOKE ALL ON public.v_cuotas_cobranza,public.v_pagos_cobranza FROM anon;
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

-- ---------------------------------------------------------------------------------
-- Bloqueo compartido de categoría activa al insertar o recategorizar un gasto
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.gastos_bloquear_categoria_activa()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id THEN
   PERFORM private.require_operador();
   PERFORM 1 FROM public.categorias_gasto WHERE id=NEW.categoria_id AND estado='activo' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'La categoría debe estar activa' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gastos_categoria_activa_lock ON public.gastos;
CREATE TRIGGER gastos_categoria_activa_lock BEFORE INSERT OR UPDATE OF categoria_id ON public.gastos
FOR EACH ROW EXECUTE FUNCTION private.gastos_bloquear_categoria_activa();

-- ---------------------------------------------------------------------------------
-- Inmutabilidad del snapshot fiscal preparado y de la identidad de serie
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.fiscal_preservar_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ex private.fiscal_ejecuciones%ROWTYPE;
BEGIN
 IF OLD.emisor_cuit IS NOT NULL AND (NEW.emisor_cuit,NEW.ambiente_fiscal,NEW.tipo_fiscal) IS DISTINCT FROM (OLD.emisor_cuit,OLD.ambiente_fiscal,OLD.tipo_fiscal) THEN RAISE EXCEPTION 'La identidad fiscal es inmutable';END IF;
 SELECT * INTO ex FROM private.fiscal_ejecuciones WHERE comprobante_id=OLD.id ORDER BY iniciado_en DESC,id DESC LIMIT 1;
 IF FOUND AND ex.posible_envio AND (NEW.numero_solicitado IS DISTINCT FROM ex.numero OR NEW.solicitud_fiscal IS DISTINCT FROM ex.solicitud) THEN RAISE EXCEPTION 'La solicitud posiblemente enviada es inmutable';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER comprobante_snapshot_fiscal_inmutable BEFORE UPDATE ON public.comprobantes FOR EACH ROW EXECUTE FUNCTION private.fiscal_preservar_snapshot();

-- ---------------------------------------------------------------------------------
-- Auto-aprovisionamiento de receptor fiscal para socios (Consumidor Final)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.trg_socios_auto_receptor_fiscal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO private.fiscal_receptores (socio_id, doc_tipo, doc_numero, condicion_iva_id, confirmado, updated_at)
  VALUES (NEW.id, 96, NEW.dni, 5, true, clock_timestamp())
  ON CONFLICT (socio_id) DO UPDATE SET
    doc_numero = EXCLUDED.doc_numero,
    updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS socios_auto_receptor_fiscal ON public.socios;
CREATE TRIGGER socios_auto_receptor_fiscal
AFTER INSERT OR UPDATE OF dni ON public.socios
FOR EACH ROW EXECUTE FUNCTION private.trg_socios_auto_receptor_fiscal();
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

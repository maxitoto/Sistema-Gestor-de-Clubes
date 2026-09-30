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

-- Habilitar extensión para búsquedas de texto avanzadas (Trigramas)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
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
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
nombre VARCHAR(255) NOT NULL,
cuit VARCHAR(20) NOT NULL UNIQUE,
domicilio_fiscal TEXT NOT NULL,
email_contacto VARCHAR(255) NOT NULL,
logo_url TEXT,
punto_venta INTEGER NOT NULL,
certificado_arca TEXT, -- Encriptado en aplicación
certificado_key TEXT, -- Encriptado en aplicación
certificado_vencimiento DATE,
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Asegurar que solo exista una configuración de club
--ALTER TABLE club ADD CONSTRAINT unica_configuracion_club CHECK (id = '00000000-0000-0000-0000-000000000000'::uuid);
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
fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
fecha_baja DATE,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Validación: Si es menor de 18 años al crearse, contacto de emergencia es obligatorio
-- (Esta lógica se reforzará también en el frontend/backend)
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
arancel_mensual DECIMAL(10,2) NOT NULL CHECK (arancel_mensual >= 0),
edad_min INTEGER CHECK (edad_min >= 0),
edad_max INTEGER CHECK (edad_max >= edad_min),
estado estado_basico NOT NULL DEFAULT 'activo',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
UNIQUE(deporte_id, nombre) -- No pueden haber dos "Sub-17" en Fútbol
);
CREATE TABLE inscripciones (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
socio_id UUID NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
fecha_baja DATE,
estado estado_inscripcion NOT NULL DEFAULT 'activa',
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Índice único parcial: Solo puede haber una inscripción 'activa' por socio y categoría.
CREATE UNIQUE INDEX idx_inscripcion_activa_unica ON inscripciones(socio_id, categoria_id) 
WHERE estado = 'activa';
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
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_pago_vigente_por_cuota
ON pagos(cuota_id) WHERE estado = 'completado'; -- indice para como maximo un pago completado

CREATE TABLE comprobantes (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
pago_id UUID NOT NULL REFERENCES pagos(id) ON DELETE RESTRICT,
comprobante_origen_id UUID REFERENCES comprobantes(id) ON DELETE SET NULL, -- Relaciona Nota de Crédito con Factura Original, null si es tipo factura
tipo tipo_comprobante NOT NULL,
punto_venta INTEGER NOT NULL DEFAULT 1,
numero_comprobante VARCHAR(50),
cae VARCHAR(50),
cae_vencimiento DATE,
estado_fiscal estado_fiscal NOT NULL DEFAULT 'pendiente_cae',
pdf_url TEXT,
motivo_anulacion TEXT,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
CONSTRAINT unique_comprobante_pv_tipo_num UNIQUE (punto_venta, tipo, numero_comprobante), -- Impide que existan dos Facturas con el mismo número en el mismo Punto de Venta
CONSTRAINT chk_nc_origen CHECK (
  (tipo = 'factura'      AND comprobante_origen_id IS NULL) OR
  (tipo = 'nota_credito' AND comprobante_origen_id IS NOT NULL)
)
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
fecha DATE NOT NULL DEFAULT CURRENT_DATE,
concepto VARCHAR(255) NOT NULL,
monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
metodo_pago medio_pago NOT NULL,
referencia_banco VARCHAR(255),
descripcion TEXT,
evidencia_url TEXT,
estado estado_gasto NOT NULL DEFAULT 'activo',
motivo_anulacion TEXT,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Índice GIN para búsquedas avanzadas (texto libre) en la descripción del gasto
CREATE INDEX idx_gastos_descripcion_trgm ON gastos USING GIN (descripcion gin_trgm_ops);

-- Índices de rendimiento y búsqueda
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
CREATE UNIQUE INDEX uq_job_exitoso ON cuota_job_logs(periodo_mes, periodo_anio)
WHERE estado = 'exitoso';   -- idempotencia: previene ejecucion dobles el mismo mes y permite reintentos fallidos
--=================================================================================
-- 8. VISTAS SQL REQUERIDAS (LIBRO MAYOR CONTINUO)
--=================================================================================
-- Esta vista consolida los pagos (ingresos) y gastos (egresos) en un solo flujo de caja.
CREATE OR REPLACE VIEW flujo_caja AS
SELECT
'ingreso' AS tipo_movimiento,
p.id AS movimiento_id,
p.fecha_pago AS fecha,
p.monto AS monto_positivo,
p.medio_pago AS metodo,
p.referencia_pago AS referencia,
'Cobro Cuota' AS concepto,
p.estado::text AS estado,
p.usuario_id AS usuario_id
FROM pagos p
WHERE p.estado = 'completado'
UNION ALL
SELECT
'egreso' AS tipo_movimiento,
g.id AS movimiento_id,
g.fecha::timestamp with time zone AS fecha,
(g.monto * -1) AS monto_positivo, -- Monto negativo para restarlo del total
g.metodo_pago AS metodo,
g.referencia_banco AS referencia,
g.concepto AS concepto,
g.estado::text AS estado,
g.usuario_id AS usuario_id
FROM gastos g
WHERE g.estado = 'activo';
--=================================================================================
-- 9. TRIGGERS ÚTILES (OPCIONAL)
--=================================================================================
-- Trigger para mantener actualizado automáticamente el campo updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';

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


--POLITICAS!!
-- 1. Permisos base (Siguen siendo necesarios para que PostgreSQL te deje llegar al RLS)
GRANT ALL ON TABLE public.club TO authenticated;
GRANT ALL ON TABLE public.club TO service_role;

-- 2. Aseguramos que RLS esté activado
ALTER TABLE public.club ENABLE ROW LEVEL SECURITY;

-- 3. Limpiamos cualquier política parche que hayamos creado antes
DROP POLICY IF EXISTS "Permitir lectura de club" ON public.club;
DROP POLICY IF EXISTS "Permitir modificar club" ON public.club;
DROP POLICY IF EXISTS "Acceso total a la configuracion del club" ON public.club;

-- ========================================================
-- 4. LAS POLÍTICAS CORRECTAS (Verificación estricta de rol)
-- ========================================================

-- A. Solo los Administradores pueden LEER la configuración
CREATE POLICY "Admins pueden leer club" 
ON public.club 
FOR SELECT 
TO authenticated 
USING (
  (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
);

-- B. Solo los Administradores pueden CREAR, MODIFICAR o BORRAR
CREATE POLICY "Admins pueden modificar club" 
ON public.club 
FOR ALL 
TO authenticated 
USING (
  (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
);

-- 5. Forzamos la actualización de la caché de permisos
NOTIFY pgrst, 'reload schema';
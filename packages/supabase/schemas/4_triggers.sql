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
CREATE OR REPLACE FUNCTION trg_socios_campos_inmutables()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER socios_inmutabilidad
BEFORE UPDATE ON socios FOR EACH ROW EXECUTE FUNCTION trg_socios_campos_inmutables();

CREATE OR REPLACE FUNCTION trg_cuotas_campos_inmutables()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER cuotas_inmutabilidad
BEFORE UPDATE ON cuotas FOR EACH ROW EXECUTE FUNCTION trg_cuotas_campos_inmutables();

CREATE OR REPLACE FUNCTION trg_pagos_campos_inmutables()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER pagos_inmutabilidad
BEFORE UPDATE ON pagos FOR EACH ROW EXECUTE FUNCTION trg_pagos_campos_inmutables();

--=================================================================================
-- GUARDA DE SINCRONIZACIÓN DE CREDENCIAL (CU-02.6)
-- usuarios.email es la credencial de login: solo el flujo de administración
-- (service_role o psql de runbook) puede tocarla; la EF sincroniza ambos lados.
--=================================================================================
CREATE OR REPLACE FUNCTION trg_usuarios_email_solo_flujo_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_rol text := COALESCE(current_setting('request.role', true), 'postgres');
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND v_rol NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'El cambio de correo debe realizarse por el flujo de administracion (CU-02.6)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER usuarios_email_sync_guard
BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION trg_usuarios_email_solo_flujo_admin();

--=================================================================================
-- VENTANA DE CORRECCIÓN DE GASTOS (CU-06.4)
-- Fuera del día de REGISTRO, los campos operativos no se editan:
-- la corrección es por anulación + nuevo registro (trazabilidad del Libro Mayor).
-- La anulación (estado/motivo) queda fuera: la rigen CU-06.4 y la RLS de rol/fecha.
--=================================================================================
CREATE OR REPLACE FUNCTION trg_gastos_edicion_mismo_dia()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER gastos_edicion_ventana
BEFORE UPDATE ON gastos FOR EACH ROW EXECUTE FUNCTION trg_gastos_edicion_mismo_dia();

--=================================================================================
-- TRIGGER PARA SINCRONIZAR USUARIOS DE AUTH A LA TABLA PÚBLICA
--=================================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, service_role;

-- Trigger que se dispara automáticamente cada vez que un usuario se registra o es creado en Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

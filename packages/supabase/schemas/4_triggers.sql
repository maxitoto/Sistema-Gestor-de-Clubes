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

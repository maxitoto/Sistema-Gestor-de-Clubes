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
DECLARE
  v_digitos text;
  v_limpio text;
  v_doc_tipo integer;
  v_doc_numero text;
BEGIN
  IF NEW.dni ~ '^[0-9.\s-]+$' THEN
    v_digitos := pg_catalog.regexp_replace(NEW.dni, '\D', '', 'g');
    v_limpio := pg_catalog.ltrim(v_digitos, '0');
    IF pg_catalog.length(v_limpio) BETWEEN 1 AND 8 THEN
      v_doc_tipo := 96;
      v_doc_numero := v_limpio;
    ELSE
      v_doc_tipo := 99;
      v_doc_numero := '0';
    END IF;
  ELSE
    v_doc_tipo := 99;
    v_doc_numero := '0';
  END IF;

  INSERT INTO private.fiscal_receptores (socio_id, doc_tipo, doc_numero, condicion_iva_id, confirmado, updated_at)
  VALUES (NEW.id, v_doc_tipo, v_doc_numero, 5, true, pg_catalog.clock_timestamp())
  ON CONFLICT (socio_id) DO UPDATE SET
    doc_tipo = EXCLUDED.doc_tipo,
    doc_numero = EXCLUDED.doc_numero,
    updated_at = pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS socios_auto_receptor_fiscal ON public.socios;
CREATE TRIGGER socios_auto_receptor_fiscal
AFTER INSERT OR UPDATE OF dni ON public.socios
FOR EACH ROW EXECUTE FUNCTION private.trg_socios_auto_receptor_fiscal();

-- ---------------------------------------------------------------------------------
-- Snapshots, captura post-commit e inmutabilidad de intenciones de correo
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.correo_nombres_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='email_logs' THEN
  IF NEW.tipo='transaccional' THEN SELECT autor_nombre_snapshot INTO NEW.autor_nombre_snapshot FROM private.correo_intenciones WHERE id=NEW.request_id;
  ELSE SELECT concat_ws(' ',nombre,apellido)INTO NEW.autor_nombre_snapshot FROM public.usuarios WHERE id=NEW.usuario_id;END IF;
 ELSE
  IF NEW.intencion_id IS NOT NULL THEN SELECT nombre_snapshot,apellido_snapshot INTO NEW.nombre_snapshot,NEW.apellido_snapshot FROM private.correo_intenciones WHERE id=NEW.intencion_id;
  ELSE SELECT nombre,apellido INTO NEW.nombre_snapshot,NEW.apellido_snapshot FROM public.socios WHERE id=NEW.socio_id;END IF;
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER correo_autor_snapshot BEFORE INSERT ON public.email_logs FOR EACH ROW EXECUTE FUNCTION private.correo_nombres_snapshot();
CREATE TRIGGER correo_socio_snapshot BEFORE INSERT ON public.email_destinatarios FOR EACH ROW EXECUTE FUNCTION private.correo_nombres_snapshot();

CREATE OR REPLACE FUNCTION private.correo_capturar_comprobante()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE evento text;version text;fuente jsonb;receptor public.socios%ROWTYPE;actor uuid;autor text;motivo text;
BEGIN
 IF TG_OP='INSERT' AND NEW.tipo='factura' THEN evento:='cobro_confirmado';version:=CASE WHEN NEW.cae IS NULL THEN 'provisional' ELSE 'autorizado' END;
 ELSIF TG_OP='UPDATE' AND OLD.cae IS NULL AND NEW.cae IS NOT NULL THEN evento:='comprobante_autorizado';version:='autorizado';
 ELSIF TG_OP='UPDATE' AND NEW.tipo='factura' AND NEW.cae IS NULL AND NEW.estado_fiscal='anulado' AND OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal THEN evento:='anulacion_confirmada';version:='provisional';
 ELSE RETURN NEW;END IF;
 SELECT s.* INTO receptor FROM public.pagos p JOIN public.cuotas q ON q.id=p.cuota_id JOIN public.socios s ON s.id=q.socio_id WHERE p.id=NEW.pago_id;
 -- Sólo una identidad humana auténtica de esta transacción; un worker no adopta al receptor como autor.
 actor:=private.correo_actor_actual();
 SELECT concat_ws(' ',nombre,apellido)INTO autor FROM public.usuarios WHERE id=actor;
 fuente:=private.correo_fuente_documento(NEW.id);
 motivo:=CASE WHEN receptor.email IS NULL OR btrim(receptor.email)!~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'THEN 'SIN_CORREO_VALIDO' WHEN receptor.email_invalido THEN 'CORREO_INVALIDO' ELSE NULL END;
 INSERT INTO private.correo_intenciones(evento,operacion_id,comprobante_id,socio_id,destinatario_snapshot,nombre_snapshot,apellido_snapshot,version_documento,version_clave,
 fuente_documento,actor_id,autor_nombre_snapshot,origen,asunto_snapshot,cuerpo_snapshot,estado,codigo)
 VALUES(evento,NEW.id,NEW.id,receptor.id,nullif(btrim(receptor.email),''),receptor.nombre,receptor.apellido,version,
 version||':'||encode(extensions.digest(convert_to(fuente::text,'UTF8'),'sha256'),'hex'),fuente,actor,autor,CASE WHEN actor IS NULL THEN 'automatico' ELSE 'manual' END,
 CASE WHEN NEW.tipo='nota_credito'THEN 'Nota de Crédito del club'WHEN evento='anulacion_confirmada'THEN 'Constancia de anulación del cobro'WHEN version='autorizado'THEN 'Comprobante fiscal del club'ELSE 'Comprobante provisional del cobro'END,
 'Hola '||receptor.nombre||'. Se adjunta la documentación correspondiente al estado confirmado de la operación. El envío de este mensaje no modifica su pago ni su deuda.',
 CASE WHEN motivo IS NULL THEN 'pendiente' ELSE 'omitida' END,motivo)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END;$$;
CREATE TRIGGER correo_intencion_comprobante AFTER INSERT OR UPDATE ON public.comprobantes FOR EACH ROW EXECUTE FUNCTION private.correo_capturar_comprobante();

CREATE OR REPLACE FUNCTION private.correo_capturar_job()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receptor record;actor uuid;autor text;cuantos integer:=0;
BEGIN
 IF NEW.estado<>'exitoso'OR(TG_OP='UPDATE' AND OLD.estado='exitoso')THEN RETURN NEW;END IF;
 actor:=private.correo_actor_actual();IF actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=actor AND rol='admin')THEN actor:=NULL;END IF;
 SELECT concat_ws(' ',nombre,apellido)INTO autor FROM public.usuarios WHERE id=actor;
 -- Destinatarios del reporte mensual: administradores activos.
 FOR receptor IN SELECT id,email,nombre,apellido FROM public.usuarios WHERE rol='admin'AND estado='activo'ORDER BY id LOOP
  cuantos:=cuantos+1;
  INSERT INTO private.correo_intenciones(evento,operacion_id,job_id,destinatario_usuario_id,destinatario_snapshot,nombre_snapshot,apellido_snapshot,version_clave,actor_id,autor_nombre_snapshot,origen,asunto_snapshot,cuerpo_snapshot,estado,codigo)
  VALUES('reporte_mensual',NEW.id,NEW.id,receptor.id,nullif(btrim(receptor.email),''),receptor.nombre,receptor.apellido,'reporte:v1',actor,autor,CASE WHEN actor IS NULL THEN 'automatico'ELSE 'manual'END,
  'Resultado de generación mensual de cuotas',format('Período %s/%s. Generación confirmada: %s cuotas creadas y %s omitidas. Este reporte corresponde a la ejecución confirmada y su recuperación no genera cuotas nuevamente.',NEW.periodo_mes,NEW.periodo_anio,NEW.cuotas_generadas,NEW.cuotas_omitidas),
  CASE WHEN receptor.email~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'THEN 'pendiente'ELSE 'omitida'END,
  CASE WHEN receptor.email~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'THEN NULL ELSE 'SIN_CORREO_VALIDO'END)ON CONFLICT DO NOTHING;
 END LOOP;
 IF cuantos=0 THEN
  INSERT INTO private.correo_intenciones(evento,operacion_id,job_id,version_clave,actor_id,origen,asunto_snapshot,cuerpo_snapshot,estado,codigo)
  VALUES('reporte_mensual',NEW.id,NEW.id,'reporte:v1',actor,CASE WHEN actor IS NULL THEN 'automatico'ELSE 'manual'END,'Resultado de generación mensual de cuotas','Generación confirmada sin administrador destinatario configurado.','omitida','SIN_ADMIN_DESTINATARIO')ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER correo_intencion_job AFTER INSERT OR UPDATE ON public.cuota_job_logs FOR EACH ROW EXECUTE FUNCTION private.correo_capturar_job();

CREATE OR REPLACE FUNCTION private.correo_intencion_inmutable()RETURNS trigger LANGUAGE plpgsql SET search_path=''AS $$
DECLARE autor_permitido boolean;
BEGIN
 autor_permitido:=OLD.actor_id IS NULL AND OLD.origen='automatico'AND NEW.actor_id IS NOT NULL AND NEW.origen='manual'
 AND OLD.estado='pendiente'AND OLD.reserva IS NULL AND OLD.creacion_xid=pg_current_xact_id()
 AND EXISTS(SELECT 1 FROM private.fiscal_auditoria a WHERE a.comprobante_id=OLD.comprobante_id AND a.actor_id=NEW.actor_id);
 IF NEW.id IS DISTINCT FROM OLD.id OR ROW(NEW.evento,NEW.operacion_id,NEW.comprobante_id,NEW.job_id,NEW.socio_id,NEW.destinatario_usuario_id,NEW.destinatario_snapshot,NEW.nombre_snapshot,NEW.apellido_snapshot,NEW.creacion_xid,NEW.version_documento,NEW.version_clave,NEW.fuente_documento,NEW.asunto_snapshot,NEW.cuerpo_snapshot,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.evento,OLD.operacion_id,OLD.comprobante_id,OLD.job_id,OLD.socio_id,OLD.destinatario_usuario_id,OLD.destinatario_snapshot,OLD.nombre_snapshot,OLD.apellido_snapshot,OLD.creacion_xid,OLD.version_documento,OLD.version_clave,OLD.fuente_documento,OLD.asunto_snapshot,OLD.cuerpo_snapshot,OLD.created_at)
 OR(ROW(NEW.actor_id,NEW.autor_nombre_snapshot,NEW.origen)IS DISTINCT FROM ROW(OLD.actor_id,OLD.autor_nombre_snapshot,OLD.origen)AND NOT autor_permitido)
 OR(OLD.documento_path IS NOT NULL AND NEW.documento_path IS DISTINCT FROM OLD.documento_path)OR(OLD.email_log_id IS NOT NULL AND NEW.email_log_id IS DISTINCT FROM OLD.email_log_id)THEN RAISE EXCEPTION 'La identidad de la notificación es inmutable';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER correo_intencion_inmutable BEFORE UPDATE ON private.correo_intenciones FOR EACH ROW EXECUTE FUNCTION private.correo_intencion_inmutable();

CREATE OR REPLACE FUNCTION private.correo_proyectar_actor_fiscal()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
BEGIN
 IF NEW.actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=NEW.actor_id AND estado='activo'AND rol='admin')THEN RETURN NEW;END IF;
 UPDATE private.correo_intenciones SET actor_id=NEW.actor_id,origen='manual',autor_nombre_snapshot=(SELECT concat_ws(' ',nombre,apellido)FROM public.usuarios WHERE id=NEW.actor_id)
 WHERE comprobante_id=NEW.comprobante_id AND creacion_xid=pg_current_xact_id()AND estado='pendiente'AND reserva IS NULL AND actor_id IS NULL;
 RETURN NEW;
END;$$;
CREATE TRIGGER correo_actor_fiscal_auditoria AFTER INSERT ON private.fiscal_auditoria FOR EACH ROW EXECUTE FUNCTION private.correo_proyectar_actor_fiscal();

CREATE OR REPLACE FUNCTION private.correo_alerta_fiscal()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE receptor record;actor uuid;autor text;
BEGIN
 IF NEW.estado_fiscal<>'fallido'OR OLD.estado_fiscal='fallido'THEN RETURN NEW;END IF;
 actor:=private.correo_actor_actual();SELECT concat_ws(' ',nombre,apellido)INTO autor FROM public.usuarios WHERE id=actor;
 FOR receptor IN SELECT id,nombre,apellido,email FROM public.usuarios WHERE rol='admin'AND estado='activo'ORDER BY id LOOP
  INSERT INTO private.correo_intenciones(evento,operacion_id,comprobante_id,destinatario_usuario_id,destinatario_snapshot,nombre_snapshot,apellido_snapshot,version_clave,actor_id,autor_nombre_snapshot,origen,asunto_snapshot,cuerpo_snapshot,estado,codigo)
  VALUES('alerta_fiscal',NEW.id,NEW.id,receptor.id,nullif(btrim(receptor.email),''),receptor.nombre,receptor.apellido,'alerta:'||coalesce(NEW.ventana_regularizacion_iniciada_en::text,NEW.created_at::text,NEW.id::text),actor,autor,CASE WHEN actor IS NULL THEN 'automatico'ELSE 'manual'END,
  'Revisión requerida: regularización fiscal pendiente','La regularización fiscal no se confirmó dentro de su presupuesto o plazo. Revise Monitoreo fiscal. El estado financiero del cobro y cualquier recobro posterior se conservan.',
  CASE WHEN receptor.email~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'THEN 'pendiente'ELSE 'omitida'END,
  CASE WHEN receptor.email~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'THEN NULL ELSE 'SIN_CORREO_VALIDO'END)ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END;$$;
CREATE TRIGGER correo_intencion_alerta_fiscal AFTER UPDATE ON public.comprobantes FOR EACH ROW EXECUTE FUNCTION private.correo_alerta_fiscal();

CREATE OR REPLACE FUNCTION private.correo_snapshot_inmutable()RETURNS trigger LANGUAGE plpgsql SET search_path=''AS $$
BEGIN
 IF TG_TABLE_NAME='email_logs'THEN
  IF NEW.autor_nombre_snapshot IS DISTINCT FROM OLD.autor_nombre_snapshot THEN RAISE EXCEPTION 'La autoría histórica no se reescribe';END IF;
 ELSIF ROW(NEW.nombre_snapshot,NEW.apellido_snapshot,NEW.asunto_snapshot,NEW.cuerpo_snapshot,NEW.email,NEW.intencion_id,NEW.documento_path)IS DISTINCT FROM ROW(OLD.nombre_snapshot,OLD.apellido_snapshot,OLD.asunto_snapshot,OLD.cuerpo_snapshot,OLD.email,OLD.intencion_id,OLD.documento_path)THEN RAISE EXCEPTION 'El destinatario y documento históricos no se reescriben';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER correo_log_snapshot_inmutable BEFORE UPDATE ON public.email_logs FOR EACH ROW EXECUTE FUNCTION private.correo_snapshot_inmutable();
CREATE TRIGGER correo_dest_snapshot_inmutable BEFORE UPDATE ON public.email_destinatarios FOR EACH ROW EXECUTE FUNCTION private.correo_snapshot_inmutable();

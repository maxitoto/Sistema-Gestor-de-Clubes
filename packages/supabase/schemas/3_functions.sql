CREATE SCHEMA IF NOT EXISTS private;
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

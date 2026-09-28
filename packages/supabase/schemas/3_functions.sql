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

CREATE OR REPLACE FUNCTION cobrar_cuota(
  p_cuota_id uuid, p_usuario_id uuid,
  p_medio_pago medio_pago, p_referencia varchar DEFAULT NULL
) RETURNS uuid  -- id del comprobante generado
LANGUAGE plpgsql SET search_path = public AS $$   -- SECURITY INVOKER (default): respeta RLS
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
END; $$;

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
-- Rango NULL = intervalo abierto: solapa con cualquier otro rango del mismo deporte
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
-- Se evalúa a la fecha de alta; rango NULL = intervalo abierto (sin advertencia)
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
CREATE OR REPLACE FUNCTION previsualizar_inscripcion(p_socio_id uuid, p_categoria_id uuid)
RETURNS TABLE (monto_proporcional numeric, tramo_pct integer, advertencia_edad boolean,
               edad_socio_anios integer, rango_min integer, rango_max integer)
LANGUAGE sql STABLE SET search_path = public
AS $$
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
$$;

--=================================================================================
-- BAJAS UNIFICADAS DE DEPORTES Y CATEGORÍAS (CU-03.3 / CU-03.6, D-24)
-- Baja SIEMPRE lógica; el historial se conserva; guarda de dos niveles en el motor
--=================================================================================
CREATE OR REPLACE FUNCTION baja_deporte(p_deporte_id uuid)
RETURNS void
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM categorias WHERE deporte_id = p_deporte_id AND estado = 'activo') THEN
    RAISE EXCEPTION 'No se puede dar de baja el deporte porque posee categorias activas. De de baja primero esas categorias (CU-03.3)';
  END IF;
  UPDATE deportes SET estado = 'inactivo' WHERE id = p_deporte_id;
END;
$$;

CREATE OR REPLACE FUNCTION baja_categoria(p_categoria_id uuid)
RETURNS void
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM inscripciones WHERE categoria_id = p_categoria_id AND estado = 'activa') THEN
    RAISE EXCEPTION 'No se puede dar de baja la categoria porque existen socios inscriptos activos en la misma. Desvinculelos primero (CU-03.6)';
  END IF;
  UPDATE categorias SET estado = 'inactivo' WHERE id = p_categoria_id;
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
  v_comp   comprobantes%ROWTYPE;
  v_pago   pagos%ROWTYPE;
  v_origen comprobantes%ROWTYPE;
BEGIN
  SELECT * INTO v_comp FROM comprobantes WHERE id = p_comprobante_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El comprobante no existe';
  END IF;
  IF v_comp.estado_fiscal <> 'fallido' THEN
    RAISE EXCEPTION 'El comprobante no esta en estado fallido';
  END IF;

  SELECT * INTO v_pago FROM pagos WHERE id = v_comp.pago_id FOR UPDATE;

  IF v_comp.tipo = 'factura' THEN
    -- solo se regulariza por reapertura un cobro VIGENTE
    IF v_pago.estado <> 'completado' THEN
      RAISE EXCEPTION 'La factura corresponde a un pago anulado: no se reabre. La operacion esta anulada; regularice via portal ARCA o mediante la nota de credito de la anulacion (CU-05.3/CU-05.7)';
    END IF;
  ELSE
    -- Nota de credito: la anulacion debe seguir vigente
    IF v_pago.estado <> 'anulado' THEN
      RAISE EXCEPTION 'La nota de credito no tiene una anulacion vigente: no se reabre';
    END IF;
    SELECT * INTO v_origen FROM comprobantes
     WHERE id = v_comp.comprobante_origen_id FOR UPDATE;
    IF v_origen.estado_fiscal <> 'anulacion_pendiente' THEN
      RAISE EXCEPTION 'El comprobante origen no espera esta nota de credito: no se reabre (regularizacion duplicada)';
    END IF;
  END IF;

  UPDATE comprobantes
     SET estado_fiscal = 'pendiente_cae',
         detalle_error_fiscal = NULL,
         intentos_reintento = 0,
         ventana_regularizacion_iniciada_en = NOW(), 
         proximo_reintento_en = NOW() + interval '10 min'
   WHERE id = p_comprobante_id;
END; $$;

--=================================================================================
-- ANULACIÓN DE PAGO (CU-05.3): transacción local ÚNICA y atómica
-- Caja+deuda se resuelven en el mismo COMMIT; lo fiscal queda en el comprobante.
-- SECURITY INVOKER + EXECUTE exclusivo service_role (mismo patrón que
-- reabrir_regularizacion_fiscal): la autorización humana (rol y ventana
-- same-day del Responsable) se verifica en la Edge Function requireRol.
--=================================================================================
CREATE OR REPLACE FUNCTION anular_pago(p_pago_id uuid, p_motivo text)
RETURNS uuid  -- id de la nota de crédito creada; NULL en la rama 4.b
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_pago     pagos%ROWTYPE;
  v_original comprobantes%ROWTYPE;
  v_nc_id    uuid;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de anulacion es obligatorio (CU-05.3)';
  END IF;

  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago inexistente'; END IF;
  IF v_pago.estado <> 'completado' THEN
    RAISE EXCEPTION 'El pago ya fue anulado: no se permite una segunda anulacion (CU-05.3)';
  END IF;

  SELECT * INTO v_original FROM comprobantes
   WHERE pago_id = p_pago_id AND tipo = 'factura' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pago no tiene factura asociada'; END IF;

  -- (1) Caja y deuda: el reverso lo DERIVA la vista flujo_caja al quedar anulado;
  --     la cuota vuelve a 'pendiente' y el indice uq_pago_vigente_por_cuota
  --     habilita el recobro inmediato.
  UPDATE pagos  SET estado = 'anulado'  WHERE id = p_pago_id;
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
  ELSE
    -- (3) Rama 4.b: nunca obtuvo CAE => anulacion local sin NC y sin cola.
    UPDATE comprobantes
       SET estado_fiscal = 'anulado',
           motivo_anulacion = p_motivo,
           proximo_reintento_en = NULL
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

REVOKE EXECUTE ON FUNCTION public.anular_pago(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anular_pago(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_pago(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.reabrir_regularizacion_fiscal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reabrir_regularizacion_fiscal(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_regularizacion_fiscal(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.baja_deporte(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.baja_deporte(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.baja_categoria(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.baja_categoria(uuid) TO authenticated, service_role;

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
REVOKE EXECUTE ON FUNCTION public.cobrar_cuota(uuid, uuid, medio_pago, varchar) FROM PUBLIC;

-- Le da permiso de ejecución a solo dos roles: el responsable y el backend interno (taras programadas y edge functions)
GRANT EXECUTE ON FUNCTION public.es_socio_moroso(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cobrar_cuota(uuid, uuid, medio_pago, varchar) TO authenticated, service_role;
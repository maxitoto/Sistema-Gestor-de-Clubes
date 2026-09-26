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
-- Solo transición fallido -> pendiente_cae; no toca pago, caja ni deuda.
-- SECURITY DEFINER acotado: comprobantes no tiene política UPDATE para
-- authenticated; la guarda de rol va dentro, estilo cobrar_cuota().
--=================================================================================
CREATE OR REPLACE FUNCTION reabrir_regularizacion_fiscal(p_comprobante_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF private.get_rol() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el Administrador puede reabrir la regularizacion fiscal (CU-05.7)';
  END IF;
  UPDATE comprobantes
     SET estado_fiscal = 'pendiente_cae',
         intentos_reintento = 0,
         proximo_reintento_en = NOW() + interval '10 min'
   WHERE id = p_comprobante_id AND estado_fiscal = 'fallido';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El comprobante no existe o no esta en estado fallido';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reabrir_regularizacion_fiscal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reabrir_regularizacion_fiscal(uuid) TO authenticated, service_role;

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
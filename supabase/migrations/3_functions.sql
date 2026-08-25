--=================================================================================
-- FUNCIONES DE NEGOCIO
--=================================================================================
CREATE OR REPLACE FUNCTION es_socio_moroso(p_socio_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (count(*) >= 2) OR (min(created_at) < now() - interval '30 days'),
    false
  )
  FROM cuotas
  WHERE socio_id = p_socio_id AND estado = 'pendiente';
$$;

CREATE OR REPLACE FUNCTION cobrar_cuota(
  p_cuota_id uuid, p_usuario_id uuid,
  p_medio_pago medio_pago, p_referencia varchar DEFAULT NULL
) RETURNS uuid  -- id del comprobante generado
LANGUAGE plpgsql AS $$   -- SECURITY INVOKER (default): respeta RLS
DECLARE
  v_cuota cuotas%ROWTYPE; v_pago_id uuid; v_comprobante_id uuid;
BEGIN
   -- Bloqueo pesimista: serializa cobros simultáneos (ND-2)
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id FOR UPDATE;  -- ND-2
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota inexistente'; END IF;
  IF v_cuota.estado <> 'pendiente' THEN RAISE EXCEPTION 'Cuota ya pagada';  -- error de negocio limpio para el segundo cobro
  END IF;

  INSERT INTO pagos (cuota_id, usuario_id, monto, medio_pago, referencia_pago)
  VALUES (p_cuota_id, p_usuario_id, v_cuota.monto, p_medio_pago, p_referencia)
  RETURNING id INTO v_pago_id;

  INSERT INTO comprobantes (pago_id, tipo, punto_venta, estado_fiscal)
  VALUES (v_pago_id, 'factura', (SELECT punto_venta FROM club), 'pendiente_cae')
  RETURNING id INTO v_comprobante_id;

  UPDATE cuotas SET estado = 'pagada' WHERE id = p_cuota_id;
  RETURN v_comprobante_id;  -- la Edge Function sigue con ARCA fuera del lock
END; $$;
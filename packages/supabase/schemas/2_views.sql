--=================================================================================
-- VISTAS SQL REQUERIDAS (LIBRO MAYOR CONTINUO)
--=================================================================================
-- Esta vista consolida los pagos (ingresos) y gastos (egresos) en un solo flujo de caja.
CREATE OR REPLACE VIEW flujo_caja WITH (security_invoker = true) AS
-- 1. Cobros (ingreso original)
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
FROM pagos p
WHERE p.estado IN ('completado', 'anulado') -- el cobro sigue sigue visible con estado anulado tambien
UNION ALL
-- 2. Gastos (egreso original).
SELECT
'egreso' AS tipo_movimiento,
g.id AS movimiento_id,
g.fecha::timestamp with time zone AS fecha,
g.monto AS monto, 
g.metodo_pago AS metodo,
g.referencia_banco AS referencia,
g.concepto AS concepto,
g.estado::text AS estado,
g.usuario_id AS usuario_id,
false AS es_reverso
FROM gastos g
UNION ALL
-- 3. Reverso de cobro anulado (devolución)
SELECT
'egreso' AS tipo_movimiento, -- la devolucion de dinero es un egreso
p.id AS movimiento_id, -- mismo id que el original: quedan relacionados
p.updated_at AS fecha, -- fecha de anulacion, no del cobro original
p.monto AS monto, 
p.medio_pago AS metodo,
p.referencia_pago AS referencia,
'Anulacion de cobro' AS concepto, 
p.estado::text AS estado, -- 'anulado'
p.usuario_id AS usuario_id,
true AS es_reverso
FROM pagos p
WHERE p.estado = 'anulado' -- solo los pagos anulados generan reverso
UNION ALL
-- 4. Reverso de gasto anulado
SELECT
'ingreso' AS tipo_movimiento, -- anular un gasto devuelve dinero al saldo -> ingreso
g.id AS movimiento_id,
g.updated_at AS fecha, -- fecha de anulacion
g.monto AS monto,
g.metodo_pago AS metodo,
g.referencia_banco AS referencia,
'Anulacion de gasto' AS concepto,
g.estado::text AS estado,
g.usuario_id AS usuario_id,
true AS es_reverso
FROM gastos g
WHERE g.estado = 'anulado';

--=================================================================================
-- VISTAS DE LECTURA PARA FILTROS POR ESTADO DERIVADO (ND-17, CU-01.4, CU-05.1)
--=================================================================================
-- Padrón con estado de pago: la morosidad sale de la ÚNICA regla (es_socio_moroso, ND-12)
CREATE OR REPLACE VIEW v_socios_estado_pago WITH (security_invoker = true) AS
SELECT
  s.*,
  m.es_moroso,
  CASE WHEN m.es_moroso THEN 'moroso' ELSE 'al_dia' END AS estado_pago
FROM socios s
CROSS JOIN LATERAL (SELECT es_socio_moroso(s.id) AS es_moroso) m;

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

GRANT SELECT ON public.v_socios_estado_pago    TO authenticated, service_role;
GRANT SELECT ON public.v_pagos_etiqueta_fiscal TO authenticated, service_role;

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



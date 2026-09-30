--=================================================================================
-- ÍNDICES DE RENDIMIENTO Y BÚSQUEDA
--=================================================================================
-- Índice único parcial: Solo puede haber una inscripción 'activa' por socio y categoría.
CREATE UNIQUE INDEX idx_inscripcion_activa_unica ON inscripciones(socio_id, categoria_id) 
WHERE estado = 'activa';

CREATE UNIQUE INDEX uq_pago_vigente_por_cuota
ON pagos(cuota_id) WHERE estado = 'completado'; -- indice para como maximo un pago completado

-- Bloqueo de segunda anulacion a nivel motor:
-- una unica nota de credito por comprobante de origen.
CREATE UNIQUE INDEX uq_nc_por_comprobante_origen
    ON comprobantes (comprobante_origen_id)
    WHERE tipo = 'nota_credito';

-- Cola del job CU-05.6: solo filas que esperan reintento
CREATE INDEX IF NOT EXISTS idx_comprobantes_reintento
  ON comprobantes (proximo_reintento_en)
  WHERE estado_fiscal IN ('pendiente_cae', 'anulacion_pendiente');
  
CREATE INDEX idx_email_dest_log ON email_destinatarios(email_log_id);
CREATE INDEX idx_email_dest_email ON email_destinatarios(email);  -- consulta de historial por direccion; el webhook usa identidad del mensaje

CREATE UNIQUE INDEX uq_job_exitoso ON cuota_job_logs(periodo_mes, periodo_anio)
WHERE estado = 'exitoso';   -- idempotencia: previene ejecucion dobles el mismo mes y permite reintentos fallidos

-- Índice GIN para búsquedas avanzadas (texto libre) en la descripción del gasto
CREATE INDEX idx_gastos_descripcion_trgm ON gastos USING GIN (descripcion extensions.gin_trgm_ops);

-- Índices de rendimiento y búsqueda generales
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

CREATE INDEX idx_cuotas_pendientes_socio
ON cuotas (socio_id)
WHERE estado = 'pendiente';
-- el historial de cobros une una sola factura original por pago.
CREATE UNIQUE INDEX uq_factura_por_pago
ON public.comprobantes(pago_id) WHERE tipo = 'factura';

-- consulta de eventos y cola.
CREATE INDEX email_eventos_message_idx ON public.email_eventos(proveedor,provider_message_id);
CREATE INDEX email_destinatarios_cola_idx ON public.email_destinatarios(created_at,id)
  WHERE estado_envio='pendiente';
CREATE INDEX email_destinatarios_reserva_idx ON public.email_destinatarios(reservado_en);

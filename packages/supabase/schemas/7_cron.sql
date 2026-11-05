-- programador mensual de cuotas en pg_cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $scheduler$
DECLARE
  v_timezone text := current_setting('cron.timezone', true);
BEGIN
  IF v_timezone IS NULL OR v_timezone NOT IN ('GMT', 'UTC', 'Etc/UTC', 'Etc/GMT') THEN
    RAISE EXCEPTION 'Se requiere cron.timezone UTC/GMT para esta programación local';
  END IF;
  IF current_setting('cron.database_name', true) IS DISTINCT FROM current_database() THEN
    RAISE EXCEPTION 'pg_cron debe usar la base local actual';
  END IF;
  -- El worker de PostgreSQL usa la identidad técnica del propietario del job.
  -- No envía JWT humano ni inventa usuario_id; el log mensual no tiene actor humano.
  -- 03:00 UTC/GMT del día 1 = 00:00 America/Argentina/Buenos_Aires (-03).
  PERFORM cron.schedule(
    'sistema-club-los-andes-cuotas-mensuales',
    '0 3 1 * *',
    'SELECT public.generar_cuotas_mes_actual();'
  );
END;
$scheduler$;

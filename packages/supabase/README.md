# Backend Supabase local

Este paquete reúne el esquema declarativo (`schemas/`), migraciones (`migrations/`), datos semilla (`seeds/`), Edge Functions (`functions/`), scripts locales (`scripts/`) y suites de prueba (`tests/`).

Para la preparación inicial del entorno (`bun install`, inicialización de Deno y archivos `.env`), el levantamiento de la base local, la ejecución del entorno y el listado completo de comandos de verificación, seguir el [README raíz](../../README.md).

## Reglas técnicas del entorno y Edge Functions

- **Variables inyectadas y red Docker:** Supabase inyecta automáticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en tiempo de ejecución; no deben agregarse en `functions/.env` ni copiarse al frontend. En el entorno local, `SMTP_HOST=host.docker.internal` conecta el contenedor de Edge Functions con el SMTP de Mailpit, mientras que `MAIL_PUBLIC_BASE_URL`, `ARCHIVOS_PUBLIC_BASE_URL` y `FISCAL_PUBLIC_BASE_URL` usan `127.0.0.1:54321` para resolverse desde el navegador y los scripts locales del host.
- **Custodia criptográfica (`FISCAL_MASTER_KEY`):** clave AES-256-GCM de 32 bytes en Base64 usada para cifrar certificados `.crt`/`.key` y tickets WSAA. Conservarla sin cambios mientras existan credenciales cargadas en la base; reemplazarla exige volver a subir el certificado y la clave privada en `/settings`.
- **Secretos técnicos de workers:** `MAIL_WORKER_SECRET` y `FISCAL_WORKER_SECRET` deben ser independientes entre sí y distintos de `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
- **Recarga de `functions/.env`:** `bun run start:containers` carga `functions/.env` al iniciar Docker; si se edita ese archivo con los contenedores ya activos, reiniciarlos (`bun run stop && bun run start:containers`) o usar `bun run start:functions` (que lanza `scripts/servir-funciones-local.ts` con `--env-file functions/.env`).
- **Homologación real con ARCA:** con `ARCA_EXTERNAL_ENABLED=false` no salen peticiones SOAP externas. Para probar contra `wsaahomo.afip.gov.ar` y `wswhomo.afip.gov.ar`, pasar `ARCA_EXTERNAL_ENABLED=true`, recargar el entorno de funciones, subir `.crt`/`.key` WSASS (servicio `wsfe`) y alinear el CUIT del club en `/settings`, verificando luego con **Diagnóstico Fiscal**.

## Esquema declarativo y migraciones

Los comandos de Supabase CLI utilizan `--workdir ..` para resolver `packages/supabase/config.toml` sin crear otra configuración anidada en este paquete.

Las fuentes en `schemas/` están ordenadas sin dependencias circulares ni referencias adelantadas (`0_scheme.sql`, `1_indexes.sql`, `3_functions.sql`, `2_views.sql`, `4_triggers.sql`, `5_politics.sql`, `6_storage.sql` y `7_cron.sql`), manteniendo en `5_politics.sql` todas las revocaciones (`REVOKE`) antes de las concesiones por columna (`GRANT`). Para regenerar la migración consolidada evitando que `pg-delta` invierta ese orden de permisos:

```bash
cat schemas/0_scheme.sql \
    schemas/1_indexes.sql \
    schemas/3_functions.sql \
    schemas/2_views.sql \
    schemas/4_triggers.sql \
    schemas/5_politics.sql \
    schemas/6_storage.sql \
    schemas/7_cron.sql \
    > migrations/$(date -u +%Y%m%d%H%M%S)_init_scheme.sql
```

Esto genera el archivo con marca temporal UTC actual; si ya existe una migración consolidada `*_init_scheme.sql` previa en `migrations/` y todavía trabajás sin migraciones incrementales posteriores, eliminá o reemplazá la anterior antes de reiniciar la base para no duplicar la definición inicial.

Si se modificó la migración consolidada o `seeds/seed.sql`, reconstruir la base local limpia con:

```bash
bun run db:reset
```

Si en cambio se creó una migración incremental nueva sobre una base en uso, aplicarla con:

```bash
bunx supabase --workdir .. migration up
```

Después de aplicar cambios de esquema con la base local en ejecución, actualizar los tipos TypeScript del frontend ejecutando `bun run types:sync` en `packages/frontend`.

## Homologación fiscal, regularización y workers

- **Aprovisionamiento automático de receptores:** tanto los socios semilla de `seeds/seed.sql` como cada alta desde `/socios` quedan registrados automáticamente en `private.fiscal_receptores` como *Consumidor Final* (`condicion_iva_id = 5`) con DNI (`doc_tipo = 96`) mediante el trigger `socios_auto_receptor_fiscal`.
- **Comprobantes, anulaciones y monitoreo:** `functions/arca` gestiona la emisión de Factura C y Nota de Crédito C sobre anulaciones junto con sus PDF A4 con QR en `club-archivos`; `functions/monitoreo` atiende la consulta paginada y las acciones auditadas (`forzar`, `reabrir`, `resolver`, `registrar-externo`) usadas desde `/monitoreo-fiscal`.
- **Worker fiscal (`functions/fiscal-worker`):** procesa pendientes de regularización mediante `POST /functions/v1/fiscal-worker/procesar-pendientes` autenticado por la cabecera `x-fiscal-worker-secret` (`FISCAL_WORKER_SECRET`), sin cuerpo HTTP.
- **Procesador local de correo (`correos:local` / `correos:una-vez`):** `scripts/procesar-correos-local.ts` invoca `POST /functions/v1/comunicaciones/procesar-cola` con `x-mail-worker-secret`. Espera la respuesta de cada petición antes de aguardar `10` segundos entre ciclos (`--once` en `correos:una-vez`) y solo admite `MAIL_PROVIDER=mailpit` y URL de loopback.
- **Invocador local del worker fiscal (`fiscal:local` / `fiscal:una-vez`):** `scripts/procesar-fiscal-local.ts` dispara `POST` vacío contra `/functions/v1/fiscal-worker/procesar-pendientes` con `x-fiscal-worker-secret` desde terminal local cada `60` segundos sin solapamientos ni ráfagas (o una vez con `--once` en `fiscal:una-vez`), con timeout HTTP de `120` segundos, logs sanitizados sin cuerpos arbitrarios ni secretos y validación estricta de `FISCAL_PUBLIC_BASE_URL` (protocolo `http` sobre loopback y ruta `/functions/v1/fiscal-worker`). En despliegue productivo este disparo lo ejecuta el scheduler del servidor sin intervención manual.
- **Baja pública de comunicaciones y cuenta de prueba:** en pruebas locales (`admin@clublosandes.com` / `Pass1234`), la captura en Mailpit (<http://localhost:54324>) verifica el recorrido SMTP local; para avisos generales, la desuscripción exige confirmar en el formulario HTML público servido por `/functions/v1/comunicaciones/desuscribir` (visitar el enlace firmado por sí solo no altera la suscripción).
- **Perfil fiscal alternativo (opcional):** `bun run fiscal:perfil --archivo <ruta-json>` (ver plantilla [perfil-fiscal.example.json](../../docs/desarrollo/perfil-fiscal.example.json)) permite cargar configuraciones tributarias alternativas sobre `private.fiscal_configuracion` y `private.fiscal_receptores`.

## Notas técnicas de verificación y pruebas

Los comandos de verificación están listados en el [README raíz](../../README.md). Particularidades propias del paquete backend:

- `bun run typecheck:functions` verifica estáticamente los **nueve entrypoints** (`comunicaciones`, `monitoreo`, `arca`, `archivos`, `acceso`, `usuarios`, `configuracion`, `credenciales` y `fiscal-worker`) junto con `functions/deno.json`.
- `bun run lint:arch` (`dependency-cruiser`) resuelve los alias declarados en `functions/deno.json` mediante `tsconfig.arch.json` e inspecciona imports de tipos; mantener ambos archivos alineados si cambian los alias.
- `bun test` y `bun run test:deno` (`tests/*.deno.ts`) cubren reglas de dominio, motor/calendario de regularización, custodia y usuarios, adaptadores SOAP WSAA/WSFEv1, consulta de serie, PDF/QR de facturas, Notas de Crédito y constancias, y contratos HTTP de `monitoreo` y `fiscal-worker`.

# Backend Supabase local

Este paquete contiene el esquema declarativo, las migraciones, datos de prueba, Edge Functions y herramientas de desarrollo local. Los comandos siguientes se ejecutan desde `packages/supabase`, salvo indicación contraria. Instalar primero las dependencias con `bun install` desde la raíz del monorepo y mantener Docker en ejecución.

## Preparar Deno para los controles

`lint:functions` y el formateo utilizan el paquete fijado `deno-bin` 2.2.7. Su wrapper descarga el binario Deno de esa versión desde GitHub si todavía falta; instalar el paquete no demuestra que el runtime ya esté disponible. Después de `bun install`, verificar desde `packages/supabase`:

```bash
bunx --bun deno --version
```

Debe informar Deno 2.2.7. Si el binario falta, el wrapper intenta descargarlo en esa primera invocación, que requiere acceso a red. Los scripts fuerzan Bun para ejecutar el wrapper, sin exigir una instalación separada de Node. Un error de descarga o de ejecución deja el control Deno pendiente de resolver.

## Configuración local del correo

Crear `functions/.env` a partir de `functions/.env.example` sólo si todavía no existe. Si ya existe, incorporar las variables faltantes sin sobrescribir sus valores válidos:

```dotenv
MAIL_PROVIDER=mailpit
MAIL_FROM="Club Los Andes <notificaciones@clublosandes.com>"
SMTP_HOST=host.docker.internal
SMTP_PORT=54325
MAIL_PUBLIC_BASE_URL=http://127.0.0.1:54321/functions/v1/comunicaciones
MAIL_UNSUBSCRIBE_SECRET=
MAIL_WORKER_SECRET=
```

Completar `MAIL_UNSUBSCRIBE_SECRET` y `MAIL_WORKER_SECRET` con dos valores aleatorios diferentes de al menos 32 caracteres. Por ejemplo, ejecutar este comando dos veces y guardar cada resultado en una de las variables:

```bash
bun -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No versionar `.env` ni copiar estos secretos al frontend. Supabase aporta sus variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al runtime de las funciones; no son valores para completar en este ejemplo. Resend no es necesario para la prueba local.

La configuración actual de `config.toml` expone Mailpit en <http://localhost:54324> y SMTP en `54325`. El host `host.docker.internal` permite que las funciones dentro del contenedor usen ese SMTP. `MAIL_PUBLIC_BASE_URL` es la dirección accesible desde el navegador local para los enlaces de baja; no es la URL SMTP.

## Preparar y verificar la base local

Los comandos de Supabase toman la configuración de `packages/supabase/config.toml` mediante `--workdir ..`. Para iniciar los servicios y consultar el estado de
las migraciones locales:

```bash
bun run start:containers
bunx supabase --workdir .. migration list --local
```

La migración inicial consolidada ya incluye la estructura completa y las políticas de permisos (ACL) finales. No es necesario generar ninguna corrección de
permisos al preparar una base nueva o clonada.

Si el listado muestra migraciones locales pendientes de aplicar en este entorno, aplicarlas con:

```bash
bunx supabase --workdir .. migration up --local
```

El `--workdir ..` identifica `packages` como directorio de trabajo de la CLI, que busca la configuración en `supabase/config.toml`. No corresponde crear otra configuración Supabase dentro de este paquete.

Si el historial no coincide con lo esperado, resolver la diferencia antes de aplicar cambios o generar tipos. No editar una migración aplicada ni eliminar el historial. `db:reset` borra los datos locales y no corresponde al arranque ni a una comprobación rutinaria.

## Generación de la migración desde los esquemas

Las fuentes declarativas en `schemas/` están ordenadas sin dependencias circulares ni referencias adelantadas (`0_scheme.sql`, `1_indexes.sql`, `3_functions.sql`, `2_views.sql`, `4_triggers.sql` y `5_politics.sql`), manteniendo en `5_politics.sql` todas las revocaciones (`REVOKE`) antes de las concesiones por columna (`GRANT`).

Para regenerar la migración consolidada directamente desde `schemas/` (evitando que `pg-delta` invierta el orden de los permisos por columna):

```bash
cat schemas/0_scheme.sql \
    schemas/1_indexes.sql \
    schemas/3_functions.sql \
    schemas/2_views.sql \
    schemas/4_triggers.sql \
    schemas/5_politics.sql \
    > migrations/$(date -u +%Y%m%d%H%M%S)_init_scheme.sql
```

Si se está inicializando o recreando la base local desde cero junto con los datos de prueba (`seeds/seed.sql`):

```bash
bun run db:reset
```

Si en cambio se creó una migración incremental nueva sobre una base ya en uso, aplicarla con:

```bash
bunx supabase --workdir .. migration up --local
```

Después de aplicar cambios en el esquema de la base, ir a `packages/frontend` y ejecutar:

```bash
bun run types:sync
bun run build
```

`types:sync` toma el esquema de la base local en ejecución; debe correrse después de aplicar cambios de esquema en el proyecto correcto. `build` incluye la comprobación de TypeScript.

## Iniciar funciones y procesar correo

Terminal 1:

```bash
bun run start
```

`start` ejecuta `start:containers` y después `start:functions`. El segundo resuelve la configuración del proyecto y pasa `functions/.env` explícitamente a `supabase functions serve`. `dev` es un alias de `start`. Si los contenedores ya están activos, se puede ejecutar directamente `bun run start:functions`.

Terminal 2:

```bash
bun run correos:local
```

Este proceso llama al endpoint local `/comunicaciones/procesar-cola` usando `MAIL_WORKER_SECRET`. Espera a que finalice cada petición y, después, espera 10 segundos para volver a consultar. Mantenerlo abierto mientras se prueban envíos; detenerlo con `Ctrl+C` al terminar. Sólo admite Mailpit y una dirección de loopback, y no imprime secretos ni cuerpos de correo.

Para procesar un solo lote, usar en lugar del proceso continuo:

```bash
bun run correos:una-vez
```

El comando de una vez termina después de esa petición; puede quedar trabajo pendiente para siguientes ejecuciones si el lote supera el límite del procesador. No ejecutar ambos comandos a la vez para la misma prueba.

El frontend se inicia en otra terminal desde `packages/frontend` con `bun run dev`. Al presionar el botón de aviso se encolan los destinatarios. La ejecución del procesador produce los mensajes individuales visibles en Mailpit. Sin ese proceso, los avisos nuevos quedan pendientes. Esta prueba local no requiere una cuenta ni claves de Resend.

Si se cambian los secretos o variables de correo, reiniciar el servidor de funciones y el proceso de correo para que ambos lean la misma configuración.

## Comprobación local

1. Entrar con una cuenta de prueba existente y habilitada.
2. Seleccionar dos socios con correo válido y preparar un aviso.
3. Verificar que el frontend informa destinatarios encolados.
4. Con el procesador activo, comprobar dos mensajes individuales en <http://localhost:54324>.
5. Para un aviso general, abrir el enlace de baja y confirmar mediante la página HTML pública que devuelve `/comunicaciones/desuscribir`. El formulario envía la confirmación a la misma URL pública, conservando `/functions/v1` y los parámetros firmados. La baja debe requerir la confirmación; visitar el enlace por sí solo no debe cambiar la suscripción. No se agrega una pantalla al frontend para este paso.

La captura en Mailpit demuestra el recorrido SMTP local, no una entrega externa. La integración fiscal ARCA y otros circuitos completos permanecen pendientes de implementación.

Para controles sin reformatear archivos:

```bash
bun run lint
bun run typecheck:functions
```

`lint` ejecuta `lint:functions` (Deno) y `lint:arch`. `typecheck:functions` ejecuta Deno check sobre comunicaciones, monitoreo y ARCA, con sus imports transitivos y la configuración de `functions/deno.json`; valida tipos sin iniciar esas funciones. Arquitectura resuelve los alias locales declarados en `functions/deno.json` mediante `tsconfig.arch.json` y también comprueba imports de tipos; mantener esas rutas alineadas al cambiar alias. Los consumidores externos acceden a las API públicas `@core/index.ts` y `@modules/comunicaciones/index.ts`, y el caso de uso depende del puerto `RepositorioAvisos`.

Para aplicar formato, ejecutar `bun run format:functions`; `bun run lint:fix` formatea y luego comprueba. `lint:functionsfix` se conserva como alias del formateo. El control Deno requiere que su runtime esté instalado; no debe confundirse un control de arquitectura aprobado con una validación completa de Edge Functions.

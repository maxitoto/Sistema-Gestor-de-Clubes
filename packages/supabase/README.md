# Backend Supabase local

Este paquete contiene el esquema declarativo, las migraciones, datos de prueba, Edge Functions y herramientas de desarrollo local. Los comandos siguientes se ejecutan desde `packages/supabase`, salvo indicación contraria. Instalar primero las dependencias con `bun install` desde la raíz del monorepo y mantener Docker en ejecución.

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

## Corregir los permisos de la base actual

Aplicar primero los cambios acordados a `schemas/5_politics.sql`. Esa fuente debe mantener las revocaciones antes de las concesiones finales por columna. Después:

```bash
bun run start:containers
bun run db:finalizar --correccion
```

El segundo comando crea una nueva migración con nombre `<fecha>_correccion_permisos.sql`, leyendo la sección final de permisos del esquema. No conecta a la base ni ejecuta SQL. Revisar su contenido y luego aplicar las migraciones pendientes:

```bash
bunx supabase --workdir .. migration up --local
```

El `--workdir ..` identifica `packages` como directorio de trabajo de la CLI, que busca la configuración en `supabase/config.toml`. No corresponde crear otra configuración Supabase dentro de este paquete.

Este flujo corrige una base que ya recibió la migración anterior. No editar esa migración aplicada ni eliminar el historial. Crear la corrección una vez; el arranque diario no necesita generar otra migración.

## Próximos cambios declarativos

1. Modificar las fuentes pertinentes de `schemas/`.
2. Generar la migración sin aplicarla todavía:

   ```bash
   bunx supabase --workdir .. db schema declarative sync -f ajuste_esquema --no-apply
   ```

3. Tomar el nombre exacto del archivo emitido dentro de `migrations/` y completar sus permisos finales:

   ```bash
   bun run db:finalizar --completar <nombre-exacto-emitido.sql>
   ```

4. Revisar la migración terminada y aplicarla:

   ```bash
   bunx supabase --workdir .. migration up --local
   ```

`--completar` acepta el nombre del archivo, no una ruta, y sólo corresponde a una migración que aún no fue aplicada. El script no consulta el historial de la base: esa condición debe verificarse antes de usarlo. Si la migración ya se aplicó, usar `--correccion` para preparar un archivo nuevo. El finalizador no reemplaza el diff de cambios estructurales: reproduce al final las ACL de la sección 10 y retira la antigua política de borrado del club.

Conservar `migrations/`. Estos pasos no requieren reiniciar los datos de la base. Si una migración falla, revisar el error y su estado antes de continuar.

Después de una aplicación exitosa, ir a `packages/frontend` y ejecutar:

```bash
bun run types:sync
bun run build
```

`types:sync` toma el esquema de la base local en ejecución; debe correrse después de corregir esa base. `build` incluye la comprobación de TypeScript.

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
bun run lint:functions
bun run lint:arch
```

El script `lint` existente incluye formateo; usarlo cuando también se quiera aplicar ese formato.

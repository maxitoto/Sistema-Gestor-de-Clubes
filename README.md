# Sistema de Gestión de Clubes

Monorepo con frontend React/MUI servido y compilado con Bun, y backend Supabase local. La base contiene reglas de negocio, funciones RPC y políticas de acceso. Las Edge Functions cubren comunicaciones y monitoreo; ARCA conserva un punto de entrada pendiente de integración. La existencia de tablas y RPC no significa que todos los módulos tengan ya una pantalla y un circuito completo.

## Preparación

Requisitos: Bun compatible con las versiones fijadas en el repositorio, Docker en ejecución y acceso a Supabase CLI mediante `bunx supabase`. Instalar dependencias desde la raíz:

```bash
bun install
```

Preparar también el runtime de Deno que usa el lint del backend. `deno-bin` está fijado en las dependencias y descarga el binario en la primera invocación si todavía falta; seguir el paso de [preparación de Deno](packages/supabase/README.md#preparar-deno-para-los-controles) antes de considerar esos controles disponibles.

Completar los entornos locales, conservando cualquier configuración existente:

- Backend: crear `packages/supabase/functions/.env` tomando como base `.env.example` de esa misma carpeta. Completar dos secretos aleatorios distintos para el correo. Ver [configuración del backend](packages/supabase/README.md).
- Frontend: configurar `packages/frontend/.env` con `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` del proyecto local. Usar la clave pública; los secretos del backend no corresponden a este archivo. Ver [configuración del frontend](packages/frontend/README.md).

## Preparar la base local

Desde `packages/supabase`, iniciar los contenedores y consultar el estado de las migraciones:

```bash
bun run start:containers
bunx supabase --workdir .. migration list --local
```

Los comandos leen la configuración local desde packages/supabase/config.toml. La migración inicial del repositorio ya consolida el esquema completo y las
políticas de permisos (ACL) finales, por lo que no es necesario generar correcciones adicionales al preparar el proyecto.

Si el listado muestra migraciones locales pendientes de aplicar en este entorno, aplicarlas con:

```bash
bunx supabase --workdir .. migration up --local
```

Conservar las migraciones aplicadas y los datos de prueba; db:reset no forma parte del arranque habitual ya que restablece la base desde cero descartando los
datos locales.

El [README del backend](packages/supabase/README.md) detalla cómo preparar nuevas migraciones declarativas y cuándo corresponde realizar ajustes posteriores de
permisos.

## Arranque diario

Terminal 1, desde `packages/supabase`:

```bash
bun run start
```

Inicia los contenedores y sirve las Edge Functions con `functions/.env` cargado explícitamente. `bun run dev` es un alias del mismo arranque.

Terminal 2, también desde `packages/supabase`:

```bash
bun run correos:local
```

Mantener esta terminal abierta para procesar la cola local. Para procesar sólo un lote de prueba, usar en su lugar `bun run correos:una-vez`. Los correos capturados aparecen en Mailpit: <http://localhost:54324>. No se envían a las casillas externas con el proveedor `mailpit`.

Terminal 3, desde `packages/frontend`:

```bash
bun run types:sync
bun run build
bun run dev
```

Regenerar tipos después de aplicar cambios del esquema, con la base correcta en ejecución. `build` incluye `typecheck`. En posteriores arranques, si el esquema no cambió y ya se validó la compilación, basta con `bun run dev`.

El botón de correo registra destinatarios en la cola; la terminal del procesador realiza los envíos después. Cerrar esa terminal deja los nuevos avisos pendientes hasta el siguiente procesamiento.

## Organización del frontend

El código está en `packages/frontend/src`. La separación de capas sigue estas responsabilidades:

| Capa       | Responsabilidad                                         | Elementos presentes                                                    |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `app`      | Inicialización, proveedores globales y rutas protegidas | `App`, proveedores de sesión/tema/router, `RequireAuth`, `RequireRole` |
| `pages`    | Composición de pantallas                                | Login, dashboard, configuración y socios                               |
| `widgets`  | Bloques que coordinan componentes y acciones            | `dashboard-panel`, `layout`                                            |
| `features` | Interacciones del usuario                               | `login-by-email`, `update-config`, `send-email`                        |
| `entities` | Datos y estado del dominio                              | `club`, `session`, `socio`                                             |
| `shared`   | Infraestructura común                                   | Cliente Supabase, temas, utilidades y tipos generados                  |

Las dependencias bajan de `app` hacia `shared`: una capa puede importar las inferiores, pero no las superiores. `shared` no importa `entities`, `features`, `widgets`, `pages` ni `app`. Los límites que comprueba el repositorio se validan con `bun run lint:arch`; no se crean carpetas de módulos sin una implementación que las necesite.

## Organización del backend

| Directorio                                 | Responsabilidad actual                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/supabase/schemas`                | Fuente declarativa de tablas, índices, funciones SQL, vistas, triggers y permisos       |
| `packages/supabase/migrations`             | Historial SQL aplicado a la base; se conserva para reproducir su evolución              |
| `packages/supabase/seeds`                  | Datos de prueba definidos por el proyecto                                               |
| `functions/comunicaciones`                 | Entrada HTTP de avisos, plantillas, historial, cola, eventos y baja de comunicaciones   |
| `functions/monitoreo`                      | Entrada HTTP de monitoreo con validación de acceso                                      |
| `functions/arca`                           | Entrada pendiente de integración fiscal; no representa una emisión fiscal terminada     |
| `functions/_shared/core`                   | Autenticación, clientes Supabase, errores, transporte de correo y firmas                |
| `functions/_shared/modules/comunicaciones` | Dominio, caso de uso de aviso y repositorio de comunicaciones                           |
| `scripts`                                  | Herramientas locales de arranque, procesamiento de correo y finalización de migraciones |

En comunicaciones, `domain` concentra validaciones/formato sin acceso a red; `application` coordina el caso de uso y `infrastructure` implementa acceso a datos. Algunas rutas HTTP coordinan directamente RPC y adaptadores compartidos, por lo que esta estructura no debe presentarse como una separación completa de todos los módulos del sistema.

## Verificación de cambios

Desde el frontend, ejecutar `bun run build` y `bun run lint`. Desde el backend, ejecutar `bun run lint` y `bun run typecheck:functions`: el primero comprueba Deno lint y arquitectura sin formatear; el segundo comprueba tipos de los tres entrypoints y sus dependencias. También pueden ejecutarse por separado `bun run lint:functions` y `bun run lint:arch`. El control de arquitectura resuelve los alias locales de Deno y considera imports de tipos. Para aplicar formato explícitamente, usar `bun run format:functions` o `bun run lint:fix`.

Además de los controles estáticos, probar inicio y cierre de sesión, edición de configuración autorizada, búsqueda/selección de socios y recorrido de un aviso hasta Mailpit. Una compilación correcta no demuestra por sí sola que los permisos de la base o el envío de correo estén bien conectados.

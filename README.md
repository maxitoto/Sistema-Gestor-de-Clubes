# Sistema de Gestión de Clubes

Monorepo con frontend React/MUI servido y compilado con Bun, y backend Supabase local. La base contiene reglas de negocio, funciones RPC, triggers y políticas de acceso. Las Edge Functions cubren autenticación y credenciales, administración de usuarios, custodia de configuración e imágenes/archivos privados, facturación electrónica ante ARCA (WSAA/WSFEv1 en homologación y generación de PDF A4 con QR), comunicaciones y monitoreo.

## Preparación

Requisitos: Bun compatible con las versiones fijadas en el repositorio, Docker en ejecución y acceso a Supabase CLI mediante `bunx supabase`. Instalar dependencias desde la raíz:

```bash
bun install
```

Preparar también el runtime de Deno que usa el lint del backend. `deno-bin` está fijado en las dependencias y descarga el binario en la primera invocación si todavía falta; seguir el paso de [preparación de Deno](packages/supabase/README.md#preparar-deno-para-los-controles) antes de considerar esos controles disponibles.

Completar los entornos locales, conservando cualquier configuración existente:

- Backend: crear `packages/supabase/functions/.env` tomando como base `.env.example` de esa misma carpeta. Completar dos secretos aleatorios distintos para el correo (`MAIL_UNSUBSCRIBE_SECRET` y `MAIL_WORKER_SECRET`), la clave maestra en Base64 de 32 bytes para la custodia criptográfica fiscal (`FISCAL_MASTER_KEY`) y las variables de homologación ARCA (`ARCA_ENVIRONMENT=homologacion` y `ARCA_EXTERNAL_ENABLED`). Ver [configuración del backend](packages/supabase/README.md).
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

El [README del backend](packages/supabase/README.md) detalla cómo generar y aplicar migraciones a partir de los esquemas en `schemas/`.

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

| Capa       | Responsabilidad                                         | Elementos presentes                                                                                                                                   |
| ---------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`      | Inicialización, proveedores globales y rutas protegidas | `App`, proveedores de sesión/tema/router, `RequireAuth`, `RequireRole`                                                                                |
| `pages`    | Composición de pantallas                                | Login, recuperación/establecimiento de clave, dashboard, socios, ficha de socio, deportes, cobranza (`/pagos`), gastos (`/gastos`), usuarios y configuración |
| `widgets`  | Bloques que coordinan componentes y acciones            | `dashboard-panel`, `layout`, `socios-panel`, `deportes-panel`, `gastos-panel`, `caja-panel`                                                            |
| `features` | Interacciones del usuario                               | Autenticación, padrón e inscripciones, catálogo deportivo, cobranza, emisión y diagnóstico de comprobante fiscal ARCA, gastos con evidencia, usuarios, configuración y correo |
| `entities` | Datos y estado del dominio                              | `club`, `session`, `usuario`, `socio`, `deporte`, `categoria`, `inscripcion`, `job-cuotas`, `cuota`, `pago`, `comprobante`, `categoria-gasto`, `gasto`, `movimiento-caja` |
| `shared`   | Infraestructura común                                   | Clientes Supabase y HTTP verificados, mutaciones idempotentes, temas, utilidades y tipos generados                                                    |

Las dependencias bajan de `app` hacia `shared`: una capa puede importar las inferiores, pero no las superiores. `shared` no importa `entities`, `features`, `widgets`, `pages` ni `app`. Los límites que comprueba el repositorio se validan con `bun run lint:arch`; no se crean carpetas de módulos sin una implementación que las necesite.

## Organización del backend

| Directorio                                  | Responsabilidad actual                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/supabase/schemas`                 | Fuente declarativa de tablas, índices, funciones SQL, vistas, triggers, permisos, Storage y tareas cron      |
| `packages/supabase/migrations`              | Historial SQL aplicado a la base; se conserva para reproducir su evolución                                   |
| `packages/supabase/seeds`                   | Datos de prueba definidos por el proyecto (incluyendo configuración fiscal y receptores por defecto)         |
| `functions/acceso` y `credenciales`         | Inicio de sesión con límite de intentos, recuperación y establecimiento/cambio de contraseña                 |
| `functions/usuarios`                        | Administración recuperable de cuentas internas (`admin` y `responsable`)                                     |
| `functions/configuracion`                   | Custodia criptográfica (`AES-256-GCM`) y validación de certificados X.509 y claves privadas RSA de ARCA      |
| `functions/archivos`                        | Validación binaria real (PNG/JPEG/PDF), carga autorizada y entrega de URLs firmadas sobre `club-archivos`    |
| `functions/arca`                            | Emisión electrónica de 4 fases, conciliación, diagnóstico WSAA/WSFEv1, consulta de serie y PDF A4 con QR     |
| `functions/comunicaciones`                  | Entrada HTTP de avisos, plantillas, historial, cola, eventos y baja de comunicaciones                        |
| `functions/monitoreo`                       | Entrada HTTP de monitoreo con validación de acceso                                                           |
| `functions/_shared/core`                    | Autenticación, clientes Supabase, errores, transporte de correo y firmas                                     |
| `functions/_shared/modules/*`               | Módulos hexagonales (`usuarios`, `credenciales`, `configuracion`, `archivos`, `fiscal`, `comunicaciones`)    |
| `scripts`                                   | Herramientas locales de arranque, procesamiento de cola de correo y configuración de perfil fiscal           |

En los módulos bajo `_shared/modules`, `domain` concentra validaciones y reglas puras sin acceso a red; `application` coordina los casos de uso sobre puertos explícitos e `infrastructure` implementa los adaptadores de base de datos, Storage, criptografía y servicios SOAP externos.

## Verificación de cambios

Desde el frontend, ejecutar `bun run build`, `bun run lint` y `bun test`. Desde el backend, ejecutar `bun run lint`, `bun run typecheck:functions`, `bun test` y `bun run test:deno`: el primero comprueba Deno lint y arquitectura sin formatear; el segundo comprueba tipos de los ocho entrypoints y sus dependencias; los dos últimos ejecutan las suites unitarias y de adaptadores en Bun y Deno. También pueden ejecutarse por separado `bun run lint:functions` y `bun run lint:arch`. El control de arquitectura resuelve los alias locales de Deno y considera imports de tipos. Para aplicar formato explícitamente, usar `bun run format:functions` o `bun run lint:fix`.

Además de los controles estáticos y pruebas automatizadas, probar inicio y cierre de sesión, edición de configuración autorizada, alta de socio (que aprovisiona automáticamente su receptor fiscal como Consumidor Final), cobro de cuota con emisión de comprobante electrónico en homologación y recorrido de un aviso hasta Mailpit.

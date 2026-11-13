# Sistema de Gestión de Clubes

**Sistema de Gestión de Clubes** es una aplicación web administrativa y operativa para instituciones deportivas y sociales. Centraliza bajo control de acceso por roles (`admin` y `responsable`) la gestión de socios, inscripciones a disciplinas, cobranza de cuotas sobre un libro de caja continuo y trazable, registro de gastos respaldados, facturación electrónica ante ARCA y comunicaciones por correo electrónico.

Reemplaza planillas dispersas y controles manuales resolviendo el circuito diario del club en un flujo unificado y auditado:

- **Socios y disciplinas:** padrón de socios con legajo y fotografía privada, catálogo de deportes y categorías e inscripciones activas.
- **Cuotas, cobranza, caja continua y gastos:** generación programada y manual de cuotas, cobros sobre un libro de movimientos continuo e inmutable (sin borrados; las anulaciones del día o históricas operan mediante reversas auditadas) y registro de gastos con comprobantes PDF o imagen validados.
- **Facturación electrónica ARCA y monitoreo fiscal:** custodia cifrada de credenciales fiscales, emisión de Factura C y Nota de Crédito C ante WSAA/WSFEv1 (homologación), generación de PDF A4 versionados con QR oficial en almacenamiento privado, regularización automática en segundo plano y consola de monitoreo fiscal con acciones administrativas auditadas.
- **Comunicaciones y administración:** envío de correos institucionales con plantillas, cola de procesamiento, historial y enlace de baja firmado, además de resumen operativo, configuración institucional y gestión de usuarios y sesiones para `admin`.

Monorepo con frontend React/MUI servido y compilado con Bun, y backend Supabase local. La base contiene reglas de negocio, funciones RPC, triggers y políticas de acceso. Las Edge Functions cubren autenticación y credenciales, administración de usuarios, custodia de configuración e imágenes/archivos privados, facturación electrónica y Notas de Crédito C ante ARCA (WSAA/WSFEv1 en homologación y generación de PDF A4 con QR), regularización automática en segundo plano, comunicaciones y monitoreo fiscal.

## Preparación

Requisitos previos en la máquina local:

- **Bun** compatible con las versiones fijadas en el repositorio.
- **Docker** instalado y con el daemon en ejecución (requerido para levantar la pila local de Supabase).
- Acceso a **Supabase CLI** mediante `bunx supabase` (sin instalación global obligatoria).

Los siguientes pasos parten de haber clonado el repositorio (`git clone <url-del-repositorio>`):

### 1. Entrar al repositorio y verificar herramientas base

Ubicarse en la raíz del proyecto clonado y comprobar que Bun responda y el servicio de Docker esté activo (si `docker info` falla, iniciar Docker antes de continuar con la base local):

```bash
cd Sistema-Gestor-de-Clubes
bun --version && docker info >/dev/null && echo "Docker listo"
```

### 2. Instalar las dependencias del monorepo

Instalar desde la raíz las dependencias declaradas para los workspaces `packages/frontend` y `packages/supabase` (incluye herramientas compartidas como `deno-bin` y utilidades invocadas con `bunx`):

```bash
bun install
```

### 3. Inicializar el runtime de Deno para el backend

El backend utiliza Deno para lint, formateo, chequeo de tipos y pruebas de Edge Functions. Ejecutar la comprobación de versión descarga el binario en caché la primera vez si todavía no está disponible:

```bash
(cd packages/supabase && bunx --bun deno --version)
```

### 4. Crear y configurar el archivo `.env` del backend

Copiar la plantilla de variables de Edge Functions sin sobrescribir configuraciones existentes:

```bash
[ -f packages/supabase/functions/.env ] || cp packages/supabase/functions/.env.example packages/supabase/functions/.env
```

Generar tres secretos hexadecimales independientes (64 caracteres cada uno) para `MAIL_UNSUBSCRIBE_SECRET`, `MAIL_WORKER_SECRET` y `FISCAL_WORKER_SECRET` (este último exige al menos 32 caracteres y debe ser distinto de `MAIL_WORKER_SECRET` y de las claves de Supabase):

```bash
bun -e "for (const k of ['MAIL_UNSUBSCRIBE_SECRET', 'MAIL_WORKER_SECRET', 'FISCAL_WORKER_SECRET']) console.log(k + '=' + require('node:crypto').randomBytes(32).toString('hex'))"
```

Generar la clave maestra AES de 32 bytes codificada en Base64 para `FISCAL_MASTER_KEY` (cifra la configuración y los certificados fiscales; conservarla sin cambios una vez cargadas las credenciales, salvo rotación explícita):

```bash
bun -e "console.log('FISCAL_MASTER_KEY=' + require('node:crypto').randomBytes(32).toString('base64'))"
```

Abrir `packages/supabase/functions/.env` y pegar los cuatro valores generados en sus variables correspondientes. Respecto al resto de las variables de la plantilla:

- Mantener `ARCA_ENVIRONMENT=homologacion` y `ARCA_EXTERNAL_ENABLED=false` para iniciar en entorno local sin llamadas externas a ARCA (habilitar `ARCA_EXTERNAL_ENABLED=true` solo cuando se pruebe homologación real con certificado y clave privada cargados).
- Los valores por defecto de correo local (`MAIL_PROVIDER`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_PUBLIC_BASE_URL`), `ARCHIVOS_PUBLIC_BASE_URL` y `FISCAL_PUBLIC_BASE_URL` ya apuntan a Mailpit y al API local (`127.0.0.1:54321`); `RESEND_API_KEY` y `RESEND_WEBHOOK_SECRET` quedan opcionales. Ver [configuración del backend](packages/supabase/README.md).

### 5. Crear el archivo `.env` del frontend

Copiar la plantilla de entorno del frontend preservando cualquier configuración existente:

```bash
[ -f packages/frontend/.env ] || cp packages/frontend/.env.example packages/frontend/.env
```

`packages/frontend/.env.example` ya deja configurada `PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`. El valor de `PUBLIC_SUPABASE_ANON_KEY` se completa con la clave pública (`anon key`) que entrega la instancia local de Supabase al levantarse en la sección siguiente (**Preparar la base local**). Nunca colocar secretos del backend ni la `service_role` key en este archivo (ver [configuración del frontend](packages/frontend/README.md)).

## Preparar la base local

Los comandos de esta sección se ejecutan desde `packages/supabase` y toman la configuración local definida en `packages/supabase/config.toml`.

### 1. Iniciar los contenedores locales

Entrar a `packages/supabase` desde la raíz del repositorio e iniciar la pila local de Supabase:

```bash
cd packages/supabase
bun run start:containers
```

En una primera inicialización sin volumen Docker previo, Supabase aplica automáticamente la migración inicial consolidada (que ya incluye el esquema completo y las políticas de permisos ACL finales) y carga los datos iniciales de prueba configurados para el entorno local.

### 2. Obtener la clave pública local para el frontend

Con los contenedores en ejecución, consultar las URLs y claves locales del proyecto:

```bash
bunx supabase status --workdir ..
```

Si se prefiere la salida en formato `CLAVE=valor`:

```bash
bunx supabase status --workdir .. -o env
```

Copiar el valor de `ANON_KEY` (o `PUBLISHABLE_KEY`) en `PUBLIC_SUPABASE_ANON_KEY` dentro de `packages/frontend/.env`. Conservar las claves privadas (`SERVICE_ROLE_KEY`, `SECRET_KEY` y `JWT_SECRET`) únicamente en el entorno del backend; nunca copiarlas al frontend.

### 3. Verificar el estado de migraciones y aplicar pendientes

Comprobar que las migraciones locales coinciden con el historial aplicado en la base local:

```bash
bunx supabase --workdir .. migration list
```

Si el listado muestra migraciones incrementales pendientes de aplicar sobre una base ya en uso, aplicarlas sin descartar datos locales con:

```bash
bunx supabase --workdir .. migration up
```

### 4. Reconstrucción desde cero (`db:reset`) y sincronización de tipos

Conservar las migraciones aplicadas y los datos de prueba durante el uso cotidiano: `db:reset` **no** forma parte del arranque habitual porque restablece la base desde cero descartando los datos locales y volviendo a cargar los datos semilla.

Ejecutarlo únicamente cuando se necesite reiniciar el entorno limpio desde cero o tras incorporar cambios en la migración inicial consolidada o en los datos semilla (cuya marca temporal ya consta como aplicada y no se vuelve a correr con `migration up`):

```bash
bun run db:reset
```

Luego de aplicar cambios en el esquema (`migration up` o `db:reset`), con la base local en ejecución, actualizar los tipos TypeScript generados para el frontend:

```bash
(cd ../frontend && bun run types:sync)
```

El [README del backend](packages/supabase/README.md) detalla cómo regenerar la migración desde los esquemas declarativos en `schemas/` y administrar el esquema local.

## Ejecución del entorno local

Los bloques siguientes asumen una terminal abierta en la raíz del repositorio (`Sistema-Gestor-de-Clubes`).

### 1. Backend y Edge Functions (segundo plano)

Si los contenedores locales todavía no están activos, iniciarlos en segundo plano desde `packages/supabase`:

```bash
cd packages/supabase
bun run start:containers
```

Este comando levanta PostgreSQL, Auth, Storage, Mailpit, Studio y el runtime de Edge Functions (`edge_runtime`) cargando automáticamente `packages/supabase/functions/.env`, y deja la terminal libre. Si ya se ejecutó `bun run start:containers` en **Preparar la base local**, no hace falta volver a correrlo.

- Si más adelante se edita `packages/supabase/functions/.env`, reiniciar la pila (`bun run stop && bun run start:containers`) para que `edge_runtime` tome los cambios, o recargar las funciones en primer plano con el comando opcional siguiente.
- **Opcional (logs de funciones en vivo en primer plano):** para ver la salida en consola de las Edge Functions o recargar `functions/.env` sin reiniciar Docker:

```bash
cd packages/supabase
bun run start:functions
```

(`bun run start` —y su alias `bun run dev` en `packages/supabase`— ejecuta `start:containers` seguido de `start:functions` en un único comando.)

### 2. Frontend en desarrollo

En una terminal aparte, iniciar el servidor de desarrollo con recarga en caliente:

```bash
cd packages/frontend
bun run dev
```

Imprime en consola la URL local de acceso (`Server running at ...`). Si hubo cambios recientes en el esquema SQL, recordar regenerar los tipos con `bun run types:sync`; para validar compilación y generar `dist/` de producción, usar `bun run build` (que ya incluye `typecheck`).

### 3. Procesador local de correos (opcional)

Solo es necesario cuando se quieran procesar envíos de correo hacia Mailpit. El botón de envío en la aplicación registra destinatarios en la cola; el procesador consulta los pendientes y realiza los envíos al SMTP local:

```bash
cd packages/supabase
bun run correos:local
```

Para procesar un solo lote puntual y salir, usar en su lugar:

```bash
cd packages/supabase
bun run correos:una-vez
```

Los correos capturados aparecen en Mailpit (<http://localhost:54324>) y no salen hacia casillas externas mientras `MAIL_PROVIDER=mailpit`. Al cerrar esa terminal, los nuevos avisos quedan en cola hasta la próxima ejecución.

### 4. Invocador periódico del worker fiscal (opcional)

En desarrollo local, los comprobantes que quedan en `pendiente_cae` o `anulacion_pendiente` no se reintentan solos en segundo plano hasta iniciar un invocador periódico local autenticado con `FISCAL_WORKER_SECRET`:

```bash
cd packages/supabase
bun run fiscal:local
```

Mientras esa terminal siga abierta, invoca `POST /functions/v1/fiscal-worker/procesar-pendientes` cada `60` segundos (en forma secuencial y sin solapamientos) para regularizar los comprobantes cuya próxima ventana ya venció o cerrarlos al cumplirse las 24 horas. Para ejecutar un único ciclo bajo demanda y salir, usar:

```bash
cd packages/supabase
bun run fiscal:una-vez
```

En producción esta cadencia corre en el scheduler administrado del servidor; en local, al cerrar la terminal los comprobantes quedan esperando en base hasta la siguiente ejecución o hasta una acción administrativa en `/monitoreo-fiscal`.

### Accesos locales y apagado

- **API local de Supabase:** <http://127.0.0.1:54321>
- **Supabase Studio:** <http://127.0.0.1:54323>
- **Mailpit (bandeja local de correos):** <http://localhost:54324>

Para detener los contenedores locales al finalizar:

```bash
cd packages/supabase
bun run stop
```

## Organización del frontend

El código está en `packages/frontend/src`. La separación de capas sigue estas responsabilidades:

| Capa       | Responsabilidad                                         | Elementos presentes                                                                                                                                   |
| ---------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`      | Inicialización, proveedores globales y rutas protegidas | `App`, proveedores de sesión/tema/router, `RequireAuth`, `RequireRole`                                                                                                       |
| `pages`    | Composición de pantallas                                | Login, recuperación/establecimiento de clave, dashboard, socios, ficha de socio, deportes, cobranza (`/pagos`), monitoreo fiscal (`/monitoreo-fiscal`), gastos (`/gastos`), usuarios y configuración |
| `widgets`  | Bloques que coordinan componentes y acciones            | `dashboard-panel`, `layout`, `socios-panel`, `deportes-panel`, `gastos-panel`, `caja-panel`                                                                                   |
| `features` | Interacciones del usuario                               | Autenticación, padrón e inscripciones, catálogo deportivo, cobranza, anulación de cobros, emisión/diagnóstico/regularización fiscal ARCA, gastos con evidencia, usuarios, configuración y correo |
| `entities` | Datos y estado del dominio                              | `club`, `session`, `usuario`, `socio`, `deporte`, `categoria`, `inscripcion`, `job-cuotas`, `cuota`, `pago`, `comprobante`, `monitoreo-fiscal`, `categoria-gasto`, `gasto`, `movimiento-caja` |
| `shared`   | Infraestructura común                                   | Clientes Supabase y HTTP verificados, mutaciones idempotentes, temas, utilidades y tipos generados                                                                            |

Las dependencias bajan de `app` hacia `shared`: una capa puede importar las inferiores, pero no las superiores. `shared` no importa `entities`, `features`, `widgets`, `pages` ni `app`. Los límites que comprueba el repositorio se validan con `bun run lint:arch`; no se crean carpetas de módulos sin una implementación que las necesite.

## Organización del backend

| Directorio                                  | Responsabilidad actual                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/supabase/schemas`                 | Fuente declarativa de tablas, índices, funciones SQL, vistas, triggers, permisos, Storage y tareas cron                         |
| `packages/supabase/migrations`              | Historial SQL aplicado a la base; se conserva para reproducir su evolución                                                      |
| `packages/supabase/seeds`                   | Datos de prueba definidos por el proyecto (incluyendo configuración fiscal para factura y Nota de Crédito C, y receptores locales) |
| `functions/acceso` y `credenciales`         | Inicio de sesión con límite de intentos, recuperación y establecimiento/cambio de contraseña                                    |
| `functions/usuarios`                        | Administración recuperable de cuentas internas (`admin` y `responsable`)                                                        |
| `functions/configuracion`                   | Custodia criptográfica (`AES-256-GCM`) y validación de certificados X.509 y claves privadas RSA de ARCA                         |
| `functions/archivos`                        | Validación binaria real (PNG/JPEG/PDF), carga autorizada y entrega de URLs firmadas sobre `club-archivos`                       |
| `functions/arca`                            | Emisión electrónica de 4 fases (Factura C y Nota de Crédito C), conciliación, diagnóstico WSAA/WSFEv1, consulta de serie y PDF A4 con QR |
| `functions/comunicaciones`                  | Entrada HTTP de avisos, plantillas, historial, cola, eventos y baja de comunicaciones                                           |
| `functions/monitoreo`                       | Consulta paginada del monitoreo fiscal (`GET`) y acciones administrativas auditadas (`forzar`, `reabrir`, `resolver`, `registrar-externo`) |
| `functions/fiscal-worker`                   | Worker automático en segundo plano (autenticado por secreto técnico) que regulariza lotes pendientes dentro de la ventana de 24 h |
| `functions/_shared/core`                    | Autenticación, clientes Supabase, errores, transporte de correo y firmas                                                        |
| `functions/_shared/modules/*`               | Módulos hexagonales (`usuarios`, `credenciales`, `configuracion`, `archivos`, `fiscal`, `comunicaciones`)                       |
| `scripts`                                   | Herramientas locales de arranque, invocación periódica de correo y worker fiscal, y configuración de perfil fiscal              |

En los módulos bajo `_shared/modules`, `domain` concentra validaciones y reglas puras sin acceso a red; `application` coordina los casos de uso sobre puertos explícitos e `infrastructure` implementa los adaptadores de base de datos, Storage, criptografía y servicios SOAP externos.

## Verificación de cambios

### Frontend (`packages/frontend`)

Comprueba tipos con TypeScript (`tsc --noEmit`) y genera el bundle de producción en `dist/`:

```bash
bun run build
```

Ejecuta solo la verificación de tipos sin generar bundle:

```bash
bun run typecheck
```

Valida formato/reglas con Biome y verifica los límites de arquitectura FSD con `dependency-cruiser` sin modificar archivos:

```bash
bun run lint
```

Aplica correcciones automáticas de formato y reglas con Biome cuando sea necesario:

```bash
bun run lint:fix
```

Ejecuta las suites unitarias y de contratos de dominio/caché del frontend:

```bash
bun test
```

### Backend (`packages/supabase`)

Comprueba `deno lint` y las reglas de arquitectura hexagonal en `functions/` (resolviendo alias locales de Deno e imports de tipos) sin modificar archivos:

```bash
bun run lint
```

Ejecuta únicamente el linter de Deno sobre `functions/` sin aplicar formato:

```bash
bun run lint:functions
```

Ejecuta únicamente el control de dependencias entre módulos (`dependency-cruiser`) sobre `functions/`:

```bash
bun run lint:arch
```

Aplica formato explícito con `deno fmt` en `functions/`:

```bash
bun run format:functions
```

Aplica formato con `deno fmt` en `functions/` y vuelve a validar `deno lint` y arquitectura:

```bash
bun run lint:fix
```

Comprueba estáticamente los tipos con Deno para los nueve entrypoints de Edge Functions y sus dependencias compartidas:

```bash
bun run typecheck:functions
```

Ejecuta las suites unitarias en Bun (perfiles fiscales, coordinación, calendario/motor de regularización, invocador fiscal local, custodia y usuarios):

```bash
bun test
```

Ejecuta las suites en runtime Deno (`tests/*.deno.ts`: adaptador WSAA/WSFE, consulta de serie, PDF/QR de facturas, Notas de Crédito y constancias, y contratos HTTP de `monitoreo` y `fiscal-worker`):

```bash
bun run test:deno
```

### Flujo manual recomendado

Además de los controles estáticos y pruebas automatizadas, probar inicio y cierre de sesión, edición de configuración autorizada, alta de socio (que aprovisiona automáticamente su receptor fiscal como Consumidor Final), cobro de cuota con emisión de comprobante electrónico en homologación, anulación de cobro con constancia o Nota de Crédito C, consulta y acciones administrativas en `/monitoreo-fiscal`, y recorrido de un aviso hasta Mailpit.

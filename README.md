# Sistema de Gestión de Clubes

Monorepo con frontend React/MUI servido y compilado con Bun, y backend Supabase local. La base contiene reglas de negocio, funciones RPC y políticas de acceso. Las Edge Functions cubren comunicaciones y monitoreo; ARCA conserva un punto de entrada pendiente de integración. La existencia de tablas y RPC no significa que todos los módulos tengan ya una pantalla y un circuito completo.

## Preparación

Requisitos: Bun compatible con las versiones fijadas en el repositorio, Docker en ejecución y acceso a Supabase CLI mediante `bunx supabase`. Instalar dependencias desde la raíz:

```bash
bun install
```

Completar los entornos locales, conservando cualquier configuración existente:

- Backend: crear `packages/supabase/functions/.env` tomando como base `.env.example` de esa misma carpeta. Completar dos secretos aleatorios distintos para el correo. Ver [configuración del backend](packages/supabase/README.md).
- Frontend: configurar `packages/frontend/.env` con `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` del proyecto local. Usar la clave pública; los secretos del backend no corresponden a este archivo. Ver [configuración del frontend](packages/frontend/README.md).

## Aplicar la corrección de permisos a una base existente

El archivo fuente que se modifica es `packages/supabase/schemas/5_politics.sql`. Con la fuente corregida y los scripts de esta propuesta copiados, ejecutar desde `packages/supabase`:

```bash
bun run start:containers
bun run db:finalizar --correccion
bunx supabase --workdir .. migration up --local
```

`db:finalizar --correccion` prepara una nueva migración de permisos; el siguiente comando aplica las migraciones locales pendientes. Revisar el archivo generado antes de aplicarlo. Ejecutar esta preparación una vez por corrección, no en cada arranque. Conservar las migraciones anteriores. El flujo no requiere reinicializar la base ni descartar datos.

El [README del backend](packages/supabase/README.md) explica también cómo completar una migración nueva que todavía no fue aplicada.

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

Desde el frontend, ejecutar `bun run build` y `bun run lint`. Desde el backend, `bun run lint:functions` y `bun run lint:arch`. El script backend `lint` también formatea archivos; usar los comandos separados para una revisión sin aplicar formato.

Además de los controles estáticos, probar inicio y cierre de sesión, edición de configuración autorizada, búsqueda/selección de socios y recorrido de un aviso hasta Mailpit. Una compilación correcta no demuestra por sí sola que los permisos de la base o el envío de correo estén bien conectados.

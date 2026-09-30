# Frontend del Sistema de Gestión de Clubes

El frontend usa Bun, React y MUI. Ejecutar `bun install` desde la raíz del monorepo para instalar las dependencias del workspace.

## Configuración local

Crear `packages/frontend/.env` con las variables públicas del proyecto Supabase local que corresponde a `packages/supabase/config.toml`:

```dotenv
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=REEMPLAZAR_POR_LA_CLAVE_PUBLICA_LOCAL
```

Estas variables se incorporan al JavaScript del navegador. Usar la clave pública `anon`/publishable del proyecto; nunca una clave `service_role` ni los secretos de correo. El archivo `.env` está excluido de Git.

La base Supabase y las Edge Functions se inician por separado desde el paquete backend. El proyecto local debe coincidir con el `project_id` de su configuración y contener la migración corregida.

## Comandos

Ejecutar desde `packages/frontend`:

```bash
bun run types:sync
bun run build
bun run dev
```

- `types:sync` genera `src/shared/types/model.ts` desde la base Supabase local que está corriendo. Requiere tener aplicado el esquema correcto. Si la generación falla, conserva el archivo anterior. Ejecutarlo después de cambiar el esquema; no editar el archivo generado a mano.
- `typecheck` comprueba los tipos sin generar archivos.
- `build` ejecuta primero `typecheck` y luego genera el sitio estático en `dist/`. Sustituye las variables `PUBLIC_*`, igual que el servidor de desarrollo. Requiere la configuración del entorno de destino al compilar; no aplica migraciones ni regenera tipos.
- `dev` inicia el servidor de desarrollo con recarga de cambios.
- `start` inicia el servidor Bun desde `src/index.ts` en modo producción. Ese servidor procesa el HTML fuente; no sirve automáticamente el contenido de `dist/`. Para probar o publicar el artefacto de `build`, servir `dist/` con un servidor estático con fallback a `index.html` para las rutas de la aplicación.

Para comprobar el código y los límites entre capas:

```bash
bun run lint
```

Una compilación correcta verifica el código y el empaquetado. Los recorridos de acceso, configuración, socios y correo deben probarse además contra el backend local. Registrar un aviso en la cola no ejecuta su procesador: el correo aparece en Mailpit después de que el backend procese los pendientes.

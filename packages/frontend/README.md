# Frontend del Sistema de Gestión de Clubes

Aplicación web React y MUI ejecutada y compilada con Bun bajo arquitectura por capas (`app` → `pages` → `widgets` → `features` → `entities` → `shared`).

Para la preparación inicial (`bun install`, `.env`), el levantamiento del entorno local, el mapa de capas y el listado completo de comandos de verificación, seguir el [README raíz](../../README.md).

## Reglas técnicas de entorno y compilación

- **Variables `PUBLIC_*` en cliente:** `bun run dev` y `bun run build` inyectan las variables `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` directamente en el JavaScript del navegador (`--env='PUBLIC_*'`). Utilizar únicamente la clave pública del proyecto; nunca incluir `service_role` ni secretos del backend en `.env`. Si cambia el entorno de destino, volver a ejecutar `bun run build`.
- **Generación de tipos (`bun run types:sync`):** [scripts/sync-types.ts](scripts/sync-types.ts) lee el esquema desde la base Supabase local en ejecución, escribe de forma atómica [src/shared/types/model.ts](src/shared/types/model.ts) y lo formatea con Biome. Si la generación falla, conserva el archivo anterior; no editar `src/shared/types/model.ts` a mano.
- **Diferencia entre `bun run build` y `bun run start`:** `bun run start` (`NODE_ENV=production`) ejecuta [src/index.ts](src/index.ts), que procesa [src/index.html](src/index.html) en caliente mediante `Bun.serve` y **no** sirve el directorio estático `dist/`. Para publicar o probar el artefacto generado por `bun run build`, servir `dist/` desde un servidor estático con fallback SPA a `index.html` para todas las rutas de la aplicación.

## Notas técnicas de controles y pruebas

Los comandos de verificación están listados en el [README raíz](../../README.md). Particularidades propias del paquete frontend:

- `bun run lint` combina formato y reglas de código ([biome.json](biome.json)) con los límites entre capas FSD definidos en [.dependency-cruiser.js](.dependency-cruiser.js).
- `bun test` ejecuta las suites de [tests/](tests) sobre transporte/sesión, formularios y validaciones de dominio, cobranza, anulación, sincronización y monitoreo fiscal, caja, gastos y recuperación de usuarios y trabajos.

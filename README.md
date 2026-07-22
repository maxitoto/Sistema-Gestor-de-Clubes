```markdown
# Sistema de Gestión de Club (Enterprise-Grade)

Este monorepo contiene el código fuente completo del Sistema de Gestión de Club. La arquitectura está dividida en dos aplicaciones principales diseñadas para trabajar en conjunto bajo estrictos contratos de API y tipado estricto (TypeScript).

## 📁 Estructura del Monorepo

- **/frontend**: Aplicación cliente SPA construida con React, Vite, MUI y TanStack Query. Consume las APIs a través de un patrón de Fábrica CRUD genérica.
- **/supabase**: Infraestructura de base de datos (PostgreSQL), migraciones, políticas de seguridad (RLS) y microservicios backend construidos con Deno y Hono (Supabase Edge Functions).

## 🚀 Requisitos Previos

Para ejecutar este proyecto en tu entorno local, necesitas tener instalado:
- [Node.js](https://nodejs.org/) y [pnpm](https://pnpm.io/) (para el frontend)
- [Deno](https://deno.land/) (para el tipado y ejecución local de Edge Functions)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para levantar la infraestructura de base de datos y contenedores locales)
- [Docker](https://www.docker.com/) (requerido por Supabase CLI)

## 🛠️ Inicio Rápido

1. **Levantar la base de datos y backend:**
   ```bash
   cd supabase
   supabase start
   supabase functions serve

    ```

2. **Levantar el entorno de desarrollo frontend:**
    ```bash
    cd frontend
    pnpm install
    pnpm dev

    ```
```
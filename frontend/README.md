```markdown
# Frontend - Sistema de Gestión de Club

Aplicación cliente de alto rendimiento orientada a la gestión administrativa del club. Construida con un enfoque en la escalabilidad, manejo explícito de errores y minimización de código repetitivo.

## 🛠️ Stack Tecnológico

- **Core**: React 18+, TypeScript, Vite
- **Estado y Fetching**: TanStack Query (React Query) v5
- **UI & Componentes**: Material UI (MUI)
- **Enrutamiento**: React Router v6

## 🏛️ Arquitectura y Patrones de Diseño

El código frontend sigue una arquitectura limpia aislando la lógica del SDK de la lógica de negocio:

### 1. Capa de Servicios y API (`/src/services`)
- **Interceptor (`edgeFetch`)**: Todas las peticiones pasan por una función central en `supabaseClient.ts` o `apis.ts`. Este interceptor procesa respuestas HTTP de Hono y transforma errores nativos del backend en Excepciones puras de JavaScript para que TanStack Query las maneje.
- **Fábrica CRUD (`createApi`)**: Ubicada en `apis.ts`, esta función utiliza Generics para instanciar automáticamente los métodos `getAll`, `getById`, `create`, `update` y `delete` de cualquier entidad. Obliga al tipado estricto basándose en los esquemas generados por Supabase.

### 2. Tipado Estricto de Base de Datos (`/src/types/model.ts`)
No declaramos interfaces manualmente para las entidades de la base de datos. Utilizamos los tipos generados automáticamente por el CLI de Supabase, aprovechando `Tables`, `TablesInsert` y `TablesUpdate` para garantizar sincronía total con la DB.

### 3. Gestión de Estado Asíncrono
Los componentes (ej. `Dashboard.tsx`) consumen la API exclusivamente a través de hooks de TanStack Query (`useQuery`, `useMutation`). Esto centraliza la lógica de carga, caché, reintentos y estados de error fuera de la vista.

## 💻 Scripts Disponibles

- `pnpm dev`: Inicia el servidor de desarrollo de Vite.
- `pnpm build`: Transpila y empaqueta la aplicación para producción.
- `pnpm preview`: Previsualiza la build de producción localmente.
- `pnpm lint`: Ejecuta ESLint para mantener el estándar del código base.

```
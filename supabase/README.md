```markdown
# Backend & Infraestructura - Supabase

Este directorio contiene toda la infraestructura de backend del sistema, estructurada alrededor de PostgreSQL, Row Level Security (RLS) y Edge Functions potenciadas por Hono y Deno.

## 🏗️ Estructura de la Base de Datos

- **/migrations**: Contiene la evolución del esquema de base de datos de manera determinista (tablas de `socios`, roles, etc.) y las políticas de seguridad.
- **/seed.sql**: Script poblador con datos semilla para el entorno de desarrollo local.
- **RLS (Row Level Security)**: Todas las operaciones a la base de datos asumen que las tablas tienen RLS habilitado. La autorización se realiza a nivel de base de datos a través de los tokens JWT de Supabase Auth.

## ⚡ Edge Functions (Hono + Deno)

El sistema de APIs está diseñado como una colección de microservicios usando [Hono](https://hono.dev/), aprovechando su enrutamiento rápido y sintaxis familiar (similar a Express/Fastify) dentro del runtime de Deno.

### Arquitectura de la carpeta `functions`

- **`/_shared`**: Contiene la lógica core compartida por todas las funciones.
  - `server.ts`: Fábrica de instanciación de la app Hono. Define el manejador de errores global (`app.onError`) y el middleware CORS.
  - `middleware.ts`: Middleware de autenticación que intercepta el JWT, instancia un cliente de Supabase seguro por cada petición y lo inyecta en el contexto de Hono (`c.get('supabase')`).
  - `errors.ts`: Clases de dominio de errores (`AppError`, `NotFoundError`, etc.) para estandarizar las respuestas HTTP.
- **`/socios`, `/enviar-email`, etc.**: Cada carpeta representa un microservicio independiente. 

### Contrato de la API

El backend sigue un contrato estricto de respuesta que permite al frontend escalar sin excepciones no controladas:
1. **Éxito**: Retorna el payload directo (ej. un Array de objetos puro) usando `c.json(data)`. Nunca se envuelven los datos en propiedades arbitrarias (ej. `{ data: [...] }`).
2. **Error**: Si ocurre una falla lógica o de DB, la ruta ejecuta `throw new AppError(...)`. Hono captura la excepción y estandariza la respuesta con el formato y status HTTP correctos para el frontend.

## 🔧 Comandos de Supabase CLI

- `supabase start`: Inicia los contenedores locales (Postgres, Studio, Auth, Storage).
- `supabase stop`: Detiene los contenedores de desarrollo.
- `supabase db reset`: Borra la DB local, reaplica migraciones y ejecuta el `seed.sql`.
- `supabase functions serve [nombre-funcion]`: Sirve localmente una Edge Function para desarrollo. Omitir el nombre sirve todas las funciones.
- `supabase gen types typescript --local > ../frontend/src/types/model.ts`: Sincroniza la estructura actual de Postgres en un archivo de tipos de TypeScript para el frontend.
```
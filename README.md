# Sistema Club Los Andes

## 1. Entorno de Node.js

Este proyecto requiere una versión específica de Node.js para asegurar la compatibilidad con todas las dependencias (como pnpm y Vite). Se recomienda utilizar Node Version Manager (NVM).

En la raíz del proyecto, ejecuta:

```bash
nvm use

```

Si la terminal indica que no tienes la versión instalada, instálala y actívala ejecutando:

```bash
nvm install
nvm use

```

---

## 2. Backend (Supabase Local)

El backend está construido sobre una instancia local de Supabase (Dockerizado). Sigue una estructura modular estricta para separar la infraestructura de las reglas de negocio.

### Comandos Principales

* **Iniciar Supabase:** `npx supabase start`
* **Cargar el esquema y datos (Reset):** `npx supabase db reset`
* **Iniciar las Edge Functions:** `npx supabase functions serve`
* **Crear nueva Edge Function:** `npx supabase functions new nombre-funcion` (Recuerda eliminar el archivo `deno.json` que se autogenera dentro de la nueva carpeta para mantener la configuración global).

### Arquitectura de Directorios: Base de Datos

* **`supabase/migrations/`:** Contiene la definición estructural de la base de datos. Los archivos están enumerados para ejecutarse en orden cronológico (ej. tablas primero, luego índices, vistas y funciones). Aquí reside el "plano" de la base de datos y las políticas de seguridad (RLS).
* **`supabase/seeds/`:** Exclusivo para poblar la base de datos con información inicial. El archivo `seed.sql` contiene los `INSERT` de prueba (socios, deportes, etc.) y se ejecuta automáticamente después de las migraciones.

### Arquitectura de Directorios: Edge Functions (`supabase/functions/`)

Las funciones serverless de Deno utilizan una aproximación de Arquitectura Limpia, aislando responsabilidades.

* **`deno.json` (Raíz de functions):** El diccionario global. Define el mapa de importaciones (alias como `@domine/`, `@infrastructure/`) y las librerías permitidas para todas las funciones.
* **`[nombre-funcion]/index.ts` (Controladores):** Cada carpeta (ej. `procesar-correos`) es un endpoint individual. El archivo `index.ts` actúa como el "portero": levanta el servidor web con `Deno.serve`, maneja los CORS, recibe el JSON del frontend y delega el trabajo pesado a las capas compartidas.
* **`_shared/domine/` (Dominio):** El corazón de la lógica de negocio. Contiene funciones puras (ej. `email_domain.ts`) que no interactúan con bases de datos ni redes. Reciben datos, aplican reglas del club y devuelven estructuras transformadas.
* **`_shared/infrastructure/` (Infraestructura):** La capa de conexión con el exterior. Aquí viven los clientes que interactúan con Supabase (`supabase.ts`) y servicios de terceros como el envío de correos (`mailer.ts`).
* **`_shared/types/` y `_shared/utils/`:** Almacenan interfaces TypeScript compartidas y pequeñas funciones utilitarias (formateadores de fecha, conversores) de uso general en el backend.

---

## 3. Frontend (React + Vite)

El frontend es una Single Page Application (SPA) construida con React 19, Vite, Material UI (MUI) y TypeScript.

### Comandos Principales

* **Instalar dependencias:** `pnpm install`
* **Sincronizar Tipos (Requiere Supabase local encendido):** `pnpm run types:sync` (Genera el modelo en `src/types/model.ts` a partir de la base de datos).
* **Levantar servidor de desarrollo:** `pnpm run dev`

### Arquitectura de Directorios (`frontend/src/`)

El código fuente utiliza alias de rutas (`#nombre`) definidos en `vite.ts.config.paths.ts` para evitar importaciones relativas confusas.

* **`assets/`:** Archivos estáticos inmutables como logotipos, íconos SVG o imágenes de fondo de la aplicación.
* **`components/layout/`:** Componentes estructurales de alto nivel que envuelven a las páginas. Ejemplos: `AuthLayout.tsx` (para la pantalla de login) y `MainLayout.tsx` (con la barra de navegación lateral/superior).
* **`components/ui/`:** Componentes visuales genéricos y reutilizables en todo el proyecto (botones personalizados, tarjetas, modales).
* **`contexts/`:** Definición de los contextos nativos de React (`createContext`). Solo contienen las interfaces y la inicialización vacía (ej. `AuthContext.tsx`, `ThemeModoContext.tsx`).
* **`providers/`:** Componentes envoltorios (Wrappers) que implementan la lógica de los contextos y exponen los datos a toda la aplicación (ej. `AuthProvider.tsx` gestiona el estado de Supabase Auth).
* **`hooks/`:** Funciones reutilizables que encapsulan lógica compleja. Aquí viven principalmente los envoltorios de TanStack React Query (ej. `useSocios.ts`) que manejan la caché, reintentos y estados de carga.
* **`pages/`:** Los componentes principales que representan vistas completas de la aplicación (pantallas asociadas directamente a una ruta de navegación).
* **`router/`:** Lógica de navegación. `Index.tsx` define el árbol de rutas, mientras que `ProtectedRoute.tsx` actúa como guardián verificando los permisos del usuario antes de renderizar una vista.
* **`services/apis/`:** La única capa autorizada para comunicarse con Supabase y las Edge Functions. Ningún componente hace llamadas directas a la base de datos; delegan la tarea a los archivos de esta carpeta.
* **`styles/`:** Configuración visual global, sobreescritura de componentes de Material UI y paletas de colores (`theme.ts`).
* **`types/`:** Interfaces y tipos globales de TypeScript. Destaca `model.ts`, el cual es autogenerado por Supabase y garantiza que el frontend conozca la estructura exacta de la base de datos.
* **`utils/`:** Funciones de ayuda general, destacando `supabaseClient.ts` que inicializa y exporta la conexión única con el backend usando las variables de entorno.
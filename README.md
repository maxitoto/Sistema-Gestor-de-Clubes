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

Miren la documentacion de FSD -> https://feature-sliced.design/docs

Crear estrutura.txt para la IA
```bash
find src/ -type f | sort | while IFS= read -r f; do echo "===== $f ====="; cat "$f"; echo; done > estructura.txt
```

---

## 2. Backend (Supabase Local)

### comandos básicos
 - npx supabase start

 - npx supabase db schema declarative sync " siguiente paso, colocar le nombre ejm: init_scheme"

 - npx supabase db reset

Mirar https://supabase.com/docs/guides/getting-started/architecture
visitar Arquitectura, desarollo local y flujo de trabajo.

este es muy bueno y esta en español -> https://www.rodalexanderson.com/docs/supabase/ 
más!!!
https://supabase.com/docs/guides/functions/development-tips habla de las fat functions (funciones gordas)
https://supabase.com/docs/guides/functions/function-configuration

como resolví las migraciones y el esquema
https://supabase.com/docs/guides/local-development/declarative-database-schemas
que son los comandos arriba!


Crear estrutura.txt para la IA
```bash
#!/bin/bash

# === CONFIGURACIÓN ===
DIR="./"
OUTPUT="estructura.txt"
SKIP=""              # patrones a saltar (ej: "schema|politics")
FULL_PATTERNS="config.toml"     # archivos que siempre se muestran completos (ej: "*.log|config.yml")
TRUNCATE_AFTER=150   # umbral para truncar (en líneas)
SHOW_LINES=20        # líneas a mostrar al truncar

# === SCRIPT ===
find "$DIR" -type f \
  -not -name "$(basename "$OUTPUT")" \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" \
  -not -path "*/.temp/*" \
  -not -path "*/.branches/*" \
  | sort | while IFS= read -r f; do

  echo "===== $f ====="

  # Blacklist: mostrar nombre pero no contenido
  if [ -n "$SKIP" ] && echo "$f" | grep -qiE "$SKIP"; then
    echo "[SALTADO]"
  else
    # Intentar contar líneas (si falla, es binario o ilegible)
    lines=$(wc -l < "$f" 2>/dev/null | tr -d ' ')
    if [ -z "$lines" ]; then
      echo "[BINARY O ILEGIBLE]"
    else
      # Verificar si el archivo debe mostrarse completo siempre
      if [ -n "$FULL_PATTERNS" ] && echo "$f" | grep -qiE "$FULL_PATTERNS"; then
        cat "$f"
      elif [ "$lines" -gt "$TRUNCATE_AFTER" ]; then
        head -"$SHOW_LINES" "$f"
        echo "..."
      else
        cat "$f"
      fi
    fi
  fi

  echo

done > "$OUTPUT"
```
---

## 3. Frontend (React + Vite)

Miren la documentacion de FSD -> https://feature-sliced.design/docs

Crear estrutura.txt para la IA
```bash
find src/ -type f | sort | while IFS= read -r f; do echo "===== $f ====="; cat "$f"; echo; done > estructura.txt
```

### Comandos básicos
  - pnpm install
  - pnpm run dev

---
---
*frontend*
| Capa / Carpeta | Responsabilidad según FSD | Qué contiene en tu proyecto |
| --- | --- | --- |
| **`app/`** | **Inicialización global del sistema.** Configura providers, estilos globales y el enrutador raíz. No contiene lógica de negocio ni componentes de UI reutilizables.

 | `App.tsx`, `AppRouterProvider.tsx`, `AuthProvider.tsx`, `ThemeModeProvider.tsx`, y los protectores de ruta `RequireAuth.tsx`, `RequireRole.tsx`.

 |
| **`pages/`** | **Vistas completas de la aplicación (páginas del router).** Su única función es componer *widgets*, *features* y *entities* para armar una pantalla. No implementa llamadas directas a APIs ni maneja estado de negocio pesado.

 | `DashboardPage.tsx`, `LoginPage.tsx`, `SettingsPage.tsx`, `SociosPage.tsx`.

 |
| **`widgets/`** | **Bloques autónomos y complejos de la interfaz.** Orquestan la interacción visual entre entidades y features. Son unidades funcionales completas que se insertan en las páginas.

 | `dashboard-panel/` (combina la nómina de socios con el buscador, paginador y botón de correo) y `layout/` (`MainLayout`, `AuthLayout`).

 |
| **`features/`** | **Acciones e interacciones con valor de negocio para el usuario.** Contienen las mutaciones, formularios y casos de uso interactivos. No pueden importarse entre sí en el mismo nivel.

 | `auth/login-by-email/` (inicio de sesión), `club/update-config/` (mutación de configuración), `comunicaciones/send-email/` (envío manual).

 |
| **`entities/`** | **Modelos y conceptos del dominio del negocio.** Representan los datos que maneja la institución. Exponen consultas de lectura (`api`), estado y hooks (`model`), y fichas o avatares (`ui`). No pueden importar features ni widgets.

 | `club/` (datos y configuración institucional), `session/` (usuario autenticado y perfil), `socio/` (datos de los miembros).

 |
| **`shared/`** | **Infraestructura técnica y utilidades reutilizables.** Código completamente agnóstico al negocio del club. Reutilizable en cualquier otro proyecto.

 | `api/` (cliente Supabase), `config/styles/` (temas MUI), `lib/` (`useDebounce`), `types/` (esquema de base de datos generado).

---
---
*supabase*

| Directorio | Capa Hexagonal / Clean | Responsabilidad oficial |
| --- | --- | --- |
| **`functions/comunicaciones/`**, **`functions/arca/`** | **Driving Adapters (Controladores HTTP)** | Puntos de entrada HTTP de Deno desplegados. Validan encabezados, manejan CORS, parsean JSON e instancian y ejecutan los casos de uso correspondientes. No contienen sentencias SQL ni reglas de negocio.

 |
| **`_shared/core/`** | **Infraestructura Transversal Compartida** | Adaptadores técnicos comunes a todos los dominios. Clientes HTTP (`cors.ts`), clases de error (`errors.ts`), transporte SMTP (`mailer.ts`) y creador de clientes autenticados (`supabase.ts`).

 |
| **`_shared/modules/<modulo>/domain/`** | **Dominio (Entities & Value Objects)** | El núcleo del sistema. Funciones puras e inmutables (ej. `email_domain.ts` con `extraerEmails` y formato HTML). **Cero dependencias externas**: no importa Supabase, Deno, HTTP ni frameworks.

 |
| **`_shared/modules/<modulo>/application/`** | **Casos de Uso (Application Services)** | El director de orquesta de cada operación (ej. `EnviarAvisoUseCase.ts`). Implementa el flujo del caso de uso: consulta al repositorio, ejecuta las reglas del dominio y despacha acciones a través de puertos de salida.

 |
| **`_shared/modules/<modulo>/infrastructure/`** | **Driven Adapters (Persistencia e Integraciones)** | Implementación técnica de acceso a datos (ej. `SocioRepository.ts`). Es el único lugar donde se escribe código dependiente de Supabase (`supabase.from(...)`) o APIs externas.

 |
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

# falta agrega la definicion de arquitectura para front y para back, y el uso de cada fichero en estrucutra interna. Igual esta en la documentación de cada arqui

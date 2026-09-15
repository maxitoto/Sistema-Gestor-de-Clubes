#!/bin/bash

# === VALIDACIÓN DE ARGUMENTOS ===
if [ "$1" != "frontend" ] && [ "$1" != "supabase" ]; then
  echo "Error: Debes especificar el módulo."
  echo "Uso: bash script.sh [frontend | supabase]"
  exit 1
fi

# === CONFIGURACIÓN ===
DIR=".././packages/$1"
OUTPUT="./estructure/$1.txt"
SKIP=""                         # patrones a saltar
FULL_PATTERNS="config.toml"     # archivos que siempre se muestran completos
TRUNCATE_AFTER=150              # umbral para truncar (en líneas)
SHOW_LINES=20                   # líneas a mostrar al truncar

# === SCRIPT ===
echo "Analizando el directorio: $DIR..."

find "$DIR" -type f \
  -not -name "$(basename "$OUTPUT")" \
  -not -path "*/.*" \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" \
  -not -name "*.lockb" \
  -not -name "*.lock" \
  -not -name "*.png" \
  -not -name "*.ico" \
  | sort | while IFS= read -r f; do

  echo "===== $f ====="

  if [ -n "$SKIP" ] && echo "$f" | grep -qiE "$SKIP"; then
    echo "[SALTADO]"
  else
    lines=$(wc -l < "$f" 2>/dev/null | tr -d ' ')
    if [ -z "$lines" ]; then
      echo "[BINARY O ILEGIBLE]"
    else
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

echo "✅ Estructura guardada en $OUTPUT"
#!/bin/bash

# === VALIDACIÓN DE ARGUMENTOS ===
if [ "$1" != "frontend" ] && [ "$1" != "supabase" ]; then
  echo "Error: Debes especificar el módulo."
  echo "Uso: bash script.sh [frontend | supabase]"
  exit 1
fi

# === CONFIGURACIÓN ===
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIR="$(cd "$SCRIPT_DIR/../packages/$1" 2>/dev/null && pwd)"
OUTPUT="$SCRIPT_DIR/$1.txt"
SKIP=""
FULL_PATTERNS="config.toml"
TRUNCATE_AFTER=150
SHOW_LINES=20

# === VALIDAR QUE EL DIRECTORIO EXISTA ===
if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
  echo "❌ Error: No se encontró el directorio."
  echo "   Ruta buscada: $SCRIPT_DIR/../packages/$1"
  echo "   Script ejecutado desde: $SCRIPT_DIR"
  exit 1
fi

echo "Analizando: $DIR"

# === SCRIPT ===
FILE_COUNT=0

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

  FILE_COUNT=$((FILE_COUNT + 1))
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

# === VERIFICAR QUE NO ESTÉ VACÍO ===
if [ ! -s "$OUTPUT" ]; then
  echo "❌ El archivo de salida quedó vacío."
  echo "   Ruta de salida: $OUTPUT"
  echo "   Directorio analizado: $DIR"
  echo "   Posible causa: no hay archivos que coincidan con los filtros."
  exit 1
fi

echo "✅ Estructura guardada en $OUTPUT"   
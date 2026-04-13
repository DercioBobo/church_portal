#!/bin/bash
# Build the catequista Next.js frontend and deploy to the correct Frappe folders:
#   HTML pages  → portal/www/catequista/   (served at /catequista/...)
#   JS/CSS/etc  → portal/public/catequista/ (served at /assets/portal/catequista/...)
#
# Run from the app root: bash apps/portal/build-catequista.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend-catequista"
WWW_DIR="$SCRIPT_DIR/portal/www/catequista"
PUBLIC_DIR="$SCRIPT_DIR/portal/public/catequista"

echo ""
echo "=== Portal Catequista — Build Frontend ==="
echo ""

if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js não encontrado."
    exit 1
fi

echo "Node: $(node --version)  NPM: $(npm --version)"

if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    echo ""
    echo "ERROR: frontend-catequista/.env.local não encontrado!"
    echo "  cp $FRONTEND_DIR/.env.example $FRONTEND_DIR/.env.local"
    echo "  nano $FRONTEND_DIR/.env.local"
    exit 1
fi

if grep -q "your-erpnext.domain.com" "$FRONTEND_DIR/.env.local"; then
    echo "AVISO: Configure NEXT_PUBLIC_FRAPPE_URL em frontend-catequista/.env.local!"
    echo ""
fi

echo "A instalar dependências..."
cd "$FRONTEND_DIR"
npm install --silent

echo "A compilar o frontend..."
npm run build

OUT_DIR="$FRONTEND_DIR/out"

# ── HTML pages → portal/www/catequista/ ──────────────────────────────────────
echo "A copiar páginas HTML para www/catequista/..."
rm -rf "$WWW_DIR"
mkdir -p "$WWW_DIR"

find "$OUT_DIR" -name "*.html" | while IFS= read -r f; do
    rel="${f#$OUT_DIR/}"
    dest="$WWW_DIR/$rel"
    mkdir -p "$(dirname "$dest")"
    printf -- "---\nsafe_render: 0\nno_cache: 1\nbase_template_path: templates/portal_page.html\n---\n" > "$dest"
    cat "$f" >> "$dest"
done

# Copy RSC payload .txt files
find "$OUT_DIR" -name "*.txt" | while IFS= read -r f; do
    rel="${f#$OUT_DIR/}"
    dest="$WWW_DIR/$rel"
    mkdir -p "$(dirname "$dest")"
    cp "$f" "$dest"
done

# ── _next/ static assets → portal/public/catequista/ ─────────────────────────
echo "A copiar assets estáticos para public/catequista/..."
mkdir -p "$PUBLIC_DIR"
rm -rf "$PUBLIC_DIR/_next"
cp -r "$OUT_DIR/_next" "$PUBLIC_DIR/_next"

echo ""
echo "Build catequista concluído!"
echo "  HTML   → $WWW_DIR"
echo "  Assets → $PUBLIC_DIR/_next"
echo ""

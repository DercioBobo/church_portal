#!/bin/bash
# Build the Next.js frontend and deploy to the correct Frappe folders:
#   HTML pages  → portal/www/portal/   (served at /portal/...)
#   JS/CSS/etc  → portal/public/       (served at /assets/portal/...)
#
# Run from the app root: bash apps/portal/build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
WWW_DIR="$SCRIPT_DIR/portal/www/portal"
PUBLIC_DIR="$SCRIPT_DIR/portal/public"

echo ""
echo "=== Portal — Build Frontend ==="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js não encontrado."
    echo "Instalar: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

echo "Node: $(node --version)  NPM: $(npm --version)"

# Check .env.local
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    echo ""
    echo "ERROR: frontend/.env.local não encontrado!"
    echo "  cp $FRONTEND_DIR/.env.example $FRONTEND_DIR/.env.local"
    echo "  nano $FRONTEND_DIR/.env.local"
    exit 1
fi

if grep -q "your-erpnext.domain.com" "$FRONTEND_DIR/.env.local"; then
    echo "AVISO: Configure NEXT_PUBLIC_FRAPPE_URL em frontend/.env.local!"
    echo ""
fi

echo "A instalar dependências..."
cd "$FRONTEND_DIR"
npm install --silent

echo "A compilar o frontend..."
npm run build

OUT_DIR="$FRONTEND_DIR/out"

# ── HTML pages → portal/www/portal/ ──────────────────────────────────────────
# Frappe renders all files in www/ through Jinja. We must:
#   1. Only put .html files here (not JS/CSS)
#   2. Prepend safe_render: 0 front matter to suppress the ".__" security check
echo "A copiar páginas HTML para www/portal/..."
rm -rf "$WWW_DIR"
mkdir -p "$WWW_DIR"

find "$OUT_DIR" -name "*.html" | while IFS= read -r f; do
    rel="${f#$OUT_DIR/}"
    dest="$WWW_DIR/$rel"
    mkdir -p "$(dirname "$dest")"
    # Frappe front matter: disable Jinja security check on Next.js inline scripts
    printf -- "---\nsafe_render: 0\nno_cache: 1\n---\n" > "$dest"
    cat "$f" >> "$dest"
done

# Copy RSC payload .txt files (Next.js fetches these for client-side navigation)
find "$OUT_DIR" -name "*.txt" | while IFS= read -r f; do
    rel="${f#$OUT_DIR/}"
    dest="$WWW_DIR/$rel"
    mkdir -p "$(dirname "$dest")"
    cp "$f" "$dest"
done

# ── _next/ static assets → portal/public/ ────────────────────────────────────
# Frappe serves portal/public/ at /assets/portal/ as true static files.
# next.config.mjs sets assetPrefix: '/assets/portal' so HTML files reference
# JS/CSS at /assets/portal/_next/static/...
echo "A copiar assets estáticos para public/..."
mkdir -p "$PUBLIC_DIR"
rm -rf "$PUBLIC_DIR/_next"
cp -r "$OUT_DIR/_next" "$PUBLIC_DIR/_next"

echo ""
echo "Build concluído!"
echo "  HTML  → $WWW_DIR"
echo "  Assets → $PUBLIC_DIR/_next"
echo ""

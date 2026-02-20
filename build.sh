#!/bin/bash
# Build the Next.js frontend and copy output to portal/www/portal/
# Run this from the app root: bash build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
WWW_DIR="$SCRIPT_DIR/portal/www/portal"

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
    echo "Crie-o a partir do exemplo:"
    echo "  cp $FRONTEND_DIR/.env.example $FRONTEND_DIR/.env.local"
    echo "  nano $FRONTEND_DIR/.env.local"
    exit 1
fi

# Warn if URL not configured
if grep -q "your-erpnext.domain.com" "$FRONTEND_DIR/.env.local"; then
    echo ""
    echo "AVISO: Configure NEXT_PUBLIC_FRAPPE_URL em frontend/.env.local antes de build!"
    echo ""
fi

echo "A instalar dependências..."
cd "$FRONTEND_DIR"
npm install --silent

echo "A compilar o frontend..."
npm run build

echo "A copiar para portal/www/portal/..."
rm -rf "$WWW_DIR"
mkdir -p "$WWW_DIR"
cp -r out/* "$WWW_DIR/"

echo ""
echo "Build concluído! Ficheiros em: $WWW_DIR"
echo ""

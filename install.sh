#!/bin/bash
# Instalação completa do Portal de Catequese no ERPNext
#
# USO (a partir do directório do bench):
#   bash apps/portal/install.sh [nome-do-site]
#
# EXEMPLO:
#   cd /home/frappe/frappe-bench
#   bash apps/portal/install.sh meusite.local

set -e

# ── Cores ────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

BENCH_DIR="$(pwd)"
PORTAL_DIR="$BENCH_DIR/apps/portal"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Portal de Catequese — Instalação       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Verificar que estamos no bench ───────────────────────
if [ ! -d "$BENCH_DIR/apps" ] || [ ! -d "$BENCH_DIR/sites" ]; then
    echo -e "${RED}ERRO: Execute este script a partir do directório do bench.${NC}"
    echo "  cd /home/frappe/frappe-bench"
    echo "  bash apps/portal/install.sh [site]"
    exit 1
fi

# ── Detectar site ─────────────────────────────────────────
SITE=${1}
if [ -z "$SITE" ]; then
    SITE=$(ls "$BENCH_DIR/sites/" 2>/dev/null | grep "\." | grep -v assets | head -1)
fi
if [ -z "$SITE" ]; then
    echo -e "${RED}ERRO: Não foi possível detectar o site. Passe o nome como argumento:${NC}"
    echo "  bash apps/portal/install.sh meusite.local"
    exit 1
fi

echo -e "Bench: ${GREEN}$BENCH_DIR${NC}"
echo -e "Site:  ${GREEN}$SITE${NC}"
echo ""

# ── Passo 0: Verificar/criar .env.local ──────────────────
ENV_FILE="$PORTAL_DIR/frontend/.env.local"
if [ ! -f "$ENV_FILE" ]; then
    cp "$PORTAL_DIR/frontend/.env.example" "$ENV_FILE"
    echo -e "${YELLOW}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  CONFIGURAÇÃO NECESSÁRIA                             ║${NC}"
    echo -e "${YELLOW}╠══════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}║  Edite o ficheiro de configuração:                   ║${NC}"
    echo -e "${YELLOW}║                                                      ║${NC}"
    echo -e "${YELLOW}║    nano $ENV_FILE  ║${NC}"
    echo -e "${YELLOW}║                                                      ║${NC}"
    echo -e "${YELLOW}║  Altere NEXT_PUBLIC_FRAPPE_URL para o URL do         ║${NC}"
    echo -e "${YELLOW}║  seu ERPNext (ex: https://erp.minha-paroquia.ao)     ║${NC}"
    echo -e "${YELLOW}║                                                      ║${NC}"
    echo -e "${YELLOW}║  Depois execute este script novamente.               ║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 0
fi

if grep -q "your-erpnext.domain.com" "$ENV_FILE"; then
    echo -e "${RED}ERRO: Configure NEXT_PUBLIC_FRAPPE_URL em:${NC}"
    echo "  $ENV_FILE"
    echo ""
    echo "Exemplo: NEXT_PUBLIC_FRAPPE_URL=https://erp.minha-paroquia.ao"
    exit 1
fi

# ── Passo 1: Build do frontend ────────────────────────────
echo -e "${GREEN}[1/3] A compilar o frontend...${NC}"
bash "$PORTAL_DIR/build.sh"

# ── Passo 2: Instalar a app no site ──────────────────────
echo ""
echo -e "${GREEN}[2/4] A instalar a app no site '$SITE'...${NC}"
cd "$BENCH_DIR"
bench --site "$SITE" install-app portal --force

# ── Passo 3: Publicar assets estáticos ───────────────────
# Copies portal/public/ → sites/assets/portal/ so /assets/portal/ works
echo ""
echo -e "${GREEN}[3/4] A publicar assets estáticos...${NC}"
bench build --app portal

# ── Passo 4: Configurar CORS e reiniciar ─────────────────
echo ""
echo -e "${GREEN}[4/4] A configurar CORS e reiniciar...${NC}"
bench --site "$SITE" set-config allow_cors "*"
bench restart

# ── Concluído ─────────────────────────────────────────────
FRAPPE_URL=$(bench --site "$SITE" show-config 2>/dev/null | grep -i host_name | head -1 | awk '{print $NF}' || echo "$SITE")
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Instalação concluída!                   ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║   Portal: http://$FRAPPE_URL/portal      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# Portal de Catequese — PNSA

Portal público (sem login) para consulta de turmas, catecúmenos e horários de catequese.
Integra com o ERPNext via API Frappe.

---

## Instalação rápida no ERPNext

### 1. Obter a app

```bash
cd /home/frappe/frappe-bench
bench get-app portal https://github.com/SEU_USUARIO/church_portal.git
```

### 2. Configurar o URL do ERPNext

```bash
cp apps/portal/frontend/.env.example apps/portal/frontend/.env.local
nano apps/portal/frontend/.env.local
```

Edite as variáveis:
```env
NEXT_PUBLIC_FRAPPE_URL=https://erp.minha-paroquia.mz
NEXT_PUBLIC_PARISH_NAME=Paróquia Nossa Senhora da Aparição
NEXT_PUBLIC_PARISH_SHORT=PNSA
```

### 3. Instalar

```bash
bash apps/portal/install.sh meusite.local
```

Pronto. O portal estará disponível em `https://erp.minha-paroquia.mz/portal`.

---

## O que o script install.sh faz

1. Verifica a configuração do `.env.local`
2. Instala as dependências Node.js e compila o frontend (`npm run build`)
3. Copia os ficheiros estáticos para `portal/www/portal/`
4. Instala a app Frappe no site: `bench install-app portal`
5. Configura CORS: `bench set-config allow_cors "*"`
6. Reinicia o bench

---

## Reconstruir o frontend (após alterar configuração)

```bash
bash apps/portal/build.sh
bench restart
```

---

## Estrutura da app

```
portal/
├── portal/               # App Frappe (Python)
│   ├── api.py            # APIs públicas (allow_guest=True)
│   └── www/portal/       # Frontend compilado (gerado por build.sh)
├── frontend/             # Código fonte Next.js 14
│   ├── src/app/          # Páginas
│   ├── src/components/   # Componentes
│   ├── src/lib/api.ts    # Cliente da API Frappe
│   └── src/types/        # TypeScript interfaces
├── build.sh              # Compila o frontend
└── install.sh            # Instalação completa
```

## Páginas do Portal

| URL | Descrição |
|-----|-----------|
| `/portal` | Dashboard: estatísticas, pesquisa, aniversários |
| `/portal/turmas` | Lista de turmas com filtro por fase |
| `/portal/turma?nome=X` | Detalhe de turma + lista de catecúmenos |
| `/portal/pesquisa?q=X` | Pesquisa global (debounce 300ms) |
| `/portal/catecumeno?nome=X` | Ficha pública de catecúmeno |
| `/portal/aniversarios` | Aniversários hoje / esta semana |

## APIs Frappe (portal.api.*)

Todos os endpoints têm `allow_guest=True` e **não expõem** dados sensíveis
(sem contactos, datas de nascimento, documentos).

| Endpoint | Descrição |
|----------|-----------|
| `portal.api.get_turmas_publicas` | Lista de turmas activas |
| `portal.api.get_turma_detalhe` | Detalhe de turma + catecúmenos |
| `portal.api.pesquisar` | Pesquisa por nome |
| `portal.api.get_catecumeno_publico` | Ficha pública |
| `portal.api.get_catecumenos_aniversariantes` | Aniversários |
| `portal.api.get_estatisticas_publicas` | Stats do dashboard |

## Requisitos

- ERPNext com `pnsa_app` instalada (DocTypes: Turma, Catecumeno, Catequista)
- Node.js 18+ (para compilar o frontend)
- Frappe v14+

# Catequese Portal — Briefing para Claude Code

## Visão Geral do Projecto

Criar um **portal público web moderno** para a paróquia PNSA, que permita a encarregados, catecúmenos e catequistas consultarem informações sobre turmas, catecúmenos e horários de catequese. O portal é **read-only** e **público** (sem login), mas **sem expor dados sensíveis** (sem contactos, sem datas de nascimento, sem documentos).

---

## Arquitectura

### Stack Recomendada

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (porta 3000 ou subdomínio catequese.paroquia.ao)  │
│  Next.js 14+ (App Router) + Tailwind CSS + shadcn/ui        │
│  TypeScript                                                  │
├─────────────────────────────────────────────────────────────┤
│  BACKEND (ERPNext existente)                                │
│  Frappe app: pnsa_app                                       │
│  APIs whitelisted com allow_guest=True                      │
│  Base URL: https://[teu-erpnext-dominio]                    │
└─────────────────────────────────────────────────────────────┘
```

### Estrutura do Projecto Next.js

```
catequese-portal/
├── app/
│   ├── layout.tsx              # Layout principal + nav
│   ├── page.tsx                # Homepage (dashboard)
│   ├── turmas/
│   │   └── page.tsx            # Listagem de turmas
│   ├── turmas/[nome]/
│   │   └── page.tsx            # Detalhe de turma
│   ├── pesquisa/
│   │   └── page.tsx            # Pesquisa global
│   ├── aniversarios/
│   │   └── page.tsx            # Aniversários hoje/semana
│   └── catecumeno/[nome]/
│       └── page.tsx            # Ficha pública de catecúmeno
├── components/
│   ├── SearchBar.tsx
│   ├── TurmaCard.tsx
│   ├── CatecumenoCard.tsx
│   ├── BirthdayList.tsx
│   └── StatsCard.tsx
├── lib/
│   └── api.ts                  # Todas as chamadas à API Frappe
└── types/
    └── catequese.ts            # TypeScript interfaces
```

---

## APIs a Criar no ERPNext (pnsa_app)

Localização sugerida: `pnsa_app/pnsa_app/paroquia_app/catequese/portal_api.py`

Todas as funções devem ter `@frappe.whitelist(allow_guest=True)`.

### 1. `get_turmas_publicas()`
Retorna lista de todas as turmas activas com dados não sensíveis.

```python
@frappe.whitelist(allow_guest=True)
def get_turmas_publicas():
    """
    Retorna turmas activas com:
    - name, fase, ano_lectivo, local, dia, hora
    - catequista (nome), catequista_adj (nome)
    - total de catecúmenos activos
    SEM: contactos, documentos, dados pessoais
    """
    turmas = frappe.db.sql("""
        SELECT 
            t.name,
            t.fase,
            t.ano_lectivo,
            t.local,
            t.dia,
            t.hora,
            t.catequista,
            t.catequista_adj,
            COUNT(CASE WHEN tc.status = 'Activo' THEN 1 END) as total_catecumenos
        FROM `tabTurma` t
        LEFT JOIN `tabTurma Catecumenos` tc ON tc.parent = t.name
        WHERE t.status = 'Activo'
        GROUP BY t.name
        ORDER BY t.fase ASC, t.name ASC
    """, as_dict=True)
    return turmas
```

### 2. `get_turma_detalhe(turma_nome)`
Detalhe de uma turma específica, incluindo lista de catecúmenos (só nomes).

```python
@frappe.whitelist(allow_guest=True)
def get_turma_detalhe(turma_nome):
    """
    Retorna dados completos de uma turma:
    - Informações da turma (local, dia, hora, fase, catequistas)
    - Lista de catecúmenos (só nome + status)
    SEM: datas de nascimento, contactos, documentos
    """
    turma = frappe.db.get_value("Turma", turma_nome, 
        ["name", "fase", "ano_lectivo", "local", "dia", "hora", 
         "catequista", "catequista_adj", "status"],
        as_dict=True
    )
    
    if not turma or turma.status != "Activo":
        frappe.throw("Turma não encontrada")
    
    catecumenos = frappe.db.sql("""
        SELECT 
            tc.catecumeno,
            tc.status,
            tc.total_presencas,
            tc.total_faltas
        FROM `tabTurma Catecumenos` tc
        WHERE tc.parent = %s
        AND tc.status = 'Activo'
        ORDER BY tc.catecumeno ASC
    """, (turma_nome,), as_dict=True)
    
    turma["catecumenos"] = catecumenos
    turma["total_catecumenos"] = len(catecumenos)
    return turma
```

### 3. `pesquisar(query)`
Pesquisa global por nome de catecúmeno, catequista ou encarregado.

```python
@frappe.whitelist(allow_guest=True)
def pesquisar(query):
    """
    Pesquisa global. Retorna:
    - Catecúmenos que correspondem ao nome
    - Catequistas que correspondem ao nome
    Com os dados da sua turma associada (sem dados sensíveis)
    """
    if not query or len(query.strip()) < 2:
        return {"catecumenos": [], "catequistas": []}
    
    q = f"%{query.strip()}%"
    
    # Pesquisa catecúmenos
    catecumenos = frappe.db.sql("""
        SELECT 
            c.name,
            c.fase,
            c.turma,
            c.sexo,
            t.local,
            t.dia,
            t.hora,
            t.catequista,
            t.catequista_adj
        FROM `tabCatecumeno` c
        LEFT JOIN `tabTurma` t ON c.turma = t.name
        WHERE c.name LIKE %s
        AND (c.status = 'Activo' OR c.status IS NULL)
        ORDER BY c.name ASC
        LIMIT 20
    """, (q,), as_dict=True)
    
    # Pesquisa catequistas
    catequistas = frappe.db.sql("""
        SELECT DISTINCT
            t.catequista,
            t.catequista_adj,
            t.name as turma,
            t.fase,
            t.local,
            t.dia,
            t.hora
        FROM `tabTurma` t
        WHERE (t.catequista LIKE %s OR t.catequista_adj LIKE %s)
        AND t.status = 'Activo'
        ORDER BY t.catequista ASC
        LIMIT 10
    """, (q, q), as_dict=True)
    
    return {
        "catecumenos": catecumenos,
        "catequistas": catequistas
    }
```

### 4. `get_catecumeno_publico(catecumeno_nome)`
Ficha pública de um catecúmeno (sem dados sensíveis).

```python
@frappe.whitelist(allow_guest=True)
def get_catecumeno_publico(catecumeno_nome):
    """
    Ficha pública de catecúmeno:
    - Nome, fase, sexo
    - Dados da turma (local, dia, hora, catequistas)
    SEM: data de nascimento, contactos, encarregado, documentos, sacramentos detalhados
    """
    cat = frappe.db.get_value("Catecumeno", catecumeno_nome,
        ["name", "fase", "turma", "sexo", "status"],
        as_dict=True
    )
    
    if not cat:
        frappe.throw("Catecúmeno não encontrado")
    
    turma_info = None
    if cat.turma:
        turma_info = frappe.db.get_value("Turma", cat.turma,
            ["name", "fase", "local", "dia", "hora", 
             "catequista", "catequista_adj", "ano_lectivo"],
            as_dict=True
        )
    
    return {
        "catecumeno": cat,
        "turma": turma_info
    }
```

### 5. `get_aniversariantes(tipo)` ← já tens implementada

Manter a função existente `get_catecumenos_aniversariantes(tipo)`.
**Remover da resposta:** `contacto` (dado sensível).

### 6. `get_estatisticas_publicas()`
Dashboard stats para a homepage.

```python
@frappe.whitelist(allow_guest=True)
def get_estatisticas_publicas():
    """
    Estatísticas gerais para o dashboard público.
    """
    total_catecumenos = frappe.db.count("Catecumeno", {"status": "Activo"})
    total_turmas = frappe.db.count("Turma", {"status": "Activo"})
    total_catequistas = frappe.db.count("Catequista")
    
    fases = frappe.db.sql("""
        SELECT fase, COUNT(*) as total
        FROM `tabCatecumeno`
        WHERE status = 'Activo' AND fase IS NOT NULL AND fase != ''
        GROUP BY fase
        ORDER BY fase ASC
    """, as_dict=True)
    
    return {
        "total_catecumenos": total_catecumenos,
        "total_turmas": total_turmas,
        "total_catequistas": total_catequistas,
        "por_fase": fases
    }
```

---

## Design System

### Paleta de Cores (sem gradientes pesados)

```css
/* Tons neutros + azul primário limpo */
--primary: #1e40af;        /* Azul sólido */
--primary-light: #3b82f6;
--surface: #ffffff;
--surface-muted: #f8fafc;
--border: #e2e8f0;
--text: #0f172a;
--text-muted: #64748b;

/* Fases — cores sólidas distintas */
--fase-1: #0ea5e9;   /* 1ª Fase */
--fase-2: #8b5cf6;   /* 2ª Fase */
--fase-3: #f59e0b;   /* 3ª Fase */
--fase-pre: #10b981; /* Pré-catecumenato */
--fase-cat: #ef4444; /* Catecumenato */
```

### Estilo Visual
- **Sem gradientes** (ou muito subtis, max 2 cores próximas)
- Cards com `border-radius: 16px`, `border: 1px solid var(--border)`
- Sombras: `box-shadow: 0 1px 3px rgba(0,0,0,0.08)` — leve
- Tipografia: Inter ou Geist (padrão Next.js)
- Ícones: Lucide React
- Tabelas limpas sem zebra-striping pesado
- Hover states subtis: `background: #f8fafc` com transição 150ms

---

## Páginas do Portal

### `/` — Homepage / Dashboard
- Header com nome da paróquia + ícone
- Stats cards: Total catecúmenos | Total turmas | Total catequistas
- Gráfico de barras simples (por fase) — usar Recharts
- Barra de pesquisa global em destaque
- Mini-lista de aniversários de hoje
- Links para secções

### `/turmas` — Listagem de Turmas
- Filtro por fase (tabs ou pills)
- Cards por turma mostrando: nome, fase, local, dia/hora, catequista, nº catecúmenos
- Click leva ao detalhe

### `/turmas/[nome]` — Detalhe de Turma
- Header com info completa da turma (fase, local, dia, hora)
- Catequistas (principal + adjunto)
- Tabela de catecúmenos (nome + status) — ordenada alfabeticamente
- Botão voltar

### `/pesquisa` — Pesquisa Global
- Search bar grande
- Resultados em tempo real (debounce 300ms)
- Secções separadas: "Catecúmenos encontrados" | "Catequistas encontrados"
- Cada resultado com chip de fase + info da turma
- Click num catecúmeno → ficha pública
- Mensagem se nenhum resultado

### `/catecumeno/[nome]` — Ficha Pública de Catecúmeno
- Nome completo + fase + sexo
- Card com dados da turma (local, dia, hora)
- Catequistas responsáveis
- **Sem:** contactos, data de nascimento, documentos

### `/aniversarios` — Aniversários
- Toggle: Hoje | Esta Semana
- Lista com nome + fase + turma + idade que faz
- Sem contactos
- Ordem por data

---

## Estrutura de Ficheiros a Criar

### `lib/api.ts`
```typescript
const FRAPPE_BASE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL;

async function frappeFetch(method: string, params?: Record<string, string>) {
  const url = new URL(`${FRAPPE_BASE_URL}/api/method/${method}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 60 } // cache 60s para dados semi-estáticos
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.message;
}

export const api = {
  getTurmas: () => frappeFetch('pnsa_app.paroquia_app.catequese.portal_api.get_turmas_publicas'),
  getTurmaDetalhe: (nome: string) => frappeFetch('pnsa_app.paroquia_app.catequese.portal_api.get_turma_detalhe', { turma_nome: nome }),
  pesquisar: (query: string) => frappeFetch('pnsa_app.paroquia_app.catequese.portal_api.pesquisar', { query }),
  getCatecumeno: (nome: string) => frappeFetch('pnsa_app.paroquia_app.catequese.portal_api.get_catecumeno_publico', { catecumeno_nome: nome }),
  getAniversariantes: (tipo: 'hoje' | 'semana') => frappeFetch('pnsa_app.paroquia_app.catequese.portal_api.get_catecumenos_aniversariantes', { tipo }),
  getEstatisticas: () => frappeFetch('pnsa_app.paroquia_app.catequese.portal_api.get_estatisticas_publicas'),
};
```

### `types/catequese.ts`
```typescript
export interface Turma {
  name: string;
  fase: string;
  ano_lectivo: string;
  local: string;
  dia: string;
  hora: string;
  catequista: string;
  catequista_adj?: string;
  total_catecumenos: number;
}

export interface TurmaDetalhe extends Turma {
  catecumenos: CatecumenoBasico[];
}

export interface CatecumenoBasico {
  catecumeno: string;
  status: string;
}

export interface Catecumeno {
  name: string;
  fase: string;
  turma: string;
  sexo: string;
  status: string;
  local?: string;
  dia?: string;
  hora?: string;
  catequista?: string;
  catequista_adj?: string;
}

export interface Aniversariante {
  name: string;
  fase: string;
  turma: string;
  local: string;
  catequista: string;
  idade: number;
  idade_nova: number;
  data_de_nascimento: string;
}

export interface Estatisticas {
  total_catecumenos: number;
  total_turmas: number;
  total_catequistas: number;
  por_fase: { fase: string; total: number }[];
}

export interface ResultadoPesquisa {
  catecumenos: Catecumeno[];
  catequistas: {
    catequista: string;
    turma: string;
    fase: string;
    local: string;
    dia: string;
    hora: string;
  }[];
}
```

---

## Variáveis de Ambiente

```env
# .env.local
NEXT_PUBLIC_FRAPPE_URL=https://teu-erpnext.dominio.ao
NEXT_PUBLIC_PARISH_NAME=Paróquia Nossa Senhora da Aparição
NEXT_PUBLIC_PARISH_SHORT=PNSA
```

---

## CORS no ERPNext

Adicionar ao ficheiro `sites/common_site_config.json` do Frappe:

```json
{
  "allow_cors": "*"
}
```

Ou configurar por site em `sites/[site-name]/site_config.json`:

```json
{
  "allow_cors": "https://catequese.paroquia.ao"
}
```

---

## Instruções de Setup para Claude Code

### Passo 1 — Criar o projecto Next.js
```bash
npx create-next-app@latest catequese-portal \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd catequese-portal

# Instalar dependências
npm install lucide-react recharts
npx shadcn@latest init
npx shadcn@latest add card badge input button tabs separator skeleton
```

### Passo 2 — Criar as APIs no ERPNext (pnsa_app)

Criar o ficheiro `portal_api.py` em:
```
pnsa_app/pnsa_app/paroquia_app/catequese/portal_api.py
```

Copiar todas as funções da secção "APIs a Criar no ERPNext" acima.

> **Nota:** Após criar o ficheiro, fazer `bench restart` para registar as novas APIs.

### Passo 3 — Configurar CORS no Frappe

Editar `sites/common_site_config.json` para permitir pedidos do domínio do portal.

### Passo 4 — Criar a estrutura de ficheiros

Seguir a estrutura definida em "Estrutura de Ficheiros a Criar".

### Passo 5 — Implementar página a página

Ordem sugerida:
1. `lib/api.ts` + `types/catequese.ts`
2. Layout principal (`app/layout.tsx`) com nav
3. Homepage (`app/page.tsx`) com stats
4. Página de turmas (`app/turmas/page.tsx`)
5. Detalhe de turma (`app/turmas/[nome]/page.tsx`)
6. Pesquisa (`app/pesquisa/page.tsx`)
7. Ficha de catecúmeno (`app/catecumeno/[nome]/page.tsx`)
8. Aniversários (`app/aniversarios/page.tsx`)

---

## Notas Importantes de Privacidade

### Dados que NUNCA devem aparecer no portal:
- Números de telefone / contactos
- Datas de nascimento
- Números de documento (BI, etc.)
- Endereços / moradas
- Nome do encarregado
- Informação sobre sacramentos (baptismo, crisma datas)
- Status de pré-avaliação (Transita/Permanece)

### Dados seguros para mostrar publicamente:
- Nome completo do catecúmeno
- Fase
- Turma (nome, local, dia, hora)
- Catequistas (nomes)
- Sexo
- Idade que faz no aniversário (não a data exacta)

---

## Referência dos DocTypes ERPNext

### `tabTurma`
- `name` — identificador único da turma
- `fase` — fase da catequese
- `ano_lectivo` — ano lectivo
- `local` — local das aulas
- `dia` — dia da semana
- `hora` — hora das aulas
- `catequista` — nome do catequista principal
- `catequista_adj` — nome do catequista adjunto
- `status` — Activo / Inativo

### `tabTurma Catecumenos` (child table de Turma)
- `parent` — nome da turma
- `catecumeno` — nome do catecúmeno (link)
- `status` — Activo / Pendente / Inativo
- `total_presencas` — número de presenças
- `total_faltas` — número de faltas

### `tabCatecumeno`
- `name` — nome completo (é o identificador)
- `fase` — fase actual
- `turma` — turma actual (link)
- `sexo` — M / F
- `status` — Activo / Inativo / Crismado
- `data_de_nascimento` — **NUNCA expor publicamente**
- `contacto` — **NUNCA expor publicamente**

### `tabCatequista`
- `name` — nome do catequista
- `user` — link para User do ERPNext

---

## Possíveis Expansões Futuras

1. **Modo Catequista** (com login) — ver a sua turma, actualizar presenças
2. **Modo Encarregado** (com login via código único) — ver dados do seu educando
3. **Calendário** — datas importantes, aulas especiais, retiros
4. **Notificações** — alertas de aniversários via WhatsApp (integração Evolution API já planeada)
5. **QR Code** — cada turma tem QR que leva ao seu detalhe
6. **PWA** — portal instalável como app no telemóvel

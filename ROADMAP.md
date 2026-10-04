# Catequese PNSA — Roadmap

Estado da app `portal` e o que falta fazer, por fases.
Actualizado em 3 de Outubro de 2026.

---

## ✅ Já feito

### Base da app
- **Tudo numa só app (`portal`).** Os 25 DocTypes da catequese, que antes só existiam na base de dados, são agora código da app (`portal/catequese`, `portal/paroquia`).
- **A `pnsa_app` foi absorvida.**
  - As funções Python estão em `portal/catequese/*.py`.
  - A tarefa diária da idade passou para a portal.
  - A página "Aniversariantes Hoje" foi corrigida (a pasta era `pages/` em vez de `page/`).
  - Os URLs antigos (`pnsa_app.paroquia_app.catequese.*`) continuam a funcionar.
- **Client Scripts e Server Scripts são código.**
  - Os Client Scripts estão no `.js` de cada DocType; os Server Scripts, nos controladores Python.
  - Os 5 scripts que estavam desactivados ficaram arquivados em `portal/patches/v1_0/scripts_desactivados_arquivo.json`.
- **Fixtures:** Print Formats, Reports, Property Setters, Fase, Sacramento e Roles.

### Fase 0: fundações
- **Link para encarregados com validade** (Preparação do Sacramento → *Link para encarregados*).
  - Pode ser revogado e só deixa editar se essa opção estiver activa.
  - Cada alteração fica registada na Preparação (antes → depois).
- **Workspace "Catequese Tools"** com contadores, atalhos e todos os DocTypes, páginas e relatórios.
- **Página "Qualidade dos Dados"** com 10 verificações e correcções em massa.
- **Testes automáticos:** 34, todos a passar em `test.local`.

### Fase 1 (parte já feita)
- **Catequese Settings**, com separadores:
  - **Geral:** cabeçalho dos relatórios, comunidade sede, local.
  - **Ano Lectivo:** o ano actual de todo o sistema.
  - **Turmas:** tamanho mínimo, ideal e máximo (usados no Apuramento e na Alocação).
  - **Sacramentos:** fase após o Baptismo, validade do link e valores por omissão de cada sacramento.
  - **Portal do Catequista:** o editor visual. O antigo "Catequista Portal Settings" foi removido.
- **Ano lectivo actual único:** todas as páginas e formulários usam o ano das Settings (`frappe.boot.catequese`).
- **Página "Abrir e Encerrar Ano"** (`/app/abrir-encerrar-ano`): lista de verificação calculada a partir dos dados.
- **Ano Lectivo** com estado: Planeado, Em curso ou Encerrado.

### Outros
- **Relatório Anual** gerado em Word a partir do sistema.
- **Consulta Rápida:**
  - Navegação fase → turma.
  - Selecção múltipla de fases e turmas.
  - Filtro de fases e pesquisa global.
  - Não mostra turmas inactivas.

---

## ⏳ Pendente (a confirmar ou decidir)

### Deploy
- [ ] Fazer `migrate` em produção com as últimas alterações:
  - mudança de nome da página `ano-lectivo` → `abrir-encerrar-ano`;
  - patch `remover_pagina_ano_lectivo`.
- [ ] Confirmar que `/app/ano-lectivo` volta a mostrar a lista dos anos.
- [ ] **Gerar um link novo** em cada Preparação do Sacramento e partilhar no grupo. Os links antigos já não funcionam.
- [ ] Rever os valores em **Catequese Settings**, sobretudo no separador Sacramentos.
- [ ] Apagar de `docs/` os ficheiros com dados pessoais: `report_schema.txt`, `catequese_export.zip` e `pnsa_app_code.zip`. **Nunca fazer commit de `docs/`.**

### Dados
- [ ] Usar a página **Qualidade dos Dados** para preencher:
  - a comunidade dos catecúmenos (819 sem comunidade);
  - o sexo (729 sem sexo);
  - o estado dos catequistas.
- [ ] Configurar a **"Fase Seguinte"** em todas as Fases. Sem isso, o Apuramento dessa fase é recusado.

### Decisões em aberto
- [ ] **Aniversários públicos:** o endpoint devolve o contacto e a data de nascimento completa. Proposta: devolver só o nome, a idade e a turma.
- [ ] **Outros endpoints públicos:** `pesquisar` e `get_catecumenos_publicos` mostram nomes de encarregados. Rever o que deve ser público.
- [ ] **Relatório Anual:** desmarcar automaticamente a linha do plano quando já existe a linha do sacramento na mesma data (evita duplicados).
- [ ] **Relatório Anual:** contar a Profissão de Fé a partir do DocType `Profissao de Fe`, que já existe (hoje é manual).

### Comportamentos que mudaram (para validar no uso)
- **Mudar o catequista de uma turma** agora dá ou retira a User Permission. Antes só acontecia em turmas novas.
- **O Apuramento** passa as turmas antigas para "Inactivo". Antes ficava "Inativo", que não era um valor válido.

---

## 🎨 Formulários estilizados (em curso)

Tema próprio em dourado claro (o mesmo do Plano Anual / Plano de Retiro). Cada formulário tem:
- um resumo compacto no topo do separador **Dados**, com os campos logo abaixo;
- separadores limpos;
- um só cartão, com as secções separadas por linhas.

Ficheiros:
- `public/css/catequese_forms.css`: os estilos.
- `public/js/catequese_forms.js`: `cq.estilizar`, `cq.resumo`, `cq.pill`, `cq.telefone`, `cq.marca`.
- `catequese/formularios.py`: dados do resumo.

A barra lateral fica fechada por omissão em formulários e listas.

### Feito
- [x] **Catecúmeno**:
  - resumo com turma, catequistas (telefone/WA), sacramentos, encarregado e faltas/ficha;
  - aviso com os botões Alocar turma / Reactivar;
  - separadores Família, Sacramentos e Histórico (mais recente primeiro).

### Seguintes (os formulários mais usados)
1. [ ] **Turma**:
   - resumo com fase, horário, local e catequistas com telefone/WA;
   - números: catecúmenos, média de faltas, fichas em falta;
   - a tabela de catecúmenos num separador próprio.
2. [ ] **Inscrição**: resumo com catecúmeno, fase e estado da inscrição, com ligação directa ao catecúmeno.
3. [ ] **Preparação do Sacramento**: resumo com sacramento, data, número de candidatos e estado do link partilhado (activo/expirado).
4. [ ] **Catequista**: resumo com contactos, turmas deste ano, quotas pagas/em falta e estado inactivo.

### Depois (só o tema e separadores organizados; resumo pequeno ou nenhum)
- [ ] Fase, Ano Lectivo, Sacramento, Livro de Baptismo, Profissão de Fé
- [ ] Troca de Turma, Transferência de Catecúmeno, Inactivar Catecúmeno, Alocação em Massa, Apuramento de Turmas
- [ ] Plano de Retiro, Actividade do Plano, Proposta do Plano, Despesa, Receita, Quota, Catequista Aviso, Relatório Anual
- [ ] Catequese Settings: só o tema, porque já está em separadores.

As tabelas filhas (`…_item`, `…_table`) não precisam: só aparecem dentro de outros formulários.

---

## ✝️ Sacramentos e livros (em curso)

**Percurso normal:**
- 5ª fase → **Baptismo**.
- 1º ano de Aprofundamento (a meio do ano) → **1ª Comunhão**.
- 1º, 2º e 3º ano de Crisma → **Crisma** no 3º ano (última fase).

**Problemas de hoje:**
- Não há forma de ver quem falhou o sacramento.
- Não há onde registar a 2ª oportunidade.
- Baptismos de bebés, de casamento e extraordinários, e crismas feitos noutra paróquia, ficam à mão no Livro de Baptismo.
- 1ª Comunhão e Crisma não têm livro.

### 1. Três livros, cada um com a sua numeração
São livros físicos diferentes. Têm campos comuns e alguns exclusivos (**à espera das colunas de cada livro**).

| Livro | Comunidade |
|---|---|
| **Livro de Baptismo** (o existente, corrigido) | um livro por comunidade (Assunção, Santa Ana) |
| **Livro de 1ª Comunhão** (novo) | um livro por comunidade |
| **Livro de Crisma** (novo) | **um só livro para a paróquia**; a comunidade só indica de onde vem a pessoa |

- **Campos comuns:**
  - catecúmeno (opcional; bebés e adultos só com nome);
  - data, celebrante, padrinhos, comunidade;
  - local: esta paróquia ou outra, com o nome dessa paróquia;
  - livro, folha e número: texto livre, **não obrigatórios**, mantidos tal como escritos porque são usados em documentos;
  - **origem**: Catequese / 2ª oportunidade / Extraordinário (casamento, bebé, adulto, outro) / Outra paróquia.
- **Livro de Baptismo:**
  - os registos novos passam a ter nome por série (ex.: `BAP-2026-0001`) em vez do nome da pessoa;
  - os registos existentes mantêm o nome;
  - o catecúmeno passa a opcional.
- Os visto Baptismo/Eucaristia/Crisma no Catecúmeno passam a vir **automaticamente** dos livros.
- O mesmo trabalho resolve os itens da Fase 1 "Certificados" e "Baptismos de crianças":
  - os certificados imprimem-se a partir do registo no livro;
  - o Relatório Anual conta os baptismos de bebés a partir do livro.

### 2. ✅ Preparação: Situação por candidato (em vez de apagar)
- **Vai receber** (por omissão) / **Não vai receber**, com motivo: comportamento, faltas, documentos, desistiu, repete a fase, outro.
- O PDF e o link para encarregados e padrinhos mostram só os que vão receber (igual ao que se partilha hoje).
- Ao submeter, só esses recebem o registo no livro e o visto. Os outros ficam como "falhou", com o motivo.
- **Feito:**
  - botão **Ações → Marcar situação** para os candidatos seleccionados;
  - linhas a cinzento com o motivo e contagem no topo;
  - "Sincronizar Lista" nunca remove quem não vai receber;
  - os 19 formatos de impressão, o link, o Relatório Anual e a Qualidade dos Dados ignoram quem não vai receber.

### 2b. ✅ Página "Gerir Preparação" (`/app/gerir-preparacao`)
- Edita o próprio documento Preparação: não há dados à parte. O formulário fica para submeter/emendar e para o histórico.
- **Progresso no topo:**
  - vão / não vão receber;
  - fichas, docs. padrinhos, dia marcado, pagamento completo;
  - valor recebido vs esperado.
- **Tabela editável:**
  - dia, ficha, docs. padrinhos, pagamentos e sacerdote editados na própria linha, guardados ao sair da célula;
  - filtros: sem ficha / sem docs / pagamento em falta / sem dia / notas dos encarregados / não vão receber;
  - turma, ordenação e pesquisa.
- **Painel lateral por candidato:** situação e motivo, nota do encarregado, data, banco, contactos (WA), pagamentos com tenda, dados pessoais, observações.
- **Acções em massa:** dia, sacerdote, data, ✓ ficha, ✓ docs., pago completo, situação, remover.
- **Cabeçalho:** Lista ▾ (listar / sincronizar / actualizar catecúmenos), Imprimir ▾ (ver/PDF de cada formato), Link ▾, Submeter (com resumo do que falta).
- Listar, Sincronizar e Actualizar passaram para o servidor (`portal/catequese/preparacao.py`); o formulário usa a mesma versão.
- O formulário tem o tema dourado, um resumo com barras de progresso e o botão **Gerir na página**.

### 3. ✅ Fase: sacramento da fase
- Já existia em **Fase**: *Com Sacramento* + *Sacramento* (5ª → Baptismo, 1º Aprofundamento → Eucaristia, 3º Crisma → Crisma).
- A página usa também a **Ordem** da Fase. Confirmar que está preenchida em todas as fases.
- Serve para saber quem já *devia* ter cada sacramento.

### 4. ✅ Página "Sacramentos" (`/app/painel-sacramentos`, no Painel e no workspace)
- Pendentes por sacramento: quem falhou, em que Preparação e porquê.
- [ ] **2ª oportunidade, noutro dia do mesmo ano:** botão "Registar sacramento" cria o registo no livro com origem *2ª oportunidade*, ligado à Preparação falhada.
- **2ª oportunidade, repete a fase:** muda de turma pelo processo normal e entra na Preparação do ano seguinte. Na página aparece como "repete a fase".
- [ ] Resumo de cada livro no ano, por origem e por comunidade.
- Botão e resumo **esperam pelos livros** (ponto 1).

### 5. Qualidade dos Dados (só incoerências)
- Sacramento com visto mas sem registo no livro.
- Registo no livro sem visto.
- Pessoa numa fase posterior sem o sacramento e sem motivo registado.

### 6. Migração
- Os registos actuais do Livro de Baptismo mantêm-se (origem por omissão: Catequese).
- Os que faltam aparecem na Qualidade dos Dados.

---

## 🔁 Renovações e desistentes (feito)
- **Renovação na linha da turma** (o catequista marca no portal): Sim / Não / **Isento**.
  - Ao marcar Sim grava o valor das Catequese Settings (separador Turmas) e a data.
  - Isento = renovado, valor 0.
  - Mudar o valor nas Settings não altera as renovações já feitas.
- **O ano é o da turma:** renovar em 2027 numa turma de 2026 conta para 2026.
- **Página Renovações** (`/app/renovacoes`):
  - renovados/esperados, recebido vs esperado, entregue, por entregar;
  - por turma, "Ainda não renovaram" (com WA) e "Renovados";
  - exportar CSV.
- **"Recebido do catequista":** cria uma Receita (fonte Renovação, ano da turma, ligada à turma).
- **Pré-avaliação "Desistente":**
  - não conta como esperado na renovação;
  - no Apuramento fica Inactivo (e "Inativo" na turma antiga) e não vai para turma nova.

## 🔜 Fase 1: resto

### 1. Certificados de sacramento
- Formato de impressão (PDF) do certificado de Baptismo, Eucaristia e Crisma.
- Gerado a partir do Livro de Baptismo e da Preparação: nome, data, sacerdote, padrinhos, livro, folha e número.
- Impressão em lote de todos os certificados de uma Preparação.

### 2. Santa Ana como comunidade real
- Campo **Comunidade** em Turma, Catequista e Catecúmeno, com valor por omissão = comunidade sede.
- Filtro por comunidade na Consulta Rápida, nos relatórios e no Relatório Anual (este deixa de ter a coluna Santa Ana manual).
- Opcional: coordenadores de Santa Ana a introduzir os seus próprios dados (permissões por comunidade).

### 3. Baptismos de crianças
- DocType próprio, ou integração no Livro de Baptismo, para os baptismos de bebés.
- Liga-se à linha "Baptismos (crianças)" do Relatório Anual, que hoje é manual.

---

## 🔭 Fases seguintes

### Fase 2: Famílias e comunicação
- Área das famílias (por link ou login) para ver a turma, os próximos eventos e o estado dos documentos, e actualizar contactos.
- **Notificações por WhatsApp** usando a app `whatsapp_notifications`, que já está instalada:
  - lembretes de retiros, reuniões e celebrações;
  - avisos de documentos em falta;
  - mensagens de aniversário (opcional).
- Novo separador nas Settings: **WhatsApp** (modelos de mensagem e eventos que enviam notificação).

### Fase 3: Catequistas
- **Programa da Fase:** plano de catequeses por fase, com materiais.
- Formação e presença dos catequistas nas formações.
- Portal do Catequista mais completo e pensado para o telemóvel.

### Fase 4: Gestão
- Painel com tendências: inscritos, desistências e sacramentos ao longo dos anos.
- Actividades do plano ligadas às despesas e receitas.
- Comparação entre comunidades.

---

## ⚙️ Possíveis novos separadores nas Catequese Settings

| Separador | Conteúdo |
|---|---|
| Portal Público | O que é público: aniversários, estatísticas, pesquisa |
| Inscrições | Inscrições abertas ou fechadas; faixas etárias por fase (sugestão de fase na inscrição) |
| Alertas | Número de faltas a partir do qual o catecúmeno é assinalado |
| WhatsApp | Modelos e eventos (Fase 2) |

---

## 🧰 Dívida técnica
- **Testes:** acrescentar testes para a Alocação em Massa, as funções de inscrição (`inscricao_utils`) e a reactivação de catecúmenos.
- **`portal/api.py`:** rever todos os endpoints `allow_guest=True`.
- **Integração contínua (CI):** correr os testes automaticamente em cada push.
- **Frontends (`frontend/`, `frontend-catequista/`):** o build actual é manual (`build.sh` / `install.sh`).

---

## 📋 Como fazer deploy (lembrete)
1. Cópia de segurança: `bench --site <site> backup --with-files`
2. No servidor, em `apps/portal`: `git pull`
3. `bench --site <site> migrate` e depois `bench restart`
4. Se o portal público ou o do catequista mudaram, fazer o rebuild dos frontends.
5. Testes, **só no site de teste:**
   ```
   bench --site test.local migrate
   bench --site test.local run-tests --module portal.catequese.tests.test_catequese
   ```

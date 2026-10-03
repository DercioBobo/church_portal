/* global frappe, Vue */
// Consulta Rápida — Vue 3 CDN, no build step
// Navegação à esquerda (fases → turmas), detalhe à direita, pesquisa global no topo.

frappe.pages['consulta-rapida'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Consulta Rápida'),
    single_column: true,
  });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    createConsultaApp().mount(mount);
  }

  if (window.Vue) {
    _mountApp();
  } else {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/vue@3.4.21/dist/vue.global.prod.js';
    script.onload = _mountApp;
    script.onerror = function () {
      const s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/vue@3.4.21/dist/vue.global.prod.js';
      s2.onload = _mountApp;
      document.head.appendChild(s2);
    };
    document.head.appendChild(script);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function api(method, args) {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: `portal.catequista.page.consulta_rapida.consulta_rapida.${method}`,
      args,
      callback: (r) => { if (r.exc) reject(new Error(r.exc)); else resolve(r.message); },
      error: reject,
    });
  });
}

// "84 123 4567 / 82..." → primeiro número só com dígitos
function firstNumber(p) {
  const first = String(p || '').split(/[\/,;|]| e /)[0];
  return first.replace(/\D/g, '');
}
function telLink(p) {
  const d = firstNumber(p);
  return d ? `tel:${d.length === 9 ? '+258' + d : '+' + d}` : null;
}
function waLink(p) {
  let d = firstNumber(p);
  if (!d) return null;
  if (d.length === 9) d = '258' + d;
  return `https://wa.me/${d}`;
}
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function isActivo(c) { return c.estado !== 'Inativo'; }
function slug(dt, name) { return `/app/${dt}/${encodeURIComponent(name)}`; }

function downloadCSV(filename, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" + BOM → abre directamente no Excel em português
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const SEM_FASE = 'Sem fase';

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
function createConsultaApp() {
  const { createApp, ref, computed, onMounted } = Vue;

  return createApp({
    template: `
<div id="cr-app">

  <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
  <div class="cr-toolbar">
    <h1>🔎 Consulta Rápida</h1>
    <select v-model="ano" @change="load" class="cr-select" title="Ano lectivo">
      <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
    </select>
    <div class="cr-search">
      <input v-model="search" placeholder="Pesquisar nome, turma, encarregado ou contacto…" @keydown.escape="search = ''">
      <button v-if="search" class="cr-x" @click="search = ''">✕</button>
    </div>
    <label class="cr-toggle" title="Esconder catecúmenos marcados como Inativo na turma">
      <input type="checkbox" v-model="soActivos"> Só activos
    </label>
  </div>

  <div v-if="loading" class="cr-loading"><div class="cr-spinner"></div> A carregar…</div>

  <div v-else class="cr-layout">

    <!-- ── Navegação ─────────────────────────────────────────────────── -->
    <nav class="cr-nav">
      <input class="cr-nav-filter" v-model="filtroFases" placeholder="Filtrar fases…" @keydown.escape="filtroFases = ''">
      <button class="cr-nav-item" :class="{ active: !temSeleccao && !q }" @click="limparSeleccao">
        <span class="cr-n">{{ totalActivos }}</span>
        <span class="cr-nav-txt"><b>Todas as fases</b><small>{{ turmasVisiveis.length }} turmas</small></span>
      </button>
      <p v-if="soInactivas" class="cr-nav-note">Ano encerrado: todas as turmas estão inactivas.</p>
      <template v-for="f in fasesFiltradas" :key="f.name">
        <div class="cr-nav-row" :class="{ active: selFases.includes(f.name) && !q }">
          <button class="cr-chev" :class="{ aberta: abertas.includes(f.name) }" @click.stop="expandir(f.name)"
                  :title="abertas.includes(f.name) ? 'Esconder turmas' : 'Mostrar turmas'">▸</button>
          <input type="checkbox" class="cr-check" :checked="selFases.includes(f.name)" @change="toggleFase(f.name)"
                 title="Juntar à selecção">
          <button class="cr-nav-main" @click="abrirFase(f.name)">
            <span class="cr-n">{{ f.n }}</span>
            <span class="cr-nav-txt"><b>{{ f.name }}</b><small>{{ f.turmas.length }} turma{{ f.turmas.length === 1 ? '' : 's' }}</small></span>
          </button>
        </div>
        <div v-if="abertas.includes(f.name)" class="cr-sub">
          <div v-for="t in f.turmas" :key="t.name" class="cr-sub-item"
               :class="{ active: turmaEstaSel(t.name) && !q }">
            <input type="checkbox" class="cr-check" :checked="turmaEstaSel(t.name)" :disabled="selFases.includes(f.name)"
                   @change="toggleTurma(t.name)" title="Juntar à selecção">
            <button class="cr-sub-main" @click="abrirTurma(t.name)">
              <span>{{ curto(t.name, f.name) }}</span><span class="cr-sub-n">{{ t.n }}</span>
            </button>
          </div>
        </div>
      </template>
      <p v-if="!fasesFiltradas.length" class="cr-nav-note">Nenhuma fase encontrada.</p>
    </nav>

    <!-- ── Painel ────────────────────────────────────────────────────── -->
    <section class="cr-panel">

      <!-- Resultados da pesquisa -->
      <template v-if="q">
        <div class="cr-head">
          <h2>Resultados para “{{ search.trim() }}”</h2>
          <p class="cr-muted">{{ resultados.total }} encontrado(s) em {{ ano }}</p>
        </div>
        <div v-if="!resultados.total" class="cr-empty">Nada encontrado.</div>

        <div v-if="resultados.catecumenos.length" class="cr-group">
          <h3>Catecúmenos <span>{{ resultados.catecumenos.length }}</span></h3>
          <table class="cr-table">
            <tbody>
              <tr v-for="c in resultados.catecumenos" :key="c.turma + c.catecumeno" :class="{ inativo: !isActivo(c) }">
                <td><a :href="slug('catecumeno', c.catecumeno)">{{ c.nome }}</a></td>
                <td><button class="cr-link" @click="abrirTurma(c.turma)">{{ c.turma }}</button></td>
                <td>{{ c.encarregado || '—' }}</td>
                <td><phone :n="c.contacto"></phone></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="resultados.catequistas.length" class="cr-group">
          <h3>Catequistas <span>{{ resultados.catequistas.length }}</span></h3>
          <table class="cr-table">
            <tbody>
              <tr v-for="x in resultados.catequistas" :key="x.nome">
                <td><a v-if="x.link" :href="x.link">{{ x.nome }}</a><span v-else>{{ x.nome }}</span></td>
                <td><phone v-for="n in x.contactos" :key="n" :n="n"></phone></td>
                <td class="cr-small">
                  <button v-for="t in x.turmas" :key="t.name" class="cr-link cr-block" @click="abrirTurma(t.name)">{{ t.name }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="resultados.turmas.length" class="cr-group">
          <h3>Turmas <span>{{ resultados.turmas.length }}</span></h3>
          <table class="cr-table">
            <tbody>
              <tr v-for="t in resultados.turmas" :key="t.name">
                <td><button class="cr-link" @click="abrirTurma(t.name)">{{ t.name }}</button></td>
                <td>{{ t.fase }}</td>
                <td>{{ horario(t) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Turma -->
      <template v-else-if="turma">
        <div class="cr-head">
          <div class="cr-head-top">
            <div>
              <h2><a :href="slug('turma', turma.name)">{{ turma.name }}</a>
                <span v-if="turma.status === 'Inactivo'" class="cr-badge grey">Inactiva</span></h2>
              <p class="cr-muted">{{ turma.fase }} · {{ horario(turma) || 'sem horário' }}</p>
            </div>
            <div class="cr-actions">
              <button class="cr-btn" @click="copiarEncarregados">📋 Contactos dos encarregados</button>
              <button class="cr-btn" @click="exportarCatecumenos">⬇ CSV</button>
            </div>
          </div>
          <div class="cr-people">
            <div v-for="p in pessoas(turma)" :key="p.papel + p.nome" class="cr-person">
              <small>{{ p.papel }}</small>
              <a v-if="p.link" :href="p.link"><b>{{ p.nome }}</b></a><b v-else>{{ p.nome }}</b>
              <phone :n="p.contacto"></phone>
            </div>
            <span v-if="!pessoas(turma).length" class="cr-muted">Sem catequista atribuído</span>
          </div>
          <div class="cr-stats"><span v-for="s in statsLinha" :key="s">{{ s }}</span></div>
        </div>
        <tabela-catecumenos :rows="catecumenosOrdenados" :sem-turma="true" :ordenar="ordenar" :seta="seta"></tabela-catecumenos>
      </template>

      <!-- Fase ou todas -->
      <template v-else>
        <div class="cr-head">
          <div class="cr-head-top">
            <div>
              <h2>{{ tituloSeleccao }}</h2>
              <p class="cr-muted">Ano lectivo {{ ano }}</p>
              <div v-if="chips.length > 1" class="cr-chips">
                <span v-for="c in chips" :key="c.tipo + c.nome" class="cr-chip">
                  {{ c.rotulo }}<button @click="removerChip(c)" title="Retirar">✕</button>
                </span>
                <button class="cr-link" @click="limparSeleccao">Limpar</button>
              </div>
            </div>
            <div class="cr-actions">
              <button v-if="tab === 'catequistas'" class="cr-btn" @click="copiarCatequistas">📋 Contactos</button>
              <button v-if="tab === 'catecumenos'" class="cr-btn" @click="copiarEncarregados">📋 Contactos dos encarregados</button>
              <button class="cr-btn" @click="exportar">⬇ CSV</button>
            </div>
          </div>
          <div class="cr-stats"><span v-for="s in statsLinha" :key="s">{{ s }}</span></div>
          <div class="cr-tabs">
            <button :class="{ active: tab === 'turmas' }" @click="tab = 'turmas'">Turmas <span>{{ turmasDetalhe.length }}</span></button>
            <button :class="{ active: tab === 'catequistas' }" @click="tab = 'catequistas'">Catequistas <span>{{ catequistasSel.length }}</span></button>
            <button :class="{ active: tab === 'catecumenos' }" @click="tab = 'catecumenos'">Catecúmenos <span>{{ catecumenosSel.length }}</span></button>
          </div>
        </div>

        <div v-if="tab === 'turmas'" class="cr-table-wrap">
          <table class="cr-table">
            <thead><tr><th>Turma</th><th>Horário</th><th>Catequista</th><th>Contacto</th><th class="num">Catecúmenos</th></tr></thead>
            <tbody>
              <tr v-for="t in turmasDetalhe" :key="t.name" class="cr-click" @click="abrirTurma(t.name)">
                <td><b>{{ t.name }}</b></td>
                <td>{{ horario(t) || '—' }}</td>
                <td>{{ t.pessoas.map(p => p.nome).join(', ') || '—' }}</td>
                <td @click.stop><phone v-if="t.pessoas[0]" :n="t.pessoas[0].contacto"></phone></td>
                <td class="num">{{ t.activos }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="tab === 'catequistas'" class="cr-table-wrap">
          <table class="cr-table">
            <thead><tr><th>Catequista</th><th>Contacto</th><th>Turmas</th><th class="num">Catecúmenos</th></tr></thead>
            <tbody>
              <tr v-for="x in catequistasSel" :key="x.nome" :class="{ inativo: x.status === 'Inactivo' }">
                <td>
                  <a v-if="x.link" :href="x.link">{{ x.nome }}</a><span v-else>{{ x.nome }}</span>
                  <span v-if="x.status === 'Inactivo'" class="cr-badge grey">Inactivo</span>
                </td>
                <td><phone v-for="n in x.contactos" :key="n" :n="n"></phone><span v-if="!x.contactos.length" class="cr-muted">—</span></td>
                <td class="cr-small">
                  <button v-for="t in x.turmas" :key="t.name" class="cr-link cr-block" @click="abrirTurma(t.name)">
                    {{ t.name }} <span class="cr-muted">({{ t.papel }})</span>
                  </button>
                </td>
                <td class="num">{{ x.catecumenos }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <tabela-catecumenos v-if="tab === 'catecumenos'" :rows="catecumenosOrdenados" :ordenar="ordenar" :seta="seta"
                            :agrupar="sortKey === 'turma'" @turma="abrirTurma"></tabela-catecumenos>
      </template>
    </section>
  </div>
</div>
`,

    setup() {
      const anos = ref([]);
      const ano = ref('');
      const loading = ref(true);
      const dados = ref({ fases: [], turmas: [], catecumenos: [], catequistas: [] });

      const selFases = ref([]);    // fases inteiras seleccionadas
      const selTurmas = ref([]);   // turmas soltas seleccionadas
      const abertas = ref([]);     // fases com as turmas visíveis no menu
      const filtroFases = ref('');
      const tab = ref('turmas');
      const search = ref('');
      const soActivos = ref(true);
      const sortKey = ref('turma');
      const sortAsc = ref(true);

      // ── Carregamento ──────────────────────────────────────────────────────
      async function load() {
        loading.value = true;
        try {
          dados.value = await api('get_dados', { ano_lectivo: ano.value });
          const existem = new Set(turmasVisiveis.value.map((t) => t.fase || SEM_FASE));
          selFases.value = selFases.value.filter((f) => existem.has(f));
          selTurmas.value = [];
        } catch (e) {
          frappe.msgprint(__('Erro ao carregar os dados.'));
        } finally {
          loading.value = false;
        }
      }

      onMounted(async () => {
        const [lista, atual] = await Promise.all([api('get_anos_lectivos'), api('get_ano_actual')]);
        anos.value = lista || [];
        ano.value = atual && anos.value.includes(atual) ? atual : (anos.value[0] || '');
        if (ano.value) await load(); else loading.value = false;
      });

      // ── Índices ───────────────────────────────────────────────────────────
      const catequistaPorNome = computed(() => Object.fromEntries(dados.value.catequistas.map((x) => [x.name, x])));
      const turmaPorNome = computed(() => Object.fromEntries(dados.value.turmas.map((t) => [t.name, t])));
      const catsPorTurma = computed(() => {
        const m = {};
        dados.value.catecumenos.forEach((c) => { (m[c.turma] = m[c.turma] || []).push(c); });
        return m;
      });
      const activosDa = (turma) => (catsPorTurma.value[turma] || []).filter(isActivo).length;
      // Turmas inactivas não aparecem; num ano já encerrado (todas inactivas) mostram-se todas
      const soInactivas = computed(() =>
        dados.value.turmas.length > 0 && !dados.value.turmas.some((t) => t.status === 'Activo'));
      const turmasVisiveis = computed(() =>
        soInactivas.value ? dados.value.turmas : dados.value.turmas.filter((t) => t.status === 'Activo'));
      const nomesVisiveis = computed(() => new Set(turmasVisiveis.value.map((t) => t.name)));
      const totalActivos = computed(() =>
        dados.value.catecumenos.filter((c) => nomesVisiveis.value.has(c.turma) && isActivo(c)).length);

      // ── Navegação ─────────────────────────────────────────────────────────
      const fasesNav = computed(() => {
        const grupos = {};
        turmasVisiveis.value.forEach((t) => {
          const f = t.fase || SEM_FASE;
          (grupos[f] = grupos[f] || []).push({ name: t.name, status: t.status, n: activosDa(t.name) });
        });
        const ordem = Object.fromEntries(dados.value.fases.map((f, i) => [f.name, i]));
        return Object.keys(grupos)
          .sort((a, b) => (ordem[a] ?? 999) - (ordem[b] ?? 999) || a.localeCompare(b))
          .map((name) => ({
            name,
            turmas: grupos[name].sort((a, b) => a.name.localeCompare(b.name)),
            n: grupos[name].reduce((s, t) => s + t.n, 0),
          }));
      });

      const fasesFiltradas = computed(() => {
        const f = norm(filtroFases.value.trim());
        return f ? fasesNav.value.filter((x) => norm(x.name).includes(f)) : fasesNav.value;
      });
      const faseDe = (turma) => ((turmaPorNome.value[turma] || {}).fase || SEM_FASE);
      const temSeleccao = computed(() => selFases.value.length > 0 || selTurmas.value.length > 0);
      const turmaEstaSel = (nome) => selTurmas.value.includes(nome) || selFases.value.includes(faseDe(nome));

      function expandir(fase) {
        const i = abertas.value.indexOf(fase);
        if (i >= 0) abertas.value.splice(i, 1); else abertas.value.push(fase);
      }
      // Clique no nome: só esta fase (mantém o separador actual; não abre as turmas no menu)
      function abrirFase(nome) {
        search.value = '';
        selFases.value = [nome];
        selTurmas.value = [];
        sortKey.value = 'turma';
        sortAsc.value = true;
      }
      // Clique no nome da turma: só esta turma
      function abrirTurma(nome) {
        if (!turmaPorNome.value[nome]) return;
        search.value = '';
        selFases.value = [];
        selTurmas.value = [nome];
        sortKey.value = 'nome';
        sortAsc.value = true;
      }
      // Caixas de selecção: juntar / retirar
      function toggleFase(nome) {
        search.value = '';
        const i = selFases.value.indexOf(nome);
        if (i >= 0) {
          selFases.value.splice(i, 1);
        } else {
          selFases.value.push(nome);
          selTurmas.value = selTurmas.value.filter((t) => faseDe(t) !== nome);  // já incluídas pela fase
        }
        sortKey.value = 'turma';
      }
      function toggleTurma(nome) {
        search.value = '';
        const i = selTurmas.value.indexOf(nome);
        if (i >= 0) selTurmas.value.splice(i, 1); else selTurmas.value.push(nome);
        sortKey.value = 'turma';
      }
      function limparSeleccao() {
        search.value = '';
        selFases.value = [];
        selTurmas.value = [];
      }

      const chips = computed(() => [
        ...selFases.value.map((f) => ({ tipo: 'fase', nome: f, rotulo: f })),
        ...selTurmas.value.map((t) => ({ tipo: 'turma', nome: t, rotulo: t })),
      ]);
      function removerChip(c) {
        if (c.tipo === 'fase') selFases.value = selFases.value.filter((f) => f !== c.nome);
        else selTurmas.value = selTurmas.value.filter((t) => t !== c.nome);
      }
      const tituloSeleccao = computed(() => {
        if (!temSeleccao.value) return 'Todas as fases';
        if (chips.value.length === 1) return chips.value[0].rotulo;
        const partes = [];
        if (selFases.value.length) partes.push(`${selFases.value.length} fase${selFases.value.length > 1 ? 's' : ''}`);
        if (selTurmas.value.length) partes.push(`${selTurmas.value.length} turma${selTurmas.value.length > 1 ? 's' : ''}`);
        return partes.join(' + ') + ' seleccionadas';
      });
      // "2026 1ª Fase T2" dentro de "1ª Fase" → "T2"
      function curto(nome, fase) {
        const i = nome.indexOf(fase);
        const resto = i >= 0 ? nome.slice(i + fase.length).trim() : '';
        return resto || nome;
      }

      // ── Selecção ──────────────────────────────────────────────────────────
      // Vista de turma: exactamente uma turma seleccionada e nenhuma fase
      const turma = computed(() =>
        (selTurmas.value.length === 1 && !selFases.value.length ? turmaPorNome.value[selTurmas.value[0]] : null));
      const turmasSel = computed(() => {
        if (!temSeleccao.value) return turmasVisiveis.value;
        const escolhidas = turmasVisiveis.value.filter((t) =>
          selFases.value.includes(t.fase || SEM_FASE) || selTurmas.value.includes(t.name));
        // turma aberta por link (ex.: inactiva) que não está na lista visível
        const extra = selTurmas.value.filter((n) => !nomesVisiveis.value.has(n))
          .map((n) => turmaPorNome.value[n]).filter(Boolean);
        return escolhidas.concat(extra);
      });

      function pessoas(t) {
        const out = [];
        const add = (nome, papel, contactoTurma) => {
          if (!nome) return;
          const x = catequistaPorNome.value[nome];
          out.push({
            nome: (x && x.nome_completo) || nome,
            papel,
            contacto: (x && (x.contacto_1 || x.contacto_2)) || contactoTurma || '',
            link: x ? slug('catequista', x.name) : null,
          });
        };
        add(t.catequista, 'Responsável', t.contacto);
        add(t.catequista_adj, 'Adjunto', t.contacto_adj);
        if (!out.length && t.catequistas) out.push({ nome: t.catequistas, papel: 'Catequistas', contacto: t.contacto || '', link: null });
        return out;
      }
      const horario = (t) => [t.dia, t.hora, t.local].filter(Boolean).join(' · ');

      const turmasDetalhe = computed(() => turmasSel.value.map((t) => ({
        ...t, pessoas: pessoas(t), activos: activosDa(t.name),
      })));

      const catecumenosSel = computed(() => {
        const nomes = new Set(turmasSel.value.map((t) => t.name));
        return dados.value.catecumenos.filter((c) => nomes.has(c.turma) && (!soActivos.value || isActivo(c)));
      });

      function agruparCatequistas(turmas) {
        const m = {};
        turmas.forEach((t) => {
          [[t.catequista, 'Responsável', t.contacto], [t.catequista_adj, 'Adjunto', t.contacto_adj]].forEach(([nome, papel, ct]) => {
            if (!nome) return;
            const x = catequistaPorNome.value[nome] || {};
            if (!m[nome]) {
              m[nome] = {
                nome: x.nome_completo || nome, link: x.name ? slug('catequista', x.name) : null,
                status: x.status, contactos: [x.contacto_1, x.contacto_2].filter(Boolean),
                email: x.email, nucleo: x.nucleo, turmas: [], catecumenos: 0,
              };
            }
            m[nome].turmas.push({ name: t.name, papel });
            m[nome].catecumenos += activosDa(t.name);
            if (!m[nome].contactos.length && ct) m[nome].contactos.push(ct);
          });
        });
        return Object.values(m).sort((a, b) => a.nome.localeCompare(b.nome));
      }
      const catequistasSel = computed(() => agruparCatequistas(turmasSel.value));

      // ── Resumo numa linha ─────────────────────────────────────────────────
      const statsLinha = computed(() => {
        const nomes = new Set(turmasSel.value.map((t) => t.name));
        const act = dados.value.catecumenos.filter((c) => nomes.has(c.turma) && isActivo(c));
        const n = act.length;
        const f = act.filter((c) => c.sexo === 'Feminino').length;
        const m = act.filter((c) => c.sexo === 'Masculino').length;
        const fichas = act.filter((c) => c.ficha_de_catecumeno).length;
        const linha = [`${n} catecúmenos`];
        if (!turma.value) linha.push(`${turmasSel.value.length} turmas`, `${catequistasSel.value.length} catequistas`);
        linha.push(`${f} F · ${m} M`);
        linha.push(`Fichas ${n ? Math.round((100 * fichas) / n) : 0}%`);
        linha.push(`Baptismo ${act.filter((c) => c.baptismo).length} · Eucaristia ${act.filter((c) => c.eucaristia).length} · Crisma ${act.filter((c) => c.crisma).length}`);
        return linha;
      });

      // ── Pesquisa global ───────────────────────────────────────────────────
      const q = computed(() => norm(search.value.trim()));
      const has = (...vals) => vals.some((v) => norm(v).includes(q.value));
      const resultados = computed(() => {
        if (!q.value) return { catecumenos: [], catequistas: [], turmas: [], total: 0 };
        const catecumenos = dados.value.catecumenos
          .filter((c) => nomesVisiveis.value.has(c.turma) && (!soActivos.value || isActivo(c))
            && has(c.nome, c.encarregado, c.contacto, c.padrinhos))
          .slice(0, 60);
        const catequistas = agruparCatequistas(turmasVisiveis.value)
          .filter((x) => has(x.nome, x.nucleo, x.email, ...x.contactos));
        const turmas = turmasVisiveis.value.filter((t) => has(t.name, t.local, t.catequista, t.catequista_adj));
        return { catecumenos, catequistas, turmas, total: catecumenos.length + catequistas.length + turmas.length };
      });

      // ── Ordenação dos catecúmenos ─────────────────────────────────────────
      const catecumenosOrdenados = computed(() => {
        const k = sortKey.value;
        const dir = sortAsc.value ? 1 : -1;
        return [...catecumenosSel.value].sort((a, b) => {
          const va = a[k] ?? '', vb = b[k] ?? '';
          const r = (typeof va === 'number' || typeof vb === 'number')
            ? ((va || 0) - (vb || 0)) : String(va).localeCompare(String(vb));
          return r * dir || String(a.nome).localeCompare(String(b.nome));
        });
      });
      function ordenar(k) {
        if (sortKey.value === k) sortAsc.value = !sortAsc.value;
        else { sortKey.value = k; sortAsc.value = true; }
      }
      const seta = (k) => (sortKey.value === k ? (sortAsc.value ? '▲' : '▼') : '');

      // ── Acções ────────────────────────────────────────────────────────────
      function copiar(linhas) {
        frappe.utils.copy_to_clipboard(linhas.join('\n'));
        frappe.show_alert({ message: __('{0} contactos copiados', [linhas.length]), indicator: 'green' });
      }
      function copiarCatequistas() {
        copiar(catequistasSel.value.map((x) => `${x.nome} — ${x.contactos.join(' / ') || 'sem contacto'} (${x.turmas.map((t) => t.name).join(', ')})`));
      }
      function copiarEncarregados() {
        copiar(catecumenosOrdenados.value.filter((c) => c.contacto)
          .map((c) => `${c.nome} — ${c.encarregado || 'Encarregado'}: ${c.contacto} (${c.turma})`));
      }

      const sufixo = () => {
        const base = chips.value.length === 1 ? chips.value[0].nome : (temSeleccao.value ? 'seleccao' : 'todas');
        return `${base.replace(/\s+/g, '-')}-${ano.value}`;
      };
      function exportarCatecumenos() {
        downloadCSV(`catecumenos-${sufixo()}.csv`, [
          ['Nome', 'Turma', 'Fase', 'Estado', 'Idade', 'Sexo', 'Encarregado', 'Contacto', 'Padrinhos', 'Contacto padrinhos', 'Faltas', 'Ficha', 'Baptismo', 'Eucaristia', 'Crisma', 'Comunidade'],
          ...catecumenosOrdenados.value.map((c) => [
            c.nome, c.turma, (turmaPorNome.value[c.turma] || {}).fase, c.estado, c.idade, c.sexo,
            c.encarregado, c.contacto, c.padrinhos, c.contacto_padrinhos, c.nr_de_faltas || 0,
            c.ficha_de_catecumeno ? 'Sim' : 'Não', c.baptismo ? 'Sim' : 'Não',
            c.eucaristia ? 'Sim' : 'Não', c.crisma ? 'Sim' : 'Não', c.comunidade,
          ]),
        ]);
      }
      function exportar() {
        if (tab.value === 'catecumenos') return exportarCatecumenos();
        if (tab.value === 'catequistas') {
          return downloadCSV(`catequistas-${sufixo()}.csv`, [
            ['Catequista', 'Contactos', 'Turmas', 'Catecúmenos', 'Núcleo', 'Email', 'Estado'],
            ...catequistasSel.value.map((x) => [x.nome, x.contactos.join(' / '),
              x.turmas.map((t) => `${t.name} (${t.papel})`).join(', '), x.catecumenos, x.nucleo, x.email, x.status]),
          ]);
        }
        downloadCSV(`turmas-${sufixo()}.csv`, [
          ['Turma', 'Fase', 'Estado', 'Dia', 'Hora', 'Local', 'Responsável', 'Contacto', 'Adjunto', 'Contacto adj.', 'Catecúmenos'],
          ...turmasDetalhe.value.map((t) => {
            const r = t.pessoas.find((p) => p.papel === 'Responsável') || t.pessoas[0] || {};
            const a = t.pessoas.find((p) => p.papel === 'Adjunto') || {};
            return [t.name, t.fase, t.status, t.dia, t.hora, t.local, r.nome, r.contacto, a.nome, a.contacto, t.activos];
          }),
        ]);
      }

      return {
        anos, ano, loading, dados, load, tab, search, soActivos, q,
        selFases, selTurmas, abertas, filtroFases, fasesFiltradas, soInactivas, turmasVisiveis, temSeleccao,
        turmaEstaSel, expandir, toggleFase, toggleTurma, limparSeleccao, chips, removerChip, tituloSeleccao,
        fasesNav, totalActivos, abrirFase, abrirTurma, curto, turma, pessoas, horario,
        turmasDetalhe, catecumenosSel, catequistasSel, statsLinha, resultados,
        catecumenosOrdenados, ordenar, seta, sortKey, copiarCatequistas, copiarEncarregados, exportar, exportarCatecumenos,
        slug, isActivo,
      };
    },
  })
    .component('phone', {
      props: ['n'],
      template: `<span v-if="n" class="cr-phone"><a :href="tel(n)">{{ n }}</a><a :href="wa(n)" target="_blank" class="cr-wa" title="WhatsApp">WA</a></span>`,
      setup() { return { tel: telLink, wa: waLink }; },
    })
    .component('tabela-catecumenos', {
      props: ['rows', 'semTurma', 'ordenar', 'seta', 'agrupar'],
      emits: ['turma'],
      setup(props) {
        const { computed } = Vue;
        const mostraTurma = computed(() => !props.semTurma && !props.agrupar);
        const colunas = computed(() => (mostraTurma.value ? 8 : 7));
        // Ordenado por turma: um cabeçalho (nome + total) antes de cada turma
        const linhas = computed(() => {
          const total = {};
          props.rows.forEach((c) => { total[c.turma] = (total[c.turma] || 0) + 1; });
          return props.rows.map((c, i) => ({
            c, grupo: props.agrupar && !props.semTurma && (i === 0 || props.rows[i - 1].turma !== c.turma),
            total: total[c.turma],
          }));
        });
        return { mostraTurma, colunas, linhas };
      },
      template: `
<div class="cr-table-wrap">
  <div v-if="!rows.length" class="cr-empty">Sem catecúmenos.</div>
  <table v-else class="cr-table">
    <thead>
      <tr>
        <th class="cr-sort" @click="ordenar('nome')">Nome {{ seta('nome') }}</th>
        <th v-if="mostraTurma" class="cr-sort" @click="ordenar('turma')">Turma {{ seta('turma') }}</th>
        <th class="cr-sort num" @click="ordenar('idade')">Idade {{ seta('idade') }}</th>
        <th>Encarregado</th>
        <th>Contacto</th>
        <th class="cr-sort num" @click="ordenar('nr_de_faltas')">Faltas {{ seta('nr_de_faltas') }}</th>
        <th title="Ficha entregue">Ficha</th>
        <th title="Baptismo · Eucaristia · Crisma">Sacr.</th>
      </tr>
    </thead>
    <tbody>
      <template v-for="l in linhas" :key="l.c.turma + l.c.catecumeno">
      <tr v-if="l.grupo" class="cr-grupo">
        <td :colspan="colunas">
          <button class="cr-link" @click="$emit('turma', l.c.turma)">{{ l.c.turma }}</button>
          <span class="cr-muted"> · {{ l.total }}</span>
        </td>
      </tr>
      <tr :class="{ inativo: l.c.estado === 'Inativo' }">
        <td>
          <a :href="'/app/catecumeno/' + encodeURIComponent(l.c.catecumeno)">{{ l.c.nome }}</a>
          <span v-if="l.c.estado === 'Inativo'" class="cr-badge grey">Inativo</span>
          <span v-if="l.c.comunidade === 'Santa Ana'" class="cr-badge">Santa Ana</span>
        </td>
        <td v-if="mostraTurma" class="cr-small"><button class="cr-link" @click="$emit('turma', l.c.turma)">{{ l.c.turma }}</button></td>
        <td class="num">{{ l.c.idade || '—' }}</td>
        <td>{{ l.c.encarregado || '—' }}</td>
        <td><phone :n="l.c.contacto"></phone><span v-if="!l.c.contacto" class="cr-muted">—</span></td>
        <td class="num">{{ l.c.nr_de_faltas || 0 }}</td>
        <td>{{ l.c.ficha_de_catecumeno ? '✔' : '—' }}</td>
        <td class="cr-sacr"><span :class="{ on: l.c.baptismo }">B</span><span :class="{ on: l.c.eucaristia }">E</span><span :class="{ on: l.c.crisma }">C</span></td>
      </tr>
      </template>
    </tbody>
  </table>
</div>`,
    });
}

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
      <button class="cr-nav-item" :class="{ active: !faseSel && !turmaSel && !q }" @click="abrirFase(null)">
        <span class="cr-n">{{ totalActivos }}</span>
        <span class="cr-nav-txt"><b>Todas as fases</b><small>{{ dados.turmas.length }} turmas</small></span>
      </button>
      <template v-for="f in fasesNav" :key="f.name">
        <button class="cr-nav-item" :class="{ active: faseSel === f.name && !turmaSel && !q, open: faseSel === f.name }"
                @click="abrirFase(f.name)">
          <span class="cr-n">{{ f.n }}</span>
          <span class="cr-nav-txt"><b>{{ f.name }}</b><small>{{ f.turmas.length }} turma{{ f.turmas.length === 1 ? '' : 's' }}</small></span>
        </button>
        <div v-if="faseSel === f.name" class="cr-sub">
          <button v-for="t in f.turmas" :key="t.name" class="cr-sub-item"
                  :class="{ active: turmaSel === t.name && !q, off: t.status === 'Inactivo' }"
                  @click="abrirTurma(t.name)">
            <span>{{ curto(t.name, f.name) }}</span><span class="cr-sub-n">{{ t.n }}</span>
          </button>
        </div>
      </template>
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
              <h2>{{ faseSel || 'Todas as fases' }}</h2>
              <p class="cr-muted">Ano lectivo {{ ano }}</p>
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
              <tr v-for="t in turmasDetalhe" :key="t.name" class="cr-click" :class="{ inativo: t.status === 'Inactivo' }" @click="abrirTurma(t.name)">
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
                            @turma="abrirTurma"></tabela-catecumenos>
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

      const faseSel = ref(null);
      const turmaSel = ref(null);
      const tab = ref('turmas');
      const search = ref('');
      const soActivos = ref(true);
      const sortKey = ref('nome');
      const sortAsc = ref(true);

      // ── Carregamento ──────────────────────────────────────────────────────
      async function load() {
        loading.value = true;
        try {
          dados.value = await api('get_dados', { ano_lectivo: ano.value });
          turmaSel.value = null;
          if (faseSel.value && !dados.value.turmas.some((t) => (t.fase || SEM_FASE) === faseSel.value)) {
            faseSel.value = null;
          }
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
      const totalActivos = computed(() => dados.value.catecumenos.filter(isActivo).length);

      // ── Navegação ─────────────────────────────────────────────────────────
      const fasesNav = computed(() => {
        const grupos = {};
        dados.value.turmas.forEach((t) => {
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

      function abrirFase(nome) {
        search.value = '';
        turmaSel.value = null;
        faseSel.value = nome;
      }
      function abrirTurma(nome) {
        const t = turmaPorNome.value[nome];
        if (!t) return;
        search.value = '';
        faseSel.value = t.fase || SEM_FASE;
        turmaSel.value = nome;
      }
      // "2026 1ª Fase T2" dentro de "1ª Fase" → "T2"
      function curto(nome, fase) {
        const i = nome.indexOf(fase);
        const resto = i >= 0 ? nome.slice(i + fase.length).trim() : '';
        return resto || nome;
      }

      // ── Selecção ──────────────────────────────────────────────────────────
      const turma = computed(() => (turmaSel.value ? turmaPorNome.value[turmaSel.value] : null));
      const turmasSel = computed(() => {
        if (turma.value) return [turma.value];
        if (faseSel.value) return dados.value.turmas.filter((t) => (t.fase || SEM_FASE) === faseSel.value);
        return dados.value.turmas;
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
          .filter((c) => (!soActivos.value || isActivo(c)) && has(c.nome, c.encarregado, c.contacto, c.padrinhos))
          .slice(0, 60);
        const catequistas = agruparCatequistas(dados.value.turmas)
          .filter((x) => has(x.nome, x.nucleo, x.email, ...x.contactos));
        const turmas = dados.value.turmas.filter((t) => has(t.name, t.local, t.catequista, t.catequista_adj));
        return { catecumenos, catequistas, turmas, total: catecumenos.length + catequistas.length + turmas.length };
      });

      // ── Ordenação dos catecúmenos ─────────────────────────────────────────
      const catecumenosOrdenados = computed(() => {
        const k = sortKey.value;
        const dir = sortAsc.value ? 1 : -1;
        return [...catecumenosSel.value].sort((a, b) => {
          const va = a[k] ?? '', vb = b[k] ?? '';
          if (typeof va === 'number' || typeof vb === 'number') return ((va || 0) - (vb || 0)) * dir;
          return String(va).localeCompare(String(vb)) * dir;
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

      const sufixo = () => `${(turmaSel.value || faseSel.value || 'todas').replace(/\s+/g, '-')}-${ano.value}`;
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
        anos, ano, loading, dados, load, faseSel, turmaSel, tab, search, soActivos, q,
        fasesNav, totalActivos, abrirFase, abrirTurma, curto, turma, pessoas, horario,
        turmasDetalhe, catecumenosSel, catequistasSel, statsLinha, resultados,
        catecumenosOrdenados, ordenar, seta, copiarCatequistas, copiarEncarregados, exportar, exportarCatecumenos,
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
      props: ['rows', 'semTurma', 'ordenar', 'seta'],
      emits: ['turma'],
      template: `
<div class="cr-table-wrap">
  <div v-if="!rows.length" class="cr-empty">Sem catecúmenos.</div>
  <table v-else class="cr-table">
    <thead>
      <tr>
        <th class="cr-sort" @click="ordenar('nome')">Nome {{ seta('nome') }}</th>
        <th v-if="!semTurma" class="cr-sort" @click="ordenar('turma')">Turma {{ seta('turma') }}</th>
        <th class="cr-sort num" @click="ordenar('idade')">Idade {{ seta('idade') }}</th>
        <th>Encarregado</th>
        <th>Contacto</th>
        <th class="cr-sort num" @click="ordenar('nr_de_faltas')">Faltas {{ seta('nr_de_faltas') }}</th>
        <th title="Ficha entregue">Ficha</th>
        <th title="Baptismo · Eucaristia · Crisma">Sacr.</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="c in rows" :key="c.turma + c.catecumeno" :class="{ inativo: c.estado === 'Inativo' }">
        <td>
          <a :href="'/app/catecumeno/' + encodeURIComponent(c.catecumeno)">{{ c.nome }}</a>
          <span v-if="c.estado === 'Inativo'" class="cr-badge grey">Inativo</span>
          <span v-if="c.comunidade === 'Santa Ana'" class="cr-badge">Santa Ana</span>
        </td>
        <td v-if="!semTurma" class="cr-small"><button class="cr-link" @click="$emit('turma', c.turma)">{{ c.turma }}</button></td>
        <td class="num">{{ c.idade || '—' }}</td>
        <td>{{ c.encarregado || '—' }}</td>
        <td><phone :n="c.contacto"></phone><span v-if="!c.contacto" class="cr-muted">—</span></td>
        <td class="num">{{ c.nr_de_faltas || 0 }}</td>
        <td>{{ c.ficha_de_catecumeno ? '✔' : '—' }}</td>
        <td class="cr-sacr"><span :class="{ on: c.baptismo }">B</span><span :class="{ on: c.eucaristia }">E</span><span :class="{ on: c.crisma }">C</span></td>
      </tr>
    </tbody>
  </table>
</div>`,
    });
}

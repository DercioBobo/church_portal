/* global frappe, Vue */
// Consulta Rápida — Vue 3 CDN, no build step

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

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
function createConsultaApp() {
  const { createApp, ref, computed, onMounted } = Vue;

  return createApp({
    template: `
<div id="consulta-app">

  <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
  <div class="cr-toolbar">
    <h1>🔎 Consulta Rápida</h1>
    <select v-model="ano" @change="load" class="cr-select" title="Ano lectivo">
      <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
    </select>
    <div class="cr-search-wrap">
      <svg class="cr-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="cr-search-input" v-model="search" placeholder="Nome, turma, encarregado ou contacto…" @keydown.escape="search = ''">
      <button v-if="search" class="cr-search-clear" @click="search = ''">✕</button>
    </div>
    <label class="cr-toggle" title="Esconder catecúmenos marcados como Inativo na turma">
      <input type="checkbox" v-model="soActivos"> Só activos
    </label>
  </div>

  <div v-if="loading" class="cr-loading"><div class="cr-spinner"></div> A carregar…</div>

  <template v-else>

    <!-- ── Fases ─────────────────────────────────────────────────────── -->
    <div class="cr-fases">
      <button class="cr-chip" :class="{ active: !selFases.length }" @click="selFases = []">
        Todas <span class="cr-chip-n">{{ totalActivos }}</span>
      </button>
      <button v-for="f in fasesComTurmas" :key="f.name" class="cr-chip"
              :class="{ active: selFases.includes(f.name) }"
              @click="toggleFase(f.name, $event)"
              :title="'Clique para escolher; Ctrl/⌘ + clique para juntar várias fases'">
        <span v-if="f.sacramento" class="cr-chip-dot" :title="'Fase de ' + f.sacramento"></span>
        {{ f.name }} <span class="cr-chip-n">{{ f.n }}</span>
      </button>
    </div>
    <p class="cr-hint">Clique numa fase para a ver; <b>Ctrl/⌘ + clique</b> para juntar várias.</p>

    <!-- ── Resumo ───────────────────────────────────────────────────── -->
    <div class="cr-cards">
      <div class="cr-card">
        <p class="cr-card-label">Catecúmenos</p>
        <p class="cr-card-value">{{ stats.catecumenos }}</p>
        <p class="cr-card-sub">{{ stats.f }} F · {{ stats.m }} M<span v-if="stats.semSexo"> · {{ stats.semSexo }} s/ indicação</span></p>
      </div>
      <div class="cr-card">
        <p class="cr-card-label">Turmas</p>
        <p class="cr-card-value">{{ turmasSel.length }}</p>
        <p class="cr-card-sub">{{ stats.mediaTurma }} por turma em média</p>
      </div>
      <div class="cr-card">
        <p class="cr-card-label">Catequistas</p>
        <p class="cr-card-value">{{ catequistasSel.length }}</p>
        <p class="cr-card-sub">{{ stats.racio }} catecúmenos por catequista</p>
      </div>
      <div class="cr-card">
        <p class="cr-card-label">Fichas entregues</p>
        <p class="cr-card-value">{{ stats.fichasPct }}%</p>
        <p class="cr-card-sub">{{ stats.fichas }} de {{ stats.catecumenos }}</p>
      </div>
      <div class="cr-card">
        <p class="cr-card-label">Sacramentos já recebidos</p>
        <p class="cr-card-value cr-card-value-sm">B {{ stats.bap }} · E {{ stats.euc }} · C {{ stats.cri }}</p>
        <p class="cr-card-sub">Baptismo · Eucaristia · Crisma</p>
      </div>
      <div class="cr-card" v-if="stats.inativos">
        <p class="cr-card-label">Inativos na turma</p>
        <p class="cr-card-value">{{ stats.inativos }}</p>
        <p class="cr-card-sub">{{ soActivos ? 'escondidos da lista' : 'incluídos na lista' }}</p>
      </div>
    </div>

    <!-- ── Tabs ─────────────────────────────────────────────────────── -->
    <div class="cr-tabs-bar">
      <div class="cr-tabs">
        <button class="cr-tab" :class="{ active: tab === 'turmas' }" @click="tab = 'turmas'">Turmas <span>{{ turmasFiltradas.length }}</span></button>
        <button class="cr-tab" :class="{ active: tab === 'catequistas' }" @click="tab = 'catequistas'">Catequistas <span>{{ catequistasFiltrados.length }}</span></button>
        <button class="cr-tab" :class="{ active: tab === 'catecumenos' }" @click="tab = 'catecumenos'">Catecúmenos <span>{{ catecumenosFiltrados.length }}</span></button>
      </div>
      <div style="flex:1"></div>
      <button v-if="tab === 'catequistas'" class="cr-btn" @click="copiarContactos">📋 Copiar contactos</button>
      <button v-if="tab === 'catecumenos'" class="cr-btn" @click="copiarEncarregados">📋 Copiar contactos dos encarregados</button>
      <button class="cr-btn" @click="exportar">⬇ Exportar CSV</button>
    </div>

    <!-- ── Turmas ───────────────────────────────────────────────────── -->
    <div v-if="tab === 'turmas'" class="cr-turmas">
      <div v-if="!turmasFiltradas.length" class="cr-empty">Nenhuma turma encontrada.</div>
      <div v-for="t in turmasFiltradas" :key="t.name" class="cr-turma" :class="{ inactiva: t.status === 'Inactivo' }">
        <div class="cr-turma-head">
          <div>
            <a :href="slug('turma', t.name)" class="cr-turma-nome">{{ t.name }}</a>
            <span v-if="t.status === 'Inactivo'" class="cr-badge cr-badge-grey">Inactiva</span>
            <p class="cr-turma-meta">
              <span class="cr-badge">{{ t.fase || 'Sem fase' }}</span>
              <span v-if="t.dia || t.hora">🕘 {{ [t.dia, t.hora].filter(Boolean).join(' · ') }}</span>
              <span v-if="t.local">📍 {{ t.local }}</span>
            </p>
          </div>
          <div class="cr-turma-count">
            <b>{{ t.activos }}</b><span>catecúmenos</span>
          </div>
        </div>

        <div class="cr-turma-cats">
          <div v-for="p in t.pessoas" :key="p.papel + p.nome" class="cr-pessoa">
            <span class="cr-papel">{{ p.papel }}</span>
            <a v-if="p.link" :href="p.link" class="cr-pessoa-nome">{{ p.nome }}</a>
            <span v-else class="cr-pessoa-nome">{{ p.nome }}</span>
            <template v-if="p.contacto">
              <a :href="telLink(p.contacto)" class="cr-phone">{{ p.contacto }}</a>
              <a :href="waLink(p.contacto)" target="_blank" class="cr-wa" title="WhatsApp">WA</a>
            </template>
            <span v-else class="cr-muted">sem contacto</span>
          </div>
          <div v-if="!t.pessoas.length" class="cr-muted">Sem catequista atribuído</div>
        </div>

        <div class="cr-turma-foot">
          <span>{{ t.f }} F · {{ t.m }} M</span>
          <span>Fichas {{ t.fichas }}/{{ t.activos }}</span>
          <span v-if="t.inativos">{{ t.inativos }} inativos</span>
          <div style="flex:1"></div>
          <button class="cr-link-btn" @click="toggleTurma(t.name)">
            {{ abertas.includes(t.name) ? 'Esconder catecúmenos ▲' : 'Ver catecúmenos ▼' }}
          </button>
        </div>

        <table v-if="abertas.includes(t.name)" class="cr-table cr-table-inner">
          <thead><tr><th>Nome</th><th>Idade</th><th>Encarregado</th><th>Contacto</th><th>Faltas</th><th>Ficha</th></tr></thead>
          <tbody>
            <tr v-for="c in catsDaTurma(t.name)" :key="c.catecumeno" :class="{ inativo: !isActivo(c) }">
              <td><a :href="slug('catecumeno', c.catecumeno)">{{ c.nome }}</a></td>
              <td>{{ c.idade || '—' }}</td>
              <td>{{ c.encarregado || '—' }}</td>
              <td>
                <template v-if="c.contacto">
                  <a :href="telLink(c.contacto)" class="cr-phone">{{ c.contacto }}</a>
                  <a :href="waLink(c.contacto)" target="_blank" class="cr-wa">WA</a>
                </template>
                <span v-else class="cr-muted">—</span>
              </td>
              <td>{{ c.nr_de_faltas || 0 }}</td>
              <td>{{ c.ficha_de_catecumeno ? '✔' : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Catequistas ──────────────────────────────────────────────── -->
    <div v-if="tab === 'catequistas'" class="cr-table-wrap">
      <div v-if="!catequistasFiltrados.length" class="cr-empty">Nenhum catequista encontrado.</div>
      <table v-else class="cr-table">
        <thead><tr><th>Catequista</th><th>Contacto</th><th>Turmas</th><th>Catecúmenos</th><th>Núcleo</th><th>Email</th></tr></thead>
        <tbody>
          <tr v-for="q in catequistasFiltrados" :key="q.nome" :class="{ inativo: q.status === 'Inactivo' }">
            <td>
              <a v-if="q.link" :href="q.link">{{ q.nome }}</a><span v-else>{{ q.nome }}</span>
              <span v-if="q.status === 'Inactivo'" class="cr-badge cr-badge-grey">Inactivo</span>
            </td>
            <td>
              <div v-for="n in q.contactos" :key="n">
                <a :href="telLink(n)" class="cr-phone">{{ n }}</a>
                <a :href="waLink(n)" target="_blank" class="cr-wa">WA</a>
              </div>
              <span v-if="!q.contactos.length" class="cr-muted">—</span>
            </td>
            <td>
              <div v-for="t in q.turmas" :key="t.name" class="cr-small">
                <a :href="slug('turma', t.name)">{{ t.name }}</a>
                <span class="cr-muted"> ({{ t.papel }})</span>
              </div>
            </td>
            <td>{{ q.catecumenos }}</td>
            <td>{{ q.nucleo || '—' }}</td>
            <td><a v-if="q.email" :href="'mailto:' + q.email">{{ q.email }}</a><span v-else class="cr-muted">—</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Catecúmenos ──────────────────────────────────────────────── -->
    <div v-if="tab === 'catecumenos'" class="cr-table-wrap">
      <div v-if="!catecumenosFiltrados.length" class="cr-empty">Nenhum catecúmeno encontrado.</div>
      <table v-else class="cr-table">
        <thead>
          <tr>
            <th class="cr-sortable" @click="ordenar('nome')">Nome {{ seta('nome') }}</th>
            <th class="cr-sortable" @click="ordenar('turma')">Turma {{ seta('turma') }}</th>
            <th class="cr-sortable" @click="ordenar('idade')">Idade {{ seta('idade') }}</th>
            <th>Sexo</th>
            <th>Encarregado</th>
            <th>Contacto</th>
            <th>Padrinhos</th>
            <th class="cr-sortable" @click="ordenar('nr_de_faltas')">Faltas {{ seta('nr_de_faltas') }}</th>
            <th>Ficha</th>
            <th title="Baptismo · Eucaristia · Crisma">Sacr.</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in catecumenosOrdenados" :key="c.turma + c.catecumeno" :class="{ inativo: !isActivo(c) }">
            <td>
              <a :href="slug('catecumeno', c.catecumeno)">{{ c.nome }}</a>
              <span v-if="!isActivo(c)" class="cr-badge cr-badge-grey">Inativo</span>
              <span v-if="c.comunidade === 'Santa Ana'" class="cr-badge">Santa Ana</span>
            </td>
            <td class="cr-small"><a :href="slug('turma', c.turma)">{{ c.turma }}</a></td>
            <td>{{ c.idade || '—' }}</td>
            <td>{{ c.sexo ? c.sexo[0] : '—' }}</td>
            <td>{{ c.encarregado || '—' }}</td>
            <td>
              <template v-if="c.contacto">
                <a :href="telLink(c.contacto)" class="cr-phone">{{ c.contacto }}</a>
                <a :href="waLink(c.contacto)" target="_blank" class="cr-wa">WA</a>
              </template>
              <span v-else class="cr-muted">—</span>
            </td>
            <td class="cr-small">
              {{ c.padrinhos || '—' }}
              <a v-if="c.contacto_padrinhos" :href="telLink(c.contacto_padrinhos)" class="cr-phone">{{ c.contacto_padrinhos }}</a>
            </td>
            <td>{{ c.nr_de_faltas || 0 }}</td>
            <td>{{ c.ficha_de_catecumeno ? '✔' : '—' }}</td>
            <td class="cr-sacr">
              <span :class="{ on: c.baptismo }">B</span><span :class="{ on: c.eucaristia }">E</span><span :class="{ on: c.crisma }">C</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </template>
</div>
`,

    setup() {
      const anos = ref([]);
      const ano = ref('');
      const loading = ref(true);
      const dados = ref({ fases: [], turmas: [], catecumenos: [], catequistas: [] });

      const selFases = ref([]);
      const search = ref('');
      const soActivos = ref(true);
      const tab = ref('turmas');
      const abertas = ref([]);
      const sortKey = ref('nome');
      const sortAsc = ref(true);

      // ── Carregamento ──────────────────────────────────────────────────────
      async function load() {
        loading.value = true;
        abertas.value = [];
        try {
          dados.value = await api('get_dados', { ano_lectivo: ano.value });
          const existentes = new Set(dados.value.turmas.map((t) => t.fase));
          selFases.value = selFases.value.filter((f) => existentes.has(f));
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
      const catequistaPorNome = computed(() => {
        const m = {};
        dados.value.catequistas.forEach((q) => { m[q.name] = q; });
        return m;
      });

      const catsPorTurma = computed(() => {
        const m = {};
        dados.value.catecumenos.forEach((c) => { (m[c.turma] = m[c.turma] || []).push(c); });
        return m;
      });

      const turmaPorNome = computed(() => {
        const m = {};
        dados.value.turmas.forEach((t) => { m[t.name] = t; });
        return m;
      });

      // ── Fases ─────────────────────────────────────────────────────────────
      const fasesComTurmas = computed(() => {
        const n = {};
        dados.value.turmas.forEach((t) => {
          const k = t.fase || 'Sem fase';
          n[k] = (n[k] || 0) + (catsPorTurma.value[t.name] || []).filter(isActivo).length;
        });
        const lista = dados.value.fases.filter((f) => f.name in n).map((f) => ({ ...f, n: n[f.name] }));
        if ('Sem fase' in n) lista.push({ name: 'Sem fase', n: n['Sem fase'] });
        return lista;
      });

      const totalActivos = computed(() => dados.value.catecumenos.filter(isActivo).length);

      function toggleFase(nome, ev) {
        const multi = ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey);
        if (!multi) {
          selFases.value = selFases.value.length === 1 && selFases.value[0] === nome ? [] : [nome];
          return;
        }
        const i = selFases.value.indexOf(nome);
        if (i >= 0) selFases.value.splice(i, 1); else selFases.value.push(nome);
      }

      // ── Selecção ──────────────────────────────────────────────────────────
      const turmasSel = computed(() => dados.value.turmas.filter(
        (t) => !selFases.value.length || selFases.value.includes(t.fase || 'Sem fase')
      ));

      function pessoasDaTurma(t) {
        const out = [];
        const add = (nome, papel, contactoTurma) => {
          if (!nome) return;
          const q = catequistaPorNome.value[nome];
          out.push({
            nome: (q && q.nome_completo) || nome,
            papel,
            contacto: (q && (q.contacto_1 || q.contacto_2)) || contactoTurma || '',
            link: q ? slug('catequista', q.name) : null,
          });
        };
        add(t.catequista, 'Responsável', t.contacto);
        add(t.catequista_adj, 'Adjunto', t.contacto_adj);
        // Campo de texto livre "Catequistas" — só quando não há ligações
        if (!out.length && t.catequistas) {
          out.push({ nome: t.catequistas, papel: 'Catequistas', contacto: t.contacto || '', link: null });
        }
        return out;
      }

      const turmasDetalhe = computed(() => turmasSel.value.map((t) => {
        const todos = catsPorTurma.value[t.name] || [];
        const act = todos.filter(isActivo);
        return {
          ...t,
          pessoas: pessoasDaTurma(t),
          activos: act.length,
          inativos: todos.length - act.length,
          f: act.filter((c) => c.sexo === 'Feminino').length,
          m: act.filter((c) => c.sexo === 'Masculino').length,
          fichas: act.filter((c) => c.ficha_de_catecumeno).length,
        };
      }));

      const catecumenosSel = computed(() => {
        const nomes = new Set(turmasSel.value.map((t) => t.name));
        return dados.value.catecumenos.filter((c) => nomes.has(c.turma) && (!soActivos.value || isActivo(c)));
      });

      const catequistasSel = computed(() => {
        const m = {};
        turmasDetalhe.value.forEach((t) => {
          const add = (nome, papel) => {
            if (!nome) return;
            const q = catequistaPorNome.value[nome] || {};
            const k = nome;
            if (!m[k]) {
              const contactos = [q.contacto_1, q.contacto_2].filter(Boolean);
              m[k] = {
                nome: q.nome_completo || nome,
                link: q.name ? slug('catequista', q.name) : null,
                status: q.status,
                contactos,
                email: q.email,
                nucleo: q.nucleo,
                turmas: [],
                catecumenos: 0,
              };
            }
            m[k].turmas.push({ name: t.name, papel });
            m[k].catecumenos += t.activos;
            // contacto guardado só na turma
            const ct = papel === 'Responsável' ? t.contacto : t.contacto_adj;
            if (!m[k].contactos.length && ct) m[k].contactos.push(ct);
          };
          add(t.catequista, 'Responsável');
          add(t.catequista_adj, 'Adjunto');
        });
        return Object.values(m).sort((a, b) => a.nome.localeCompare(b.nome));
      });

      // ── Pesquisa ──────────────────────────────────────────────────────────
      const q = computed(() => norm(search.value.trim()));
      const has = (...vals) => vals.some((v) => norm(v).includes(q.value));

      const turmasFiltradas = computed(() => !q.value ? turmasDetalhe.value : turmasDetalhe.value.filter(
        (t) => has(t.name, t.local, ...t.pessoas.map((p) => p.nome + ' ' + p.contacto))
          || (catsPorTurma.value[t.name] || []).some((c) => has(c.nome))
      ));

      const catequistasFiltrados = computed(() => !q.value ? catequistasSel.value : catequistasSel.value.filter(
        (x) => has(x.nome, x.nucleo, x.email, ...x.contactos, ...x.turmas.map((t) => t.name))
      ));

      const catecumenosFiltrados = computed(() => !q.value ? catecumenosSel.value : catecumenosSel.value.filter(
        (c) => has(c.nome, c.turma, c.encarregado, c.contacto, c.padrinhos)
      ));

      const catecumenosOrdenados = computed(() => {
        const k = sortKey.value;
        const dir = sortAsc.value ? 1 : -1;
        return [...catecumenosFiltrados.value].sort((a, b) => {
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

      // ── Resumo ────────────────────────────────────────────────────────────
      const stats = computed(() => {
        const nomes = new Set(turmasSel.value.map((t) => t.name));
        const todos = dados.value.catecumenos.filter((c) => nomes.has(c.turma));
        const act = todos.filter(isActivo);
        const n = act.length;
        const f = act.filter((c) => c.sexo === 'Feminino').length;
        const m = act.filter((c) => c.sexo === 'Masculino').length;
        const fichas = act.filter((c) => c.ficha_de_catecumeno).length;
        const nq = catequistasSel.value.length;
        const nt = turmasSel.value.length;
        return {
          catecumenos: n, f, m, semSexo: n - f - m,
          fichas, fichasPct: n ? Math.round((100 * fichas) / n) : 0,
          inativos: todos.length - n,
          mediaTurma: nt ? Math.round(n / nt) : 0,
          racio: nq ? Math.round(n / nq) : '—',
          bap: act.filter((c) => c.baptismo).length,
          euc: act.filter((c) => c.eucaristia).length,
          cri: act.filter((c) => c.crisma).length,
        };
      });

      // ── Acções ────────────────────────────────────────────────────────────
      function toggleTurma(nome) {
        const i = abertas.value.indexOf(nome);
        if (i >= 0) abertas.value.splice(i, 1); else abertas.value.push(nome);
      }

      function catsDaTurma(nome) {
        return (catsPorTurma.value[nome] || [])
          .filter((c) => !soActivos.value || isActivo(c))
          .sort((a, b) => a.nome.localeCompare(b.nome));
      }

      function copiar(texto, n) {
        frappe.utils.copy_to_clipboard(texto);
        frappe.show_alert({ message: __('{0} contactos copiados', [n]), indicator: 'green' });
      }

      function copiarContactos() {
        const linhas = catequistasFiltrados.value.map(
          (x) => `${x.nome} — ${x.contactos.join(' / ') || 'sem contacto'} (${x.turmas.map((t) => t.name).join(', ')})`
        );
        copiar(linhas.join('\n'), linhas.length);
      }

      function copiarEncarregados() {
        const linhas = catecumenosFiltrados.value.filter((c) => c.contacto).map(
          (c) => `${c.nome} — ${c.encarregado || 'Encarregado'}: ${c.contacto} (${c.turma})`
        );
        copiar(linhas.join('\n'), linhas.length);
      }

      function exportar() {
        const sufixo = (selFases.value.length ? selFases.value.join('+') : 'todas') + `-${ano.value}`;
        if (tab.value === 'turmas') {
          downloadCSV(`turmas-${sufixo}.csv`, [
            ['Turma', 'Fase', 'Estado', 'Dia', 'Hora', 'Local', 'Responsável', 'Contacto', 'Adjunto', 'Contacto adj.', 'Catecúmenos', 'F', 'M', 'Fichas'],
            ...turmasFiltradas.value.map((t) => {
              const r = t.pessoas.find((p) => p.papel === 'Responsável') || t.pessoas[0] || {};
              const a = t.pessoas.find((p) => p.papel === 'Adjunto') || {};
              return [t.name, t.fase, t.status, t.dia, t.hora, t.local, r.nome, r.contacto, a.nome, a.contacto, t.activos, t.f, t.m, t.fichas];
            }),
          ]);
        } else if (tab.value === 'catequistas') {
          downloadCSV(`catequistas-${sufixo}.csv`, [
            ['Catequista', 'Contactos', 'Turmas', 'Catecúmenos', 'Núcleo', 'Email', 'Estado'],
            ...catequistasFiltrados.value.map((x) => [
              x.nome, x.contactos.join(' / '), x.turmas.map((t) => `${t.name} (${t.papel})`).join(', '),
              x.catecumenos, x.nucleo, x.email, x.status,
            ]),
          ]);
        } else {
          downloadCSV(`catecumenos-${sufixo}.csv`, [
            ['Nome', 'Turma', 'Fase', 'Estado', 'Idade', 'Sexo', 'Encarregado', 'Contacto', 'Padrinhos', 'Contacto padrinhos', 'Faltas', 'Ficha', 'Baptismo', 'Eucaristia', 'Crisma', 'Comunidade'],
            ...catecumenosOrdenados.value.map((c) => [
              c.nome, c.turma, (turmaPorNome.value[c.turma] || {}).fase, c.estado, c.idade, c.sexo,
              c.encarregado, c.contacto, c.padrinhos, c.contacto_padrinhos, c.nr_de_faltas || 0,
              c.ficha_de_catecumeno ? 'Sim' : 'Não', c.baptismo ? 'Sim' : 'Não',
              c.eucaristia ? 'Sim' : 'Não', c.crisma ? 'Sim' : 'Não', c.comunidade,
            ]),
          ]);
        }
      }

      return {
        anos, ano, loading, load, selFases, search, soActivos, tab, abertas,
        fasesComTurmas, totalActivos, toggleFase, turmasSel, catequistasSel, stats,
        turmasFiltradas, catequistasFiltrados, catecumenosFiltrados, catecumenosOrdenados,
        ordenar, seta, toggleTurma, catsDaTurma, copiarContactos, copiarEncarregados, exportar,
        telLink, waLink, slug, isActivo,
      };
    },
  });
}

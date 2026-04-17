/* global frappe, Vue */
// Despesas da Catequese — Vue 3 CDN, no build step

frappe.pages['despesas-catequese'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Despesas da Catequese'),
    single_column: true,
  });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    createDespesasApp().mount(mount);
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
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const FONTES          = ['Quotas', 'Fichas', 'Inscrição', 'Donativo', 'Subsídio Paroquial', 'Outro'];
const RECEITA_FONTES  = ['Fichas', 'Inscrição', 'Donativo', 'Subsídio Paroquial', 'Outro'];
const CATEGORIAS      = ['Material Didáctico', 'Transportes', 'Actividades', 'Alimentação', 'Comunicação', 'Outro'];

const FONTE_COLOR = {
  'Quotas':             '#6366f1',
  'Fichas':             '#10b981',
  'Inscrição':          '#8b5cf6',
  'Donativo':           '#f59e0b',
  'Subsídio Paroquial': '#0ea5e9',
  'Outro':              '#6b7280',
};

const RECEITA_FONTE_COLOR = {
  'Fichas':             '#10b981',
  'Inscrição':          '#8b5cf6',
  'Donativo':           '#f59e0b',
  'Subsídio Paroquial': '#0ea5e9',
  'Outro':              '#6b7280',
};

function fonteColor(fonte)        { return FONTE_COLOR[fonte]        || '#6b7280'; }
function receitaFonteColor(fonte) { return RECEITA_FONTE_COLOR[fonte] || '#6b7280'; }

function api(method, args) {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: `portal.catequista.page.despesas_catequese.despesas_catequese.${method}`,
      args,
      callback: (r) => { if (r.exc) reject(new Error(r.exc)); else resolve(r.message); },
      error: reject,
    });
  });
}

const EMPTY_FORM = () => ({
  name: null, descricao: '', fonte: 'Quotas', ano_lectivo: '',
  data: '', valor: '', categoria: '', actividade: '', notas: '',
});

const EMPTY_RECEITA_FORM = () => ({
  name: null, descricao: '', fonte: 'Fichas', ano_lectivo: '',
  data: '', valor: '', notas: '',
});

function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' MT';
}
function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).split('-');
  return `${day}/${m}/${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
function createDespesasApp() {
  const { createApp, ref, computed, reactive, nextTick } = Vue;

  return createApp({
    template: `
<div id="despesas-app">

  <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
  <div class="de-toolbar">
    <h1>💰 Despesas da Catequese</h1>
    <select v-model="selectedAno" @change="loadAll" class="de-select" title="Ano lectivo">
      <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
    </select>
    <div class="de-tabs">
      <button class="de-tab-btn" :class="{ active: activeTab === 'despesas' }" @click="activeTab = 'despesas'">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>
        Despesas
      </button>
      <button class="de-tab-btn" :class="{ active: activeTab === 'receitas' }" @click="activeTab = 'receitas'">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
        Receitas
      </button>
    </div>
    <div style="flex:1"></div>
    <button class="de-btn de-btn-primary de-btn-sm" @click="activeTab === 'despesas' ? openNew() : openNewReceita()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      {{ activeTab === 'despesas' ? 'Nova despesa' : 'Nova receita' }}
    </button>
  </div>

  <!-- ── Filter bar ──────────────────────────────────────────────────── -->
  <div class="de-filter-bar">
    <template v-if="activeTab === 'despesas'">
      <select v-model="filterFonte" class="de-select" title="Filtrar por fonte">
        <option value="">Todas as fontes</option>
        <option v-for="f in FONTES" :key="f" :value="f">{{ f }}</option>
      </select>
      <select v-model="filterCategoria" class="de-select" title="Filtrar por categoria">
        <option value="">Todas as categorias</option>
        <option v-for="c in CATEGORIAS" :key="c" :value="c">{{ c }}</option>
      </select>
    </template>
    <template v-else>
      <select v-model="filterReceitaFonte" class="de-select" title="Filtrar por fonte">
        <option value="">Todas as fontes</option>
        <option v-for="f in RECEITA_FONTES" :key="f" :value="f">{{ f }}</option>
      </select>
    </template>
    <div class="de-search-wrap">
      <svg class="de-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="de-search-input" v-model="search" placeholder="Pesquisar…" @keydown.escape="clearSearch">
      <button v-if="search" class="de-search-clear" @click="clearSearch">✕</button>
    </div>
  </div>

  <!-- ── Loading ──────────────────────────────────────────────────────── -->
  <div v-if="loading" class="de-loading">
    <div class="de-spinner"></div> A carregar…
  </div>

  <template v-else>

    <!-- ── Summary cards ──────────────────────────────────────────────── -->
    <div class="de-summary-grid">
      <div class="de-stat-card">
        <div class="de-stat-icon de-stat-icon-blue">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M22 10H2"/></svg>
        </div>
        <div>
          <p class="de-stat-label">Quotas arrecadadas</p>
          <p class="de-stat-value">{{ fmt(resumo.total_quotas || 0) }}</p>
          <p class="de-stat-sub">fundo base</p>
        </div>
      </div>
      <div class="de-stat-card">
        <div class="de-stat-icon de-stat-icon-amber">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 18 23 18 23 12"/></svg>
        </div>
        <div>
          <p class="de-stat-label">Outras receitas</p>
          <p class="de-stat-value">{{ fmt(resumo.total_outras_receitas || 0) }}</p>
          <p v-if="receitasDetalhes" class="de-stat-sub">{{ receitasDetalhes }}</p>
          <p v-else class="de-stat-sub">fichas, inscrições…</p>
        </div>
      </div>
      <div class="de-stat-card">
        <div class="de-stat-icon de-stat-icon-red">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 6 23 6 23 12"/></svg>
        </div>
        <div>
          <p class="de-stat-label">Total despesas</p>
          <p class="de-stat-value">{{ fmt(resumo.total_despesas || 0) }}</p>
          <p class="de-stat-sub">gastos totais</p>
        </div>
      </div>
    </div>

    <!-- ── Por Fundo breakdown ───────────────────────────────────────── -->
    <div v-if="resumo.por_fundo && resumo.por_fundo.length" class="de-fundo-section">
      <button class="de-fundo-toggle" @click="porFundoOpen = !porFundoOpen">
        <svg :style="porFundoOpen ? 'transform:rotate(0deg)' : 'transform:rotate(-90deg)'" style="transition:transform 0.2s;flex-shrink:0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        Por Fundo
        <span class="de-fundo-count">{{ resumo.por_fundo.length }} fundo{{ resumo.por_fundo.length !== 1 ? 's' : '' }}</span>
      </button>
      <div v-if="porFundoOpen" class="de-fundo-table-wrap">
        <table class="de-fundo-table">
          <thead>
            <tr>
              <th>Fundo</th>
              <th style="text-align:right">Entrada</th>
              <th style="text-align:right">Saída</th>
              <th style="text-align:right">Líquido</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in resumo.por_fundo" :key="f.fonte">
              <td><span class="de-fonte-tag" :style="fonteTagStyle(f.fonte)">{{ f.fonte }}</span></td>
              <td class="de-fundo-num de-fundo-entrada">{{ f.entrada > 0 ? fmt(f.entrada) : '—' }}</td>
              <td class="de-fundo-num de-fundo-saida">{{ f.saida > 0 ? fmt(f.saida) : '—' }}</td>
              <td class="de-fundo-num" :class="f.liquido >= 0 ? 'de-val-pos' : 'de-val-neg'">
                {{ (f.liquido > 0 ? '+' : '') + fmt(f.liquido) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Category breakdown (despesas only) ────────────────────────── -->
    <div v-if="activeTab === 'despesas' && Object.keys(resumo.por_categoria || {}).length" class="de-breakdown">
      <span class="de-breakdown-label">Por categoria:</span>
      <span
        v-for="(val, cat) in resumo.por_categoria" :key="cat"
        class="de-cat-pill"
      >{{ cat }}: {{ fmt(val) }}</span>
    </div>

    <!-- ── Empty state ────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'despesas' ? filteredDespesas.length === 0 : filteredReceitas.length === 0" class="de-empty">
      <div style="font-size:2.6rem;margin-bottom:12px">{{ activeTab === 'despesas' ? '🧾' : '💵' }}</div>
      <div style="font-weight:600;color:#374151;margin-bottom:6px">
        {{ activeTab === 'despesas' ? 'Nenhuma despesa encontrada' : 'Nenhuma receita encontrada' }}
      </div>
      <div style="color:#9ca3af;font-size:0.85rem">
        {{ hasFilters
          ? 'Tente outros filtros'
          : (activeTab === 'despesas'
              ? 'Clique em "Nova despesa" para registar a primeira'
              : 'Clique em "Nova receita" para registar a primeira') }}
      </div>
    </div>

    <!-- ── Despesas table ─────────────────────────────────────────────── -->
    <div v-else-if="activeTab === 'despesas'" class="de-table-wrap">
      <table class="de-table">
        <thead>
          <tr>
            <th style="width:96px">Data</th>
            <th>Descrição</th>
            <th style="width:155px">Categoria</th>
            <th style="width:145px">Fonte</th>
            <th style="width:170px">Actividade</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:48px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in filteredDespesas" :key="d.name" class="de-row" @click="openEdit(d)">
            <td class="de-date">{{ formatDate(d.data) }}</td>
            <td class="de-desc">{{ d.descricao }}</td>
            <td>
              <span v-if="d.categoria" class="de-cat-tag">{{ d.categoria }}</span>
              <span v-else class="de-empty-val">—</span>
            </td>
            <td>
              <span class="de-fonte-tag" :style="fonteTagStyle(d.fonte)">{{ d.fonte }}</span>
            </td>
            <td class="de-act-cell">{{ d.actividade || '—' }}</td>
            <td class="de-valor">{{ fmt(d.valor) }}</td>
            <td @click.stop>
              <button class="de-del-btn" @click="confirmAndDelete(d)" title="Eliminar">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </td>
          </tr>
          <tr class="de-total-row">
            <td colspan="5" class="de-total-label">
              {{ filteredDespesas.length }} despesa{{ filteredDespesas.length !== 1 ? 's' : '' }}
              <span v-if="hasFilters" style="color:#a3a3a3"> (filtradas)</span>
            </td>
            <td class="de-total-valor">{{ fmt(filteredTotal) }}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Receitas table ─────────────────────────────────────────────── -->
    <div v-else class="de-table-wrap">
      <table class="de-table">
        <thead>
          <tr>
            <th style="width:96px">Data</th>
            <th>Descrição</th>
            <th style="width:160px">Fonte</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:48px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredReceitas" :key="r.name" class="de-row" @click="openEditReceita(r)">
            <td class="de-date">{{ formatDate(r.data) }}</td>
            <td class="de-desc">{{ r.descricao }}</td>
            <td>
              <span class="de-fonte-tag" :style="receitaFonteTagStyle(r.fonte)">{{ r.fonte }}</span>
            </td>
            <td class="de-valor de-val-pos">{{ fmt(r.valor) }}</td>
            <td @click.stop>
              <button class="de-del-btn" @click="confirmAndDeleteReceita(r)" title="Eliminar">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </td>
          </tr>
          <tr class="de-total-row">
            <td colspan="3" class="de-total-label">
              {{ filteredReceitas.length }} receita{{ filteredReceitas.length !== 1 ? 's' : '' }}
              <span v-if="filterReceitaFonte || search" style="color:#a3a3a3"> (filtradas)</span>
            </td>
            <td class="de-total-valor de-val-pos">{{ fmt(receitaTotal) }}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

  </template>

  <!-- ── Overlay ──────────────────────────────────────────────────────── -->
  <div class="de-overlay" :class="{ open: panelOpen }" @click="closePanel"></div>

  <!-- ── Side panel ───────────────────────────────────────────────────── -->
  <div class="de-panel" :class="{ open: panelOpen }">
    <div class="de-panel-header">
      <h2>{{ panelTitle }}</h2>
      <button class="de-panel-close" @click="closePanel">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- ── Despesa form ────────────────────────────────────────────────── -->
    <div v-if="panelMode === 'despesa'" class="de-panel-body">
      <div class="de-field">
        <label>Descrição <span class="de-req">*</span></label>
        <input v-model="form.descricao" type="text" placeholder="O que foi pago / comprado" ref="inputDescricao">
      </div>

      <div class="de-field-row">
        <div class="de-field">
          <label>Valor <span class="de-req">*</span></label>
          <input v-model="form.valor" type="number" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="de-field">
          <label>Data <span class="de-req">*</span></label>
          <input v-model="form.data" type="date">
        </div>
      </div>

      <div class="de-field-row">
        <div class="de-field">
          <label>Fonte <span class="de-req">*</span></label>
          <select v-model="form.fonte">
            <option v-for="f in FONTES" :key="f" :value="f">{{ f }}</option>
          </select>
        </div>
        <div class="de-field">
          <label>Categoria</label>
          <select v-model="form.categoria">
            <option value="">— Sem categoria —</option>
            <option v-for="c in CATEGORIAS" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>

      <div class="de-field">
        <label>Actividade do Plano</label>
        <input
          v-model="form.actividade"
          type="text"
          list="de-actividades-list"
          placeholder="Actividade relacionada (opcional)"
          autocomplete="off"
        >
        <datalist id="de-actividades-list">
          <option v-for="a in actividadesOpts" :key="a.name" :value="a.name">{{ a.actividade }}</option>
        </datalist>
      </div>

      <div class="de-field">
        <label>Ano Lectivo</label>
        <select v-model="form.ano_lectivo">
          <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>

      <div class="de-field">
        <label>Notas</label>
        <textarea v-model="form.notas" rows="3" placeholder="Nº de recibo, fornecedor, observações…"></textarea>
      </div>

      <template v-if="form.name">
        <div class="de-section-divider"></div>
        <div v-if="!confirmDelete" style="display:flex;justify-content:center">
          <button class="de-btn de-btn-danger" @click="startDelete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            Eliminar despesa
          </button>
        </div>
        <div v-else class="de-delete-zone">
          <p class="de-delete-title">Confirmar eliminação?</p>
          <p class="de-delete-desc">Esta acção é permanente e não pode ser desfeita.</p>
          <div class="de-delete-actions">
            <button class="de-btn de-btn-danger" @click="deleteNow" :disabled="saving">Sim, eliminar</button>
            <button class="de-btn de-btn-secondary" @click="cancelDelete">Cancelar</button>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Receita form ────────────────────────────────────────────────── -->
    <div v-else-if="panelMode === 'receita'" class="de-panel-body">
      <div class="de-field">
        <label>Descrição <span class="de-req">*</span></label>
        <input v-model="receitaForm.descricao" type="text" placeholder="Ex: Fichas do 1º período" ref="inputReceitaDescricao">
      </div>

      <div class="de-field-row">
        <div class="de-field">
          <label>Valor <span class="de-req">*</span></label>
          <input v-model="receitaForm.valor" type="number" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="de-field">
          <label>Data <span class="de-req">*</span></label>
          <input v-model="receitaForm.data" type="date">
        </div>
      </div>

      <div class="de-field-row">
        <div class="de-field">
          <label>Fonte <span class="de-req">*</span></label>
          <select v-model="receitaForm.fonte">
            <option v-for="f in RECEITA_FONTES" :key="f" :value="f">{{ f }}</option>
          </select>
        </div>
        <div class="de-field">
          <label>Ano Lectivo</label>
          <select v-model="receitaForm.ano_lectivo">
            <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
      </div>

      <div class="de-field">
        <label>Notas</label>
        <textarea v-model="receitaForm.notas" rows="3" placeholder="Observações sobre esta receita…"></textarea>
      </div>

      <template v-if="receitaForm.name">
        <div class="de-section-divider"></div>
        <div v-if="!receitaConfirmDelete" style="display:flex;justify-content:center">
          <button class="de-btn de-btn-danger" @click="receitaConfirmDelete = true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            Eliminar receita
          </button>
        </div>
        <div v-else class="de-delete-zone">
          <p class="de-delete-title">Confirmar eliminação?</p>
          <p class="de-delete-desc">Esta acção é permanente e não pode ser desfeita.</p>
          <div class="de-delete-actions">
            <button class="de-btn de-btn-danger" @click="deleteReceita" :disabled="saving">Sim, eliminar</button>
            <button class="de-btn de-btn-secondary" @click="receitaConfirmDelete = false">Cancelar</button>
          </div>
        </div>
      </template>
    </div>

    <div class="de-panel-footer">
      <button class="de-btn de-btn-secondary" @click="closePanel">Cancelar</button>
      <button class="de-btn de-btn-primary" @click="panelMode === 'despesa' ? saveDespesa() : saveReceita()" :disabled="saving">
        <div v-if="saving" class="de-spinner" style="width:13px;height:13px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></div>
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        {{ saving ? 'A guardar…' : saveLabel }}
      </button>
    </div>
  </div>

  <!-- ── Toasts ────────────────────────────────────────────────────────── -->
  <div class="de-toast-container">
    <div v-for="t in toasts" :key="t.id" class="de-toast" :class="t.type">{{ t.msg }}</div>
  </div>

</div>`,

    setup() {
      const loading               = ref(true);
      const saving                = ref(false);
      const anos                  = ref([]);
      const selectedAno           = ref('');
      const despesas              = ref([]);
      const receitas              = ref([]);
      const resumo                = ref({});
      const actividadesOpts       = ref([]);
      const panelOpen             = ref(false);
      const panelMode             = ref('despesa');
      const form                  = reactive(EMPTY_FORM());
      const receitaForm           = reactive(EMPTY_RECEITA_FORM());
      const confirmDelete         = ref(false);
      const receitaConfirmDelete  = ref(false);
      const toasts                = ref([]);
      const search                = ref('');
      const filterFonte           = ref('');
      const filterCategoria       = ref('');
      const filterReceitaFonte    = ref('');
      const activeTab             = ref('despesas');
      const porFundoOpen          = ref(true);
      const inputDescricao        = ref(null);
      const inputReceitaDescricao = ref(null);

      // ── Computed ──────────────────────────────────────────────────────
      const panelTitle = computed(() => {
        if (panelMode.value === 'receita') {
          return receitaForm.name ? 'Editar Receita' : 'Nova Receita';
        }
        return form.name ? 'Editar Despesa' : 'Nova Despesa';
      });

      const saveLabel = computed(() => {
        if (panelMode.value === 'receita') {
          return receitaForm.name ? 'Guardar alterações' : 'Criar receita';
        }
        return form.name ? 'Guardar alterações' : 'Criar despesa';
      });

      const hasFilters = computed(() =>
        filterFonte.value || filterCategoria.value || filterReceitaFonte.value || search.value.trim()
      );

      const filteredDespesas = computed(() => {
        let items = despesas.value;
        const q = search.value.toLowerCase().trim();
        if (q) items = items.filter(d =>
          (d.descricao  || '').toLowerCase().includes(q) ||
          (d.actividade || '').toLowerCase().includes(q) ||
          (d.notas      || '').toLowerCase().includes(q)
        );
        if (filterFonte.value)
          items = items.filter(d => d.fonte === filterFonte.value);
        if (filterCategoria.value)
          items = items.filter(d => d.categoria === filterCategoria.value);
        return items;
      });

      const filteredTotal = computed(() =>
        filteredDespesas.value.reduce((s, d) => s + (d.valor || 0), 0)
      );

      const filteredReceitas = computed(() => {
        let items = receitas.value;
        const q = search.value.toLowerCase().trim();
        if (q) items = items.filter(r =>
          (r.descricao || '').toLowerCase().includes(q) ||
          (r.notas     || '').toLowerCase().includes(q)
        );
        if (filterReceitaFonte.value)
          items = items.filter(r => r.fonte === filterReceitaFonte.value);
        return items;
      });

      const receitaTotal = computed(() =>
        filteredReceitas.value.reduce((s, r) => s + (r.valor || 0), 0)
      );

      const receitasDetalhes = computed(() =>
        Object.entries(resumo.value.por_fonte_receitas || {})
          .map(([f, v]) => `${f}: ${fmt(v)}`)
          .join(' · ')
      );

      // ── Styling helpers ───────────────────────────────────────────────
      function fonteTagStyle(fonte) {
        const c = fonteColor(fonte);
        return { background: c + '1a', color: c, borderColor: c + '40' };
      }
      function receitaFonteTagStyle(fonte) {
        const c = receitaFonteColor(fonte);
        return { background: c + '1a', color: c, borderColor: c + '40' };
      }

      // ── Toast ─────────────────────────────────────────────────────────
      let _toastId = 0;
      function toast(msg, type = 'info') {
        const id = ++_toastId;
        toasts.value.push({ id, msg, type });
        setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3200);
      }

      // ── Despesa panel ─────────────────────────────────────────────────
      function openNew() {
        Object.assign(form, EMPTY_FORM());
        form.ano_lectivo    = selectedAno.value;
        form.data           = frappe.datetime.get_today();
        confirmDelete.value = false;
        panelMode.value     = 'despesa';
        panelOpen.value     = true;
        nextTick(() => inputDescricao.value && inputDescricao.value.focus());
      }

      function openEdit(d) {
        Object.assign(form, {
          name:        d.name,
          descricao:   d.descricao   || '',
          fonte:       d.fonte       || 'Quotas',
          ano_lectivo: d.ano_lectivo || selectedAno.value,
          data:        d.data        || '',
          valor:       d.valor       || '',
          categoria:   d.categoria   || '',
          actividade:  d.actividade  || '',
          notas:       d.notas       || '',
        });
        confirmDelete.value = false;
        panelMode.value     = 'despesa';
        panelOpen.value     = true;
        nextTick(() => inputDescricao.value && inputDescricao.value.focus());
      }

      function startDelete()  { confirmDelete.value = true; }
      function cancelDelete() { confirmDelete.value = false; }

      function confirmAndDelete(d) {
        openEdit(d);
        nextTick(() => { confirmDelete.value = true; });
      }

      // ── Receita panel ─────────────────────────────────────────────────
      function openNewReceita() {
        Object.assign(receitaForm, EMPTY_RECEITA_FORM());
        receitaForm.ano_lectivo        = selectedAno.value;
        receitaForm.data               = frappe.datetime.get_today();
        receitaConfirmDelete.value     = false;
        panelMode.value                = 'receita';
        panelOpen.value                = true;
        nextTick(() => inputReceitaDescricao.value && inputReceitaDescricao.value.focus());
      }

      function openEditReceita(r) {
        Object.assign(receitaForm, {
          name:        r.name,
          descricao:   r.descricao   || '',
          fonte:       r.fonte       || 'Fichas',
          ano_lectivo: r.ano_lectivo || selectedAno.value,
          data:        r.data        || '',
          valor:       r.valor       || '',
          notas:       r.notas       || '',
        });
        receitaConfirmDelete.value = false;
        panelMode.value            = 'receita';
        panelOpen.value            = true;
        nextTick(() => inputReceitaDescricao.value && inputReceitaDescricao.value.focus());
      }

      function confirmAndDeleteReceita(r) {
        openEditReceita(r);
        nextTick(() => { receitaConfirmDelete.value = true; });
      }

      // ── Shared panel close ────────────────────────────────────────────
      function closePanel() {
        panelOpen.value            = false;
        confirmDelete.value        = false;
        receitaConfirmDelete.value = false;
      }
      function clearSearch() { search.value = ''; }

      // ── Despesa save / delete ─────────────────────────────────────────
      async function saveDespesa() {
        if (!form.descricao.trim()) { toast('A descrição é obrigatória', 'error'); return; }
        if (!form.valor)            { toast('O valor é obrigatório', 'error');     return; }
        saving.value = true;
        try {
          const payload = { ...form };
          Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
          let saved;
          if (form.name) {
            saved = await api('update_despesa', { name: form.name, data_json: JSON.stringify(payload) });
            const idx = despesas.value.findIndex(d => d.name === form.name);
            if (idx >= 0) despesas.value.splice(idx, 1, saved);
          } else {
            saved = await api('create_despesa', { data_json: JSON.stringify(payload) });
            despesas.value.unshift(saved);
          }
          await loadResumo();
          toast(form.name ? 'Despesa actualizada' : 'Despesa criada', 'success');
          closePanel();
        } catch (e) {
          toast('Erro ao guardar: ' + e.message, 'error');
        } finally {
          saving.value = false;
        }
      }

      async function deleteNow() {
        if (!form.name) return;
        saving.value = true;
        try {
          await api('delete_despesa', { name: form.name });
          despesas.value = despesas.value.filter(d => d.name !== form.name);
          await loadResumo();
          toast('Despesa eliminada', 'info');
          closePanel();
        } catch (e) {
          toast('Erro ao eliminar: ' + e.message, 'error');
        } finally {
          saving.value = false;
        }
      }

      // ── Receita save / delete ─────────────────────────────────────────
      async function saveReceita() {
        if (!receitaForm.descricao.trim()) { toast('A descrição é obrigatória', 'error'); return; }
        if (!receitaForm.valor)            { toast('O valor é obrigatório', 'error');     return; }
        saving.value = true;
        try {
          const payload = { ...receitaForm };
          Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
          let saved;
          if (receitaForm.name) {
            saved = await api('update_receita', { name: receitaForm.name, data_json: JSON.stringify(payload) });
            const idx = receitas.value.findIndex(r => r.name === receitaForm.name);
            if (idx >= 0) receitas.value.splice(idx, 1, saved);
          } else {
            saved = await api('create_receita', { data_json: JSON.stringify(payload) });
            receitas.value.unshift(saved);
          }
          await loadResumo();
          toast(receitaForm.name ? 'Receita actualizada' : 'Receita criada', 'success');
          closePanel();
        } catch (e) {
          toast('Erro ao guardar: ' + e.message, 'error');
        } finally {
          saving.value = false;
        }
      }

      async function deleteReceita() {
        if (!receitaForm.name) return;
        saving.value = true;
        try {
          await api('delete_receita', { name: receitaForm.name });
          receitas.value = receitas.value.filter(r => r.name !== receitaForm.name);
          await loadResumo();
          toast('Receita eliminada', 'info');
          closePanel();
        } catch (e) {
          toast('Erro ao eliminar: ' + e.message, 'error');
        } finally {
          saving.value = false;
        }
      }

      // ── Data loading ──────────────────────────────────────────────────
      async function loadResumo() {
        if (!selectedAno.value) return;
        try {
          resumo.value = await api('get_resumo_financeiro', { ano_lectivo: selectedAno.value }) || {};
        } catch (_) { /* non-fatal */ }
      }

      async function loadAll() {
        if (!selectedAno.value) return;
        loading.value = true;
        try {
          const [desp, rec, res, acts] = await Promise.all([
            api('get_despesas',          { ano_lectivo: selectedAno.value }),
            api('get_receitas',          { ano_lectivo: selectedAno.value }),
            api('get_resumo_financeiro', { ano_lectivo: selectedAno.value }),
            api('get_actividades_nomes', { ano_lectivo: selectedAno.value }),
          ]);
          despesas.value        = desp || [];
          receitas.value        = rec  || [];
          resumo.value          = res  || {};
          actividadesOpts.value = acts || [];
        } catch (e) {
          toast('Erro ao carregar: ' + e.message, 'error');
        } finally {
          loading.value = false;
        }
      }

      async function init() {
        loading.value = true;
        try {
          const [anosResp, anoAtual] = await Promise.all([
            api('get_anos_lectivos',     {}),
            api('get_ano_lectivo_atual', {}),
          ]);
          anos.value        = anosResp || [];
          selectedAno.value = anoAtual || (anosResp && anosResp[0]) || '';
          if (selectedAno.value) await loadAll();
        } catch (e) {
          toast('Erro ao inicializar: ' + e.message, 'error');
        } finally {
          loading.value = false;
        }
      }

      init();

      return {
        FONTES, RECEITA_FONTES, CATEGORIAS,
        loading, saving, anos, selectedAno,
        despesas, receitas, resumo, actividadesOpts,
        panelOpen, panelMode, panelTitle, saveLabel,
        form, receitaForm, confirmDelete, receitaConfirmDelete, toasts,
        search, filterFonte, filterCategoria, filterReceitaFonte, activeTab, porFundoOpen,
        inputDescricao, inputReceitaDescricao,
        hasFilters, filteredDespesas, filteredTotal, filteredReceitas, receitaTotal,
        receitasDetalhes,
        loadAll, openNew, openEdit, openNewReceita, openEditReceita, closePanel,
        startDelete, cancelDelete, clearSearch, confirmAndDelete, confirmAndDeleteReceita,
        saveDespesa, deleteNow, saveReceita, deleteReceita,
        fmt, formatDate, fonteColor, receitaFonteColor, fonteTagStyle, receitaFonteTagStyle,
      };
    },
  });
}

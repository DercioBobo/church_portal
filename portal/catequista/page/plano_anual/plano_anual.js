/* global frappe, Vue */
// Plano Anual da Catequese — Vue 3 CDN, no build step

frappe.pages['plano-anual'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Plano Anual da Catequese'),
    single_column: true,
  });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    createPlanoAnualApp().mount(mount);
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
const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const ALL_ESTADOS = ['Pendente','Em Progresso','Realizada','Cancelada','Adiada'];
const STATUS_NEXT = {
  'Pendente':     'Em Progresso',
  'Em Progresso': 'Realizada',
  'Realizada':    'Cancelada',
  'Cancelada':    'Adiada',
  'Adiada':       'Pendente',
};
const PALETTE = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha = 0.13) {
  if (!hex || !hex.startsWith('#')) return `rgba(107,114,128,${alpha})`;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function isOverdue(act) {
  if (!act.data || act.estado === 'Realizada' || act.estado === 'Cancelada') return false;
  return act.data < frappe.datetime.get_today();
}
function monthKey(dateStr) { return !dateStr ? '__nodate__' : dateStr.substring(0, 7); }
function monthLabel(key) {
  if (key === '__nodate__') return 'Sem Data Definida';
  const [year, month] = key.split('-');
  return `${MESES_PT[parseInt(month) - 1]} ${year}`;
}
function api(method, args) {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: `portal.catequista.page.plano_anual.plano_anual.${method}`,
      args,
      callback: (r) => { if (r.exc) reject(new Error(r.exc)); else resolve(r.message); },
      error: reject,
    });
  });
}
const EMPTY_FORM = () => ({
  name: null, actividade: '', tipologia: '', estado: 'Pendente',
  ano_lectivo: '', data: '', orador: '', local: '', orcamento: '', notas_execucao: '',
});

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
function createPlanoAnualApp() {
  const { createApp, ref, computed, reactive, nextTick, onMounted, onUnmounted } = Vue;

  return createApp({
    template: `
<div id="plano-anual-app">

  <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
  <div class="pa-toolbar">
    <h1>📅 Plano Anual da Catequese</h1>

    <select v-model="selectedAno" @change="loadActividades" title="Ano lectivo" class="pa-select">
      <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
    </select>

    <select v-model="filterMonth" title="Filtrar por mês" class="pa-select">
      <option value="">Todos os meses</option>
      <option v-for="mk in availableMonths" :key="mk.key" :value="mk.key">{{ mk.label }}</option>
    </select>

    <!-- Search — isolated prominent field -->
    <div class="pa-search-wrap">
      <svg class="pa-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input
        class="pa-search-input"
        type="text"
        v-model="search"
        placeholder="Pesquisar actividade…"
        @keydown.escape="search = ''"
      >
      <button v-if="search" class="pa-search-clear" @click="search = ''" title="Limpar">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div style="flex:1"></div>

    <!-- View toggle -->
    <div class="pa-view-toggle" data-no-print>
      <button class="pa-view-btn" :class="{ active: viewMode==='card' }" @click="viewMode='card'" title="Vista de cartões">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Cartões
      </button>
      <button class="pa-view-btn" :class="{ active: viewMode==='list' }" @click="viewMode='list'" title="Vista de lista">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
        Lista
      </button>
    </div>

    <button class="pa-btn pa-btn-secondary pa-btn-sm" @click="printView" data-no-print>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Imprimir
    </button>

    <button class="pa-btn pa-btn-primary pa-btn-sm" @click="openNewActivity(null)" data-no-print>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Adicionar
    </button>
  </div>

  <!-- ── Filter bar ───────────────────────────────────────────────────── -->
  <div class="pa-filter-bar" v-if="!loading" data-no-print>
    <!-- Estado: single-select chips -->
    <span class="pa-filter-label">Estado</span>
    <span
      class="pa-stat-chip total"
      :class="{ active: !filterStatus }"
      @click="filterStatus = ''"
    >Todos ({{ stats.total }})</span>
    <span
      v-for="s in ALL_ESTADOS" :key="s"
      class="pa-stat-chip"
      :class="[statusChipClass(s), { active: filterStatus === s }]"
      @click="filterStatus = filterStatus === s ? '' : s"
    >{{ s }} <span class="pa-chip-count">({{ stats[s] || 0 }})</span></span>

    <!-- Tipologia: dropdown multi-select -->
    <div class="pa-filter-sep" v-if="tipologias.length"></div>
    <div class="pa-tip-dd" ref="tipDropEl" v-if="tipologias.length">
      <button
        class="pa-tip-dd-btn"
        :class="{ 'has-value': filterTipologias.length }"
        @click.stop="tipDdOpen = !tipDdOpen"
      >
        <span v-if="!filterTipologias.length" style="color:#6b7280">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:4px"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
          Tipologia
        </span>
        <span v-else style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;max-width:220px">
          <span
            v-for="tn in filterTipologias" :key="tn"
            class="pa-tip-tag"
            :style="{ background: hexToRgba(tipologiaMap[tn]?.cor || '#6b7280', 0.15), color: tipologiaMap[tn]?.cor || '#6b7280' }"
          >
            {{ tipologiaMap[tn]?.icone ? tipologiaMap[tn].icone + ' ' : '' }}{{ tn }}
            <span @click.stop="removeTipFilter(tn)" class="pa-tip-tag-x">✕</span>
          </span>
        </span>
        <svg class="pa-tip-dd-caret" :class="{ open: tipDdOpen }" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      <div v-if="tipDdOpen" class="pa-tip-dd-panel" @click.stop>
        <div class="pa-tip-dd-search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="tipSearch" type="text" placeholder="Pesquisar tipologia…" ref="tipSearchInput" @keydown.escape="tipDdOpen = false">
        </div>
        <div class="pa-tip-dd-list">
          <label
            v-for="t in filteredTipDd" :key="t.name"
            class="pa-tip-dd-item"
            :class="{ selected: filterTipologias.includes(t.name) }"
          >
            <input type="checkbox" :value="t.name" v-model="filterTipologias" style="display:none">
            <span class="pa-tip-dd-dot" :style="{ background: t.cor || '#6b7280' }"></span>
            <span class="pa-tip-dd-name">{{ t.icone ? t.icone + ' ' : '' }}{{ t.name }}</span>
            <svg v-if="filterTipologias.includes(t.name)" class="pa-tip-dd-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </label>
          <div v-if="filteredTipDd.length === 0" class="pa-tip-dd-empty">Nenhuma encontrada</div>
        </div>
        <div v-if="filterTipologias.length" class="pa-tip-dd-footer">
          <button @click="filterTipologias = []; tipDdOpen = false">Limpar selecção</button>
        </div>
      </div>
    </div>

    <!-- Clear all filters -->
    <button
      v-if="filterStatus || filterTipologias.length"
      class="pa-clear-filters"
      @click="filterStatus = ''; filterTipologias = []"
    >✕ Limpar</button>
  </div>

  <!-- ── Content ─────────────────────────────────────────────────────── -->
  <div class="pa-timeline">
    <div v-if="loading" class="pa-loading">
      <div class="pa-spinner"></div> A carregar plano…
    </div>

    <div v-else-if="filteredGroups.length === 0" class="pa-loading" style="min-height:220px">
      <div style="text-align:center">
        <div style="font-size:2.8rem;margin-bottom:10px">📋</div>
        <div style="font-weight:600;color:#374151;margin-bottom:6px">Nenhuma actividade encontrada</div>
        <div style="color:#9ca3af;font-size:0.84rem">{{ hasFilters ? 'Tente outros filtros' : 'Adicione a primeira actividade' }}</div>
      </div>
    </div>

    <!-- ── Card view ───────────────────────────────────────────────── -->
    <template v-else-if="viewMode === 'card'">
      <div v-for="group in filteredGroups" :key="group.key" class="pa-month-group">
        <div class="pa-month-header">
          <span class="pa-month-label">{{ group.label }}</span>
          <span class="pa-month-count">{{ group.items.length }} actividade{{ group.items.length !== 1 ? 's' : '' }}</span>
          <div class="pa-month-line"></div>
          <button class="pa-month-add" @click="openNewActivity(group.key)" data-no-print>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Adicionar
          </button>
        </div>

        <div
          class="pa-cards"
          :class="{ 'drag-over': dragOverGroup === group.key }"
          @dragover.prevent="onDragOver(group.key)"
          @dragleave="onDragLeave(group.key)"
          @drop.prevent="onDrop(group.key)"
        >
          <div
            v-for="act in group.items" :key="act.name"
            class="pa-card"
            :class="{ overdue: isOverdue(act), dragging: dragItem === act.name, 'drag-target': dragTarget === act.name }"
            :style="cardStyle(act)"
            draggable="true"
            @dragstart="onDragStart(act, $event)"
            @dragend="onDragEnd"
            @dragover.prevent="dragTarget = act.name"
            @click="openEdit(act)"
          >
            <div class="pa-card-header">
              <span class="pa-card-drag-handle" title="Arrastar" @click.stop>⠿</span>
              <span class="pa-card-title">{{ act.actividade }}</span>
              <span class="pa-card-status" :class="statusClass(act.estado)"
                @click.stop="cycleStatus(act)" title="Clique para avançar estado">{{ act.estado }}</span>
            </div>
            <div class="pa-card-meta">
              <span v-if="act.data" class="pa-card-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {{ formatDate(act.data) }}
                <span v-if="act.data_original" style="color:#f59e0b;margin-left:2px" :title="'Original: '+formatDate(act.data_original)">✎</span>
              </span>
              <span v-if="act.orador" class="pa-card-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                {{ act.orador }}
              </span>
              <span v-if="act.local" class="pa-card-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                {{ truncate(act.local, 28) }}
              </span>
              <span v-if="act.orcamento" class="pa-card-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M22 10H2"/></svg>
                {{ formatCurrency(act.orcamento) }}
              </span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">
              <span v-if="act.tipologia" class="pa-card-tipologia" :style="tipologiaChipStyle(act)">
                {{ act.tipologia_icone ? act.tipologia_icone + ' ' : '' }}{{ act.tipologia }}
              </span>
              <span v-if="isOverdue(act)" class="pa-overdue-tag">⚠ Vencida</span>
            </div>
          </div>
          <div v-if="group.items.length === 0" class="pa-empty">Sem actividades — clique em Adicionar</div>
        </div>
      </div>
    </template>

    <!-- ── List view ───────────────────────────────────────────────── -->
    <template v-else>
      <div class="pa-table-wrap">
        <div class="pa-table-scroll">
        <table class="pa-list-table">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th>Actividade</th>
              <th>Tipologia</th>
              <th style="width:96px">Data</th>
              <th>Orador / Responsável</th>
              <th>Local</th>
              <th style="width:98px">Orçamento</th>
              <th style="width:108px">Estado</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in filteredGroups" :key="group.key">
              <tr class="pa-list-month-row">
                <td :colspan="8">
                  <span class="pa-list-month-label">{{ group.label }}</span>
                  <span class="pa-list-month-meta">{{ group.items.length }} actividade{{ group.items.length !== 1 ? 's' : '' }}</span>
                  <button class="pa-month-add pa-list-month-add" @click="openNewActivity(group.key)" data-no-print>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Adicionar
                  </button>
                </td>
              </tr>
              <tr v-for="(act, i) in group.items" :key="act.name"
                :class="{ 'pa-row-overdue': isOverdue(act) }"
                @click="openEdit(act)">
                <td class="pa-list-num">{{ i + 1 }}</td>
                <td>
                  <span class="pa-list-act-name">{{ act.actividade }}</span>
                  <span v-if="isOverdue(act)" class="pa-list-overdue-tag">⚠ Vencida</span>
                </td>
                <td>
                  <span v-if="act.tipologia" class="pa-list-tip">
                    <span class="pa-list-tip-dot" :style="{ background: tipologiaColor(act) }"></span>
                    {{ act.tipologia_icone ? act.tipologia_icone+' ' : '' }}{{ act.tipologia }}
                  </span>
                  <span v-else class="pa-list-empty-val">—</span>
                </td>
                <td class="pa-list-date">
                  {{ act.data ? formatDate(act.data) : '—' }}
                  <span v-if="act.data_original" style="color:#f59e0b" :title="'Original: '+formatDate(act.data_original)">✎</span>
                </td>
                <td>{{ act.orador || '—' }}</td>
                <td>{{ act.local ? truncate(act.local, 38) : '—' }}</td>
                <td class="pa-list-date">{{ act.orcamento ? formatCurrency(act.orcamento) : '—' }}</td>
                <td>
                  <span class="pa-card-status" :class="statusClass(act.estado)"
                    @click.stop="cycleStatus(act)" title="Avançar estado">{{ act.estado }}</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        </div><!-- /pa-table-scroll -->
      </div>
    </template>
  </div>

  <!-- Overlay -->
  <div class="pa-overlay" :class="{ open: panelOpen }" @click="closePanel"></div>

  <!-- Panel -->
  <div class="pa-panel" :class="{ open: panelOpen }">
    <div class="pa-panel-header">
      <h2>{{ form.name ? 'Editar Actividade' : 'Nova Actividade' }}</h2>
      <button class="pa-panel-close" @click="closePanel">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="pa-panel-body">
      <div class="pa-field">
        <label>Actividade <span class="req">*</span></label>
        <input v-model="form.actividade" type="text" placeholder="Nome ou descrição" ref="inputActividade">
      </div>
      <div class="pa-field-row">
        <div class="pa-field">
          <label>Data</label>
          <input v-model="form.data" type="date">
        </div>
        <div class="pa-field">
          <label>Estado</label>
          <select v-model="form.estado">
            <option v-for="s in ALL_ESTADOS" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>
      <div class="pa-field-row">
        <div class="pa-field">
          <label>Tipologia</label>
          <select v-model="form.tipologia">
            <option value="">— Sem tipologia —</option>
            <option v-for="t in tipologias" :key="t.name" :value="t.name">{{ t.icone ? t.icone+' ' : '' }}{{ t.name }}</option>
          </select>
        </div>
        <div class="pa-field">
          <label>Ano Lectivo</label>
          <select v-model="form.ano_lectivo">
            <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
      </div>
      <div class="pa-section-divider"></div>
      <div class="pa-section-label">Responsável e Local</div>
      <div class="pa-field">
        <label>Orador / Responsável</label>
        <input v-model="form.orador" type="text" placeholder="Nome do responsável">
      </div>
      <div class="pa-field">
        <label>Local</label>
        <textarea v-model="form.local" rows="2" placeholder="Local(is) da actividade"></textarea>
      </div>
      <div class="pa-field">
        <label>Orçamento</label>
        <input v-model="form.orcamento" type="number" step="0.01" min="0" placeholder="0.00">
      </div>
      <div class="pa-section-divider"></div>
      <div class="pa-section-label">Notas de Execução</div>
      <div class="pa-field">
        <textarea v-model="form.notas_execucao" rows="3" placeholder="Como correu, observações…"></textarea>
      </div>
      <div v-if="form.name && editingAct && editingAct.data_original" class="pa-field">
        <div class="pa-field-hint" style="color:#d97706">📌 Data original: <strong>{{ formatDate(editingAct.data_original) }}</strong></div>
      </div>
      <template v-if="form.name">
        <div class="pa-section-divider"></div>
        <div v-if="!confirmDelete" style="display:flex;justify-content:center">
          <button class="pa-btn pa-btn-danger" @click="confirmDelete = true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Eliminar Actividade
          </button>
        </div>
        <div v-else class="pa-delete-zone">
          <p class="pa-delete-zone-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Confirmar eliminação
          </p>
          <p class="pa-delete-zone-desc">Esta acção é permanente e não pode ser desfeita.</p>
          <div class="pa-delete-zone-actions">
            <button class="pa-btn pa-btn-danger-solid" style="flex:1;justify-content:center" @click="deleteActivity" :disabled="saving">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Sim, eliminar
            </button>
            <button class="pa-btn pa-btn-secondary" style="flex:1;justify-content:center" @click="confirmDelete = false">Cancelar</button>
          </div>
        </div>
      </template>
    </div>
    <div class="pa-panel-footer">
      <button class="pa-btn pa-btn-secondary" @click="closePanel">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Cancelar
      </button>
      <button class="pa-btn pa-btn-primary" @click="saveActivity" :disabled="saving">
        <div v-if="saving" class="pa-spinner" style="width:13px;height:13px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></div>
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        {{ saving ? 'A guardar…' : (form.name ? 'Guardar alterações' : 'Criar actividade') }}
      </button>
    </div>
  </div>

  <!-- Toasts -->
  <div class="pa-toast-container">
    <div v-for="t in toasts" :key="t.id" class="pa-toast" :class="t.type">{{ t.msg }}</div>
  </div>

</div>`,

    setup() {
      // ── State ─────────────────────────────────────────────────────────────
      const loading      = ref(true);
      const saving       = ref(false);
      const actividades  = ref([]);
      const tipologias   = ref([]);
      const anos         = ref([]);
      const selectedAno  = ref('');
      const search       = ref('');
      const viewMode     = ref('card');
      const panelOpen    = ref(false);
      const form         = reactive(EMPTY_FORM());
      const editingAct   = ref(null);
      const confirmDelete = ref(false);
      const toasts       = ref([]);
      const inputActividade = ref(null);

      // Filters
      const filterStatus    = ref('');      // single string
      const filterTipologias = ref([]);     // multi array
      const filterMonth     = ref('');

      // Tipologia dropdown
      const tipDdOpen    = ref(false);
      const tipSearch    = ref('');
      const tipDropEl    = ref(null);
      const tipSearchInput = ref(null);

      // Drag
      const dragItem      = ref(null);
      const dragOverGroup = ref(null);
      const dragTarget    = ref(null);
      let _dragAct        = null;

      // ── Derived ───────────────────────────────────────────────────────────
      const tipologiaMap = computed(() => {
        const m = {};
        tipologias.value.forEach((t, i) => {
          m[t.name] = { cor: t.cor || PALETTE[i % PALETTE.length], icone: t.icone };
        });
        return m;
      });

      const stats = computed(() => {
        const s = { total: 0 };
        ALL_ESTADOS.forEach(e => { s[e] = 0; });
        actividades.value.forEach(a => { s.total++; if (s[a.estado] !== undefined) s[a.estado]++; });
        return s;
      });

      const availableMonths = computed(() => {
        const keys = new Set();
        actividades.value.forEach(a => { if (a.data) keys.add(monthKey(a.data)); });
        return Array.from(keys).sort().map(k => ({ key: k, label: monthLabel(k) }));
      });

      const hasFilters = computed(() =>
        filterStatus.value || filterTipologias.value.length || filterMonth.value || search.value.trim()
      );

      const filteredTipDd = computed(() => {
        const q = tipSearch.value.toLowerCase().trim();
        if (!q) return tipologias.value;
        return tipologias.value.filter(t => t.name.toLowerCase().includes(q));
      });

      const filteredActividades = computed(() => {
        let items = actividades.value;
        const q = search.value.toLowerCase().trim();
        if (q) items = items.filter(a =>
          (a.actividade||'').toLowerCase().includes(q) ||
          (a.orador    ||'').toLowerCase().includes(q) ||
          (a.local     ||'').toLowerCase().includes(q) ||
          (a.tipologia ||'').toLowerCase().includes(q)
        );
        if (filterStatus.value)
          items = items.filter(a => a.estado === filterStatus.value);
        if (filterTipologias.value.length)
          items = items.filter(a => filterTipologias.value.includes(a.tipologia || ''));
        if (filterMonth.value)
          items = items.filter(a => monthKey(a.data) === filterMonth.value);
        return items;
      });

      const filteredGroups = computed(() => {
        const map = {};
        filteredActividades.value.forEach(a => {
          const k = monthKey(a.data);
          if (!map[k]) map[k] = [];
          map[k].push(a);
        });
        const keys = Object.keys(map).sort((a, b) => {
          if (a === '__nodate__') return 1;
          if (b === '__nodate__') return -1;
          return a.localeCompare(b);
        });
        return keys.map(k => ({ key: k, label: monthLabel(k), items: map[k] }));
      });

      // ── Click-outside for tipologia dropdown ──────────────────────────────
      function _onDocClick(e) {
        if (tipDdOpen.value && tipDropEl.value && !tipDropEl.value.contains(e.target)) {
          tipDdOpen.value = false;
          tipSearch.value = '';
        }
      }
      onMounted(() => document.addEventListener('mousedown', _onDocClick));
      onUnmounted(() => document.removeEventListener('mousedown', _onDocClick));

      // Auto-focus search when dropdown opens
      const { watch } = Vue;
      watch(tipDdOpen, (val) => {
        if (val) nextTick(() => tipSearchInput.value && tipSearchInput.value.focus());
        else tipSearch.value = '';
      });

      // ── Data ──────────────────────────────────────────────────────────────
      async function init() {
        loading.value = true;
        try {
          const [anosResp, anoAtual, tipResp] = await Promise.all([
            api('get_anos_lectivos', {}),
            api('get_ano_lectivo_atual', {}),
            api('get_tipologias', {}),
          ]);
          anos.value       = anosResp || [];
          tipologias.value = tipResp  || [];
          selectedAno.value = anoAtual || (anosResp && anosResp[0]) || '';
          if (selectedAno.value) await loadActividades();
        } catch (e) {
          toast('Erro ao carregar: ' + e.message, 'error');
        } finally {
          loading.value = false;
        }
      }

      async function loadActividades() {
        if (!selectedAno.value) return;
        loading.value = true;
        try {
          actividades.value = await api('get_actividades', { ano_lectivo: selectedAno.value }) || [];
        } catch (e) {
          toast('Erro ao carregar actividades', 'error');
        } finally {
          loading.value = false;
        }
      }

      // ── Panel ─────────────────────────────────────────────────────────────
      function openNewActivity(groupKey) {
        Object.assign(form, EMPTY_FORM());
        form.ano_lectivo = selectedAno.value;
        if (groupKey && groupKey !== '__nodate__') form.data = groupKey + '-01';
        editingAct.value = null;
        confirmDelete.value = false;
        panelOpen.value = true;
        nextTick(() => inputActividade.value && inputActividade.value.focus());
      }

      function openEdit(act) {
        Object.assign(form, {
          name: act.name, actividade: act.actividade || '',
          tipologia: act.tipologia || '', estado: act.estado || 'Pendente',
          ano_lectivo: act.ano_lectivo || selectedAno.value,
          data: act.data || '', orador: act.orador || '',
          local: act.local || '', orcamento: act.orcamento || '',
          notas_execucao: act.notas_execucao || '',
        });
        editingAct.value = act;
        confirmDelete.value = false;
        panelOpen.value = true;
        nextTick(() => inputActividade.value && inputActividade.value.focus());
      }

      function closePanel() { panelOpen.value = false; confirmDelete.value = false; }

      async function saveActivity() {
        if (!form.actividade.trim()) { toast('O campo Actividade é obrigatório', 'error'); return; }
        saving.value = true;
        try {
          const payload = { ...form };
          Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
          let saved;
          if (form.name) {
            saved = await api('update_actividade', { name: form.name, data_json: JSON.stringify(payload) });
            const idx = actividades.value.findIndex(a => a.name === form.name);
            if (idx >= 0) actividades.value.splice(idx, 1, saved);
          } else {
            saved = await api('create_actividade', { data_json: JSON.stringify(payload) });
            actividades.value.push(saved);
          }
          toast(form.name ? 'Actualizado' : 'Criado', 'success');
          closePanel();
        } catch (e) {
          toast('Erro ao guardar: ' + e.message, 'error');
        } finally {
          saving.value = false;
        }
      }

      async function deleteActivity() {
        if (!form.name) return;
        saving.value = true;
        try {
          await api('delete_actividade', { name: form.name });
          actividades.value = actividades.value.filter(a => a.name !== form.name);
          toast('Eliminado', 'info');
          closePanel();
        } catch (e) {
          toast('Erro ao eliminar: ' + e.message, 'error');
        } finally {
          saving.value = false;
        }
      }

      async function cycleStatus(act) {
        const next = STATUS_NEXT[act.estado] || 'Pendente';
        const prev = act.estado;
        act.estado = next;
        try {
          await api('update_estado', { name: act.name, estado: next });
          toast('Estado: ' + next, 'success');
        } catch (e) {
          act.estado = prev;
          toast('Erro ao alterar estado', 'error');
        }
      }

      function removeTipFilter(name) {
        filterTipologias.value = filterTipologias.value.filter(n => n !== name);
      }

      // ── Drag ─────────────────────────────────────────────────────────────
      function onDragStart(act, evt) {
        _dragAct = act; dragItem.value = act.name;
        evt.dataTransfer.effectAllowed = 'move';
        evt.dataTransfer.setData('text/plain', act.name);
      }
      function onDragEnd() { dragItem.value = null; dragOverGroup.value = null; dragTarget.value = null; _dragAct = null; }
      function onDragOver(k) { dragOverGroup.value = k; }
      function onDragLeave(k) { if (dragOverGroup.value === k) dragOverGroup.value = null; }
      async function onDrop(groupKey) {
        dragOverGroup.value = null;
        if (!_dragAct) return;
        const act = _dragAct;
        const newDate = groupKey === '__nodate__' ? null
          : (act.data && monthKey(act.data) === groupKey ? act.data : groupKey + '-01');
        if (monthKey(act.data || '') === groupKey && act.data === newDate) return;
        const oldDate = act.data;
        act.data = newDate;
        try {
          await api('update_actividade', { name: act.name, data_json: JSON.stringify({ ...act, data: newDate }) });
          toast('Actividade movida', 'info');
        } catch (e) { act.data = oldDate; toast('Erro ao mover', 'error'); }
      }

      function printView() { window.print(); }

      // ── Styling ───────────────────────────────────────────────────────────
      function tipologiaColor(act) {
        const tmap = tipologiaMap.value;
        return act.tipologia && tmap[act.tipologia] ? tmap[act.tipologia].cor : '#d1d5db';
      }
      function cardStyle(act) { return `--tipologia-cor: ${tipologiaColor(act)}`; }
      function tipologiaChipStyle(act) {
        const cor = tipologiaColor(act);
        return `--tipologia-bg: ${hexToRgba(cor, 0.14)}; --tipologia-text: ${cor}`;
      }
      function statusClass(estado) {
        return { 'Pendente':'status-pendente','Em Progresso':'status-em-progresso','Realizada':'status-realizada','Cancelada':'status-cancelada','Adiada':'status-adiada' }[estado] || 'status-pendente';
      }
      function statusChipClass(s) {
        return { 'Pendente':'pendente','Em Progresso':'em-progresso','Realizada':'realizada','Cancelada':'cancelada','Adiada':'adiada' }[s] || 'pendente';
      }
      function formatDate(d) { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }
      function formatCurrency(v) {
        if (!v) return '';
        return parseFloat(v).toLocaleString('pt-MZ', { style:'currency', currency:'MZN', minimumFractionDigits:0 });
      }
      function truncate(s, n) { return s && s.length > n ? s.substring(0, n) + '…' : (s || ''); }

      // ── Toast ─────────────────────────────────────────────────────────────
      let _toastId = 0;
      function toast(msg, type = 'info') {
        const id = ++_toastId;
        toasts.value.push({ id, msg, type });
        setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3200);
      }

      init();

      return {
        ALL_ESTADOS,
        loading, saving, actividades, tipologias, anos, selectedAno,
        search, viewMode, panelOpen, form, editingAct, confirmDelete, toasts,
        inputActividade, dragItem, dragOverGroup, dragTarget,
        filterStatus, filterTipologias, filterMonth,
        tipDdOpen, tipSearch, tipDropEl, tipSearchInput,
        stats, availableMonths, hasFilters, filteredGroups, filteredTipDd,
        tipologiaMap,
        loadActividades, openNewActivity, openEdit, closePanel,
        saveActivity, deleteActivity, cycleStatus, removeTipFilter,
        onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
        printView,
        cardStyle, tipologiaChipStyle, tipologiaColor,
        statusClass, statusChipClass,
        formatDate, formatCurrency, truncate, isOverdue, hexToRgba,
      };
    },
  });
}

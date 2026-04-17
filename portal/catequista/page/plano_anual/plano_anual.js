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
        v-model="searchRaw"
        placeholder="Pesquisar actividade…"
        @keydown.escape="clearSearch()"
      >
      <button v-if="searchRaw" class="pa-search-clear" @click="clearSearch()" title="Limpar">
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
      <button class="pa-view-btn" :class="{ active: viewMode==='cal' }" @click="viewMode='cal'" title="Calendário mensal">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Calendário
      </button>
    </div>

    <button class="pa-btn pa-btn-ghost pa-btn-sm" @click="expandAll" data-no-print
      :title="collapsedMonths.size > 0 ? 'Expandir todos os meses' : 'Recolher todos os meses'">
      <!-- Expand icon — shown when anything is collapsed -->
      <svg v-if="collapsedMonths.size > 0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 15 12 20 17 15"/><polyline points="7 9 12 4 17 9"/></svg>
      <!-- Collapse icon — shown when all are expanded -->
      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 20 12 15 17 20"/><polyline points="7 4 12 9 17 4"/></svg>
    </button>

    <!-- ── Actions dropdown ─────────────────────────────────────── -->
    <div class="pa-actions-dd" ref="actionsEl" data-no-print>
      <button class="pa-btn pa-btn-secondary pa-btn-sm" @click.stop="actionsOpen = !actionsOpen" :class="{ active: actionsOpen }">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
        Mais
        <svg class="pa-actions-caret" :class="{ open: actionsOpen }" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div v-if="actionsOpen" class="pa-actions-panel">
        <button class="pa-actions-item" @click="exportExcel(); actionsOpen = false" :disabled="exporting">
          <div v-if="exporting" class="pa-spinner" style="width:13px;height:13px;flex-shrink:0"></div>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
          Exportar Excel
          <span v-if="hasFilters" class="pa-actions-badge">filtrado</span>
        </button>
        <button class="pa-actions-item" @click="openCopyYearModal(); actionsOpen = false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copiar ano anterior
        </button>
        <div class="pa-actions-sep"></div>
        <button class="pa-actions-item" @click="printView(); actionsOpen = false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Imprimir
        </button>
      </div>
    </div>

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
      <div
        v-for="group in filteredGroups" :key="group.key"
        class="pa-month-group"
        :class="{ 'is-current-month': isCurrentMonth(group.key), 'is-collapsed': isCollapsed(group.key) }"
      >
        <div class="pa-month-header" @click="toggleCollapse(group.key)" style="cursor:pointer" :title="isCollapsed(group.key) ? 'Expandir mês' : 'Recolher mês'">
          <input type="checkbox" class="pa-month-check" :checked="isMonthFullySelected(group.key)" @click.stop="toggleSelectMonth(group.key)" @change.stop data-no-print>
          <!-- Collapse chevron -->
          <svg class="pa-month-chevron" :class="{ collapsed: isCollapsed(group.key) }" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="pa-month-label">{{ group.label }}</span>
          <span v-if="isCurrentMonth(group.key)" class="pa-month-now-badge">Agora</span>
          <span class="pa-month-count">{{ group.items.length }} actividade{{ group.items.length !== 1 ? 's' : '' }}</span>
          <div class="pa-month-line"></div>
          <button class="pa-month-add" @click.stop="openQuickAdd(group.key)" data-no-print>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Adicionar
          </button>
        </div>

        <div
          v-show="!isCollapsed(group.key)"
          class="pa-cards pa-month-body"
          :class="{ 'drag-over': dragOverGroup === group.key }"
          @dragover.prevent="onDragOver(group.key)"
          @dragleave="onDragLeave(group.key)"
          @drop.prevent="onDrop(group.key)"
        >
          <div
            v-for="act in group.items" :key="act.name"
            class="pa-card"
            :class="{ overdue: isOverdue(act), dragging: dragItem === act.name, 'drag-target': dragTarget === act.name, selected: selected.has(act.name), 'pa-card-just-moved': justMovedCard === act.name }"
            :style="cardStyle(act)"
            draggable="true"
            @dragstart="onDragStart(act, $event)"
            @dragend="onDragEnd"
            @dragover.prevent="dragTarget = act.name"
            @click="handleCardClick(act)"
          >
            <div class="pa-card-header">
              <input type="checkbox" class="pa-card-check" :checked="selected.has(act.name)" @click.stop="toggleSelect(act.name)" @change.stop data-no-print>
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
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;align-items:center">
              <span v-if="act.tipologia" class="pa-card-tipologia" :style="tipologiaChipStyle(act)">
                {{ act.tipologia_icone ? act.tipologia_icone + ' ' : '' }}{{ act.tipologia }}
              </span>
              <span v-if="isOverdue(act)" class="pa-overdue-tag">⚠ Vencida</span>
              <span
                v-if="act.notas_execucao"
                class="pa-notes-indicator"
                :title="act.notas_execucao"
              >📝 <span class="pa-notes-indicator-text">{{ truncate(act.notas_execucao, 60) }}</span></span>
            </div>
          </div>
          <div v-if="group.items.length === 0 && quickAdd.groupKey !== group.key" class="pa-empty">Sem actividades — clique em Adicionar</div>
          <div v-if="quickAdd.groupKey === group.key" class="pa-quick-add-card" @click.stop data-no-print>
            <input
              class="pa-quick-add-name"
              type="text"
              v-model="quickAdd.name"
              placeholder="Nome da actividade…"
              @keydown.enter="saveQuickAdd"
              @keydown.escape="cancelQuickAdd"
              :disabled="quickAddSaving"
              autocomplete="off"
            >
            <input
              class="pa-quick-add-date"
              type="date"
              v-model="quickAdd.date"
              @keydown.enter="saveQuickAdd"
              @keydown.escape="cancelQuickAdd"
              :disabled="quickAddSaving"
            >
            <span class="pa-quick-add-hint">↵ guardar &nbsp;Esc fechar</span>
            <button class="pa-btn pa-btn-primary pa-btn-sm" @click="saveQuickAdd" :disabled="quickAddSaving || !quickAdd.name.trim()" title="Guardar (Enter)">
              <div v-if="quickAddSaving" class="pa-spinner" style="width:11px;height:11px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></div>
              <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="pa-btn pa-btn-ghost pa-btn-sm pa-quick-add-full" @click="openNewActivity(quickAdd.groupKey); cancelQuickAdd()" :disabled="quickAddSaving" title="Abrir formulário completo">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><polyline points="16 4 20 4 20 8"/><line x1="10" y1="14" x2="20" y2="4"/></svg>
              Formulário
            </button>
            <button class="pa-btn pa-btn-ghost pa-btn-sm" @click="cancelQuickAdd" :disabled="quickAddSaving" title="Cancelar (Esc)" style="padding:0 7px">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ── List view ───────────────────────────────────────────────── -->
    <template v-else-if="viewMode === 'list'">
      <div class="pa-table-wrap">
        <div class="pa-table-scroll">
        <table class="pa-list-table">
          <thead>
            <tr>
              <th style="width:32px" data-no-print>
                <input type="checkbox" class="pa-table-check"
                  :ref="el => { if (el) el.indeterminate = isSomeSelected && !isAllSelected; }"
                  :checked="isAllSelected"
                  @change="toggleSelectAll"
                >
              </th>
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
              <tr
                class="pa-list-month-row"
                :class="{ 'is-current-month': isCurrentMonth(group.key) }"
                @click="toggleCollapse(group.key)"
                style="cursor:pointer"
                :title="isCollapsed(group.key) ? 'Expandir mês' : 'Recolher mês'"
              >
                <td :colspan="9">
                  <svg class="pa-month-chevron" :class="{ collapsed: isCollapsed(group.key) }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:6px;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>
                  <span class="pa-list-month-label">{{ group.label }}</span>
                  <span v-if="isCurrentMonth(group.key)" class="pa-month-now-badge" style="margin-left:6px">Agora</span>
                  <span class="pa-list-month-meta">{{ group.items.length }} actividade{{ group.items.length !== 1 ? 's' : '' }}</span>
                  <button class="pa-month-add pa-list-month-add" @click.stop="openQuickAdd(group.key)" data-no-print>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Adicionar
                  </button>
                </td>
              </tr>
              <tr v-for="(act, i) in group.items" :key="act.name"
                v-show="!isCollapsed(group.key)"
                :class="{ 'pa-row-overdue': isOverdue(act), 'pa-row-selected': selected.has(act.name), 'pa-row-flashing': flashingRow === act.name }"
                @click="handleCardClick(act)">
                <td data-no-print @click.stop style="text-align:center;padding:0 8px">
                  <input type="checkbox" class="pa-table-check" :checked="selected.has(act.name)" @change.stop="toggleSelect(act.name)">
                </td>
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
              <tr v-if="quickAdd.groupKey === group.key" v-show="!isCollapsed(group.key)" class="pa-quick-add-row" data-no-print>
                <td colspan="2"></td>
                <td style="padding:5px 8px">
                  <input
                    class="pa-quick-add-name pa-quick-add-name-list"
                    type="text"
                    v-model="quickAdd.name"
                    placeholder="Nome da actividade…"
                    @keydown.enter="saveQuickAdd"
                    @keydown.escape="cancelQuickAdd"
                    :disabled="quickAddSaving"
                    autocomplete="off"
                  >
                </td>
                <td></td>
                <td style="padding:5px 8px">
                  <input
                    class="pa-quick-add-date"
                    type="date"
                    v-model="quickAdd.date"
                    @keydown.enter="saveQuickAdd"
                    @keydown.escape="cancelQuickAdd"
                    :disabled="quickAddSaving"
                    style="width:100%"
                  >
                </td>
                <td colspan="4" style="padding:5px 8px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <button class="pa-btn pa-btn-primary pa-btn-sm" @click="saveQuickAdd" :disabled="quickAddSaving || !quickAdd.name.trim()">
                      <div v-if="quickAddSaving" class="pa-spinner" style="width:11px;height:11px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></div>
                      <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                      Guardar
                    </button>
                    <button class="pa-btn pa-btn-ghost pa-btn-sm pa-quick-add-full" @click="openNewActivity(quickAdd.groupKey); cancelQuickAdd()" :disabled="quickAddSaving">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><polyline points="16 4 20 4 20 8"/><line x1="10" y1="14" x2="20" y2="4"/></svg>
                      Formulário
                    </button>
                    <button class="pa-btn pa-btn-ghost pa-btn-sm" @click="cancelQuickAdd" :disabled="quickAddSaving">Cancelar</button>
                    <span class="pa-quick-add-hint">↵ guardar &nbsp;Esc fechar</span>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        </div><!-- /pa-table-scroll -->
      </div>
    </template>

    <!-- ── Calendar grid view ─────────────────────────────────────── -->
    <template v-else>

      <!-- Sub-toolbar: annual/monthly toggle + month navigation -->
      <div class="pa-cal-bar">
        <div class="pa-cal-sub-toggle">
          <button class="pa-cal-sub-btn" :class="{ active: calViewMode === 'annual' }" @click="calViewMode = 'annual'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Anual
          </button>
          <button class="pa-cal-sub-btn" :class="{ active: calViewMode === 'monthly' }" @click="calViewMode = 'monthly'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Mensal
          </button>
        </div>
        <template v-if="calViewMode === 'monthly' && calCurrentMonthData">
          <button class="pa-btn pa-btn-ghost pa-btn-sm" @click="calPrevMonth" :disabled="calMonthIndex === 0" title="Mês anterior">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="pa-cal-nav-label">{{ calCurrentMonthData.label }}</span>
          <button class="pa-btn pa-btn-ghost pa-btn-sm" @click="calNextMonth" :disabled="calMonthIndex >= calendarData.length - 1" title="Mês seguinte">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </template>
      </div>

      <!-- ── Annual: responsive grid of all months ────────────────── -->
      <div v-if="calViewMode === 'annual'" class="pa-cal-grid">
        <div
          v-for="month in calendarData" :key="month.key"
          class="pa-cal-month"
          :class="{ 'pa-cal-month-current': isCurrentMonth(month.key) }"
        >
          <div class="pa-cal-month-hdr">
            <span class="pa-cal-month-name">{{ month.label }}</span>
            <span v-if="isCurrentMonth(month.key)" class="pa-month-now-badge">Agora</span>
            <div style="flex:1"></div>
            <span v-if="month.actCount" class="pa-cal-month-count">{{ month.actCount }} act.</span>
            <button class="pa-month-add" @click="openQuickAdd(month.key)" data-no-print>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Adicionar
            </button>
          </div>
          <div class="pa-cal-dow-row">
            <span v-for="dw in ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']" :key="dw" class="pa-cal-dow">{{ dw }}</span>
          </div>
          <div v-for="(week, wi) in month.weeks" :key="wi" class="pa-cal-week">
            <div
              v-for="(cell, di) in week" :key="di"
              class="pa-cal-cell"
              :class="{
                'pa-cal-empty':    !cell,
                'pa-cal-today':    cell && cell.isToday,
                'pa-cal-weekend':  cell && cell.isWeekend,
                'pa-cal-has-acts': cell && cell.acts.length > 0,
                'pa-cal-conflict': cell && cell.acts.length > 1,
              }"
              @click="cell && !cell.acts.length && openNewActivityOnDay(cell.dateStr)"
              :title="cell && !cell.acts.length ? 'Adicionar actividade em ' + formatDate(cell.dateStr) : ''"
            >
              <div v-if="cell" class="pa-cal-day-num">{{ cell.day }}</div>
              <div v-if="cell && cell.acts.length" class="pa-cal-acts">
                <div
                  v-for="act in cell.acts.slice(0, 3)" :key="act.name"
                  class="pa-cal-act-chip"
                  :style="calActStyle(act)"
                  :class="{ 'pa-cal-act-overdue': isOverdue(act) }"
                  @click.stop="openEdit(act)"
                  :title="act.actividade + ' — ' + act.estado + (act.orador ? ' (' + act.orador + ')' : '')"
                >
                  <span class="pa-cal-act-dot" :style="{ background: tipologiaColor(act) }"></span>
                  {{ truncate(act.actividade, 20) }}
                </div>
                <div v-if="cell.acts.length > 3" class="pa-cal-act-more" @click.stop>+{{ cell.acts.length - 3 }} mais</div>
              </div>
              <div v-if="cell && cell.acts.length > 1" class="pa-cal-conflict-badge" title="Múltiplas actividades neste dia">!</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Monthly: single enlarged month ───────────────────────── -->
      <div v-else-if="calCurrentMonthData" class="pa-cal-monthly-wrap">
        <div class="pa-cal-month pa-cal-month-lg" :class="{ 'pa-cal-month-current': isCurrentMonth(calCurrentMonthData.key) }">
          <div class="pa-cal-month-hdr">
            <span class="pa-cal-month-name" style="font-size:1rem;font-weight:800">{{ calCurrentMonthData.label }}</span>
            <span v-if="isCurrentMonth(calCurrentMonthData.key)" class="pa-month-now-badge">Agora</span>
            <div style="flex:1"></div>
            <span v-if="calCurrentMonthData.actCount" class="pa-cal-month-count">
              {{ calCurrentMonthData.actCount }} actividade{{ calCurrentMonthData.actCount !== 1 ? 's' : '' }}
            </span>
            <button class="pa-month-add" @click="openQuickAdd(calCurrentMonthData.key)" data-no-print>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Adicionar
            </button>
          </div>
          <div class="pa-cal-dow-row pa-cal-dow-row-lg">
            <span v-for="dw in ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']" :key="dw" class="pa-cal-dow">{{ dw }}</span>
          </div>
          <div v-for="(week, wi) in calCurrentMonthData.weeks" :key="wi" class="pa-cal-week pa-cal-week-lg">
            <div
              v-for="(cell, di) in week" :key="di"
              class="pa-cal-cell pa-cal-cell-lg"
              :class="{
                'pa-cal-empty':    !cell,
                'pa-cal-today':    cell && cell.isToday,
                'pa-cal-weekend':  cell && cell.isWeekend,
                'pa-cal-has-acts': cell && cell.acts.length > 0,
                'pa-cal-conflict': cell && cell.acts.length > 1,
              }"
              @click="cell && !cell.acts.length && openNewActivityOnDay(cell.dateStr)"
              :title="cell && !cell.acts.length ? 'Adicionar actividade em ' + formatDate(cell.dateStr) : ''"
            >
              <div v-if="cell" class="pa-cal-day-num pa-cal-day-num-lg">{{ cell.day }}</div>
              <div v-if="cell && cell.acts.length" class="pa-cal-acts">
                <div
                  v-for="act in cell.acts" :key="act.name"
                  class="pa-cal-act-chip pa-cal-act-chip-lg"
                  :style="calActStyle(act)"
                  :class="{ 'pa-cal-act-overdue': isOverdue(act) }"
                  @click.stop="openEdit(act)"
                  :title="act.actividade + ' — ' + act.estado + (act.orador ? ' (' + act.orador + ')' : '')"
                >
                  <span class="pa-cal-act-dot" :style="{ background: tipologiaColor(act) }"></span>
                  <span class="pa-cal-act-chip-body">
                    <span class="pa-cal-act-chip-name">{{ truncate(act.actividade, 36) }}</span>
                    <span v-if="act.orador" class="pa-cal-act-chip-sub">{{ act.orador }}</span>
                  </span>
                  <span class="pa-card-status" :class="statusClass(act.estado)" style="flex-shrink:0;font-size:0.6rem;padding:1px 6px;margin-left:auto">{{ act.estado }}</span>
                </div>
              </div>
              <div v-if="cell && cell.acts.length > 1" class="pa-cal-conflict-badge" title="Múltiplas actividades neste dia">!</div>
            </div>
          </div>
        </div>
      </div>

    </template>
  </div>

  <!-- Overlay (shared between slide-over panel and modal) -->
  <div class="pa-overlay" :class="{ open: panelOpen || copyModal.open }" @click="panelOpen ? closePanel() : closeCopyYearModal()"></div>

  <!-- ── Copy Year Modal ─────────────────────────────────────────────── -->
  <div class="pa-modal" :class="{ open: copyModal.open }">

    <div v-if="copyModal.loading" class="pa-loading" style="min-height:110px;padding:20px">
      <div class="pa-spinner"></div> A verificar…
    </div>
    <template v-else-if="copyModal.error">
      <div class="pa-modal-header">
        <div class="pa-modal-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <h3>Copiar Ano Anterior</h3>
      </div>
      <div class="pa-modal-body">
        <p style="color:#dc2626;font-size:0.88rem;margin:0">{{ copyModal.error }}</p>
      </div>
      <div class="pa-modal-footer">
        <button class="pa-btn pa-btn-secondary" @click="closeCopyYearModal">Fechar</button>
      </div>
    </template>
    <template v-else-if="copyModal.preview">
      <div class="pa-modal-header">
        <div class="pa-modal-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </div>
        <h3>Copiar Ano Anterior</h3>
        <button class="pa-panel-close" @click="closeCopyYearModal" :disabled="copyModal.copying">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="pa-modal-body">
        <!-- Year flow -->
        <div class="pa-copy-flow">
          <span class="pa-copy-year-pill">{{ copyModal.preview.prev_year }}</span>
          <svg class="pa-copy-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <span class="pa-copy-year-pill target">{{ selectedAno }}</span>
        </div>

        <!-- Count -->
        <div class="pa-copy-count-box">
          <span class="pa-copy-big">{{ copyModal.preview.source_count }}</span>
          <span class="pa-copy-sub">actividade{{ copyModal.preview.source_count !== 1 ? 's' : '' }} {{ copyModal.preview.source_count !== 1 ? 'serão copiadas' : 'será copiada' }}</span>
        </div>

        <!-- Existing activities warning -->
        <div v-if="copyModal.preview.target_count > 0" class="pa-copy-warning-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>{{ selectedAno }} já tem <strong>{{ copyModal.preview.target_count }}</strong> actividade{{ copyModal.preview.target_count !== 1 ? 's' : '' }}. As cópias serão adicionadas sem substituir as existentes.</span>
        </div>

        <!-- What happens -->
        <ul class="pa-copy-rules">
          <li>Estado reposto para <strong>Pendente</strong></li>
          <li>Datas avançadas <strong>1 ano</strong> (29 Fev → 28 Fev nos anos sem bissexto)</li>
          <li>Notas de execução <strong>não copiadas</strong></li>
          <li>Tipologias, responsáveis e locais <strong>mantidos</strong></li>
        </ul>
      </div>

      <div class="pa-modal-footer">
        <button class="pa-btn pa-btn-secondary" @click="closeCopyYearModal" :disabled="copyModal.copying">Cancelar</button>
        <button
          class="pa-btn pa-btn-primary"
          @click="confirmCopyYear"
          :disabled="copyModal.copying || copyModal.preview.source_count === 0"
        >
          <div v-if="copyModal.copying" class="pa-spinner" style="width:13px;height:13px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></div>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          {{ copyModal.copying ? 'A copiar…' : 'Copiar actividades' }}
        </button>
      </div>
    </template>

  </div>

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
          <label style="display:flex;align-items:center;justify-content:space-between">
            Tipologia
            <button
              type="button"
              class="pa-tip-quick-toggle"
              :class="{ active: showTipForm }"
              @click="toggleTipForm"
              :title="showTipForm ? 'Fechar' : 'Nova tipologia'"
            >
              <svg v-if="!showTipForm" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {{ showTipForm ? 'Fechar' : 'Nova' }}
            </button>
          </label>
          <select v-model="form.tipologia" v-if="!showTipForm">
            <option value="">— Sem tipologia —</option>
            <option v-for="t in tipologias" :key="t.name" :value="t.name">{{ t.icone ? t.icone+' ' : '' }}{{ t.name }}</option>
          </select>

          <!-- Quick-create inline form -->
          <div v-if="showTipForm" class="pa-tip-quick-form">
            <div class="pa-tip-quick-row">
              <input
                v-model="newTip.nome"
                type="text"
                placeholder="Nome da tipologia"
                ref="newTipInput"
                class="pa-tip-quick-name"
                @keydown.enter="saveTipologia"
                @keydown.escape="cancelTipForm"
              >
              <input
                v-model="newTip.icone"
                type="text"
                placeholder="🎉"
                class="pa-tip-quick-icone"
                title="Emoji (opcional)"
                maxlength="4"
              >
            </div>

            <!-- Colour swatches + custom picker -->
            <div class="pa-tip-quick-colours">
              <button
                v-for="c in TIP_PALETTE"
                :key="c"
                type="button"
                class="pa-tip-swatch"
                :class="{ selected: newTip.cor === c }"
                :style="{ background: c }"
                @click="newTip.cor = c"
                :title="c"
              ></button>
              <!-- Custom colour picker -->
              <label class="pa-tip-swatch pa-tip-swatch-custom" :style="newTip.cor && !TIP_PALETTE.includes(newTip.cor) ? { background: newTip.cor, outline: '2px solid ' + newTip.cor, outlineOffset: '2px' } : {}" title="Cor personalizada">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
                <input type="color" v-model="newTip.cor" style="position:absolute;opacity:0;width:0;height:0">
              </label>
            </div>

            <!-- Preview -->
            <div v-if="newTip.nome || newTip.cor" class="pa-tip-quick-preview">
              <span
                class="pa-card-tipologia"
                :style="newTip.cor ? \`--tipologia-bg:\${hexToRgba(newTip.cor,0.14)};--tipologia-text:\${newTip.cor}\` : ''"
              >{{ newTip.icone || '' }} {{ newTip.nome || 'Pré-visualização' }}</span>
            </div>

            <div class="pa-tip-quick-actions">
              <button type="button" class="pa-btn pa-btn-primary pa-btn-sm" @click="saveTipologia" :disabled="savingTip || !newTip.nome.trim()">
                <div v-if="savingTip" class="pa-spinner" style="width:11px;height:11px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></div>
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                {{ savingTip ? 'A criar…' : 'Criar tipologia' }}
              </button>
              <button type="button" class="pa-btn pa-btn-ghost pa-btn-sm" @click="cancelTipForm">Cancelar</button>
            </div>
          </div>
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

        <!-- Duplicate -->
        <div class="pa-dupe-row">
          <button class="pa-btn pa-btn-ghost pa-btn-dupe" @click="duplicateActivity" :disabled="duplicating">
            <div v-if="duplicating" class="pa-spinner" style="width:13px;height:13px"></div>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {{ duplicating ? 'A duplicar…' : 'Duplicar actividade' }}
          </button>
        </div>

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

  <!-- ── Bulk action bar ──────────────────────────────────────────── -->
  <div class="pa-bulk-bar" :class="{ visible: hasSelection }" data-no-print>
    <div class="pa-bulk-left">
      <button class="pa-bulk-close" @click="clearSelection" title="Cancelar selecção">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <span class="pa-bulk-count-num">{{ selectionCount }}</span>
      <span class="pa-bulk-count-label">seleccionada{{ selectionCount !== 1 ? 's' : '' }}</span>
    </div>

    <div class="pa-bulk-sep"></div>

    <div class="pa-bulk-actions">
      <!-- Mark as estado -->
      <select
        v-model="bulkEstadoTarget"
        class="pa-bulk-select"
        @change="onBulkEstadoChange"
        :disabled="bulkActWorking"
        title="Marcar seleccionadas como…"
      >
        <option value="">Marcar como…</option>
        <option v-for="s in ALL_ESTADOS" :key="s" :value="s">{{ s }}</option>
      </select>

      <div class="pa-bulk-sep"></div>

      <!-- Move to month -->
      <select v-model="bulkMoveTarget" class="pa-bulk-select" :disabled="bulkActWorking" title="Mover para mês…">
        <option value="">Mover para mês…</option>
        <option v-for="mk in allMonthsForYear" :key="mk.key" :value="mk.key">{{ mk.label }}</option>
      </select>
      <button
        v-if="bulkMoveTarget"
        class="pa-btn pa-btn-secondary pa-btn-sm"
        @click="doBulkMoveMonth"
        :disabled="bulkActWorking"
        style="background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.25);color:#fff"
      >
        <div v-if="bulkActWorking" class="pa-spinner" style="width:11px;height:11px"></div>
        <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        Mover
      </button>

      <div class="pa-bulk-sep"></div>

      <!-- Delete -->
      <template v-if="!bulkDelConfirm">
        <button class="pa-btn pa-btn-danger pa-btn-sm" @click="bulkDelConfirm = true" :disabled="bulkActWorking">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          Eliminar
        </button>
      </template>
      <template v-else>
        <span class="pa-bulk-del-label">Eliminar {{ selectionCount }}?</span>
        <button class="pa-btn pa-btn-danger-solid pa-btn-sm" @click="doBulkDelete" :disabled="bulkActWorking">
          <div v-if="bulkActWorking" class="pa-spinner" style="width:11px;height:11px;border-top-color:#fff;border-color:rgba(255,255,255,0.3)"></div>
          Confirmar
        </button>
        <button class="pa-btn pa-btn-ghost pa-btn-sm" @click="bulkDelConfirm = false" :disabled="bulkActWorking" style="color:rgba(255,255,255,0.7);border-color:rgba(255,255,255,0.2)">Cancelar</button>
      </template>
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
      const searchRaw    = ref('');   // bound to input (v-model)
      const search       = ref('');   // debounced — used by filteredActividades
      let   _searchTimer = null;
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

      // Actions dropdown
      const actionsOpen = ref(false);
      const actionsEl   = ref(null);

      // Drag
      const dragItem      = ref(null);
      const dragOverGroup = ref(null);
      const dragTarget    = ref(null);
      let _dragAct        = null;

      // Collapse / current month
      const TODAY_KEY   = frappe.datetime.get_today().substring(0, 7); // YYYY-MM
      const collapsedMonths = ref(new Set());

      function isCurrentMonth(key) { return key === TODAY_KEY; }
      function isPastMonth(key)    { return key !== '__nodate__' && key < TODAY_KEY; }
      function isCollapsed(key)    { return collapsedMonths.value.has(key); }

      function toggleCollapse(key) {
        const s = new Set(collapsedMonths.value);
        if (s.has(key)) s.delete(key); else s.add(key);
        collapsedMonths.value = s;
      }

      function autoCollapsePast() {
        const s = new Set(collapsedMonths.value);
        filteredGroups.value.forEach(g => { if (isPastMonth(g.key)) s.add(g.key); });
        collapsedMonths.value = s;
      }

      function expandAll() {
        if (collapsedMonths.value.size > 0) {
          collapsedMonths.value = new Set();                                      // expand all
        } else {
          collapsedMonths.value = new Set(filteredGroups.value.map(g => g.key)); // collapse all
        }
      }

      // Tipologia quick-create
      const TIP_PALETTE = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];
      const showTipForm  = ref(false);
      const savingTip    = ref(false);
      const newTipInput  = ref(null);
      const newTip       = reactive({ nome: '', cor: '#6366f1', icone: '' });

      function toggleTipForm() {
        showTipForm.value = !showTipForm.value;
        if (showTipForm.value) {
          newTip.nome = ''; newTip.cor = '#6366f1'; newTip.icone = '';
          nextTick(() => newTipInput.value && newTipInput.value.focus());
        }
      }
      function cancelTipForm() { showTipForm.value = false; }

      async function saveTipologia() {
        if (!newTip.nome.trim()) return;
        savingTip.value = true;
        try {
          const created = await api('create_tipologia', {
            nome:  newTip.nome.trim(),
            cor:   newTip.cor  || '',
            icone: newTip.icone.trim(),
          });
          // Add to local list and auto-select
          tipologias.value.push({ name: created.name, cor: created.cor, icone: created.icone });
          form.tipologia = created.name;
          toast('Tipologia "' + created.name + '" criada', 'success');
          showTipForm.value = false;
        } catch (e) {
          toast(e.message || 'Erro ao criar tipologia', 'error');
        } finally {
          savingTip.value = false;
        }
      }

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
        filterStatus.value || filterTipologias.value.length || filterMonth.value || searchRaw.value.trim()
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

      // Calendar grid: one entry per month in the academic year
      const calendarData = computed(() => {
        const today = frappe.datetime.get_today();
        // Index filtered activities by date string
        const byDate = {};
        filteredActividades.value.forEach(a => {
          if (!a.data) return;
          if (!byDate[a.data]) byDate[a.data] = [];
          byDate[a.data].push(a);
        });

        return allMonthsForYear.value.map(({ key, label }) => {
          const [yr, mo] = key.split('-').map(Number);
          const firstDow    = new Date(yr, mo - 1, 1).getDay(); // 0=Sun
          const daysInMonth = new Date(yr, mo, 0).getDate();
          const startOffset = (firstDow + 6) % 7;               // Mon=0 … Sun=6

          let actCount = 0;
          const weeks = [];
          let week = [];
          for (let i = 0; i < startOffset; i++) week.push(null);
          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${key}-${String(d).padStart(2, '0')}`;
            const dow     = (startOffset + d - 1) % 7;
            const acts    = byDate[dateStr] || [];
            actCount += acts.length;
            week.push({ day: d, dateStr, isToday: dateStr === today, isWeekend: dow >= 5, acts });
            if (week.length === 7) { weeks.push(week); week = []; }
          }
          if (week.length > 0) {
            while (week.length < 7) week.push(null);
            weeks.push(week);
          }
          return { key, label, weeks, actCount };
        });
      });

      // Calendar sub-view: annual | monthly
      const calViewMode   = ref('annual');
      const calMonthIndex = ref(0);

      const calCurrentMonthData = computed(() => calendarData.value[calMonthIndex.value] || null);

      function calPrevMonth() { if (calMonthIndex.value > 0) calMonthIndex.value--; }
      function calNextMonth() { if (calMonthIndex.value < calendarData.value.length - 1) calMonthIndex.value++; }

      // When switching to monthly view, jump to the current month (or first)
      watch(() => calViewMode.value, (val) => {
        if (val === 'monthly') {
          const idx = calendarData.value.findIndex(m => m.key === TODAY_KEY);
          calMonthIndex.value = idx >= 0 ? idx : 0;
        }
      });

      // ── Click-outside for tipologia dropdown ──────────────────────────────
      function _onDocClick(e) {
        if (tipDdOpen.value && tipDropEl.value && !tipDropEl.value.contains(e.target)) {
          tipDdOpen.value = false;
          tipSearch.value = '';
        }
        if (actionsOpen.value && actionsEl.value && !actionsEl.value.contains(e.target)) {
          actionsOpen.value = false;
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

      // Debounce raw search input → search (used by filteredActividades)
      watch(searchRaw, (val) => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => { search.value = val; }, 150);
      });

      function clearSearch() {
        clearTimeout(_searchTimer);
        searchRaw.value = '';
        search.value    = '';
      }

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
        clearSelection();
        cancelQuickAdd();
        try {
          actividades.value = await api('get_actividades', { ano_lectivo: selectedAno.value }) || [];
          nextTick(autoCollapsePast);
        } catch (e) {
          toast('Erro ao carregar actividades', 'error');
        } finally {
          loading.value = false;
        }
      }

      // ── Panel ─────────────────────────────────────────────────────────────
      function _resetPanelScroll() {
        const body = document.querySelector('.pa-panel-body');
        if (body) body.scrollTop = 0;
      }

      function openNewActivity(groupKey) {
        Object.assign(form, EMPTY_FORM());
        form.ano_lectivo = selectedAno.value;
        if (groupKey && groupKey !== '__nodate__') form.data = groupKey + '-01';
        editingAct.value = null;
        confirmDelete.value = false;
        panelOpen.value = true;
        nextTick(() => { _resetPanelScroll(); inputActividade.value && inputActividade.value.focus(); });
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
        nextTick(() => { _resetPanelScroll(); inputActividade.value && inputActividade.value.focus(); });
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

      const duplicating = ref(false);

      // ── Quick inline add ─────────────────────────────────────────────────
      const quickAdd        = reactive({ groupKey: null, name: '', date: '' });
      const quickAddSaving  = ref(false);

      function openQuickAdd(groupKey) {
        quickAdd.groupKey = groupKey;
        quickAdd.name     = '';
        quickAdd.date     = groupKey && groupKey !== '__nodate__' ? groupKey + '-01' : '';
        nextTick(() => {
          const el = document.querySelector('.pa-quick-add-name');
          if (el) el.focus();
        });
      }
      function cancelQuickAdd() {
        quickAdd.groupKey = null;
        quickAdd.name     = '';
        quickAdd.date     = '';
      }
      async function saveQuickAdd() {
        const name = quickAdd.name.trim();
        if (!name || quickAddSaving.value) return;
        quickAddSaving.value = true;
        try {
          const payload = {
            actividade:     name,
            estado:         'Pendente',
            ano_lectivo:    selectedAno.value,
            data:           quickAdd.date || null,
            tipologia:      null,
            orador:         null,
            local:          null,
            orcamento:      null,
            notas_execucao: null,
          };
          const saved = await api('create_actividade', { data_json: JSON.stringify(payload) });
          actividades.value.push(saved);
          toast('Actividade adicionada', 'success');
          // Stay open for rapid entry — clear name, keep date
          quickAdd.name = '';
          nextTick(() => {
            const el = document.querySelector('.pa-quick-add-name');
            if (el) el.focus();
          });
        } catch (e) {
          toast('Erro ao criar: ' + e.message, 'error');
        } finally {
          quickAddSaving.value = false;
        }
      }

      // ── Multi-select / bulk ───────────────────────────────────────────────
      const selected         = ref(new Set());
      const bulkEstadoTarget = ref('');
      const bulkMoveTarget   = ref('');
      const bulkDelConfirm   = ref(false);
      const bulkActWorking   = ref(false);

      const selectionCount = computed(() => selected.value.size);
      const hasSelection   = computed(() => selected.value.size > 0);
      const isAllSelected  = computed(() =>
        filteredActividades.value.length > 0 &&
        filteredActividades.value.every(a => selected.value.has(a.name))
      );
      const isSomeSelected = computed(() =>
        filteredActividades.value.some(a => selected.value.has(a.name))
      );

      // All months in the academic year (for bulk-move target)
      const allMonthsForYear = computed(() => {
        const yr = selectedAno.value || '';
        let startKey, endKey;
        if (/^\d{4}-\d{4}$/.test(yr)) {
          const [sy, ey] = yr.split('-');
          startKey = `${sy}-09`; endKey = `${ey}-08`;
        } else if (/^\d{4}$/.test(yr)) {
          startKey = `${yr}-01`; endKey = `${yr}-12`;
        } else {
          return availableMonths.value;
        }
        const months = [];
        let cur = startKey;
        while (cur <= endKey) {
          months.push({ key: cur, label: monthLabel(cur) });
          const [y, m] = cur.split('-').map(Number);
          const nm = m === 12 ? 1 : m + 1;
          const ny = m === 12 ? y + 1 : y;
          cur = `${ny}-${String(nm).padStart(2, '0')}`;
        }
        return months;
      });

      function isMonthFullySelected(key) {
        const group = filteredGroups.value.find(g => g.key === key);
        if (!group || group.items.length === 0) return false;
        return group.items.every(a => selected.value.has(a.name));
      }
      function isMonthPartiallySelected(key) {
        const group = filteredGroups.value.find(g => g.key === key);
        if (!group) return false;
        return group.items.some(a => selected.value.has(a.name));
      }

      function toggleSelect(name) {
        const s = new Set(selected.value);
        if (s.has(name)) s.delete(name); else s.add(name);
        selected.value = s;
      }
      function toggleSelectAll() {
        if (isAllSelected.value) {
          selected.value = new Set();
        } else {
          selected.value = new Set(filteredActividades.value.map(a => a.name));
        }
      }
      function toggleSelectMonth(key) {
        const group = filteredGroups.value.find(g => g.key === key);
        if (!group) return;
        const names = group.items.map(a => a.name);
        const allSel = names.every(n => selected.value.has(n));
        const s = new Set(selected.value);
        if (allSel) { names.forEach(n => s.delete(n)); }
        else         { names.forEach(n => s.add(n)); }
        selected.value = s;
      }
      function clearSelection() {
        selected.value = new Set();
        bulkDelConfirm.value  = false;
        bulkMoveTarget.value  = '';
        bulkEstadoTarget.value = '';
      }
      function onBulkEstadoChange() {
        if (bulkEstadoTarget.value) bulkMarkEstado(bulkEstadoTarget.value);
      }
      function handleCardClick(act) {
        if (hasSelection.value) { toggleSelect(act.name); }
        else                     { openEdit(act); }
      }

      async function bulkMarkEstado(estado) {
        if (!selected.value.size || !estado) return;
        bulkActWorking.value = true;
        const names = Array.from(selected.value);
        const orig  = {};
        names.forEach(n => {
          const a = actividades.value.find(x => x.name === n);
          if (a) { orig[n] = a.estado; a.estado = estado; }
        });
        try {
          await api('bulk_update_estado', { names_json: JSON.stringify(names), estado });
          toast(`${names.length} actividade${names.length !== 1 ? 's' : ''} marcada${names.length !== 1 ? 's' : ''} como "${estado}"`, 'success');
          clearSelection();
        } catch (e) {
          names.forEach(n => { const a = actividades.value.find(x => x.name === n); if (a && orig[n]) a.estado = orig[n]; });
          toast('Erro ao actualizar: ' + e.message, 'error');
        } finally {
          bulkActWorking.value = false;
        }
      }

      async function doBulkDelete() {
        if (!selected.value.size) return;
        bulkActWorking.value = true;
        const names = Array.from(selected.value);
        try {
          await api('bulk_delete', { names_json: JSON.stringify(names) });
          actividades.value = actividades.value.filter(a => !names.includes(a.name));
          toast(`${names.length} actividade${names.length !== 1 ? 's' : ''} eliminada${names.length !== 1 ? 's' : ''}`, 'info');
          clearSelection();
        } catch (e) {
          toast('Erro ao eliminar: ' + e.message, 'error');
        } finally {
          bulkActWorking.value = false;
        }
      }

      async function doBulkMoveMonth() {
        if (!selected.value.size || !bulkMoveTarget.value) return;
        bulkActWorking.value = true;
        const names  = Array.from(selected.value);
        const target = bulkMoveTarget.value;
        const [ny, nm] = target.split('-').map(Number);
        const lastDay = new Date(ny, nm, 0).getDate();
        const orig = {};
        names.forEach(n => {
          const a = actividades.value.find(x => x.name === n);
          if (!a) return;
          orig[n] = a.data;
          if (a.data) {
            const day = Math.min(parseInt(a.data.split('-')[2], 10), lastDay);
            a.data = `${target}-${String(day).padStart(2, '0')}`;
          } else {
            a.data = `${target}-01`;
          }
        });
        try {
          const result = await api('bulk_move_month', { names_json: JSON.stringify(names), new_month: target });
          // Sync server-authoritative dates and data_original
          if (result && result.rows) {
            result.rows.forEach(r => {
              const a = actividades.value.find(x => x.name === r.name);
              if (a) {
                a.data = r.data;
                if (r.data_original) a.data_original = r.data_original;
              }
            });
          }
          toast(`${names.length} actividade${names.length !== 1 ? 's' : ''} movida${names.length !== 1 ? 's' : ''} para ${monthLabel(target)}`, 'success');
          clearSelection();
        } catch (e) {
          names.forEach(n => { const a = actividades.value.find(x => x.name === n); if (a) a.data = orig[n]; });
          toast('Erro ao mover: ' + e.message, 'error');
        } finally {
          bulkActWorking.value = false;
        }
      }

      // ── Copy from previous year ───────────────────────────────────────────
      const copyModal = reactive({
        open:    false,
        loading: false,
        copying: false,
        preview: null,   // { prev_year, source_count, target_count }
        error:   '',
      });

      async function openCopyYearModal() {
        if (panelOpen.value) closePanel();
        copyModal.open    = true;
        copyModal.loading = true;
        copyModal.preview = null;
        copyModal.error   = '';
        try {
          copyModal.preview = await api('get_copy_preview', { target_ano_lectivo: selectedAno.value });
        } catch (e) {
          copyModal.error = e.message || 'Não existe ano lectivo anterior para copiar.';
        } finally {
          copyModal.loading = false;
        }
      }

      function closeCopyYearModal() {
        if (copyModal.copying) return;
        copyModal.open = false;
      }

      async function confirmCopyYear() {
        if (!copyModal.preview || copyModal.copying) return;
        copyModal.copying = true;
        try {
          const result = await api('copy_from_previous_year', { target_ano_lectivo: selectedAno.value });
          if (result.rows && result.rows.length) {
            result.rows.forEach(r => actividades.value.push(r));
            nextTick(autoCollapsePast);
          }
          const n = result.copied;
          toast(`${n} actividade${n !== 1 ? 's' : ''} copiada${n !== 1 ? 's' : ''} de ${result.prev_year}`, 'success');
          closeCopyYearModal();
        } catch (e) {
          toast('Erro ao copiar: ' + e.message, 'error');
        } finally {
          copyModal.copying = false;
        }
      }

      async function duplicateActivity() {
        if (!editingAct.value) return;
        duplicating.value = true;
        try {
          const src = editingAct.value;
          const payload = {
            actividade:    src.actividade,
            tipologia:     src.tipologia     || null,
            estado:        'Pendente',          // always reset
            ano_lectivo:   src.ano_lectivo,
            data:          src.data            || null,
            orador:        src.orador          || null,
            local:         src.local           || null,
            orcamento:     src.orcamento       || null,
            notas_execucao: null,               // execution notes don't carry over
          };
          const created = await api('create_actividade', { data_json: JSON.stringify(payload) });
          actividades.value.push(created);
          toast('Actividade duplicada', 'success');
          // Switch panel to editing the new copy
          openEdit(created);
        } catch (e) {
          toast('Erro ao duplicar: ' + e.message, 'error');
        } finally {
          duplicating.value = false;
        }
      }

      const flashingRow = ref(null);

      async function cycleStatus(act) {
        const next = STATUS_NEXT[act.estado] || 'Pendente';
        const prev = act.estado;
        act.estado = next;
        flashingRow.value = act.name;
        setTimeout(() => { if (flashingRow.value === act.name) flashingRow.value = null; }, 620);
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
      const justMovedCard = ref(null);
      let   _justMovedTimer = null;

      function markJustMoved(name) {
        clearTimeout(_justMovedTimer);
        justMovedCard.value = name;
        _justMovedTimer = setTimeout(() => { justMovedCard.value = null; }, 450);
      }

      function onDragStart(act, evt) {
        _dragAct = act;
        dragItem.value = act.name;
        evt.dataTransfer.effectAllowed = 'move';
        evt.dataTransfer.setData('text/plain', act.name);
      }
      function onDragEnd() {
        dragItem.value = null;
        dragOverGroup.value = null;
        dragTarget.value = null;
        _dragAct = null;
      }
      function onDragOver(k) { dragOverGroup.value = k; }
      function onDragLeave(k) { if (dragOverGroup.value === k) dragOverGroup.value = null; }

      async function onDrop(groupKey) {
        dragOverGroup.value = null;
        if (!_dragAct) return;

        const act      = _dragAct;
        const tgtCard  = dragTarget.value;   // capture before clearing
        dragTarget.value = null;

        const srcKey      = monthKey(act.data || '');
        const isSameMonth = srcKey === groupKey;

        if (isSameMonth) {
          // ── Intra-month reorder ──────────────────────────────────────────
          if (tgtCard && tgtCard !== act.name) {
            await _reorderWithinMonth(groupKey, act.name, tgtCard);
          }
          return;
        }

        // ── Inter-month move (change date) ───────────────────────────────
        const newDate = groupKey === '__nodate__'
          ? null
          : (act.data && monthKey(act.data) === groupKey ? act.data : groupKey + '-01');
        const oldDate = act.data;
        act.data = newDate;  // optimistic
        markJustMoved(act.name);
        try {
          await api('update_actividade', { name: act.name, data_json: JSON.stringify({ ...act, data: newDate }) });
          toast('Actividade movida para ' + monthLabel(groupKey), 'info');
        } catch (e) {
          act.data = oldDate;
          justMovedCard.value = null;
          toast('Erro ao mover', 'error');
        }
      }

      async function _reorderWithinMonth(groupKey, srcName, tgtName) {
        // Find positions in the master array
        const mainSrcIdx = actividades.value.findIndex(a => a.name === srcName);
        const mainTgtIdx = actividades.value.findIndex(a => a.name === tgtName);
        if (mainSrcIdx < 0 || mainTgtIdx < 0 || mainSrcIdx === mainTgtIdx) return;

        // Save for potential rollback
        const original = [...actividades.value];

        // Optimistic: splice the item to its new position
        const arr = [...actividades.value];
        const [moved] = arr.splice(mainSrcIdx, 1);
        arr.splice(mainTgtIdx, 0, moved);
        actividades.value = arr;

        // Derive the new ordered name list for this month from the updated computed
        const updatedGroup  = filteredGroups.value.find(g => g.key === groupKey);
        const orderedNames  = updatedGroup ? updatedGroup.items.map(a => a.name) : [];

        try {
          await api('reorder_actividades', {
            ano_lectivo:   selectedAno.value,
            ordered_names: JSON.stringify(orderedNames),
          });
        } catch (e) {
          actividades.value = original;   // rollback
          toast('Erro ao reordenar', 'error');
        }
      }

      function printView() { window.print(); }

      const exporting = ref(false);

      async function exportExcel() {
        if (exporting.value) return;
        exporting.value = true;
        try {
          const params = new URLSearchParams({
            ano_lectivo:    selectedAno.value,
            estado:         filterStatus.value  || '',
            tipologias_json: JSON.stringify(filterTipologias.value),
            month:          filterMonth.value   || '',
            csrf_token:     frappe.csrf_token,
          });
          const url = `/api/method/portal.catequista.page.plano_anual.plano_anual.export_actividades?${params}`;
          // Trigger download via hidden link (avoids popup blockers)
          const a = document.createElement('a');
          a.href = url;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast('A descarregar Excel…', 'success');
        } catch (e) {
          toast('Erro ao exportar: ' + e.message, 'error');
        } finally {
          // Give the browser a moment to start the download before re-enabling
          setTimeout(() => { exporting.value = false; }, 2000);
        }
      }

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
      function calActStyle(act) {
        const cor = tipologiaColor(act);
        return { background: hexToRgba(cor, 0.13), borderLeft: '2.5px solid ' + cor };
      }
      function openNewActivityOnDay(dateStr) {
        Object.assign(form, EMPTY_FORM());
        form.ano_lectivo = selectedAno.value;
        form.data        = dateStr;
        editingAct.value    = null;
        confirmDelete.value = false;
        panelOpen.value     = true;
        nextTick(() => inputActividade.value && inputActividade.value.focus());
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
        searchRaw, viewMode, panelOpen, form, editingAct, confirmDelete, toasts,
        inputActividade, dragItem, dragOverGroup, dragTarget,
        filterStatus, filterTipologias, filterMonth,
        tipDdOpen, tipSearch, tipDropEl, tipSearchInput,
        actionsOpen, actionsEl,
        stats, availableMonths, hasFilters, filteredGroups, filteredTipDd,
        tipologiaMap, calendarData, calViewMode, calMonthIndex, calCurrentMonthData, calPrevMonth, calNextMonth,
        loadActividades, openNewActivity, openEdit, closePanel,
        saveActivity, deleteActivity, duplicating, duplicateActivity,
        cycleStatus, flashingRow, removeTipFilter,
        onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, justMovedCard,
        clearSearch,
        printView, exporting, exportExcel,
        cardStyle, tipologiaChipStyle, tipologiaColor, calActStyle,
        openNewActivityOnDay,
        statusClass, statusChipClass,
        formatDate, formatCurrency, truncate, isOverdue, hexToRgba,
        TODAY_KEY, collapsedMonths, isCurrentMonth, isPastMonth, isCollapsed, toggleCollapse, expandAll,
        TIP_PALETTE, showTipForm, savingTip, newTip, newTipInput,
        toggleTipForm, cancelTipForm, saveTipologia,
        // Quick inline add
        quickAdd, quickAddSaving, openQuickAdd, cancelQuickAdd, saveQuickAdd,
        // Copy year modal
        copyModal, openCopyYearModal, closeCopyYearModal, confirmCopyYear,
        // Multi-select / bulk
        selected, selectionCount, hasSelection, isAllSelected, isSomeSelected,
        allMonthsForYear, bulkEstadoTarget, bulkMoveTarget, bulkDelConfirm, bulkActWorking,
        isMonthFullySelected, isMonthPartiallySelected,
        toggleSelect, toggleSelectAll, toggleSelectMonth, clearSelection, handleCardClick,
        onBulkEstadoChange, bulkMarkEstado, doBulkDelete, doBulkMoveMonth,
      };
    },
  });
}

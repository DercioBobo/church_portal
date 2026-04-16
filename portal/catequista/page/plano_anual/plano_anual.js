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

  // Load Vue 3 from CDN if not already loaded
  if (window.Vue) {
    _mountApp();
  } else {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/vue@3.4.21/dist/vue.global.prod.js';
    script.onload = _mountApp;
    script.onerror = function () {
      // Fallback to jsdelivr
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

const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const STATUS_CYCLE = ['Pendente','Realizada','Cancelada','Adiada'];
const STATUS_NEXT  = { Pendente:'Realizada', Realizada:'Cancelada', Cancelada:'Adiada', Adiada:'Pendente' };

// Default palette assigned by tipologia index
const PALETTE = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
];

function hexToRgba(hex, alpha = 0.12) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function isOverdue(act) {
  if (!act.data || act.estado !== 'Pendente') return false;
  return act.data < frappe.datetime.get_today();
}

function monthKey(dateStr) {
  if (!dateStr) return '__nodate__';
  return dateStr.substring(0, 7); // YYYY-MM
}

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
      callback: (r) => {
        if (r.exc) reject(new Error(r.exc));
        else resolve(r.message);
      },
      error: reject,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// App factory
// ─────────────────────────────────────────────────────────────────────────────

function createPlanoAnualApp() {
  const { createApp, ref, computed, reactive, watch, nextTick } = Vue;

  const EMPTY_FORM = () => ({
    name: null,
    actividade: '',
    tipologia: '',
    estado: 'Pendente',
    ano_lectivo: '',
    data: '',
    orador: '',
    local: '',
    orcamento: '',
    notas_execucao: '',
  });

  return createApp({
    template: `
<div id="plano-anual-app">

  <!-- Toolbar -->
  <div class="pa-toolbar">
    <h1>📅 Plano Anual da Catequese</h1>
    <select v-model="selectedAno" @change="loadActividades">
      <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
    </select>
    <input type="text" v-model="search" placeholder="Pesquisar..." style="width:180px">
    <button class="pa-btn pa-btn-ghost" @click="openNewActivity(null)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nova Actividade
    </button>
  </div>

  <!-- Stats bar -->
  <div class="pa-stats-bar" v-if="!loading">
    <span class="pa-stat-chip total">Total: {{ stats.total }}</span>
    <span class="pa-stat-chip realizada">✓ Realizadas: {{ stats.realizada }}</span>
    <span class="pa-stat-chip pendente">● Pendentes: {{ stats.pendente }}</span>
    <span class="pa-stat-chip adiada">⏸ Adiadas: {{ stats.adiada }}</span>
    <span class="pa-stat-chip cancelada">✕ Canceladas: {{ stats.cancelada }}</span>
  </div>

  <!-- Timeline -->
  <div class="pa-timeline">
    <div v-if="loading" class="pa-loading">
      <div class="pa-spinner"></div> A carregar plano...
    </div>

    <div v-else>
      <div
        v-for="group in filteredGroups"
        :key="group.key"
        class="pa-month-group"
      >
        <div class="pa-month-header">
          <span class="pa-month-label">{{ group.label }}</span>
          <span class="pa-month-count">{{ group.items.length }} actividade{{ group.items.length !== 1 ? 's' : '' }}</span>
          <div class="pa-month-line"></div>
          <button class="pa-month-add" @click="openNewActivity(group.key)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Adicionar
          </button>
        </div>

        <div
          class="pa-cards"
          :class="{ 'drag-over': dragOverGroup === group.key }"
          @dragover.prevent="onDragOver(group.key)"
          @dragleave="onDragLeave(group.key)"
          @drop.prevent="onDrop(group.key, $event)"
        >
          <div
            v-for="act in group.items"
            :key="act.name"
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
              <span
                class="pa-card-status"
                :class="statusClass(act.estado)"
                @click.stop="cycleStatus(act)"
                :title="'Clique para alterar estado (agora: ' + act.estado + ')'"
              >{{ act.estado }}</span>
            </div>

            <div class="pa-card-meta">
              <span v-if="act.data" class="pa-card-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {{ formatDate(act.data) }}
                <span v-if="act.data_original" style="color:#f59e0b;margin-left:3px" :title="'Data original: ' + formatDate(act.data_original)">✎</span>
              </span>
              <span v-if="act.orador" class="pa-card-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                {{ act.orador }}
              </span>
              <span v-if="act.local" class="pa-card-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                {{ truncate(act.local, 30) }}
              </span>
              <span v-if="act.orcamento" class="pa-card-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M22 10H2"/></svg>
                {{ formatCurrency(act.orcamento) }}
              </span>
            </div>

            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
              <span v-if="act.tipologia" class="pa-card-tipologia" :style="tipologiaChipStyle(act)">
                <span v-if="act.tipologia_icone">{{ act.tipologia_icone }}</span>
                {{ act.tipologia }}
              </span>
              <span v-if="isOverdue(act)" class="pa-overdue-tag">⚠ Vencida</span>
            </div>
          </div>

          <div v-if="group.items.length === 0" class="pa-empty">
            Sem actividades neste mês — clique em Adicionar
          </div>
        </div>
      </div>

      <div v-if="filteredGroups.length === 0 && !loading" class="pa-loading" style="min-height:200px">
        <div style="text-align:center">
          <div style="font-size:3rem;margin-bottom:12px">📋</div>
          <div style="font-weight:600;color:#374151;margin-bottom:6px">Nenhuma actividade encontrada</div>
          <div style="color:#9ca3af;font-size:0.85rem">{{ search ? 'Tente outra pesquisa' : 'Adicione a primeira actividade do plano' }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Slide-over overlay -->
  <div class="pa-overlay" :class="{ open: panelOpen }" @click="closePanel"></div>

  <!-- Slide-over panel -->
  <div class="pa-panel" :class="{ open: panelOpen }">
    <div class="pa-panel-header">
      <h2>{{ form.name ? 'Editar Actividade' : 'Nova Actividade' }}</h2>
      <button class="pa-panel-close" @click="closePanel">✕</button>
    </div>

    <div class="pa-panel-body">
      <!-- Core fields -->
      <div class="pa-field">
        <label>Actividade <span class="req">*</span></label>
        <input v-model="form.actividade" type="text" placeholder="Nome ou descrição da actividade" ref="inputActividade">
      </div>

      <div class="pa-field-row">
        <div class="pa-field">
          <label>Data</label>
          <input v-model="form.data" type="date">
        </div>
        <div class="pa-field">
          <label>Estado</label>
          <select v-model="form.estado">
            <option>Pendente</option>
            <option>Realizada</option>
            <option>Cancelada</option>
            <option>Adiada</option>
          </select>
        </div>
      </div>

      <div class="pa-field-row">
        <div class="pa-field">
          <label>Tipologia</label>
          <select v-model="form.tipologia">
            <option value="">— Sem tipologia —</option>
            <option v-for="t in tipologias" :key="t.name" :value="t.name">
              {{ t.icone ? t.icone + ' ' : '' }}{{ t.name }}
            </option>
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
        <textarea v-model="form.notas_execucao" rows="3" placeholder="Como correu, observações, notas para o arquivo…"></textarea>
      </div>

      <!-- data_original hint -->
      <div v-if="form.name && editingAct && editingAct.data_original" class="pa-field">
        <div class="pa-field-hint">
          📌 Data original: <strong>{{ formatDate(editingAct.data_original) }}</strong>
        </div>
      </div>

      <!-- Delete zone -->
      <template v-if="form.name">
        <div class="pa-section-divider"></div>
        <div v-if="!confirmDelete" style="text-align:center">
          <button class="pa-btn pa-btn-danger" style="border:none;cursor:pointer" @click="confirmDelete = true">
            🗑 Eliminar Actividade
          </button>
        </div>
        <div v-else class="pa-delete-zone">
          <p>Tem a certeza? Esta acção não pode ser desfeita.</p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="pa-btn pa-btn-danger" @click="deleteActivity">Sim, eliminar</button>
            <button class="pa-btn pa-btn-ghost" @click="confirmDelete = false">Cancelar</button>
          </div>
        </div>
      </template>
    </div>

    <div class="pa-panel-footer">
      <button class="pa-btn pa-btn-ghost" @click="closePanel">Cancelar</button>
      <button class="pa-btn pa-btn-primary" @click="saveActivity" :disabled="saving">
        <span v-if="saving">
          <div class="pa-spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></div>
          A guardar…
        </span>
        <span v-else>{{ form.name ? 'Guardar' : 'Criar Actividade' }}</span>
      </button>
    </div>
  </div>

  <!-- Toast container -->
  <div class="pa-toast-container">
    <div v-for="t in toasts" :key="t.id" class="pa-toast" :class="t.type">{{ t.msg }}</div>
  </div>

</div>
    `,

    setup() {
      const { ref, computed, reactive, watch, nextTick } = Vue;

      // ── State ───────────────────────────────────────────────────────────────
      const loading     = ref(true);
      const saving      = ref(false);
      const actividades = ref([]);
      const tipologias  = ref([]);
      const anos        = ref([]);
      const selectedAno = ref('');
      const search      = ref('');
      const panelOpen   = ref(false);
      const form        = reactive(EMPTY_FORM());
      const editingAct  = ref(null);
      const confirmDelete = ref(false);
      const toasts      = ref([]);
      const inputActividade = ref(null);

      // Drag state
      const dragItem    = ref(null);
      const dragOverGroup = ref(null);
      const dragTarget  = ref(null);

      // Tipologia colour map by name
      const tipologiaMap = computed(() => {
        const m = {};
        tipologias.value.forEach((t, i) => {
          m[t.name] = { cor: t.cor || PALETTE[i % PALETTE.length], icone: t.icone };
        });
        return m;
      });

      // ── Stats ───────────────────────────────────────────────────────────────
      const stats = computed(() => {
        const s = { total: 0, realizada: 0, pendente: 0, adiada: 0, cancelada: 0 };
        actividades.value.forEach(a => {
          s.total++;
          const k = (a.estado || 'Pendente').toLowerCase().replace('í','i');
          if (s[k] !== undefined) s[k]++;
        });
        return s;
      });

      // ── Grouping ────────────────────────────────────────────────────────────
      const filteredActividades = computed(() => {
        const q = search.value.toLowerCase().trim();
        if (!q) return actividades.value;
        return actividades.value.filter(a =>
          (a.actividade || '').toLowerCase().includes(q) ||
          (a.orador     || '').toLowerCase().includes(q) ||
          (a.local      || '').toLowerCase().includes(q) ||
          (a.tipologia  || '').toLowerCase().includes(q)
        );
      });

      const filteredGroups = computed(() => {
        const map = {};
        filteredActividades.value.forEach(a => {
          const k = monthKey(a.data);
          if (!map[k]) map[k] = [];
          map[k].push(a);
        });

        // Sort month keys chronologically, keep __nodate__ last
        const keys = Object.keys(map).sort((a, b) => {
          if (a === '__nodate__') return 1;
          if (b === '__nodate__') return -1;
          return a.localeCompare(b);
        });

        return keys.map(k => ({
          key: k,
          label: monthLabel(k),
          items: map[k],
        }));
      });

      // ── Data loading ─────────────────────────────────────────────────────────
      async function init() {
        loading.value = true;
        try {
          const [anosResp, anoAtual, tipResp] = await Promise.all([
            api('get_anos_lectivos', {}),
            api('get_ano_lectivo_atual', {}),
            api('get_tipologias', {}),
          ]);
          anos.value      = anosResp || [];
          tipologias.value = tipResp || [];
          selectedAno.value = anoAtual || (anosResp && anosResp[0]) || '';
          if (selectedAno.value) await loadActividades();
        } catch (e) {
          toast('Erro ao carregar plano: ' + e.message, 'error');
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

      // ── Panel / form ─────────────────────────────────────────────────────────
      function openNewActivity(groupKey) {
        Object.assign(form, EMPTY_FORM());
        form.ano_lectivo = selectedAno.value;
        if (groupKey && groupKey !== '__nodate__') {
          form.data = groupKey + '-01'; // pre-fill first day of the month
        }
        editingAct.value  = null;
        confirmDelete.value = false;
        panelOpen.value   = true;
        nextTick(() => inputActividade.value && inputActividade.value.focus());
      }

      function openEdit(act) {
        Object.assign(form, {
          name:          act.name,
          actividade:    act.actividade || '',
          tipologia:     act.tipologia || '',
          estado:        act.estado || 'Pendente',
          ano_lectivo:   act.ano_lectivo || selectedAno.value,
          data:          act.data || '',
          orador:        act.orador || '',
          local:         act.local || '',
          orcamento:     act.orcamento || '',
          notas_execucao: act.notas_execucao || '',
        });
        editingAct.value  = act;
        confirmDelete.value = false;
        panelOpen.value   = true;
        nextTick(() => inputActividade.value && inputActividade.value.focus());
      }

      function closePanel() {
        panelOpen.value = false;
        confirmDelete.value = false;
      }

      async function saveActivity() {
        if (!form.actividade.trim()) {
          toast('O campo Actividade é obrigatório', 'error');
          return;
        }
        saving.value = true;
        try {
          const payload = { ...form };
          // Clean empty strings to null
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
          toast(form.name ? 'Actividade actualizada' : 'Actividade criada', 'success');
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
          toast('Actividade eliminada', 'info');
          closePanel();
        } catch (e) {
          toast('Erro ao eliminar: ' + e.message, 'error');
        } finally {
          saving.value = false;
        }
      }

      // ── Inline status cycle ──────────────────────────────────────────────────
      async function cycleStatus(act) {
        const next = STATUS_NEXT[act.estado] || 'Pendente';
        const prev = act.estado;
        act.estado = next; // optimistic
        try {
          await api('update_estado', { name: act.name, estado: next });
          toast('Estado: ' + next, 'success');
        } catch (e) {
          act.estado = prev; // rollback
          toast('Erro ao alterar estado', 'error');
        }
      }

      // ── Drag and drop ────────────────────────────────────────────────────────
      let _dragAct = null;

      function onDragStart(act, evt) {
        _dragAct = act;
        dragItem.value = act.name;
        evt.dataTransfer.effectAllowed = 'move';
        evt.dataTransfer.setData('text/plain', act.name);
      }

      function onDragEnd() {
        dragItem.value   = null;
        dragOverGroup.value = null;
        dragTarget.value = null;
        _dragAct = null;
      }

      function onDragOver(groupKey) {
        dragOverGroup.value = groupKey;
      }

      function onDragLeave(groupKey) {
        if (dragOverGroup.value === groupKey) dragOverGroup.value = null;
      }

      async function onDrop(groupKey, evt) {
        dragOverGroup.value = null;
        if (!_dragAct) return;

        const act = _dragAct;
        const newDate = groupKey === '__nodate__' ? null
          : (act.data && monthKey(act.data) === groupKey ? act.data : groupKey + '-01');

        // Don't do anything if same month and same date
        if (monthKey(act.data || '') === groupKey && act.data === newDate) return;

        const oldDate = act.data;
        act.data = newDate; // optimistic

        try {
          await api('update_actividade', {
            name: act.name,
            data_json: JSON.stringify({ ...act, data: newDate }),
          });
          toast('Actividade movida', 'info');
        } catch (e) {
          act.data = oldDate; // rollback
          toast('Erro ao mover', 'error');
        }
      }

      // ── Styling helpers ──────────────────────────────────────────────────────
      function cardStyle(act) {
        const tmap = tipologiaMap.value;
        const cor = act.tipologia && tmap[act.tipologia]
          ? tmap[act.tipologia].cor
          : '#e5e7eb';
        return `--tipologia-cor: ${cor}`;
      }

      function tipologiaChipStyle(act) {
        const tmap = tipologiaMap.value;
        const cor = act.tipologia && tmap[act.tipologia]
          ? tmap[act.tipologia].cor
          : '#6b7280';
        return `--tipologia-bg: ${hexToRgba(cor, 0.15)}; --tipologia-text: ${cor}`;
      }

      function statusClass(estado) {
        const m = { Pendente:'status-pendente', Realizada:'status-realizada', Cancelada:'status-cancelada', Adiada:'status-adiada' };
        return m[estado] || 'status-pendente';
      }

      function formatDate(d) {
        if (!d) return '';
        const [y,m,day] = d.split('-');
        return `${day}/${m}/${y}`;
      }

      function formatCurrency(v) {
        if (!v) return '';
        return parseFloat(v).toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN', minimumFractionDigits: 0 });
      }

      function truncate(s, n) {
        if (!s) return '';
        return s.length > n ? s.substring(0, n) + '…' : s;
      }

      // ── Toasts ───────────────────────────────────────────────────────────────
      let _toastId = 0;
      function toast(msg, type = 'info') {
        const id = ++_toastId;
        toasts.value.push({ id, msg, type });
        setTimeout(() => {
          toasts.value = toasts.value.filter(t => t.id !== id);
        }, 3200);
      }

      // ── Init ─────────────────────────────────────────────────────────────────
      init();

      return {
        loading, saving, actividades, tipologias, anos, selectedAno,
        search, panelOpen, form, editingAct, confirmDelete, toasts,
        inputActividade, dragItem, dragOverGroup, dragTarget,
        stats, filteredGroups,
        loadActividades, openNewActivity, openEdit, closePanel,
        saveActivity, deleteActivity, cycleStatus,
        onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
        cardStyle, tipologiaChipStyle, statusClass,
        formatDate, formatCurrency, truncate, isOverdue,
      };
    },
  });
}

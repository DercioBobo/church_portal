/* global frappe, Vue */
// Plano de Retiros — Vue 3 CDN, list view with inline programa editing

frappe.pages['plano-retiro'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Plano de Retiros'),
    single_column: true,
  });

  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = '/assets/portal/css/plano_retiro.css';
  document.head.appendChild(link);

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    createPlanoRetiroApp().mount(mount);
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
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).substring(0, 10).split('-');
  return `${parseInt(day)} ${MESES_PT[parseInt(m) - 1]} ${y}`;
}

function api(method, args) {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: `portal.catequista.page.plano_retiro.plano_retiro.${method}`,
      args,
      callback: (r) => { if (r.exc) reject(new Error(r.exc)); else resolve(r.message); },
      error: reject,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
function createPlanoRetiroApp() {
  const { createApp, ref, computed, onMounted, watch, reactive } = Vue;

  return createApp({
    template: `
      <div style="padding:16px 0; min-height:300px;">

        <!-- Toolbar -->
        <div class="pr-toolbar">
          <select v-model="anoLectivo" @change="loadRetiros" class="pr-select">
            <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
          </select>

          <!-- Sort direction toggle -->
          <button class="pr-sort-btn" :class="{ 'pr-sort-desc': sortDir === 'desc' }"
            @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
            :title="sortDir === 'asc' ? 'Mais antigo primeiro — clique para inverter' : 'Mais recente primeiro — clique para inverter'">
            <svg v-if="sortDir === 'asc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            {{ sortDir === 'asc' ? 'Antigo→Novo' : 'Novo→Antigo' }}
          </button>

          <!-- Search -->
          <div class="pr-search-wrap">
            <svg class="pr-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="pr-search-input" type="text" v-model="searchRaw"
              placeholder="Pesquisar retiro…"
              @keydown.escape="clearSearch">
            <button v-if="searchRaw" class="pr-search-clear" @click="clearSearch" title="Limpar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style="flex:1"></div>
          <button class="btn btn-primary btn-sm" @click="openCreate">+ Novo Retiro</button>
        </div>

        <!-- Filter bar -->
        <div class="pr-filter-bar" v-if="!loading">
          <span class="pr-filter-label">Estado</span>
          <span class="pr-chip pr-chip-total" :class="{ active: !filterEstado }" @click="filterEstado = ''">
            Todos <span class="pr-chip-count">({{ stats.total }})</span>
          </span>
          <span v-for="s in ['Planeado','Realizado','Cancelado']" :key="s"
            class="pr-chip" :class="['pr-chip-' + s.toLowerCase(), { active: filterEstado === s }]"
            @click="filterEstado = filterEstado === s ? '' : s">
            {{ s }} <span class="pr-chip-count">({{ stats[s] || 0 }})</span>
          </span>

          <div class="pr-filter-sep" v-if="fases.length"></div>

          <template v-if="fases.length">
            <span class="pr-filter-label">Fase</span>
            <select v-model="filterFase" class="pr-select pr-select-sm">
              <option value="">Todas</option>
              <option v-for="f in fases" :key="f" :value="f">{{ f }}</option>
            </select>
          </template>

          <button v-if="filterEstado || filterFase || searchRaw" class="pr-clear-filters" @click="clearFilters">
            ✕ Limpar
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" style="text-align:center; padding:48px; color:#9ca3af;">
          <div class="spinner-border spinner-border-sm" style="width:24px;height:24px;border-width:2px;"></div>
          <p style="margin-top:12px; font-size:13px;">A carregar...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="!filteredRetiros.length" class="empty-state">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
          </svg>
          <p v-if="hasActiveFilters">Nenhum retiro corresponde aos filtros activos.</p>
          <p v-else>Nenhum retiro registado para <strong>{{ anoLectivo }}</strong></p>
          <button v-if="hasActiveFilters" class="btn btn-default btn-sm" style="margin-top:12px;" @click="clearFilters">Limpar filtros</button>
          <button v-else class="btn btn-default btn-sm" style="margin-top:12px;" @click="openCreate">Criar primeiro retiro</button>
        </div>

        <!-- List table -->
        <div v-else class="retiro-list-wrap">
          <table class="retiro-list-table">
            <thead>
              <tr>
                <th style="width:36px"></th>
                <th>Título</th>
                <th style="width:180px">Fases</th>
                <th style="width:130px">Data</th>
                <th style="width:140px">Local</th>
                <th style="width:110px">Estado</th>
                <th style="width:100px"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="r in filteredRetiros" :key="r.name">
                <!-- Main row -->
                <tr class="retiro-row" :class="{ expanded: expandedName === r.name }"
                    @click="toggleExpand(r)">
                  <td style="text-align:center; color:#9ca3af;">
                    <svg :style="{ transform: expandedName===r.name ? 'rotate(90deg)':'', transition:'transform 0.2s' }"
                      width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  </td>
                  <td>
                    <span style="font-weight:600; color:#111827;">{{ r.titulo }}</span>
                    <span v-if="r.orador" style="display:block; font-size:11px; color:#9ca3af; margin-top:1px;">{{ r.orador }}</span>
                  </td>
                  <td>
                    <span v-if="r.fase_1" class="fase-pill">{{ r.fase_1 }}</span>
                    <span v-if="r.fase_2" class="fase-pill" style="margin-left:4px;">{{ r.fase_2 }}</span>
                  </td>
                  <td style="font-size:12px; color:#374151;">{{ fmtDate(r.data) }}</td>
                  <td style="font-size:12px; color:#6b7280;">{{ r.local || '—' }}</td>
                  <td>
                    <span :class="['estado-badge', 'estado-' + r.estado]">{{ r.estado }}</span>
                  </td>
                  <td @click.stop style="white-space:nowrap;">
                    <button class="btn-icon" @click="openEdit(r)" title="Editar">✏️</button>
                    <button class="btn-icon" @click="cycleEstado(r)" :title="'→ ' + nextEstado(r.estado)">
                      {{ estadoIcon(nextEstado(r.estado)) }}
                    </button>
                    <button class="btn-icon danger" @click="confirmDelete(r)" title="Eliminar">🗑</button>
                  </td>
                </tr>

                <!-- Expanded: programa -->
                <tr v-if="expandedName === r.name" class="programa-row">
                  <td colspan="7" style="padding:0;">
                    <div class="programa-panel">
                      <ProgramaPanel :retiro="r" :fases="fases" />
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Create / Edit Modal -->
        <div v-if="showModal" class="retiro-modal-overlay" @click.self="closeModal">
          <div class="retiro-modal">
            <h3>{{ editMode ? 'Editar Retiro' : 'Novo Retiro' }}</h3>

            <div class="form-group">
              <label>Título *</label>
              <input v-model="form.titulo" placeholder="Ex: Retiro de Quaresma" />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Data</label>
                <input type="date" v-model="form.data" />
              </div>
              <div class="form-group">
                <label>Estado</label>
                <select v-model="form.estado">
                  <option>Planeado</option>
                  <option>Realizado</option>
                  <option>Cancelado</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Fase 1 *</label>
                <select v-model="form.fase_1">
                  <option value="">— seleccionar —</option>
                  <option v-for="f in fases" :key="f" :value="f">{{ f }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>Fase 2</label>
                <select v-model="form.fase_2">
                  <option value="">— nenhuma —</option>
                  <option v-for="f in fases" :key="f" :value="f" :disabled="f === form.fase_1">{{ f }}</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Local</label>
                <input v-model="form.local" placeholder="Ex: Casa de Exercícios" />
              </div>
              <div class="form-group">
                <label>Orador</label>
                <input v-model="form.orador" placeholder="Nome do orador" />
              </div>
            </div>

            <div class="form-group">
              <label>Tema</label>
              <textarea v-model="form.tema" placeholder="Tema ou subtítulo do retiro" rows="2"></textarea>
            </div>

            <div v-if="formError" style="color:#dc2626; font-size:12px; margin-top:-6px; margin-bottom:10px;">
              {{ formError }}
            </div>

            <div class="modal-footer">
              <button class="btn btn-default btn-sm" @click="closeModal" :disabled="saving">Cancelar</button>
              <button class="btn btn-primary btn-sm" @click="saveRetiro" :disabled="saving || !form.titulo || !form.fase_1">
                <span v-if="saving">A guardar...</span>
                <span v-else>{{ editMode ? 'Guardar' : 'Criar Retiro' }}</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    `,

    components: {
      ProgramaPanel: {
        props: ['retiro', 'fases'],
        template: `
          <div style="padding:16px 20px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af;">
                Programa do Dia
              </span>
              <div style="display:flex; gap:8px; align-items:center;">
                <button v-if="!editMode" class="btn btn-default btn-xs" @click="enterEdit">✏️ Editar Programa</button>
                <template v-else>
                  <button class="btn btn-default btn-xs" @click="cancelEdit" :disabled="saving">Cancelar</button>
                  <button class="btn btn-primary btn-xs" @click="savePrograma" :disabled="saving">
                    {{ saving ? 'A guardar...' : 'Guardar' }}
                  </button>
                </template>
              </div>
            </div>

            <!-- Loading -->
            <div v-if="loadingPrograma" style="text-align:center; padding:20px; color:#9ca3af; font-size:12px;">
              A carregar programa...
            </div>

            <!-- Empty read mode -->
            <div v-else-if="!editMode && !items.length"
              style="text-align:center; padding:20px; color:#d1d5db; font-size:12px;">
              Sem programa definido. Clique em "Editar Programa" para adicionar actividades.
            </div>

            <!-- Programme table -->
            <table v-else class="prog-table">
              <thead>
                <tr>
                  <th style="width:90px">Hora</th>
                  <th>Actividade</th>
                  <th style="width:150px">Responsável</th>
                  <th style="width:180px">Notas</th>
                  <th v-if="editMode" style="width:36px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in (editMode ? editItems : items)" :key="idx">
                  <td>
                    <span v-if="!editMode">{{ item.hora || '—' }}</span>
                    <input v-else v-model="item.hora" placeholder="ex: 09h30" class="prog-input" style="width:80px;" />
                  </td>
                  <td>
                    <span v-if="!editMode">{{ item.actividade }}</span>
                    <input v-else v-model="item.actividade" placeholder="Actividade" class="prog-input" />
                  </td>
                  <td>
                    <span v-if="!editMode" style="color:#6b7280;">{{ item.responsavel || '—' }}</span>
                    <input v-else v-model="item.responsavel" placeholder="—" class="prog-input" />
                  </td>
                  <td>
                    <span v-if="!editMode" style="color:#9ca3af; font-style:italic; font-size:12px;">{{ item.notas || '' }}</span>
                    <input v-else v-model="item.notas" placeholder="—" class="prog-input" />
                  </td>
                  <td v-if="editMode" style="text-align:center;">
                    <button @click="removeRow(idx)"
                      style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;padding:2px 4px;">✕</button>
                  </td>
                </tr>
                <!-- New row in edit mode -->
                <tr v-if="editMode">
                  <td colspan="5">
                    <button @click="addRow"
                      style="background:none; border:none; cursor:pointer; color:#6366f1; font-size:12px; font-weight:600; padding:4px 0;">
                      + Adicionar linha
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            <div v-if="saveError" style="color:#dc2626; font-size:12px; margin-top:8px;">{{ saveError }}</div>
          </div>
        `,

        setup(props) {
          const { ref, onMounted } = Vue;

          const items           = ref([]);
          const editItems       = ref([]);
          const editMode        = ref(false);
          const loadingPrograma = ref(false);
          const saving          = ref(false);
          const saveError       = ref('');

          async function load() {
            loadingPrograma.value = true;
            try {
              items.value = await api('get_programa', { retiro_name: props.retiro.name });
            } catch(e) {
              console.error(e);
            } finally {
              loadingPrograma.value = false;
            }
          }

          function enterEdit() {
            editItems.value = items.value.map(i => ({ ...i }));
            editMode.value = true;
          }

          function cancelEdit() {
            editItems.value = [];
            editMode.value = false;
            saveError.value = '';
          }

          function addRow() {
            editItems.value.push({ hora: '', actividade: '', responsavel: '', notas: '' });
          }

          function removeRow(idx) {
            editItems.value.splice(idx, 1);
          }

          async function savePrograma() {
            saveError.value = '';
            const valid = editItems.value.filter(i => i.actividade?.trim());
            if (!valid.length && editItems.value.length) {
              saveError.value = 'Cada linha precisa de uma actividade.';
              return;
            }
            saving.value = true;
            try {
              items.value = await api('save_programa', {
                retiro_name: props.retiro.name,
                items_json: JSON.stringify(valid),
              });
              editMode.value = false;
              editItems.value = [];
              frappe.show_alert({ message: 'Programa guardado', indicator: 'green' });
            } catch(e) {
              saveError.value = String(e?.message || e);
            } finally {
              saving.value = false;
            }
          }

          onMounted(load);

          return {
            items, editItems, editMode, loadingPrograma, saving, saveError,
            enterEdit, cancelEdit, addRow, removeRow, savePrograma,
          };
        },
      },
    },

    setup() {
      const anos         = ref([]);
      const anoLectivo   = ref('');
      const fases        = ref([]);
      const retiros      = ref([]);
      const loading      = ref(false);
      const expandedName = ref(null);

      // Search
      const searchRaw    = ref('');
      const search       = ref('');
      let   _searchTimer = null;

      // Filters & sort
      const filterEstado = ref('');
      const filterFase   = ref('');
      const sortDir      = ref('asc');

      const showModal  = ref(false);
      const editMode   = ref(false);
      const editName   = ref(null);
      const saving     = ref(false);
      const formError  = ref('');

      const emptyForm = () => ({ titulo:'', data:'', estado:'Planeado', fase_1:'', fase_2:'', local:'', orador:'', tema:'' });
      const form = ref(emptyForm());

      // Auto-suggest title from fases + year when creating new retiro
      function suggestTitle() {
        if (editMode.value) return;
        const f1 = form.value.fase_1;
        const f2 = form.value.fase_2;
        const year = anoLectivo.value ? anoLectivo.value.split('-')[0] : new Date().getFullYear();
        if (!f1) { form.value.titulo = ''; return; }
        const faseStr = f2 ? `${f1} e ${f2}` : f1;
        form.value.titulo = `Retiro da ${faseStr} ${year}`;
      }
      watch(() => form.value.fase_1, suggestTitle);
      watch(() => form.value.fase_2, suggestTitle);

      // Debounce search
      watch(searchRaw, (val) => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => { search.value = val; }, 200);
      });

      function clearSearch() {
        clearTimeout(_searchTimer);
        searchRaw.value = '';
        search.value    = '';
      }

      function clearFilters() {
        clearSearch();
        filterEstado.value = '';
        filterFase.value   = '';
      }

      const STATUS_CYCLE = ['Planeado','Realizado','Cancelado'];
      function nextEstado(e)  { return STATUS_CYCLE[(STATUS_CYCLE.indexOf(e)+1)%STATUS_CYCLE.length]; }
      function estadoIcon(e)  { return { Planeado:'📋', Realizado:'✅', Cancelado:'❌' }[e] || '📋'; }

      // Counts from full list (unaffected by active filters so chips always show totals)
      const stats = computed(() => {
        const s = { total: 0, Planeado: 0, Realizado: 0, Cancelado: 0 };
        retiros.value.forEach(r => {
          s.total++;
          if (s[r.estado] !== undefined) s[r.estado]++;
        });
        return s;
      });

      const hasActiveFilters = computed(() =>
        !!(filterEstado.value || filterFase.value || search.value.trim())
      );

      const filteredRetiros = computed(() => {
        let items = retiros.value;

        // Full-text search across título, orador, local, tema
        const q = search.value.toLowerCase().trim();
        if (q) {
          items = items.filter(r =>
            (r.titulo || '').toLowerCase().includes(q) ||
            (r.orador || '').toLowerCase().includes(q) ||
            (r.local  || '').toLowerCase().includes(q) ||
            (r.tema   || '').toLowerCase().includes(q)
          );
        }

        // Estado chip filter
        if (filterEstado.value) {
          items = items.filter(r => r.estado === filterEstado.value);
        }

        // Fase filter — matches fase_1 OR fase_2
        if (filterFase.value) {
          items = items.filter(r => r.fase_1 === filterFase.value || r.fase_2 === filterFase.value);
        }

        // Sort by date (nulls always last)
        return [...items].sort((a, b) => {
          if (!a.data && !b.data) return 0;
          if (!a.data) return 1;
          if (!b.data) return -1;
          const cmp = a.data < b.data ? -1 : 1;
          return sortDir.value === 'asc' ? cmp : -cmp;
        });
      });

      function toggleExpand(r) {
        expandedName.value = expandedName.value === r.name ? null : r.name;
      }

      async function loadRetiros() {
        if (!anoLectivo.value) return;
        loading.value = true;
        expandedName.value = null;
        try {
          retiros.value = await api('get_retiros', { ano_lectivo: anoLectivo.value });
        } catch(e) {
          frappe.msgprint({ title:'Erro', message:String(e), indicator:'red' });
        } finally {
          loading.value = false;
        }
      }

      function openCreate() {
        form.value = emptyForm();
        editMode.value = false; editName.value = null; formError.value = '';
        showModal.value = true;
      }

      function openEdit(r) {
        form.value = { titulo:r.titulo||'', data:r.data?String(r.data).substring(0,10):'',
          estado:r.estado||'Planeado', fase_1:r.fase_1||'', fase_2:r.fase_2||'',
          local:r.local||'', orador:r.orador||'', tema:r.tema||'' };
        editMode.value = true; editName.value = r.name; formError.value = '';
        showModal.value = true;
      }

      function closeModal() { if (!saving.value) showModal.value = false; }

      async function saveRetiro() {
        formError.value = '';
        if (!form.value.titulo?.trim()) { formError.value = 'O título é obrigatório.'; return; }
        if (!form.value.fase_1)         { formError.value = 'A Fase 1 é obrigatória.'; return; }
        saving.value = true;
        try {
          const payload = { ...form.value, ano_lectivo: anoLectivo.value };
          if (editMode.value) {
            const result = await api('update_retiro', { name:editName.value, data_json:JSON.stringify(payload) });
            const idx = retiros.value.findIndex(r => r.name === editName.value);
            if (idx >= 0) retiros.value[idx] = result;
          } else {
            const result = await api('create_retiro', { data_json:JSON.stringify(payload) });
            retiros.value.push(result);
          }
          showModal.value = false;
          frappe.show_alert({ message: editMode.value ? 'Retiro actualizado' : 'Retiro criado', indicator:'green' });
        } catch(e) {
          formError.value = String(e?.message || e);
        } finally {
          saving.value = false;
        }
      }

      async function cycleEstado(r) {
        const estado = nextEstado(r.estado);
        try {
          await api('update_estado', { name:r.name, estado });
          r.estado = estado;
        } catch(e) {
          frappe.msgprint({ title:'Erro', message:String(e), indicator:'red' });
        }
      }

      function confirmDelete(r) {
        frappe.confirm(`Eliminar o retiro <strong>${r.titulo}</strong>?`, async () => {
          try {
            await api('delete_retiro', { name:r.name });
            retiros.value = retiros.value.filter(x => x.name !== r.name);
            if (expandedName.value === r.name) expandedName.value = null;
            frappe.show_alert({ message:'Retiro eliminado', indicator:'orange' });
          } catch(e) {
            frappe.msgprint({ title:'Erro', message:String(e), indicator:'red' });
          }
        });
      }

      onMounted(async () => {
        try {
          const [anosData, fasesData, anoAtual] = await Promise.all([
            api('get_anos_lectivos'), api('get_fases'), api('get_ano_lectivo_atual'),
          ]);
          anos.value  = anosData  || [];
          fases.value = fasesData || [];

          // Always honour the real calendar year rather than whatever is_current says.
          // For academic-year strings like "2025-2026" we prefer the one whose end
          // year matches today (April 2026 → "2025-2026"), then any that contains it.
          const currentYear = frappe.datetime.get_today().substring(0, 4);
          const byEndYear   = (anosData || []).find(a => String(a).endsWith(currentYear));
          const byAnyMatch  = (anosData || []).find(a => String(a).includes(currentYear));
          anoLectivo.value  = byEndYear || byAnyMatch || anoAtual || (anosData[0] || '');

          await loadRetiros();
        } catch(e) {
          frappe.msgprint({ title:'Erro ao inicializar', message:String(e), indicator:'red' });
        }
      });

      return {
        anos, anoLectivo, fases, retiros, filteredRetiros, loading, expandedName,
        showModal, editMode, saving, form, formError,
        searchRaw, filterEstado, filterFase, sortDir,
        stats, hasActiveFilters,
        loadRetiros, toggleExpand, openCreate, openEdit, closeModal, saveRetiro,
        cycleEstado, confirmDelete, nextEstado, estadoIcon, fmtDate,
        clearSearch, clearFilters,
      };
    },
  });
}

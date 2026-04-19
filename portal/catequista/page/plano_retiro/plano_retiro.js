/* global frappe, Vue */
// Plano de Retiros — Vue 3 CDN, no build step

frappe.pages['plano-retiro'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Plano de Retiros'),
    single_column: true,
  });

  // Load CSS
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
const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

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
  const { createApp, ref, computed, onMounted } = Vue;

  return createApp({
    template: `
      <div style="padding: 16px 0; min-height: 300px;">

        <!-- Toolbar -->
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:20px;">
          <select v-model="anoLectivo" @change="loadRetiros"
            style="border:1px solid #d1d5db; border-radius:8px; padding:6px 12px; font-size:13px; background:#fff; min-width:140px;">
            <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
          </select>

          <div style="flex:1"></div>

          <button class="btn btn-primary btn-sm" @click="openCreate">
            + Novo Retiro
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" style="text-align:center; padding:48px; color:#9ca3af;">
          <div class="spinner-border spinner-border-sm" style="width:24px;height:24px;border-width:2px;"></div>
          <p style="margin-top:12px; font-size:13px;">A carregar...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="!retiros.length" class="empty-state">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
          </svg>
          <p>Nenhum retiro registado para <strong>{{ anoLectivo }}</strong></p>
          <button class="btn btn-default btn-sm" style="margin-top:12px;" @click="openCreate">
            Criar primeiro retiro
          </button>
        </div>

        <!-- Grid -->
        <div v-else class="retiro-grid">
          <div v-for="r in retirosSorted" :key="r.name" class="retiro-card">
            <!-- Estado badge -->
            <div>
              <span :class="['estado-badge', 'estado-' + r.estado]">
                {{ estadoIcon(r.estado) }} {{ r.estado }}
              </span>
            </div>

            <div class="titulo">{{ r.titulo }}</div>

            <!-- Meta -->
            <div class="meta">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5"/>
              </svg>
              {{ fmtDate(r.data) }}
            </div>
            <div v-if="r.local" class="meta">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
              </svg>
              {{ r.local }}
            </div>
            <div v-if="r.orador" class="meta">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
              </svg>
              {{ r.orador }}
            </div>
            <div v-if="r.tema" class="meta" style="font-style:italic;">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/>
              </svg>
              {{ r.tema }}
            </div>

            <!-- Fases -->
            <div class="fases-pills" v-if="r.fase_1">
              <span class="fase-pill">{{ r.fase_1 }}</span>
              <span v-if="r.fase_2" class="fase-pill">{{ r.fase_2 }}</span>
            </div>

            <!-- Actions -->
            <div class="actions">
              <button class="btn-icon" @click="cycleEstado(r)" title="Mudar estado">
                {{ estadoIcon(r.estado) }} {{ nextEstado(r.estado) }}
              </button>
              <button class="btn-icon" @click="openEdit(r)">✏️ Editar</button>
              <div style="flex:1"></div>
              <button class="btn-icon danger" @click="confirmDelete(r)">🗑</button>
            </div>
          </div>
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
                <label>1ª Fase *</label>
                <select v-model="form.fase_1">
                  <option value="">— seleccionar —</option>
                  <option v-for="f in fases" :key="f" :value="f">{{ f }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>2ª Fase</label>
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

    setup() {
      const anos        = ref([]);
      const anoLectivo  = ref('');
      const fases       = ref([]);
      const retiros     = ref([]);
      const loading     = ref(false);

      const showModal   = ref(false);
      const editMode    = ref(false);
      const editName    = ref(null);
      const saving      = ref(false);
      const formError   = ref('');

      const emptyForm = () => ({
        titulo: '', data: '', estado: 'Planeado',
        fase_1: '', fase_2: '',
        local: '', orador: '', tema: '',
      });
      const form = ref(emptyForm());

      const STATUS_CYCLE = ['Planeado', 'Realizado', 'Cancelado'];
      function nextEstado(e) {
        const i = STATUS_CYCLE.indexOf(e);
        return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
      }
      function estadoIcon(e) {
        return { Planeado: '📋', Realizado: '✅', Cancelado: '❌' }[e] || '📋';
      }

      const retirosSorted = computed(() =>
        [...retiros.value].sort((a, b) => {
          if (!a.data && !b.data) return 0;
          if (!a.data) return 1;
          if (!b.data) return -1;
          return a.data < b.data ? -1 : 1;
        })
      );

      async function loadRetiros() {
        if (!anoLectivo.value) return;
        loading.value = true;
        try {
          retiros.value = await api('get_retiros', { ano_lectivo: anoLectivo.value });
        } catch(e) {
          frappe.msgprint({ title: 'Erro', message: String(e), indicator: 'red' });
        } finally {
          loading.value = false;
        }
      }

      function openCreate() {
        form.value  = emptyForm();
        form.value.ano_lectivo = anoLectivo.value;
        editMode.value = false;
        editName.value = null;
        formError.value = '';
        showModal.value = true;
      }

      function openEdit(r) {
        form.value = {
          titulo:  r.titulo  || '',
          data:    r.data    ? String(r.data).substring(0, 10) : '',
          estado:  r.estado  || 'Planeado',
          fase_1:  r.fase_1  || '',
          fase_2:  r.fase_2  || '',
          local:   r.local   || '',
          orador:  r.orador  || '',
          tema:    r.tema    || '',
        };
        editMode.value  = true;
        editName.value  = r.name;
        formError.value = '';
        showModal.value = true;
      }

      function closeModal() {
        if (saving.value) return;
        showModal.value = false;
      }

      async function saveRetiro() {
        formError.value = '';
        if (!form.value.titulo?.trim()) { formError.value = 'O título é obrigatório.'; return; }
        if (!form.value.fase_1)         { formError.value = 'A 1ª Fase é obrigatória.'; return; }

        saving.value = true;
        try {
          const payload = { ...form.value, ano_lectivo: anoLectivo.value };
          let result;
          if (editMode.value) {
            result = await api('update_retiro', { name: editName.value, data_json: JSON.stringify(payload) });
            const idx = retiros.value.findIndex(r => r.name === editName.value);
            if (idx >= 0) retiros.value[idx] = result;
          } else {
            result = await api('create_retiro', { data_json: JSON.stringify(payload) });
            retiros.value.push(result);
          }
          showModal.value = false;
          frappe.show_alert({ message: editMode.value ? 'Retiro actualizado' : 'Retiro criado', indicator: 'green' });
        } catch(e) {
          formError.value = String(e?.message || e);
        } finally {
          saving.value = false;
        }
      }

      async function cycleEstado(r) {
        const estado = nextEstado(r.estado);
        try {
          await api('update_estado', { name: r.name, estado });
          r.estado = estado;
        } catch(e) {
          frappe.msgprint({ title: 'Erro', message: String(e), indicator: 'red' });
        }
      }

      function confirmDelete(r) {
        frappe.confirm(
          `Eliminar o retiro <strong>${r.titulo}</strong>?`,
          async () => {
            try {
              await api('delete_retiro', { name: r.name });
              retiros.value = retiros.value.filter(x => x.name !== r.name);
              frappe.show_alert({ message: 'Retiro eliminado', indicator: 'orange' });
            } catch(e) {
              frappe.msgprint({ title: 'Erro', message: String(e), indicator: 'red' });
            }
          }
        );
      }

      onMounted(async () => {
        try {
          const [anosData, fasesData, anoAtual] = await Promise.all([
            api('get_anos_lectivos'),
            api('get_fases'),
            api('get_ano_lectivo_atual'),
          ]);
          anos.value  = anosData  || [];
          fases.value = fasesData || [];
          anoLectivo.value = anoAtual || (anosData[0] || '');
          await loadRetiros();
        } catch(e) {
          frappe.msgprint({ title: 'Erro ao inicializar', message: String(e), indicator: 'red' });
        }
      });

      return {
        anos, anoLectivo, fases, retiros, retirosSorted, loading,
        showModal, editMode, saving, form, formError,
        loadRetiros, openCreate, openEdit, closeModal, saveRetiro,
        cycleEstado, confirmDelete, nextEstado, estadoIcon, fmtDate,
      };
    },
  });
}

/* global frappe, Vue */
// Qualidade dos Dados — Vue 3 CDN, no build step

frappe.pages['qualidade-dados'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Qualidade dos Dados'),
    single_column: true,
  });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    createQualidadeApp().mount(mount);
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

function qdApi(method, args) {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: `portal.catequese.page.qualidade_dados.qualidade_dados.${method}`,
      args,
      callback: (r) => { if (r.exc) reject(new Error(r.exc)); else resolve(r.message); },
      error: reject,
    });
  });
}

const QD_ROTULOS = {
  turma: 'Turma', fase: 'Fase', status: 'Estado', idade: 'Idade', comunidade: 'Comunidade',
  turma_real: 'Turma real', turmas: 'Turmas', encarregado: 'Encarregado', contacto: 'Contacto',
  contacto_1: 'Contacto', nucleo: 'Núcleo', email: 'Email', ano_lectivo: 'Ano', catequistas: 'Catequistas',
};

function createQualidadeApp() {
  const { createApp, ref, computed, onMounted } = Vue;

  return createApp({
    template: `
<div id="qd-app">
  <div class="qd-toolbar">
    <h1>🩺 Qualidade dos Dados</h1>
    <span class="qd-muted">{{ totalProblemas }} registos a rever</span>
    <div style="flex:1"></div>
    <button class="qd-btn" @click="carregar" :disabled="loading">↻ Verificar de novo</button>
  </div>

  <div v-if="loading" class="qd-loading"><div class="qd-spinner"></div> A verificar…</div>

  <div v-else class="qd-layout">
    <!-- Verificações -->
    <div class="qd-checks">
      <button v-for="v in verificacoes" :key="v.chave" class="qd-check"
              :class="{ active: actual && actual.chave === v.chave, ok: !v.total }"
              @click="abrir(v)">
        <span class="qd-check-n">{{ v.total || '✓' }}</span>
        <span class="qd-check-txt">
          <b>{{ v.titulo }}</b>
          <small v-if="v.correccao">correcção rápida disponível</small>
        </span>
      </button>
    </div>

    <!-- Registos -->
    <div class="qd-panel">
      <div v-if="!actual" class="qd-empty">Escolha uma verificação à esquerda.</div>
      <template v-else>
        <div class="qd-panel-head">
          <div>
            <h2>{{ actual.titulo }}</h2>
            <p class="qd-muted">{{ actual.descricao }}</p>
          </div>
        </div>

        <div v-if="actual.correccao && registos.length" class="qd-actions">
          <label class="qd-sel-all"><input type="checkbox" :checked="todosSeleccionados" @change="toggleTodos"> Todos ({{ registos.length }})</label>
          <span class="qd-muted">{{ seleccionados.length }} seleccionados</span>
          <div style="flex:1"></div>
          <template v-if="actual.correccao.accao">
            <button class="qd-btn qd-btn-primary" :disabled="!seleccionados.length || saving" @click="aplicar(null)">
              {{ actual.correccao.rotulo }}
            </button>
          </template>
          <template v-else>
            <span class="qd-muted">Definir {{ actual.correccao.campo }} como:</span>
            <button v-for="val in actual.correccao.valores" :key="val" class="qd-btn qd-btn-primary"
                    :disabled="!seleccionados.length || saving" @click="aplicar(val)">{{ val }}</button>
          </template>
        </div>

        <div v-if="loadingRegistos" class="qd-loading"><div class="qd-spinner"></div></div>
        <div v-else-if="!registos.length" class="qd-empty">✓ Nada a corrigir aqui.</div>
        <div v-else class="qd-table-wrap">
          <table class="qd-table">
            <thead>
              <tr>
                <th v-if="actual.correccao" style="width:32px"></th>
                <th>Nome</th>
                <th v-for="c in actual.colunas" :key="c">{{ rotulo(c) }}</th>
                <th v-if="actual.correccao && actual.correccao.por_linha">Corrigir</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in registos" :key="r.name">
                <td v-if="actual.correccao"><input type="checkbox" :value="r.name" v-model="seleccionados"></td>
                <td><a :href="link(r.name)" target="_blank">{{ r.name }}</a></td>
                <td v-for="c in actual.colunas" :key="c">{{ r[c] || '—' }}</td>
                <td v-if="actual.correccao && actual.correccao.por_linha" class="qd-row-fix">
                  <button v-for="val in actual.correccao.valores" :key="val" class="qd-mini"
                          :disabled="saving" @click="aplicarLinha(r, val)">{{ val[0] }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</div>
`,
    setup() {
      const verificacoes = ref([]);
      const loading = ref(true);
      const actual = ref(null);
      const registos = ref([]);
      const loadingRegistos = ref(false);
      const seleccionados = ref([]);
      const saving = ref(false);

      const totalProblemas = computed(() => verificacoes.value.reduce((s, v) => s + (v.total || 0), 0));
      const todosSeleccionados = computed(() =>
        registos.value.length > 0 && seleccionados.value.length === registos.value.length);

      async function carregar() {
        loading.value = true;
        try {
          verificacoes.value = await qdApi('get_verificacoes');
          if (actual.value) {
            const v = verificacoes.value.find((x) => x.chave === actual.value.chave);
            if (v) await abrir(v);
          }
        } finally {
          loading.value = false;
        }
      }

      async function abrir(v) {
        actual.value = v;
        seleccionados.value = [];
        loadingRegistos.value = true;
        try {
          registos.value = await qdApi('get_registos', { chave: v.chave });
        } finally {
          loadingRegistos.value = false;
        }
      }

      function toggleTodos() {
        seleccionados.value = todosSeleccionados.value ? [] : registos.value.map((r) => r.name);
      }

      async function corrigir(nomes, valor) {
        saving.value = true;
        try {
          const n = await qdApi('corrigir', { chave: actual.value.chave, nomes: JSON.stringify(nomes), valor });
          frappe.show_alert({ message: __('{0} registos corrigidos', [n]), indicator: 'green' });
          return n;
        } catch (e) {
          frappe.msgprint(__('Não foi possível aplicar a correcção.'));
          return 0;
        } finally {
          saving.value = false;
        }
      }

      async function aplicar(valor) {
        const nomes = [...seleccionados.value];
        const alvo = valor ? `"${valor}"` : '';
        frappe.confirm(__('Aplicar {0} a {1} registos?', [alvo || actual.value.correccao.rotulo, nomes.length]), async () => {
          if (await corrigir(nomes, valor)) await carregar();
        });
      }

      async function aplicarLinha(r, valor) {
        if (await corrigir([r.name], valor)) {
          registos.value = registos.value.filter((x) => x.name !== r.name);
          seleccionados.value = seleccionados.value.filter((n) => n !== r.name);
          const v = verificacoes.value.find((x) => x.chave === actual.value.chave);
          if (v) v.total = Math.max(0, v.total - 1);
        }
      }

      const rotulo = (c) => QD_ROTULOS[c] || c;
      const link = (name) => `/app/${frappe.router.slug(actual.value.doctype)}/${encodeURIComponent(name)}`;

      onMounted(carregar);

      return {
        verificacoes, loading, actual, registos, loadingRegistos, seleccionados, saving,
        totalProblemas, todosSeleccionados, carregar, abrir, toggleTodos, aplicar, aplicarLinha, rotulo, link,
      };
    },
  });
}

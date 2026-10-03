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
  data_de_nascimento: 'Nascimento', idade_certa: 'Idade certa', idade_tipica: 'Idade típica da fase',
  fase_da_turma: 'Fase da turma', estado_catecumeno: 'Estado do catecúmeno', parecido_com: 'Parecido com',
  criado_em: 'Inscrito em', baptismo: 'Baptismo', eucaristia: 'Eucaristia', crisma: 'Crisma',
  data_do_crisma: 'Data do crisma', data_do_livro: 'Data no Livro', ano: 'Ano', sem_data: 'Sem data',
  preparacao: 'Preparação', falta: 'Falta', catecumenos: 'Catecúmenos', maximo: 'Máximo',
  dia: 'Dia', hora: 'Hora', local: 'Local', catequista_inactivo: 'Catequista inactivo',
};

const QD_ICONE_AREA = { 'Catecúmenos': '👦', 'Sacramentos': '✝️', 'Turmas': '👥', 'Catequistas': '🙋' };

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
      <template v-for="a in areas" :key="a.nome">
        <div class="qd-area">
          <span>{{ a.icone }} {{ a.nome }}</span>
          <span class="qd-area-n" :class="{ ok: !a.total }">{{ a.total || '✓' }}</span>
        </div>
        <button v-for="v in a.verificacoes" :key="v.chave" class="qd-check"
                :class="{ active: actual && actual.chave === v.chave, ok: !v.total }"
                @click="abrir(v)">
          <span class="qd-check-n">{{ v.total || '✓' }}</span>
          <span class="qd-check-txt">
            <b>{{ v.titulo }}</b>
            <small v-if="v.correccao && v.total">correcção rápida disponível</small>
          </span>
        </button>
      </template>
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
                <td><a :href="link(r)" target="_blank">{{ nomeDe(r) }}</a></td>
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
      const areas = computed(() => {
        const out = [];
        verificacoes.value.forEach((v) => {
          let a = out.find((x) => x.nome === v.area);
          if (!a) { a = { nome: v.area, icone: QD_ICONE_AREA[v.area] || '•', total: 0, verificacoes: [] }; out.push(a); }
          a.verificacoes.push(v);
          a.total += v.total || 0;
        });
        return out;
      });
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
      // Algumas verificações listam linhas de tabelas: mostram outro campo e abrem outro registo
      const nomeDe = (r) => (actual.value.nome ? r[actual.value.nome] : r.name);
      const link = (r) => {
        const l = actual.value.link;
        const dt = l ? l.doctype : actual.value.doctype;
        const nome = l ? r[l.campo] : r.name;
        return `/app/${frappe.router.slug(dt)}/${encodeURIComponent(nome)}`;
      };

      onMounted(carregar);

      return {
        verificacoes, loading, actual, registos, loadingRegistos, seleccionados, saving,
        totalProblemas, areas, nomeDe, todosSeleccionados, carregar, abrir, toggleTodos, aplicar, aplicarLinha, rotulo, link,
      };
    },
  });
}

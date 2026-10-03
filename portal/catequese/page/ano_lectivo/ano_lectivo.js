/* global frappe, Vue */
// Abrir e Encerrar Ano — Vue 3 CDN, no build step

frappe.pages['ano-lectivo'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Abrir e Encerrar Ano'),
    single_column: true,
  });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    createAnoApp().mount(mount);
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

function alApi(method, args) {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: `portal.catequese.page.ano_lectivo.ano_lectivo.${method}`,
      args,
      callback: (r) => { if (r.exc) reject(new Error(r.exc)); else resolve(r.message); },
      error: reject,
    });
  });
}

const AL_ICONE = { ok: '✓', aviso: '!', pendente: '○', info: 'i' };

function createAnoApp() {
  const { createApp, ref, computed, onMounted } = Vue;

  return createApp({
    template: `
<div id="al-app">
  <div class="al-toolbar">
    <h1>📅 Abrir e Encerrar Ano</h1>
    <select v-model="ano" @change="carregar" class="al-select" title="Ano a encerrar">
      <option v-for="a in anos" :key="a.name" :value="a.name">{{ a.name }} · {{ a.estado || '—' }}</option>
    </select>
    <span v-if="dados" class="al-muted">Ano actual do sistema: <b>{{ dados.actual || '—' }}</b></span>
    <div style="flex:1"></div>
    <a class="al-btn" href="/app/catequese-settings">⚙ Catequese Settings</a>
    <button class="al-btn" @click="carregar" :disabled="loading">↻ Actualizar</button>
  </div>

  <div v-if="loading && !dados" class="al-loading"><div class="al-spinner"></div> A verificar…</div>

  <div v-else-if="dados" class="al-cols" :class="{ busy: loading }">
    <section v-for="col in colunas" :key="col.chave" class="al-col">
      <div class="al-col-head">
        <h2>{{ col.titulo }}</h2>
        <div class="al-progress">
          <div class="al-progress-bar" :style="{ width: col.pct + '%' }"></div>
        </div>
        <span class="al-muted">{{ col.feitos }} de {{ col.total }} passos concluídos</span>
      </div>

      <div v-for="(p, i) in col.passos" :key="p.chave" class="al-step" :class="'st-' + p.estado">
        <div class="al-step-icon">{{ icone(p.estado) }}</div>
        <div class="al-step-body">
          <h3><span class="al-step-n">{{ i + 1 }}.</span> {{ p.titulo }}</h3>
          <p>{{ p.detalhe }}</p>

          <ul v-if="p.itens.length" class="al-itens">
            <li v-for="it in p.itens" :key="it.texto" :class="'st-' + it.estado">
              <span class="al-dot"></span>
              <a v-if="it.rota" :href="it.rota">{{ it.texto }}</a><b v-else>{{ it.texto }}</b>
              <span v-if="it.nota" class="al-muted"> — {{ it.nota }}</span>
              <button v-if="it.accao" class="al-link" @click="executar(it.accao)">{{ it.accao.rotulo }} →</button>
              <button v-if="it.accao_extra" class="al-link" @click="executar(it.accao_extra)">{{ it.accao_extra.rotulo }}</button>
            </li>
          </ul>

          <div v-if="p.accoes.length" class="al-actions">
            <button v-for="a in p.accoes" :key="a.rotulo" class="al-btn"
                    :class="{ 'al-btn-primary': a.tipo === 'metodo' && a.primario }"
                    :disabled="loading" @click="executar(a)">{{ a.rotulo }}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
`,
    setup() {
      const anos = ref([]);
      const ano = ref('');
      const dados = ref(null);
      const loading = ref(true);

      function resumo(chave, titulo, passos) {
        const contam = passos.filter((p) => p.estado !== 'info');
        const feitos = contam.filter((p) => p.estado === 'ok').length;
        return { chave, titulo, passos, feitos, total: contam.length,
                 pct: contam.length ? Math.round((100 * feitos) / contam.length) : 0 };
      }

      const colunas = computed(() => !dados.value ? [] : [
        resumo('encerrar', __('Encerrar {0}', [dados.value.ano]), dados.value.encerrar),
        resumo('abrir', __('Preparar {0}', [dados.value.seguinte]), dados.value.abrir),
      ]);

      async function carregar() {
        loading.value = true;
        try {
          dados.value = await alApi('get_estado', { ano: ano.value });
        } catch (e) {
          frappe.msgprint(__('Não foi possível carregar o estado do ano.'));
        } finally {
          loading.value = false;
        }
      }

      async function correrMetodo(a) {
        loading.value = true;
        try {
          const r = await alApi(a.metodo, a.args || {});
          frappe.show_alert({ message: __('Feito') + (typeof r === 'number' ? ` (${r})` : ''), indicator: 'green' });
          if (a.metodo === 'criar_ano' || a.metodo === 'definir_ano_actual') {
            anos.value = (await alApi('get_anos')).anos;
          }
          if (a.metodo === 'definir_ano_actual') {
            frappe.msgprint(__('O novo ano está activo. Recarregue a página (F5) para que os formulários o usem.'));
          }
        } catch (e) {
          frappe.msgprint(__('A acção falhou.'));
        } finally {
          await carregar();
        }
      }

      function executar(a) {
        if (a.tipo === 'rota') {
          window.location.href = a.rota;
        } else if (a.tipo === 'novo') {
          frappe.new_doc(a.doctype, a.valores || {});
        } else if (a.tipo === 'metodo') {
          if (a.confirmar) frappe.confirm(a.confirmar, () => correrMetodo(a));
          else correrMetodo(a);
        }
      }

      const icone = (e) => AL_ICONE[e] || '·';

      onMounted(async () => {
        try {
          const r = await alApi('get_anos');
          anos.value = r.anos || [];
          ano.value = r.actual || (anos.value[0] && anos.value[0].name) || String(new Date().getFullYear());
        } finally {
          await carregar();
        }
      });

      return { anos, ano, dados, loading, colunas, carregar, executar, icone };
    },
  });
}

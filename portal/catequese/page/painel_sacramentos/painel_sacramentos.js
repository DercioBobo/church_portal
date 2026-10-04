/* global frappe, Vue */
// Sacramentos — acompanhamento de quem falhou um sacramento (Vue 3 CDN, sem build)

frappe.pages['painel-sacramentos'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({ parent: wrapper, title: __('Sacramentos'), single_column: true });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    wrapper.psApp = createSacramentosApp().mount(mount);
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

frappe.pages['painel-sacramentos'].on_page_show = function (wrapper) {
  // ao voltar de uma Preparação, actualiza
  if (wrapper.psApp && wrapper.psApp.carregar) wrapper.psApp.carregar();
};

function createSacramentosApp() {
  const { createApp, ref, computed, onMounted } = Vue;

  return createApp({
    template: `
<div id="ps-app">
  <div class="ps-head">
    <div>
      <h1>✝️ Sacramentos</h1>
      <p class="ps-muted">Quem não recebeu o sacramento, porquê, e onde está agora · Ano {{ dados.ano || '—' }}</p>
    </div>
    <button class="ps-btn" @click="carregar" :disabled="loading">↻ Actualizar</button>
  </div>

  <div v-if="loading && !dados.sacramentos" class="ps-loading"><div class="ps-spinner"></div></div>

  <template v-else-if="dados.sacramentos">
    <div class="ps-tabs">
      <button v-for="(s, i) in dados.sacramentos" :key="s.sacramento" class="ps-tab"
              :class="{ active: i === activo }" @click="activo = i; motivo = ''">
        {{ s.rotulo }}
        <span class="ps-tab-n" :class="{ zero: !total(s) }">{{ total(s) || '✓' }}</span>
      </button>
    </div>

    <div class="ps-preps">
      <span class="ps-preps-label">Preparações de {{ dados.ano }}</span>
      <a v-for="p in sac.preparacoes" :key="p.name" class="ps-prep" :href="'/app/preparacao-do-sacramento/' + encodeURIComponent(p.name)">
        <b>{{ p.name }}</b>
        <small v-if="p.data">{{ dia(p.data) }}</small>
        <span class="ps-chip ok">{{ p.vao }} vão</span>
        <span v-if="p.nao" class="ps-chip erro">{{ p.nao }} não</span>
        <span class="ps-chip" :class="p.docstatus ? 'feito' : 'rasc'">{{ p.docstatus ? 'Submetida' : 'Rascunho' }}</span>
      </a>
      <span v-if="!sac.preparacoes.length" class="ps-muted">Nenhuma preparação este ano.</span>
      <span v-if="sac.fases.length" class="ps-muted ps-fases">Fase do sacramento: {{ sac.fases.join(', ') }}</span>
    </div>

    <div class="ps-filtros">
      <input class="ps-search" v-model="busca" placeholder="Procurar nome, turma, encarregado…">
      <button v-for="m in motivos" :key="m.nome" class="ps-motivo-chip" :class="{ on: motivo === m.nome }"
              @click="motivo = motivo === m.nome ? '' : m.nome">{{ m.nome }} <b>{{ m.n }}</b></button>
    </div>

    <!-- Não receberam -->
    <section class="ps-card">
      <div class="ps-card-head">
        <h2>Não receberam</h2>
        <span class="ps-count">{{ pendentes.length }}</span>
        <p class="ps-muted">Marcados “Não vai receber” numa Preparação e que ainda não têm o sacramento.</p>
      </div>
      <div v-if="!pendentes.length" class="ps-vazio">Ninguém pendente{{ busca || motivo ? ' com este filtro' : '' }}. 🙏</div>
      <table v-else class="ps-table">
        <thead><tr><th>Catecúmeno</th><th>Motivo</th><th>Preparação</th><th>Agora</th><th>Encarregado</th></tr></thead>
        <tbody>
          <tr v-for="r in pendentes" :key="r.catecumeno">
            <td data-l="Catecúmeno">
              <a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a>
              <span v-if="r.vezes > 1" class="ps-chip erro" :title="'Falhou ' + r.vezes + ' vezes'">{{ r.vezes }}×</span>
            </td>
            <td data-l="Motivo">
              <span class="ps-motivo" :class="cls(r.motivo)">{{ r.motivo || 'Sem motivo' }}</span>
              <div v-if="r.detalhe" class="ps-detalhe">{{ r.detalhe }}</div>
            </td>
            <td data-l="Preparação">
              <a :href="'/app/preparacao-do-sacramento/' + encodeURIComponent(r.preparacao)">{{ r.preparacao }}</a>
              <div class="ps-muted ps-small">{{ dia(r.data) }}</div>
            </td>
            <td data-l="Agora">
              <span class="ps-estado" :class="estadoCls(r.status)">{{ r.status }}</span>
              <div class="ps-small">{{ [r.fase, r.turma].filter(Boolean).join(' · ') || 'Sem turma' }}</div>
            </td>
            <td data-l="Encarregado">
              <div class="ps-small">{{ r.encarregado || '—' }}</div>
              <span v-if="r.contacto" v-html="tel(r.contacto)"></span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Sem motivo registado -->
    <section class="ps-card">
      <div class="ps-card-head">
        <h2>Em fase posterior, sem o sacramento</h2>
        <span class="ps-count aviso">{{ semMotivo.length }}</span>
        <p class="ps-muted">Activos numa fase depois da do sacramento, sem o visto e sem registo de “Não vai receber”.
          Se falhou, marque-o na Preparação; se já recebeu, marque-o no catecúmeno.</p>
      </div>
      <div v-if="!semMotivo.length" class="ps-vazio">{{ motivo ? 'Filtro de motivo activo.' : 'Tudo coerente. ✓' }}</div>
      <table v-else class="ps-table">
        <thead><tr><th>Catecúmeno</th><th>Fase · Turma</th><th>Estado</th><th>Encarregado</th></tr></thead>
        <tbody>
          <tr v-for="r in semMotivo" :key="r.catecumeno">
            <td data-l="Catecúmeno"><a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a></td>
            <td data-l="Fase · Turma" class="ps-small">{{ [r.fase, r.turma].filter(Boolean).join(' · ') || '—' }}</td>
            <td data-l="Estado"><span class="ps-estado" :class="estadoCls(r.status)">{{ r.status }}</span></td>
            <td data-l="Encarregado"><div class="ps-small">{{ r.encarregado || '—' }}</div><span v-if="r.contacto" v-html="tel(r.contacto)"></span></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Resolvidos -->
    <section v-if="sac.resolvidos.length" class="ps-card ps-card--leve">
      <button class="ps-card-head ps-toggle" @click="verResolvidos = !verResolvidos">
        <h2>Já receberam depois</h2>
        <span class="ps-count ok">{{ sac.resolvidos.length }}</span>
        <p class="ps-muted">Falharam numa Preparação mas já têm o sacramento (2ª oportunidade). {{ verResolvidos ? '▲' : '▼' }}</p>
      </button>
      <table v-if="verResolvidos" class="ps-table">
        <thead><tr><th>Catecúmeno</th><th>Falhou em</th><th>Motivo</th><th>Recebeu em</th></tr></thead>
        <tbody>
          <tr v-for="r in sac.resolvidos" :key="r.catecumeno">
            <td data-l="Catecúmeno"><a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a></td>
            <td data-l="Falhou em"><a :href="'/app/preparacao-do-sacramento/' + encodeURIComponent(r.preparacao)">{{ r.preparacao }}</a></td>
            <td data-l="Motivo"><span class="ps-motivo" :class="cls(r.motivo)">{{ r.motivo || '—' }}</span></td>
            <td data-l="Recebeu em">{{ r.data_recebeu ? dia(r.data_recebeu) : 'Sem data' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</div>`,

    setup() {
      const dados = ref({});
      const loading = ref(false);
      const activo = ref(0);
      const busca = ref('');
      const motivo = ref('');
      const verResolvidos = ref(false);

      function carregar() {
        loading.value = true;
        frappe.call({
          method: 'portal.catequese.page.painel_sacramentos.painel_sacramentos.get_dados',
          callback: (r) => { dados.value = r.message || {}; },
          always: () => { loading.value = false; },
        });
      }
      onMounted(carregar);

      const VAZIO = { pendentes: [], sem_motivo: [], resolvidos: [], preparacoes: [], fases: [] };
      const sac = computed(() => (dados.value.sacramentos || [])[activo.value] || VAZIO);
      const bate = (r) => {
        const q = busca.value.trim().toLowerCase();
        return !q || [r.catecumeno, r.turma, r.fase, r.encarregado, r.preparacao]
          .some((v) => (v || '').toLowerCase().includes(q));
      };
      const pendentes = computed(() => sac.value.pendentes.filter(
        (r) => bate(r) && (!motivo.value || (r.motivo || 'Sem motivo') === motivo.value)));
      const semMotivo = computed(() => (motivo.value ? [] : sac.value.sem_motivo.filter(bate)));
      const motivos = computed(() => {
        const n = {};
        sac.value.pendentes.forEach((r) => { const m = r.motivo || 'Sem motivo'; n[m] = (n[m] || 0) + 1; });
        return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([nome, k]) => ({ nome, n: k }));
      });

      const total = (s) => s.pendentes.length + s.sem_motivo.length;
      const dia = (d) => (d ? frappe.datetime.str_to_user(String(d).split(' ')[0]) : '—');
      const tel = (n) => (window.cq ? window.cq.telefone(n) : frappe.utils.escape_html(n));
      const MOT = { Comportamento: 'm1', Faltas: 'm2', Documentos: 'm3', Desistiu: 'm4', 'Repete a fase': 'm5', Outro: 'm6' };
      const cls = (m) => MOT[m] || 'm6';
      const estadoCls = (e) => ({ Activo: 'ok', Pendente: 'aviso', Inactivo: 'off', Transferido: 'off', Crismado: 'feito' }[e] || 'off');

      return {
        dados, loading, activo, busca, motivo, verResolvidos, carregar,
        sac, pendentes, semMotivo, motivos, total, dia, tel, cls, estadoCls,
      };
    },
  });
}

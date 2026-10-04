/* global frappe, Vue */
// Sacramentos — acompanhamento de quem não recebeu um sacramento (Vue 3 CDN, sem build)

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
  const { createApp, ref, reactive, computed, onMounted } = Vue;
  const API = 'portal.catequese.page.painel_sacramentos.painel_sacramentos.';

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
              :class="{ active: i === activo }" @click="mudar(i)">
        {{ s.rotulo }}
        <span class="ps-tab-n" :class="{ zero: !total(s) }">{{ total(s) || '✓' }}</span>
      </button>
      <button class="ps-tab ps-tab-arq" :class="{ active: activo === 'arq' }" @click="mudar('arq')">
        🗂 Arquivados <span class="ps-tab-n neutro">{{ todosArquivados.length }}</span>
      </button>
    </div>

    <!-- ── Separador Arquivados ──────────────────────────────────────────── -->
    <template v-if="activo === 'arq'">
      <div class="ps-filtros">
        <input class="ps-search" v-model="busca" placeholder="Procurar nome, turma, nota…">
        <button v-for="o in arqSacramentos" :key="o.nome" class="ps-motivo-chip" :class="{ on: fSac === o.nome }"
                @click="fSac = fSac === o.nome ? '' : o.nome">{{ o.rotulo }} <b>{{ o.n }}</b></button>
        <select v-model="fAno" class="ps-select"><option value="">Todos os anos</option><option v-for="a in arqAnos" :key="a" :value="a">{{ a }}</option></select>
        <select v-model="fDecisao" class="ps-select"><option value="">Todas as decisões</option><option v-for="d in dados.decisoes" :key="d" :value="d">{{ d }}</option></select>
      </div>
      <section class="ps-card">
        <div class="ps-card-head">
          <h2>Arquivados</h2>
          <span class="ps-count neutro">{{ arquivadosVisiveis.length }}</span>
          <p class="ps-muted">Não receberam e já há decisão. O registo fica guardado; “Reabrir” devolve a pessoa ao acompanhamento.</p>
        </div>
        <div v-if="!arquivadosVisiveis.length" class="ps-vazio">{{ todosArquivados.length ? 'Nenhum registo com estes filtros.' : 'Ainda não há registos arquivados.' }}</div>
        <table v-else class="ps-table">
          <thead><tr><th>Catecúmeno</th><th>Sacramento</th><th>Ano</th><th>Motivo</th><th>Decisão</th><th>Nota</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in arquivadosVisiveis" :key="r.name">
              <td data-l="Catecúmeno">
                <a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a>
                <span v-if="r.recebeu" class="ps-chip ok">já recebeu</span>
                <div class="ps-small ps-muted">{{ [r.status, r.fase, r.turma].filter(Boolean).join(' · ') }}</div>
              </td>
              <td data-l="Sacramento"><span class="ps-chip feito">{{ r.rotulo }}</span></td>
              <td data-l="Ano">{{ r.ano_lectivo }}<div v-if="r.preparacao" class="ps-small"><a :href="'/app/preparacao-do-sacramento/' + encodeURIComponent(r.preparacao)">{{ r.preparacao }}</a></div></td>
              <td data-l="Motivo"><span class="ps-motivo" :class="cls(r.motivo)">{{ r.motivo || '—' }}</span></td>
              <td data-l="Decisão"><b class="ps-small">{{ r.decisao }}</b><div class="ps-small ps-muted">{{ dia(r.data_decisao) }}</div></td>
              <td data-l="Nota" class="ps-small">{{ r.nota || '' }}</td>
              <td class="ps-c-acc">
                <a class="ps-arquivar" title="Abrir o registo" :href="'/app/sacramento-nao-recebido/' + encodeURIComponent(r.name)">✎</a>
                <button class="ps-arquivar" title="Reabrir (volta ao acompanhamento)" @click="reabrir(r)">↺</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <template v-else>

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

    <!-- Barra de selecção -->
    <div v-if="seleccionados.size" class="ps-massa">
      <b>{{ seleccionados.size }} seleccionado(s)</b>
      <button class="ps-btn ps-btn-ouro" @click="arquivarSel">🗂 Arquivar com decisão…</button>
      <button class="ps-link" @click="seleccionados.clear()">limpar</button>
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
        <thead><tr>
          <th class="ps-c-sel"><input type="checkbox" :checked="todos(pendentes)" @change="marcarTodos(pendentes, $event.target.checked)"></th>
          <th>Catecúmeno</th><th>Motivo</th><th>Preparação</th><th>Agora</th><th>Encarregado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in pendentes" :key="r.catecumeno" :class="{ sel: seleccionados.has(r.catecumeno) }">
            <td class="ps-c-sel"><input type="checkbox" :checked="seleccionados.has(r.catecumeno)" @change="alternar(r)"></td>
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
            <td class="ps-c-acc"><button class="ps-arquivar" title="Arquivar com decisão" @click="arquivar([r])">🗂</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Fora da preparação -->
    <section class="ps-card">
      <div class="ps-card-head">
        <h2>Na fase do sacramento, fora da preparação</h2>
        <span class="ps-count aviso">{{ fora.length }}</span>
        <p class="ps-muted">Este ano na fase do sacramento, sem o sacramento, e em nenhuma Preparação de {{ dados.ano }}
          (inclui quem saiu durante o ano). Se vão receber, use “Listar candidatos” na Preparação; se não, arquive com a decisão.</p>
      </div>
      <div v-if="!sac.preparacoes.length" class="ps-vazio">Aparece quando houver uma Preparação deste ano.</div>
      <div v-else-if="!fora.length" class="ps-vazio">{{ motivo ? 'Filtro de motivo activo.' : 'Todos estão numa preparação. ✓' }}</div>
      <table v-else class="ps-table">
        <thead><tr>
          <th class="ps-c-sel"><input type="checkbox" :checked="todos(fora)" @change="marcarTodos(fora, $event.target.checked)"></th>
          <th>Catecúmeno</th><th>Fase · Turma</th><th>Estado</th><th>Encarregado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in fora" :key="r.catecumeno" :class="{ sel: seleccionados.has(r.catecumeno) }">
            <td class="ps-c-sel"><input type="checkbox" :checked="seleccionados.has(r.catecumeno)" @change="alternar(r)"></td>
            <td data-l="Catecúmeno"><a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a></td>
            <td data-l="Fase · Turma" class="ps-small">{{ [r.fase, r.turma].filter(Boolean).join(' · ') || '—' }}</td>
            <td data-l="Estado"><span class="ps-estado" :class="estadoCls(r.status)">{{ r.status }}</span></td>
            <td data-l="Encarregado"><div class="ps-small">{{ r.encarregado || '—' }}</div><span v-if="r.contacto" v-html="tel(r.contacto)"></span></td>
            <td class="ps-c-acc"><button class="ps-arquivar" title="Arquivar com decisão" @click="arquivar([r])">🗂</button></td>
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
          Se já recebeu, marque-o no catecúmeno; se não, arquive com a decisão.</p>
      </div>
      <div v-if="!semMotivo.length" class="ps-vazio">{{ motivo ? 'Filtro de motivo activo.' : 'Tudo coerente. ✓' }}</div>
      <table v-else class="ps-table">
        <thead><tr>
          <th class="ps-c-sel"><input type="checkbox" :checked="todos(semMotivo)" @change="marcarTodos(semMotivo, $event.target.checked)"></th>
          <th>Catecúmeno</th><th>Fase · Turma</th><th>Estado</th><th>Encarregado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in semMotivo" :key="r.catecumeno" :class="{ sel: seleccionados.has(r.catecumeno) }">
            <td class="ps-c-sel"><input type="checkbox" :checked="seleccionados.has(r.catecumeno)" @change="alternar(r)"></td>
            <td data-l="Catecúmeno"><a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a></td>
            <td data-l="Fase · Turma" class="ps-small">{{ [r.fase, r.turma].filter(Boolean).join(' · ') || '—' }}</td>
            <td data-l="Estado"><span class="ps-estado" :class="estadoCls(r.status)">{{ r.status }}</span></td>
            <td data-l="Encarregado"><div class="ps-small">{{ r.encarregado || '—' }}</div><span v-if="r.contacto" v-html="tel(r.contacto)"></span></td>
            <td class="ps-c-acc"><button class="ps-arquivar" title="Arquivar com decisão" @click="arquivar([r])">🗂</button></td>
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
  </template>
</div>`,

    setup() {
      const dados = ref({});
      const loading = ref(false);
      const activo = ref(0);
      const busca = ref('');
      const motivo = ref('');
      const verResolvidos = ref(false);
      const fSac = ref('');
      const fAno = ref('');
      const fDecisao = ref('');
      // catecúmeno → linha (para saber a Preparação ao arquivar)
      const seleccionados = reactive(new Map());

      function carregar() {
        loading.value = true;
        frappe.call({
          method: API + 'get_dados',
          callback: (r) => { dados.value = r.message || {}; seleccionados.clear(); },
          always: () => { loading.value = false; },
        });
      }
      onMounted(carregar);
      function mudar(i) { activo.value = i; motivo.value = ''; busca.value = ''; seleccionados.clear(); }

      const VAZIO = { pendentes: [], fora: [], sem_motivo: [], resolvidos: [], arquivados: [], preparacoes: [], fases: [] };
      const sac = computed(() => (activo.value !== 'arq' && (dados.value.sacramentos || [])[activo.value]) || VAZIO);
      const bate = (r) => {
        const q = busca.value.trim().toLowerCase();
        return !q || [r.catecumeno, r.turma, r.fase, r.encarregado, r.preparacao, r.decisao, r.nota]
          .some((v) => (v || '').toLowerCase().includes(q));
      };
      const pendentes = computed(() => sac.value.pendentes.filter(
        (r) => bate(r) && (!motivo.value || (r.motivo || 'Sem motivo') === motivo.value)));
      const fora = computed(() => (motivo.value ? [] : sac.value.fora.filter(bate)));
      const semMotivo = computed(() => (motivo.value ? [] : sac.value.sem_motivo.filter(bate)));
      // Todos os arquivados (todos os sacramentos), para o separador próprio
      const todosArquivados = computed(() => (dados.value.sacramentos || []).flatMap(
        (x) => x.arquivados.map((r) => Object.assign({ sacramento: x.sacramento, rotulo: x.rotulo }, r))));
      const arqSacramentos = computed(() => (dados.value.sacramentos || [])
        .map((x) => ({ nome: x.sacramento, rotulo: x.rotulo, n: x.arquivados.length })).filter((o) => o.n));
      const arqAnos = computed(() => [...new Set(todosArquivados.value.map((r) => r.ano_lectivo))].sort().reverse());
      const arquivadosVisiveis = computed(() => todosArquivados.value.filter((r) => bate(r)
        && (!fSac.value || r.sacramento === fSac.value)
        && (!fAno.value || r.ano_lectivo === fAno.value)
        && (!fDecisao.value || r.decisao === fDecisao.value)));
      const motivos = computed(() => {
        const n = {};
        sac.value.pendentes.forEach((r) => { const m = r.motivo || 'Sem motivo'; n[m] = (n[m] || 0) + 1; });
        return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([nome, k]) => ({ nome, n: k }));
      });

      // ── Selecção e arquivo ──────────────────────────────────────────────
      const alternar = (r) => (seleccionados.has(r.catecumeno) ? seleccionados.delete(r.catecumeno) : seleccionados.set(r.catecumeno, r));
      const todos = (lst) => lst.length && lst.every((r) => seleccionados.has(r.catecumeno));
      const marcarTodos = (lst, v) => lst.forEach((r) => (v ? seleccionados.set(r.catecumeno, r) : seleccionados.delete(r.catecumeno)));
      const arquivarSel = () => arquivar([...seleccionados.values()]);

      function arquivar(linhas) {
        const semMotivoProprio = linhas.some((r) => !r.preparacao);
        const d = new frappe.ui.Dialog({
          title: linhas.length === 1 ? __('Arquivar: {0}', [linhas[0].catecumeno]) : __('Arquivar {0} catecúmeno(s)', [linhas.length]),
          fields: [
            { fieldname: 'decisao', fieldtype: 'Select', label: __('Decisão'), reqd: 1,
              options: [''].concat(dados.value.decisoes || []).join('\n') },
            { fieldname: 'motivo', fieldtype: 'Select', label: __('Motivo'),
              options: [''].concat(dados.value.motivos || []).join('\n'),
              description: semMotivoProprio
                ? __('Para quem não está numa Preparação, por omissão fica “Não listado na preparação”.')
                : __('Vazio = o motivo registado na Preparação.') },
            { fieldname: 'nota', fieldtype: 'Small Text', label: __('Nota (opcional)') },
            { fieldname: 'info', fieldtype: 'HTML',
              options: `<p class="text-muted small">${__('Saem das listas de acompanhamento, mas o registo fica guardado (secção Arquivados e lista “Sacramento Nao Recebido”).')}</p>` },
          ],
          primary_action_label: __('Arquivar'),
          primary_action(v) {
            d.hide();
            frappe.call({
              method: API + 'arquivar',
              args: {
                catecumenos: linhas.map((r) => r.catecumeno),
                preparacoes: linhas.map((r) => r.preparacao || null),
                sacramento: sac.value.sacramento, decisao: v.decisao, motivo: v.motivo || null, nota: v.nota || null,
              },
              freeze: true,
              callback: (r) => {
                frappe.show_alert({ message: __('{0} arquivado(s).', [r.message.arquivados]), indicator: 'green' });
                carregar();
              },
            });
          },
        });
        d.show();
      }
      function reabrir(r) {
        frappe.confirm(__('Reabrir {0}? O registo da decisão é apagado e a pessoa volta ao acompanhamento.', [r.catecumeno]), () => {
          frappe.call({ method: API + 'reabrir', args: { nome: r.name }, callback: carregar });
        });
      }

      const total = (s) => s.pendentes.length + s.fora.length + s.sem_motivo.length;
      const dia = (d) => (d ? frappe.datetime.str_to_user(String(d).split(' ')[0]) : '—');
      const tel = (n) => (window.cq ? window.cq.telefone(n) : frappe.utils.escape_html(n));
      const MOT = { Comportamento: 'm1', Faltas: 'm2', Documentos: 'm3', Desistiu: 'm4', 'Repete a fase': 'm5', Outro: 'm6' };
      const cls = (m) => MOT[m] || 'm6';
      const estadoCls = (e) => ({ Activo: 'ok', Pendente: 'aviso', Inactivo: 'off', Transferido: 'off', Crismado: 'feito' }[e] || 'off');

      return {
        dados, loading, activo, busca, motivo, verResolvidos, fSac, fAno, fDecisao, seleccionados, carregar, mudar,
        sac, pendentes, fora, semMotivo, motivos, todosArquivados, arqSacramentos, arqAnos, arquivadosVisiveis,
        alternar, todos, marcarTodos, arquivarSel, arquivar, reabrir,
        total, dia, tel, cls, estadoCls,
      };
    },
  });
}

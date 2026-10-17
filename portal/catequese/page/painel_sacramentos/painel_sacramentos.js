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
      <div class="ps-preps-top">
        <span class="ps-preps-label">Preparações</span>
        <span v-if="sac.fases.length" class="ps-muted ps-small">Fase do sacramento: {{ sac.fases.join(', ') }}</span>
      </div>
      <div class="ps-prep-grid">
        <!-- rascunho: abre a lista de candidatos aqui (não é link: o router do Frappe apanha
             qualquer clique em <a href="/app/...">); submetida: abre o Gerir Preparação -->
        <component :is="p.docstatus ? 'a' : 'div'" v-for="p in sac.cartoes" :key="p.name" class="ps-prep"
           :class="{ rasc: !p.docstatus, aberta: p.name === abertaNome }"
           :href="p.docstatus ? '/app/gerir-preparacao/' + encodeURIComponent(p.name) : null"
           :role="p.docstatus ? null : 'button'"
           @click="!p.docstatus && (abertaNome = abertaNome === p.name ? '' : p.name)">
          <div class="ps-prep-l1">
            <b>{{ p.name }}</b>
            <span class="ps-chip" :class="p.docstatus ? 'feito' : 'rasc'">{{ p.docstatus ? 'Submetida' : 'Rascunho' }}</span>
          </div>
          <div class="ps-prep-l2">
            <span>{{ p.data ? dia(p.data) : 'Sem data' }}</span>
            <span v-if="p.tipo && p.tipo !== 'Normal'">· {{ p.tipo }}</span>
            <span v-if="p.ano_lectivo !== dados.ano">· {{ p.ano_lectivo }}</span>
          </div>
          <div class="ps-prep-l3">
            <span class="ps-chip ok">{{ p.vao }} vão</span>
            <span v-if="p.nao" class="ps-chip erro">{{ p.nao }} não</span>
            <span v-if="!p.docstatus" class="ps-prep-ver">{{ p.name === abertaNome ? 'fechar ▲' : 'ver ▼' }}</span>
          </div>
        </component>
        <span v-if="!sac.cartoes.length" class="ps-muted">Nenhuma preparação de {{ dados.ano }}.</span>
      </div>

      <!-- Candidatos da preparação em rascunho (compacto) -->
      <section v-if="aberta" class="ps-card ps-prep-painel">
        <div class="ps-card-head">
          <h2>{{ aberta.name }}</h2>
          <span class="ps-count ok">{{ aberta.vao }}</span>
          <span class="ps-vazio-inline">{{ aberta.data ? dia(aberta.data) : 'Sem data' }}<template v-if="aberta.tipo && aberta.tipo !== 'Normal'"> · {{ aberta.tipo }}</template></span>
          <a class="ps-btn ps-btn-add" :href="'/app/gerir-preparacao/' + encodeURIComponent(aberta.name)">Gerir preparação ↗</a>
          <button class="ps-link" @click="abertaNome = ''">fechar</button>
        </div>
        <div v-if="!aberta.candidatos.length" class="ps-vazio">Ainda sem candidatos.</div>
        <table v-else class="ps-table">
          <thead><tr><th>Candidato</th><th>Catequista</th><th>Encarregado</th><th class="ps-c-chk">Ficha</th><th class="ps-c-chk">Docs. pad.</th></tr></thead>
          <tbody>
            <tr v-for="c in aberta.candidatos" :key="c.catecumeno" :class="{ nao: c.nao }">
              <td data-l="Candidato">
                <a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(c.catecumeno)">{{ c.catecumeno }}</a>
                <span v-if="c.nao" class="ps-chip erro">não vai receber</span>
                <div class="ps-small ps-muted">{{ c.turma || 'Sem turma' }}</div>
              </td>
              <td data-l="Catequista" class="ps-small">{{ c.catequista || '—' }}</td>
              <td data-l="Encarregado"><div v-if="c.encarregado" class="ps-small">{{ c.encarregado }}</div><span v-if="c.contacto" v-html="tel(c.contacto)"></span><span v-if="!c.encarregado && !c.contacto" class="ps-muted">—</span></td>
              <td data-l="Ficha" class="ps-c-chk"><span class="ps-chk" :class="{ on: c.ficha }">{{ c.ficha ? '✓' : '' }}</span></td>
              <td data-l="Docs. pad." class="ps-c-chk"><span class="ps-chk" :class="{ on: c.documentos_padrinhos }">{{ c.documentos_padrinhos ? '✓' : '' }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <div class="ps-filtros">
      <input class="ps-search" v-model="busca" placeholder="Procurar nome, turma, encarregado…">
      <button v-for="m in motivos" :key="m.nome" class="ps-motivo-chip" :class="{ on: motivo === m.nome }"
              @click="motivo = motivo === m.nome ? '' : m.nome">{{ m.nome }} <b>{{ m.n }}</b></button>
    </div>

    <!-- Barra de selecção -->
    <div v-if="seleccionados.size" class="ps-massa">
      <b>{{ seleccionados.size }} seleccionado(s)</b>
      <button class="ps-btn ps-btn-ouro" @click="segundaOportunidade">✝️ 2ª oportunidade…</button>
      <button class="ps-btn" @click="arquivarSel">🗂 Arquivar com decisão…</button>
      <button class="ps-link" @click="seleccionados.clear()">limpar</button>
    </div>

    <!-- Não receberam -->
    <section class="ps-card" :class="{ 'ps-card--vazio': !pendentes.length }">
      <div class="ps-card-head">
        <h2>Não receberam</h2>
        <span class="ps-count" :class="{ ok: !pendentes.length }">{{ pendentes.length }}</span>
        <span v-if="!pendentes.length" class="ps-vazio-inline">Ninguém pendente{{ busca || motivo ? ' com este filtro' : '' }} ✓</span>
        <button class="ps-btn ps-btn-add" @click="adicionar">＋ Adicionar</button>
        <p v-if="pendentes.length" class="ps-muted">Marcados “Não vai receber” numa Preparação e que ainda não têm o sacramento.
          Falta alguém (ex.: foi apagado da preparação)? Use “＋ Adicionar”.</p>
      </div>
      <table v-if="pendentes.length" class="ps-table">
        <thead><tr>
          <th class="ps-c-sel"><input type="checkbox" :checked="todos(pendentes)" @change="marcarTodos(pendentes, $event.target.checked)"></th>
          <th>Catecúmeno</th><th>Motivo</th><th>Não recebeu em</th><th>Turma · Catequista</th><th>Encarregado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in pendentes" :key="r.catecumeno" :class="{ sel: seleccionados.has(r.catecumeno) }">
            <td class="ps-c-sel"><input type="checkbox" :checked="seleccionados.has(r.catecumeno)" @change="alternar(r)"></td>
            <td data-l="Catecúmeno">
              <a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a>
              <span v-if="r.vezes > 1" class="ps-chip erro" :title="'Falhou ' + r.vezes + ' vezes'">{{ r.vezes }}×</span>
              <div><span class="ps-estado" :class="estadoCls(r.status)">{{ r.status }}</span></div>
            </td>
            <td data-l="Motivo">
              <span class="ps-motivo" :class="cls(r.motivo)">{{ r.motivo || 'Sem motivo' }}</span>
              <div v-if="r.detalhe" class="ps-detalhe">{{ r.detalhe }}</div>
            </td>
            <td data-l="Não recebeu em" class="ps-nowrap">
              <a v-if="r.preparacao" :href="'/app/preparacao-do-sacramento/' + encodeURIComponent(r.preparacao)">{{ r.preparacao }}</a>
              <span v-else class="ps-muted">—</span>
              <div class="ps-muted ps-small">{{ dia(r.data) }}
                <a v-if="r.manual" class="ps-chip" :href="'/app/sacramento-nao-recebido/' + encodeURIComponent(r.registo)" title="Acrescentado à mão">acrescentado</a>
              </div>
            </td>
            <td data-l="Turma"><div class="ps-small">{{ r.turma || 'Sem turma' }}</div><div v-if="r.catequista" class="ps-small ps-muted">{{ r.catequista }}</div></td>
            <td data-l="Encarregado"><div v-if="r.encarregado" class="ps-small">{{ r.encarregado }}</div><span v-if="r.contacto" v-html="tel(r.contacto)"></span><span v-if="!r.encarregado && !r.contacto" class="ps-muted">—</span></td>
            <td class="ps-c-acc"><button class="ps-arquivar" title="Arquivar com decisão" @click="arquivar([r])">🗂</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Fora da preparação -->
    <section class="ps-card" :class="{ 'ps-card--vazio': !fora.length }">
      <div class="ps-card-head">
        <h2>Na fase do sacramento, fora da preparação</h2>
        <span class="ps-count aviso" :class="{ ok: !fora.length }">{{ fora.length }}</span>
        <span v-if="!fora.length" class="ps-vazio-inline">{{ !sac.preparacoes.length ? 'Aparece quando houver uma Preparação deste ano.' : motivo ? 'Filtro de motivo activo.' : 'Todos estão numa preparação ✓' }}</span>
        <p v-if="fora.length" class="ps-muted">Este ano na fase do sacramento, sem o sacramento, e em nenhuma Preparação de {{ dados.ano }}
          (inclui quem saiu durante o ano). Se vão receber, use “Listar candidatos” na Preparação; se não, arquive com a decisão.</p>
      </div>
      <table v-if="fora.length" class="ps-table">
        <thead><tr>
          <th class="ps-c-sel"><input type="checkbox" :checked="todos(fora)" @change="marcarTodos(fora, $event.target.checked)"></th>
          <th>Catecúmeno</th><th>Turma · Catequista</th><th>Encarregado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in fora" :key="r.catecumeno" :class="{ sel: seleccionados.has(r.catecumeno) }">
            <td class="ps-c-sel"><input type="checkbox" :checked="seleccionados.has(r.catecumeno)" @change="alternar(r)"></td>
            <td data-l="Catecúmeno"><a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a>
              <div><span class="ps-estado" :class="estadoCls(r.status)">{{ r.status }}</span></div></td>
            <td data-l="Turma"><div class="ps-small">{{ r.turma || 'Sem turma' }}</div><div v-if="r.catequista" class="ps-small ps-muted">{{ r.catequista }}</div></td>
            <td data-l="Encarregado"><div v-if="r.encarregado" class="ps-small">{{ r.encarregado }}</div><span v-if="r.contacto" v-html="tel(r.contacto)"></span><span v-if="!r.encarregado && !r.contacto" class="ps-muted">—</span></td>
            <td class="ps-c-acc"><button class="ps-arquivar" title="Arquivar com decisão" @click="arquivar([r])">🗂</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Sem motivo registado -->
    <section class="ps-card" :class="{ 'ps-card--vazio': !semMotivo.length }">
      <div class="ps-card-head">
        <h2>Em fase posterior, sem o sacramento</h2>
        <span class="ps-count aviso" :class="{ ok: !semMotivo.length }">{{ semMotivo.length }}</span>
        <span v-if="!semMotivo.length" class="ps-vazio-inline">{{ motivo ? 'Filtro de motivo activo.' : 'Tudo coerente ✓' }}</span>
        <p v-if="semMotivo.length" class="ps-muted">Activos numa fase depois da do sacramento, sem o visto e sem registo de “Não vai receber”.
          Se já recebeu, marque-o no catecúmeno; se não, arquive com a decisão.</p>
      </div>
      <table v-if="semMotivo.length" class="ps-table">
        <thead><tr>
          <th class="ps-c-sel"><input type="checkbox" :checked="todos(semMotivo)" @change="marcarTodos(semMotivo, $event.target.checked)"></th>
          <th>Catecúmeno</th><th>Turma · Catequista</th><th>Encarregado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in semMotivo" :key="r.catecumeno" :class="{ sel: seleccionados.has(r.catecumeno) }">
            <td class="ps-c-sel"><input type="checkbox" :checked="seleccionados.has(r.catecumeno)" @change="alternar(r)"></td>
            <td data-l="Catecúmeno"><a class="ps-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a>
              <div><span class="ps-estado" :class="estadoCls(r.status)">{{ r.status }}</span></div></td>
            <td data-l="Turma"><div class="ps-small">{{ r.turma || 'Sem turma' }}</div><div v-if="r.catequista" class="ps-small ps-muted">{{ r.catequista }}</div></td>
            <td data-l="Encarregado"><div v-if="r.encarregado" class="ps-small">{{ r.encarregado }}</div><span v-if="r.contacto" v-html="tel(r.contacto)"></span><span v-if="!r.encarregado && !r.contacto" class="ps-muted">—</span></td>
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
      const abertaNome = ref('');   // preparação em rascunho com a lista aberta
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
      function mudar(i) { activo.value = i; abertaNome.value = ''; motivo.value = ''; busca.value = ''; seleccionados.clear(); }

      const VAZIO = { pendentes: [], fora: [], sem_motivo: [], resolvidos: [], arquivados: [], preparacoes: [], cartoes: [], fases: [], rascunhos: [] };
      const sac = computed(() => (activo.value !== 'arq' && (dados.value.sacramentos || [])[activo.value]) || VAZIO);
      const bate = (r) => {
        const q = busca.value.trim().toLowerCase();
        return !q || [r.catecumeno, r.turma, r.catequista, r.encarregado, r.preparacao, r.agendado, r.decisao, r.nota]
          .some((v) => (v || '').toLowerCase().includes(q));
      };
      const doMotivo = (r) => !motivo.value || (r.motivo || 'Sem motivo') === motivo.value;
      // quem já está numa preparação para receber sai das listas (aparece no cartão da preparação)
      const pendentes = computed(() => sac.value.pendentes.filter((r) => !r.agendado && bate(r) && doMotivo(r)));
      const fora = computed(() => (motivo.value ? [] : sac.value.fora.filter((r) => !r.agendado && bate(r))));
      const semMotivo = computed(() => (motivo.value ? [] : sac.value.sem_motivo.filter((r) => !r.agendado && bate(r))));
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
      const aberta = computed(() => sac.value.cartoes.find((p) => p.name === abertaNome.value && p.candidatos) || null);
      const motivos = computed(() => {
        const n = {};
        sac.value.pendentes.filter((r) => !r.agendado).forEach((r) => { const m = r.motivo || 'Sem motivo'; n[m] = (n[m] || 0) + 1; });
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
      function segundaOportunidade() {
        const linhas = [...seleccionados.values()];
        const s = sac.value;
        const NOVA = __('Nova preparação (2ª oportunidade)');
        const JUNTAR = __('Juntar a uma preparação em rascunho');
        const rascunhos = s.rascunhos || [];
        const d = new frappe.ui.Dialog({
          title: __('2ª oportunidade — {0} ({1})', [s.rotulo, linhas.length]),
          fields: [
            { fieldname: 'modo', fieldtype: 'Select', label: __('Como'), reqd: 1,
              options: (rascunhos.length ? [NOVA, JUNTAR] : [NOVA]).join('\n'), default: NOVA },
            { fieldname: 'preparacao', fieldtype: 'Select', label: __('Preparação em rascunho'),
              options: [''].concat(rascunhos.map((x) => x.name)).join('\n'),
              depends_on: `eval:doc.modo=='${JUNTAR}'`, mandatory_depends_on: `eval:doc.modo=='${JUNTAR}'`,
              description: __('Ex.: a do próximo ano, para quem repete com o grupo seguinte.') },
            { fieldname: 'ano', fieldtype: 'Link', options: 'Ano Lectivo', label: __('Ano lectivo'), default: dados.value.ano,
              depends_on: `eval:doc.modo=='${NOVA}'`, mandatory_depends_on: `eval:doc.modo=='${NOVA}'` },
            { fieldname: 'data', fieldtype: 'Date', label: __('Data do sacramento'), depends_on: `eval:doc.modo=='${NOVA}'`,
              description: __('Pode ficar vazia agora; é obrigatória para submeter.') },
            { fieldname: 'turma_destino', fieldtype: 'Link', options: 'Turma', label: __('Turma de destino (opcional)'),
              get_query: () => ({ filters: { status: 'Activo' } }),
              depends_on: `eval:doc.modo=='${NOVA}' && ${JSON.stringify(s.sacramento)}=='Baptismo'`,
              description: __('Depois do baptismo passam para esta turma (ex.: a da fase seguinte onde estão os colegas). Vazio: ficam onde estão.') },
            { fieldname: 'nomes', fieldtype: 'HTML',
              options: `<p class="text-muted small">${linhas.map((r) => frappe.utils.escape_html(r.catecumeno)).join(', ')}</p>` },
          ],
          primary_action_label: __('Criar'),
          primary_action(v) {
            d.hide();
            frappe.call({
              method: API + 'segunda_oportunidade',
              args: {
                catecumenos: linhas.map((r) => r.catecumeno),
                falhou_em: linhas.map((r) => r.preparacao || null),
                sacramento: s.sacramento,
                preparacao: v.modo === JUNTAR ? v.preparacao : null,
                ano: v.ano, data: v.data || null, turma_destino: v.turma_destino || null,
              },
              freeze: true,
              callback: (r) => {
                const m = r.message;
                seleccionados.clear();
                carregar();
                frappe.msgprint({
                  title: __('2ª oportunidade'), indicator: 'green',
                  message: `<p>${__('{0} adicionado(s) e {1} reposto(s) em <b>{2}</b>.', [m.adicionados, m.repostos, m.preparacao])}</p>
                    <p><a class="btn btn-primary btn-sm" href="/app/gerir-preparacao/${encodeURIComponent(m.preparacao)}">${__('Abrir na página Gerir Preparação')}</a></p>`,
                });
              },
            });
          },
        });
        d.show();
      }

      function adicionar() {
        const s = sac.value;
        const d = new frappe.ui.Dialog({
          title: __('Acrescentar a “Não receberam” — {0}', [s.rotulo]),
          fields: [
            { fieldname: 'catecumeno', fieldtype: 'Link', options: 'Catecumeno', label: __('Catecúmeno'), reqd: 1 },
            { fieldname: 'preparacao', fieldtype: 'Link', options: 'Preparacao do Sacramento', label: __('Preparação onde devia ter recebido'),
              get_query: () => ({ filters: { sacramento: s.sacramento, docstatus: ['<', 2] } }),
              description: __('Opcional. Define o ano; vazio = ano actual.') },
            { fieldname: 'motivo', fieldtype: 'Select', label: __('Motivo'), options: [''].concat(dados.value.motivos || []).join('\n') },
            { fieldname: 'nota', fieldtype: 'Small Text', label: __('Nota (opcional)') },
          ],
          primary_action_label: __('Acrescentar'),
          primary_action(v) {
            d.hide();
            frappe.call({
              method: API + 'adicionar',
              args: { catecumeno: v.catecumeno, sacramento: s.sacramento, preparacao: v.preparacao || null,
                      motivo: v.motivo || null, nota: v.nota || null },
              callback: () => {
                frappe.show_alert({ message: __('{0} está em “Não receberam”.', [v.catecumeno]), indicator: 'green' });
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

      // quem já está numa preparação para receber não conta como pendente
      const total = (s) => [...s.pendentes, ...s.fora, ...s.sem_motivo].filter((r) => !r.agendado).length;
      const dia = (d) => (d ? frappe.datetime.str_to_user(String(d).split(' ')[0]) : '—');
      const tel = (n) => (window.cq ? window.cq.telefone(n) : frappe.utils.escape_html(n));
      const MOT = { Comportamento: 'm1', Faltas: 'm2', Documentos: 'm3', Desistiu: 'm4', 'Repete a fase': 'm5', Outro: 'm6' };
      const cls = (m) => MOT[m] || 'm6';
      const estadoCls = (e) => ({ Activo: 'ok', Pendente: 'aviso', Inactivo: 'off', Transferido: 'off', Crismado: 'feito' }[e] || 'off');

      return {
        dados, loading, activo, busca, motivo, verResolvidos, abertaNome, aberta, fSac, fAno, fDecisao, seleccionados, carregar, mudar,
        sac, pendentes, fora, semMotivo, motivos, todosArquivados, arqSacramentos, arqAnos, arquivadosVisiveis,
        alternar, todos, marcarTodos, arquivarSel, arquivar, reabrir, segundaOportunidade, adicionar,
        total, dia, tel, cls, estadoCls,
      };
    },
  });
}

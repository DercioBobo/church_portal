/* global frappe, Vue */
// Rollover do Plano — Proposta do Plano Anual: gerar → editar por mês → imprimir → finalizar.
// Vue 3 CDN, no build step.

frappe.pages['rollover-plano'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Rollover do Plano Anual'),
    single_column: true,
  });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    createRolloverApp().mount(mount);
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

const RP_METODO = 'portal.catequista.doctype.proposta_do_plano.proposta_do_plano';
const RP_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto',
                  'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const RP_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const RP_CAMPOS = ['data', 'data_fim', 'actividade', 'tipologia', 'local', 'orador', 'orcamento', 'notas'];

function rpApi(method, args) {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: `${RP_METODO}.${method}`,
      args,
      callback: (r) => { if (r.exc) reject(new Error(r.exc)); else resolve(r.message); },
      error: reject,
    });
  });
}

function rpNorm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function rpDia(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('-').map(Number);
  return RP_DIAS[new Date(y, m - 1, day).getDay()];
}
function rpCurta(d) {
  if (!d) return '';
  const [, m, day] = String(d).split('-');
  return `${day}/${m}`;
}

let rpChave = 0;

function createRolloverApp() {
  const { createApp, ref, computed, onMounted, onBeforeUnmount } = Vue;

  return createApp({
    template: `
<div id="rp-app">
  <div class="rp-toolbar">
    <h1>🔁 Rollover do Plano</h1>
    <label class="rp-muted">Plano para</label>
    <select v-model="ano" @change="carregar" class="rp-select">
      <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
    </select>
    <span v-if="proposta" class="rp-estado" :class="finalizada ? 'final' : 'rascunho'">
      {{ finalizada ? 'Finalizada' : 'Em discussão' }}
    </span>
    <div style="flex:1"></div>
    <template v-if="proposta">
      <span v-if="sujo" class="rp-muted">Alterações por guardar</span>
      <a class="rp-btn" :href="'/app/proposta-do-plano/' + encodeURIComponent(proposta.name)" title="Documento, comentários e histórico">
        📄 Documento<span v-if="proposta.comentarios"> · 💬 {{ proposta.comentarios }}</span>
      </a>
      <button class="rp-btn" @click="imprimir">🖨 Imprimir</button>
      <template v-if="!finalizada">
        <button class="rp-btn" :disabled="!sujo || ocupado" @click="guardar">💾 Guardar</button>
        <button class="rp-btn rp-btn-primary" :disabled="ocupado || !linhas.length" @click="finalizar">✓ Finalizar</button>
      </template>
      <a v-else class="rp-btn rp-btn-primary" href="/app/plano-anual">Abrir Plano Anual →</a>
    </template>
  </div>

  <div v-if="loading" class="rp-loading"><div class="rp-spinner"></div> A carregar…</div>

  <!-- ── Sem proposta: gerar ───────────────────────────────────────── -->
  <div v-else-if="!proposta" class="rp-wrap">
    <div class="rp-card rp-gerar">
      <h2>Proposta do Plano {{ ano }}</h2>
      <p class="rp-muted">
        Copia as actividades de um ano para {{ ano }}, com as datas ajustadas. A proposta fica em rascunho para
        discutir em reunião: pode alterar, apagar e acrescentar actividades, imprimir, e só no fim finalizar.
      </p>
      <div class="rp-form">
        <label>Copiar do ano
          <select v-model="origem" class="rp-select">
            <option v-for="a in anos.filter(x => x !== ano)" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <label class="rp-check"><input type="checkbox" v-model="manterOrador"> Manter orador / responsável</label>
        <label class="rp-check"><input type="checkbox" v-model="manterFds"> Manter o dia da semana das actividades ao fim-de-semana</label>
      </div>
      <p v-if="info.no_plano" class="rp-aviso">
        {{ ano }} já tem {{ info.no_plano }} actividade(s) no Plano Anual — as que tiverem o mesmo nome não são repetidas.
      </p>
      <button class="rp-btn rp-btn-primary rp-btn-lg" :disabled="!origem || ocupado" @click="gerar">Gerar proposta</button>
    </div>
  </div>

  <!-- ── Proposta ──────────────────────────────────────────────────── -->
  <div v-else class="rp-wrap rp-wrap-wide">
    <div class="rp-resumo">
      <div><b>{{ linhas.length }}</b><span>actividades</span></div>
      <div><b>{{ novas }}</b><span>novas</span></div>
      <div><b>{{ semData }}</b><span>sem data</span></div>
      <div :class="{ alerta: choques.size }"><b>{{ choques.size }}</b><span>dias com várias actividades</span></div>
      <p v-if="proposta.ano_origem" class="rp-muted">Baseada no plano de {{ proposta.ano_origem }}.</p>
      <p v-if="finalizada" class="rp-muted">
        Finalizada — as actividades estão no Plano Anual, ligadas a esta proposta.
        Para desfazer, cancele o documento (só é possível se nenhuma actividade já começou).
      </p>
    </div>

    <div class="rp-barra">
      <div class="rp-pesquisa">
        <input v-model="pesquisa" placeholder="Pesquisar actividade, tipologia, local, responsável ou notas…"
               @keydown.escape="pesquisa = ''">
        <button v-if="pesquisa" class="rp-limpar" @click="pesquisa = ''">✕</button>
      </div>
      <span v-if="pesquisa" class="rp-muted">{{ visiveis.length }} de {{ linhas.length }}</span>
      <template v-if="!finalizada">
        <div style="flex:1"></div>
        <button class="rp-btn" :disabled="!visiveis.length" @click="seleccionarVisiveis">
          ☑ Seleccionar {{ pesquisa ? 'resultados' : 'todas' }}
        </button>
        <template v-if="seleccionadas.length">
          <button class="rp-btn" @click="seleccionadas = []">Limpar selecção</button>
          <button class="rp-btn rp-btn-danger" @click="apagarSeleccionadas">🗑 Apagar seleccionadas ({{ seleccionadas.length }})</button>
        </template>
      </template>
    </div>
    <div v-if="pesquisa && !visiveis.length" class="rp-vazio">Nenhuma actividade corresponde à pesquisa.</div>

    <section v-for="g in grupos" :key="g.chave" class="rp-mes">
      <h3>
        <input v-if="!finalizada" type="checkbox" class="rp-sel" :checked="todasSel(g.linhas)"
               :indeterminate.prop="algumasSel(g.linhas)" @change="toggleGrupo(g.linhas)" title="Seleccionar o mês">
        {{ g.titulo }} <span>{{ g.linhas.length }}</span>
      </h3>
      <div class="rp-table-wrap">
        <table class="rp-table">
          <thead>
            <tr>
              <th v-if="!finalizada" class="c-sel"></th>
              <th class="c-data">Data</th><th class="c-data">Fim</th><th class="c-act">Actividade</th><th class="c-tip">Tipologia</th>
              <th class="c-txt">Local</th><th class="c-txt">Responsável</th><th class="c-num">Orçamento</th><th class="c-notas">Notas da reunião</th>
              <th v-if="!finalizada" class="c-x"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in g.linhas" :key="l._k"
                :class="{ choque: l.data && choques.has(l.data), sel: seleccionadas.includes(l._k) }">
              <template v-if="!finalizada">
                <td class="c-sel"><input type="checkbox" class="rp-sel" :checked="seleccionadas.includes(l._k)" @change="toggle(l)"></td>
                <td class="c-data">
                  <input type="date" :value="l.data" @blur="definirData(l, $event)"
                         @keydown.enter.prevent="$event.target.blur()" title="A linha muda de mês ao sair do campo">
                  <small>{{ dia(l.data) }}<span v-if="l.data_origem"> · antes {{ curta(l.data_origem) }}</span></small>
                </td>
                <td class="c-data"><input type="date" v-model="l.data_fim" @input="marcar"></td>
                <td>
                  <input v-model="l.actividade" @input="marcar" placeholder="Nome da actividade">
                  <span v-if="l.origem !== 'Rollover'" class="rp-nova">NOVA</span>
                </td>
                <td class="c-tip">
                  <select v-model="l.tipologia" @change="marcar">
                    <option value=""></option>
                    <option v-for="t in tipologias" :key="t.name" :value="t.name">{{ t.icone ? t.icone + ' ' : '' }}{{ t.name }}</option>
                  </select>
                </td>
                <td><input v-model="l.local" @input="marcar"></td>
                <td><input v-model="l.orador" @input="marcar"></td>
                <td class="c-num"><input type="number" min="0" step="0.01" v-model="l.orcamento" @input="marcar"></td>
                <td><input v-model="l.notas" @input="marcar" placeholder="—"></td>
                <td class="c-x"><button class="rp-x" title="Apagar" @click="apagar(l)">✕</button></td>
              </template>
              <template v-else>
                <td class="c-data">{{ curta(l.data) || '—' }} <small>{{ dia(l.data) }}</small></td>
                <td class="c-data">{{ curta(l.data_fim) }}</td>
                <td>
                  <a v-if="l.actividade_criada" :href="'/app/actividade-do-plano/' + encodeURIComponent(l.actividade_criada)">{{ l.actividade }}</a>
                  <span v-else>{{ l.actividade }}</span>
                </td>
                <td class="c-tip">{{ l.tipologia }}</td><td>{{ l.local }}</td><td>{{ l.orador }}</td>
                <td class="c-num">{{ l.orcamento || '' }}</td><td>{{ l.notas }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="!finalizada" class="rp-add">
      <button class="rp-btn" @click="adicionar">+ Adicionar actividade</button>
    </div>

    <div class="rp-card rp-notas">
      <label>Notas gerais da reunião</label>
      <textarea v-if="!finalizada" v-model="notasGerais" @input="marcar" rows="3"
                placeholder="Decisões, pendentes, quem trata de quê…"></textarea>
      <p v-else>{{ notasGerais || '—' }}</p>
    </div>
  </div>
</div>
`,
    setup() {
      const anos = ref([]);
      const ano = ref('');
      const loading = ref(true);
      const ocupado = ref(false);
      const info = ref({});
      const proposta = ref(null);
      const linhas = ref([]);
      const notasGerais = ref('');
      const tipologias = ref([]);
      const sujo = ref(false);
      const pesquisa = ref('');
      const seleccionadas = ref([]);   // _k das linhas seleccionadas

      const origem = ref('');
      const manterOrador = ref(true);
      const manterFds = ref(true);

      const finalizada = computed(() => proposta.value && proposta.value.docstatus === 1);
      const novas = computed(() => linhas.value.filter((l) => l.origem !== 'Rollover').length);
      const semData = computed(() => linhas.value.filter((l) => !l.data).length);
      const choques = computed(() => {
        const n = {};
        linhas.value.forEach((l) => { if (l.data) n[l.data] = (n[l.data] || 0) + 1; });
        return new Set(Object.keys(n).filter((d) => n[d] > 1));
      });

      // Agrupadas por mês da data (sem data no fim); dentro do mês, por data
      const visiveis = computed(() => {
        const q = rpNorm(pesquisa.value.trim());
        if (!q) return linhas.value;
        return linhas.value.filter((l) =>
          [l.actividade, l.tipologia, l.local, l.orador, l.notas].some((v) => rpNorm(v).includes(q)));
      });

      const grupos = computed(() => {
        const m = {};
        visiveis.value.forEach((l) => {
          const k = l.data ? Number(String(l.data).slice(5, 7)) - 1 : 12;
          (m[k] = m[k] || []).push(l);
        });
        return Object.keys(m).map(Number).sort((a, b) => a - b).map((k) => ({
          chave: k,
          titulo: k < 12 ? RP_MESES[k] : 'Sem data',
          linhas: m[k].sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || a._k - b._k),
        }));
      });

      function aplicar(estado) {
        info.value = estado;
        tipologias.value = estado.tipologias || [];
        proposta.value = estado.proposta;
        linhas.value = ((estado.proposta && estado.proposta.itens) || []).map((r) => {
          const l = { _k: ++rpChave, name: r.name, origem: r.origem, data_origem: r.data_origem,
                      actividade_criada: r.actividade_criada };
          RP_CAMPOS.forEach((c) => { l[c] = r[c] == null ? '' : r[c]; });
          return l;
        });
        notasGerais.value = (estado.proposta && estado.proposta.notas) || '';
        seleccionadas.value = [];
        origem.value = estado.origem_sugerida && anos.value.includes(estado.origem_sugerida)
          ? estado.origem_sugerida : (anos.value.find((a) => a !== ano.value) || '');
        sujo.value = false;
      }

      async function carregar() {
        if (sujo.value && !window.confirm(__('Há alterações por guardar. Mudar de ano e perdê-las?'))) return;
        loading.value = true;
        try {
          aplicar(await rpApi('get_estado', { ano_destino: ano.value }));
        } finally {
          loading.value = false;
        }
      }

      function marcar() { sujo.value = true; }

      // A data só é aplicada ao sair do campo (ou Enter): enquanto se escreve, a linha não muda de sítio
      function definirData(l, e) {
        const v = e.target.value || '';
        if (v !== (l.data || '')) {
          l.data = v;
          marcar();
        }
      }

      async function gerar() {
        ocupado.value = true;
        try {
          await rpApi('gerar_proposta', {
            ano_origem: origem.value, ano_destino: ano.value,
            manter_orador: manterOrador.value ? 1 : 0, manter_fim_de_semana: manterFds.value ? 1 : 0,
          });
          frappe.show_alert({ message: __('Proposta criada'), indicator: 'green' });
          await carregar();
        } finally {
          ocupado.value = false;
        }
      }

      async function guardar() {
        ocupado.value = true;
        try {
          const itens = linhas.value.map((l) => {
            const r = { name: l.name };
            RP_CAMPOS.forEach((c) => { r[c] = l[c] === '' ? null : l[c]; });
            return r;
          });
          const doc = await rpApi('guardar_itens', {
            nome: proposta.value.name, itens: JSON.stringify(itens), notas: notasGerais.value,
          });
          aplicar(Object.assign({}, info.value, { proposta: Object.assign(doc, { comentarios: proposta.value.comentarios }) }));
          frappe.show_alert({ message: __('Proposta guardada'), indicator: 'green' });
          return true;
        } catch (e) {
          return false;
        } finally {
          ocupado.value = false;
        }
      }

      function adicionar() {
        linhas.value.push({ _k: ++rpChave, origem: 'Nova', data: '', data_fim: '', actividade: '', tipologia: '',
                            local: '', orador: '', orcamento: '', notas: '' });
        marcar();
      }

      function apagar(l) {
        const nome = l.actividade || __('esta linha');
        frappe.confirm(__('Apagar "{0}" da proposta?', [nome]), () => {
          linhas.value = linhas.value.filter((x) => x !== l);
          seleccionadas.value = seleccionadas.value.filter((k) => k !== l._k);
          marcar();
        });
      }

      function toggle(l) {
        const i = seleccionadas.value.indexOf(l._k);
        if (i >= 0) seleccionadas.value.splice(i, 1); else seleccionadas.value.push(l._k);
      }
      const todasSel = (ls) => ls.length > 0 && ls.every((l) => seleccionadas.value.includes(l._k));
      const algumasSel = (ls) => !todasSel(ls) && ls.some((l) => seleccionadas.value.includes(l._k));
      function toggleGrupo(ls) {
        const ks = ls.map((l) => l._k);
        if (todasSel(ls)) seleccionadas.value = seleccionadas.value.filter((k) => !ks.includes(k));
        else seleccionadas.value = [...new Set([...seleccionadas.value, ...ks])];
      }
      function seleccionarVisiveis() {
        seleccionadas.value = [...new Set([...seleccionadas.value, ...visiveis.value.map((l) => l._k)])];
      }
      function apagarSeleccionadas() {
        const n = seleccionadas.value.length;
        frappe.confirm(__('Apagar {0} actividade(s) da proposta? (Só fica definitivo quando guardar.)', [n]), () => {
          const ks = new Set(seleccionadas.value);
          linhas.value = linhas.value.filter((l) => !ks.has(l._k));
          seleccionadas.value = [];
          marcar();
          frappe.show_alert({ message: __('{0} actividade(s) apagadas — guarde para confirmar', [n]), indicator: 'orange' });
        });
      }

      async function imprimir() {
        if (sujo.value && !(await guardar())) return;
        const q = new URLSearchParams({ doctype: 'Proposta do Plano', name: proposta.value.name,
                                        format: 'Proposta do Plano', trigger_print: 1, no_letterhead: 1 });
        window.open(`/printview?${q.toString()}`, '_blank');
      }

      function finalizar() {
        frappe.confirm(
          __('Criar {0} actividades no Plano Anual de {1}? Depois de finalizada, a proposta já não pode ser editada.',
             [linhas.value.length, ano.value]),
          async () => {
            if (sujo.value && !(await guardar())) return;
            ocupado.value = true;
            try {
              await rpApi('finalizar', { nome: proposta.value.name });
              await carregar();
            } finally {
              ocupado.value = false;
            }
          });
      }

      const avisarSaida = (e) => { if (sujo.value) { e.preventDefault(); e.returnValue = ''; } };
      onMounted(async () => {
        window.addEventListener('beforeunload', avisarSaida);
        const r = await rpApi('get_anos');
        anos.value = r.anos || [];
        ano.value = r.sugerido || anos.value[0] || '';
        if (ano.value) await carregar(); else loading.value = false;
      });
      onBeforeUnmount(() => window.removeEventListener('beforeunload', avisarSaida));

      return {
        anos, ano, loading, ocupado, info, proposta, linhas, notasGerais, tipologias, sujo,
        origem, manterOrador, manterFds, finalizada, novas, semData, choques, grupos,
        pesquisa, visiveis, seleccionadas, toggle, todasSel, algumasSel, toggleGrupo, seleccionarVisiveis,
        apagarSeleccionadas,
        carregar, marcar, definirData, gerar, guardar, adicionar, apagar, imprimir, finalizar,
        dia: rpDia, curta: rpCurta,
      };
    },
  });
}

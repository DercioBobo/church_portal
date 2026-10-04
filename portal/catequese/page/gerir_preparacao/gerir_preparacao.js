/* global frappe, Vue */
// Gerir Preparação — fichas, pagamentos, dia e situação de cada candidato numa só tabela.
// Edita o próprio documento "Preparacao do Sacramento" (portal.catequese.preparacao). Vue 3 CDN, sem build.

frappe.pages['gerir-preparacao'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({ parent: wrapper, title: __('Gerir Preparação'), single_column: true });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    wrapper.gpApp = createGerirPreparacaoApp().mount(mount);
    wrapper.gpApp.abrirRota();
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

frappe.pages['gerir-preparacao'].on_page_show = function (wrapper) {
  if (wrapper.gpApp) wrapper.gpApp.abrirRota();
};

function gpApi(metodo, args) {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: 'portal.catequese.preparacao.' + metodo,
      args,
      callback: (r) => resolve(r.message),
      error: reject,
    });
  });
}

const GP_NAO = 'Não vai receber';
const GP_DT = 'Preparacao do Sacramento';

function createGerirPreparacaoApp() {
  const { createApp, ref, reactive, computed } = Vue;

  return createApp({
    template: `
<div id="gp-app">
  <!-- Sem preparação escolhida: lista -->
  <template v-if="!nome">
    <div class="gp-head">
      <div><h1>✝️ Gerir Preparação</h1><p class="gp-muted">Escolha a preparação do sacramento.</p></div>
    </div>
    <div v-if="carregandoLista" class="gp-loading"><div class="gp-spinner"></div></div>
    <div v-for="g in listaPorAno" :key="g.ano" class="gp-ano">
      <div class="gp-ano-titulo">{{ g.ano }}</div>
      <div class="gp-grid">
        <a v-for="p in g.itens" :key="p.name" class="gp-prep-card" :href="'/app/gerir-preparacao/' + encodeURIComponent(p.name)">
          <b>{{ p.sacramento }}</b>
          <small>{{ p.data ? dia(p.data) : 'Sem data' }}</small>
          <span class="gp-chips">
            <span class="gp-chip ok">{{ p.vao }} vão</span>
            <span v-if="p.nao" class="gp-chip erro">{{ p.nao }} não</span>
            <span class="gp-chip" :class="p.docstatus ? 'ouro' : ''">{{ p.docstatus ? 'Submetida' : 'Rascunho' }}</span>
          </span>
        </a>
      </div>
    </div>
    <div v-if="!carregandoLista && !lista.length" class="gp-vazio">Ainda não há preparações.</div>
  </template>

  <template v-else>
    <div v-if="!p" class="gp-loading"><div class="gp-spinner"></div></div>
    <template v-else>
      <!-- Cabeçalho -->
      <div class="gp-head">
        <div class="gp-head-id">
          <a class="gp-voltar" href="/app/gerir-preparacao" title="Todas as preparações">←</a>
          <div>
            <h1>{{ p.sacramento }} {{ p.ano_lectivo }}
              <span class="gp-chip" :class="p.docstatus ? 'ouro' : 'rasc'">{{ p.docstatus ? 'Submetida' : 'Rascunho' }}</span>
              <span v-if="linkActivo" class="gp-chip ok">Link activo até {{ dia(p.link.expira_em) }}</span>
            </h1>
            <p class="gp-muted">📅 {{ p.data_do_sacramento ? dia(p.data_do_sacramento) : 'Sem data definida' }}
              · <a :href="'/app/preparacao-do-sacramento/' + encodeURIComponent(p.name)">abrir o formulário</a>
              <span class="gp-guardar" :class="estadoGuardar">{{ textoGuardar }}</span></p>
          </div>
        </div>
        <div class="gp-head-accoes">
          <div v-if="p.pode_editar" class="gp-menu">
            <button class="gp-btn" @click="menu = menu === 'lista' ? '' : 'lista'">👥 Lista ▾</button>
            <div v-if="menu === 'lista'" class="gp-menu-itens">
              <button @click="accao('listar')">Listar candidatos<small>acrescenta quem está nas fases do sacramento</small></button>
              <button @click="accao('sincronizar')">Sincronizar lista<small>remove quem já não cumpre os critérios</small></button>
              <button @click="accao('actualizar')">Actualizar catecúmenos<small>copia encarregados, padrinhos e contactos</small></button>
            </div>
          </div>
          <div class="gp-menu">
            <button class="gp-btn" @click="menu = menu === 'imprimir' ? '' : 'imprimir'">🖨 Imprimir ▾</button>
            <div v-if="menu === 'imprimir'" class="gp-menu-itens gp-menu-longo">
              <div v-for="f in p.formatos" :key="f" class="gp-menu-linha">
                <span>{{ f }}</span>
                <a :href="urlImprimir(f)" target="_blank">Ver</a>
                <a :href="urlPdf(f)" target="_blank">PDF</a>
              </div>
              <p class="gp-menu-nota">Só aparecem os que vão receber.</p>
            </div>
          </div>
          <div class="gp-menu">
            <button class="gp-btn" @click="menu = menu === 'link' ? '' : 'link'">🔗 Link ▾</button>
            <div v-if="menu === 'link'" class="gp-menu-itens">
              <button v-if="linkActivo" @click="copiarLink">Copiar link<small>para o grupo de WhatsApp</small></button>
              <button v-if="p.pode_editar || p.docstatus === 1" @click="gerarLink">{{ linkActivo ? 'Gerar novo link' : 'Gerar link' }}<small>o anterior deixa de funcionar</small></button>
              <button v-if="linkActivo" @click="revogarLink">Revogar link<small>deixa de funcionar já</small></button>
            </div>
          </div>
          <button v-if="p.pode_submeter" class="gp-btn gp-btn-ouro" @click="submeter">✓ Submeter</button>
        </div>
      </div>

      <!-- Progresso -->
      <div class="gp-kpis">
        <div class="gp-kpi"><b>{{ vao.length }}</b><span>vão receber</span><small v-if="naoN">{{ naoN }} não vão</small></div>
        <div class="gp-kpi" v-for="k in progresso" :key="k.rotulo" :class="{ completo: k.n === vao.length && vao.length }">
          <b>{{ k.n }}<small>/{{ vao.length }}</small></b><span>{{ k.rotulo }}</span>
          <i><em :style="{ width: pct(k.n) + '%' }"></em></i>
        </div>
        <div v-if="esperadoTotal" class="gp-kpi gp-kpi-dinheiro">
          <b>{{ moeda(recebidoTotal) }}</b><span>recebido de {{ moeda(esperadoTotal) }}</span>
          <i><em :style="{ width: Math.min(100, esperadoTotal ? recebidoTotal / esperadoTotal * 100 : 0) + '%' }"></em></i>
        </div>
      </div>

      <!-- Filtros -->
      <div class="gp-filtros">
        <input class="gp-search" v-model="busca" placeholder="Procurar candidato, turma, encarregado, padrinho…">
        <button v-for="f in FILTROS" :key="f.id" class="gp-filtro" :class="{ on: filtro === f.id }" @click="filtro = f.id">
          {{ f.rotulo }} <b>{{ contar(f.id) }}</b></button>
        <select v-model="turma" class="gp-select"><option value="">Todas as turmas</option><option v-for="t in turmas" :key="t" :value="t">{{ t }}</option></select>
        <div class="gp-menu">
          <button class="gp-btn" @click="menu = menu === 'colunas' ? '' : 'colunas'">⚙ Colunas ▾</button>
          <div v-if="menu === 'colunas'" class="gp-menu-itens gp-menu-longo gp-colunas">
            <template v-for="g in gruposColunas" :key="g.nome">
              <div class="gp-colunas-g">{{ g.nome }}</div>
              <label v-for="c in g.itens" :key="c.id" class="gp-colunas-item">
                <input type="checkbox" :checked="escolhidas.includes(c.id)" @change="alternarColuna(c.id)"> {{ c.rotulo }}
              </label>
            </template>
            <button class="gp-colunas-repor" @click="reporColunas">Repor as colunas padrão</button>
          </div>
        </div>
        <select v-model="ordem" class="gp-select"><option value="nome">Ordenar: nome</option><option value="turma">Ordenar: turma</option><option value="dia">Ordenar: dia</option></select>
      </div>

      <!-- Acções em massa -->
      <div v-if="seleccionados.size && p.pode_editar" class="gp-massa">
        <b>{{ seleccionados.size }} seleccionado(s)</b>
        <select class="gp-select" @change="emMassa({ dia: $event.target.value }); $event.target.value = '-'">
          <option value="-">Dia…</option><option v-for="d in p.opcoes.dia" :key="d" :value="d">{{ d }}</option></select>
        <button class="gp-btn" @click="massaTexto('sacerdote', 'Sacerdote')">Sacerdote…</button>
        <button class="gp-btn" @click="massaData">Data…</button>
        <button class="gp-btn" @click="emMassa({ ficha: 1 })">✓ Ficha</button>
        <button class="gp-btn" @click="emMassa({ documentos_padrinhos: 1 })">✓ Docs. padrinhos</button>
        <button v-if="esperadoTotal" class="gp-btn" @click="pagoCompleto">✓ Pago completo</button>
        <button class="gp-btn" @click="dialogoSituacao([...seleccionados])">Situação…</button>
        <button class="gp-btn gp-btn-perigo" @click="removerSel">Remover</button>
        <button class="gp-link" @click="seleccionados.clear()">limpar</button>
      </div>

      <!-- Tabela -->
      <div class="gp-tabela-wrap">
        <table class="gp-tabela">
          <thead>
            <tr>
              <th class="gp-c-sel"><input type="checkbox" :checked="todosSel" :disabled="!p.pode_editar" @change="seleccionarTodos($event.target.checked)"></th>
              <th>Candidato</th>
              <th v-for="c in colunasVisiveis" :key="c.id" :class="'gp-t-' + c.tipo">{{ c.rotulo }}<small v-if="c.esperado">{{ moeda(c.esperado) }}</small></th>
              <th class="gp-c-obs"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visiveis" :key="r.name" :class="{ fora: r.situacao === NAO, activa: painel === r.name, sel: seleccionados.has(r.name) }">
              <td class="gp-c-sel"><input type="checkbox" :checked="seleccionados.has(r.name)" :disabled="!p.pode_editar" @change="alternarSel(r.name)"></td>
              <td class="gp-c-nome" @click="painel = r.name">
                <b>{{ r.catecumeno }}</b>
                <span v-if="r.situacao === NAO" class="gp-motivo">{{ r.motivo_nao_recebe || NAO }}</span>
                <small>{{ r.turma || r.comunidade || '—' }}</small>
              </td>
              <td v-for="c in colunasVisiveis" :key="c.id" :class="'gp-t-' + c.tipo">
                <button v-if="c.tipo === 'chk'" class="gp-check" :class="{ on: r[c.campo] }" :disabled="!p.pode_editar"
                        @click="guardar(r, c.campo, r[c.campo] ? 0 : 1)">✓</button>
                <select v-else-if="c.tipo === 'sel'" class="gp-cel" :value="r[c.campo] || ''" :disabled="!p.pode_editar" @change="guardar(r, c.campo, $event.target.value)">
                  <option value=""></option><option v-for="o in p.opcoes[c.opcoes]" :key="o" :value="o" :selected="r[c.campo] === o">{{ o }}</option></select>
                <input v-else-if="c.tipo === 'num'" class="gp-cel gp-num" type="number" min="0" step="any" :value="r[c.campo] || ''" :disabled="!p.pode_editar"
                       :class="{ pago: c.esperado && r[c.campo] >= c.esperado, parcial: c.esperado && r[c.campo] && r[c.campo] < c.esperado }"
                       @change="guardar(r, c.campo, $event.target.value)" @keydown.enter="$event.target.blur()">
                <input v-else-if="c.tipo === 'data'" class="gp-cel" type="date" :value="r[c.campo] || ''" :disabled="!p.pode_editar" @change="guardar(r, c.campo, $event.target.value)">
                <span v-else-if="c.tipo === 'tel'" class="gp-tel-cel">
                  <input class="gp-cel" :value="r[c.campo] || ''" :disabled="!p.pode_editar" @change="guardar(r, c.campo, $event.target.value)" @keydown.enter="$event.target.blur()">
                  <a v-if="r[c.campo]" class="gp-wa" :href="wa(r[c.campo])" target="_blank" title="WhatsApp">WA</a></span>
                <input v-else class="gp-cel" :value="r[c.campo] || ''" :disabled="!p.pode_editar" @change="guardar(r, c.campo, $event.target.value)" @keydown.enter="$event.target.blur()">
              </td>
              <td class="gp-c-obs" @click="painel = r.name">
                <span v-if="r.enc_obs" class="gp-nota enc" :title="r.enc_obs">💬</span>
                <span v-else-if="r.obs" class="gp-nota" :title="r.obs">📝</span>
                <span v-else class="gp-abrir">›</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!visiveis.length" class="gp-vazio">{{ p.candidatos.length ? 'Nenhum candidato com estes filtros.' : 'A lista está vazia. Use “Lista ▾ → Listar candidatos”.' }}</div>
      </div>

      <!-- Painel lateral do candidato -->
      <div v-if="linhaPainel" class="gp-painel-fundo" @click.self="painel = null">
        <aside class="gp-painel">
          <div class="gp-painel-topo">
            <div>
              <a class="gp-painel-nome" :href="'/app/catecumeno/' + encodeURIComponent(linhaPainel.catecumeno)">{{ linhaPainel.catecumeno }}</a>
              <p class="gp-muted">{{ [linhaPainel.fase, linhaPainel.turma].filter(Boolean).join(' · ') || '—' }}</p>
            </div>
            <button class="gp-fechar" @click="painel = null">✕</button>
          </div>

          <div class="gp-sec">
            <div class="gp-sec-t">Situação</div>
            <div class="gp-seg">
              <button :class="{ on: linhaPainel.situacao !== NAO }" :disabled="!p.pode_editar" @click="situacaoUma(linhaPainel, 'Vai receber')">Vai receber</button>
              <button :class="{ on: linhaPainel.situacao === NAO, nao: true }" :disabled="!p.pode_editar" @click="dialogoSituacao([linhaPainel.name])">Não vai receber</button>
            </div>
            <template v-if="linhaPainel.situacao === NAO">
              <p class="gp-motivo-grande">{{ linhaPainel.motivo_nao_recebe }}</p>
              <label>Detalhe<textarea rows="2" :value="linhaPainel.detalhe_situacao || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'detalhe_situacao', $event.target.value)"></textarea></label>
            </template>
          </div>

          <div v-if="linhaPainel.enc_obs" class="gp-sec gp-sec-enc">
            <div class="gp-sec-t">💬 Observação do encarregado / padrinho</div>
            <p>{{ linhaPainel.enc_obs }}</p>
          </div>

          <div class="gp-sec">
            <div class="gp-sec-t">Documentos e agendamento</div>
            <div class="gp-toggles">
              <button class="gp-toggle" :class="{ on: linhaPainel.ficha }" :disabled="!p.pode_editar" @click="guardar(linhaPainel, 'ficha', linhaPainel.ficha ? 0 : 1)">✓ Ficha do candidato</button>
              <button class="gp-toggle" :class="{ on: linhaPainel.documentos_padrinhos }" :disabled="!p.pode_editar" @click="guardar(linhaPainel, 'documentos_padrinhos', linhaPainel.documentos_padrinhos ? 0 : 1)">✓ Documentos dos padrinhos</button>
            </div>
            <div class="gp-campos">
              <label>Data<input type="date" :value="linhaPainel.date || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'date', $event.target.value)"></label>
              <label>Dia<select :value="linhaPainel.dia || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'dia', $event.target.value)"><option value=""></option><option v-for="d in p.opcoes.dia" :key="d" :selected="linhaPainel.dia === d">{{ d }}</option></select></label>
              <label>Sacerdote<input :value="linhaPainel.sacerdote || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'sacerdote', $event.target.value)"></label>
              <label>Banco<input :value="linhaPainel.banco || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'banco', $event.target.value)"></label>
            </div>
          </div>

          <div class="gp-sec">
            <div class="gp-sec-t">Contactos</div>
            <div class="gp-campos">
              <label>Encarregado<input :value="linhaPainel.encarregado || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'encarregado', $event.target.value)"></label>
              <label>Contacto<input :value="linhaPainel.contacto_encarregado || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'contacto_encarregado', $event.target.value)">
                <span v-if="linhaPainel.contacto_encarregado" class="gp-tel" v-html="tel(linhaPainel.contacto_encarregado)"></span></label>
              <label>Padrinhos<input :value="linhaPainel.padrinhos || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'padrinhos', $event.target.value)"></label>
              <label>Contacto<input :value="linhaPainel.contacto_padrinhos || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'contacto_padrinhos', $event.target.value)">
                <span v-if="linhaPainel.contacto_padrinhos" class="gp-tel" v-html="tel(linhaPainel.contacto_padrinhos)"></span></label>
            </div>
          </div>

          <div class="gp-sec">
            <div class="gp-sec-t">Pagamentos</div>
            <div class="gp-campos">
              <label v-for="c in pagCols" :key="c.campo">{{ c.rotulo }}<small v-if="p.esperado[c.campo]"> ({{ moeda(p.esperado[c.campo]) }})</small>
                <input type="number" min="0" step="any" :value="linhaPainel[c.campo] || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, c.campo, $event.target.value)"></label>
              <label>Tenda<input type="number" min="0" step="any" :value="linhaPainel.valor_tenda || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'valor_tenda', $event.target.value)"></label>
            </div>
          </div>

          <div class="gp-sec">
            <div class="gp-sec-t">Dados pessoais</div>
            <div class="gp-campos">
              <label>Sexo<select :value="linhaPainel.sexo || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'sexo', $event.target.value)"><option value=""></option><option v-for="o in p.opcoes.sexo" :key="o" :selected="linhaPainel.sexo === o">{{ o }}</option></select></label>
              <label>Idade<input type="number" min="0" :value="linhaPainel.idade || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'idade', $event.target.value)"></label>
              <label>Nascimento<input type="date" :value="linhaPainel.data_de_nascimento || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'data_de_nascimento', $event.target.value)"></label>
              <label>Comunidade<select :value="linhaPainel.comunidade || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'comunidade', $event.target.value)"><option value=""></option><option v-for="o in p.opcoes.comunidade" :key="o" :selected="linhaPainel.comunidade === o">{{ o }}</option></select></label>
            </div>
          </div>

          <div class="gp-sec">
            <div class="gp-sec-t">Observações</div>
            <textarea rows="3" :value="linhaPainel.obs || ''" :disabled="!p.pode_editar" @change="guardar(linhaPainel, 'obs', $event.target.value)"></textarea>
          </div>
        </aside>
      </div>
    </template>
  </template>
</div>`,

    setup() {
      const nome = ref(null);
      const p = ref(null);
      const lista = ref([]);
      const carregandoLista = ref(false);
      const busca = ref('');
      const filtro = ref('todos');
      const turma = ref('');
      const ordem = ref('nome');
      const painel = ref(null);
      const menu = ref('');
      const seleccionados = reactive(new Set());
      const aGuardar = ref(0);
      const erroGuardar = ref(false);
      const ultimoGuardado = ref(null);

      // ── Carregar ──────────────────────────────────────────────────────────
      function abrirRota() {
        const rota = frappe.get_route();
        const alvo = rota[1] ? decodeURIComponent(rota.slice(1).join('/')) : null;
        if (alvo === nome.value && (alvo ? p.value : lista.value.length)) return;
        nome.value = alvo;
        p.value = null;
        painel.value = null;
        seleccionados.clear();
        if (alvo) carregar();
        else carregarLista();
      }
      async function carregarLista() {
        carregandoLista.value = true;
        try { lista.value = (await gpApi('listar_preparacoes', {})) || []; } finally { carregandoLista.value = false; }
      }
      async function carregar() {
        p.value = await gpApi('get_preparacao', { nome: nome.value });
        frappe.utils.set_title && frappe.utils.set_title(`${p.value.sacramento} ${p.value.ano_lectivo}`);
      }
      const listaPorAno = computed(() => {
        const g = {};
        lista.value.forEach((x) => { (g[x.ano_lectivo] = g[x.ano_lectivo] || []).push(x); });
        return Object.keys(g).sort().reverse().map((ano) => ({ ano, itens: g[ano] }));
      });

      // ── Guardar ───────────────────────────────────────────────────────────
      function aplicar(res) {
        (res.linhas || []).forEach((nova) => {
          const i = p.value.candidatos.findIndex((x) => x.name === nova.name);
          if (i >= 0) p.value.candidatos[i] = nova;
        });
        ultimoGuardado.value = new Date();
      }
      async function enviar(metodo, args) {
        aGuardar.value++;
        erroGuardar.value = false;
        try {
          const res = await gpApi(metodo, Object.assign({ nome: nome.value }, args));
          aplicar(res || {});
          return res;
        } catch (e) {
          erroGuardar.value = true;
          await carregar();   // volta ao que está gravado
          throw e;
        } finally {
          aGuardar.value--;
        }
      }
      function guardar(r, campo, valor) {
        if ((r[campo] ?? '') === valor) return;
        r[campo] = valor;   // optimista
        return enviar('guardar', { linhas: [r.name], valores: { [campo]: valor } });
      }
      function emMassa(valores) {
        const k = Object.keys(valores)[0];
        if (!seleccionados.size || valores[k] === '-' || valores[k] === undefined) return;
        return enviar('guardar', { linhas: [...seleccionados], valores })
          .then(() => frappe.show_alert({ message: __('Aplicado a {0} candidato(s).', [seleccionados.size]), indicator: 'green' }));
      }
      function massaTexto(campo, rotulo) {
        frappe.prompt({ fieldname: 'v', fieldtype: 'Data', label: rotulo, reqd: 1 }, (v) => emMassa({ [campo]: v.v }), rotulo);
      }
      function massaData() {
        frappe.prompt({ fieldname: 'v', fieldtype: 'Date', label: __('Data do sacramento'), reqd: 1,
          default: p.value.data_do_sacramento }, (v) => emMassa({ date: v.v }), __('Data'));
      }
      function pagoCompleto() {
        const valores = {};
        pagCols.value.forEach((c) => { if (p.value.esperado[c.campo]) valores[c.campo] = p.value.esperado[c.campo]; });
        frappe.confirm(__('Registar os valores esperados como pagos para {0} candidato(s)?', [seleccionados.size]),
          () => emMassa(valores));
      }
      function situacaoUma(r, situacao) {
        if (r.situacao === situacao) return;
        enviar('marcar_situacao', { linhas: [r.name], situacao });
      }
      function dialogoSituacao(linhas) {
        const d = new frappe.ui.Dialog({
          title: __('Não vai receber ({0})', [linhas.length]),
          fields: [
            { fieldname: 'motivo', fieldtype: 'Select', label: __('Motivo'), reqd: 1, options: [''].concat(p.value.opcoes.motivo).join('\n') },
            { fieldname: 'detalhe', fieldtype: 'Small Text', label: __('Detalhe (opcional)') },
            { fieldname: 'repor', fieldtype: 'Check', label: __('Em vez disso, repor como "Vai receber"') },
          ],
          primary_action_label: __('Aplicar'),
          primary_action(v) {
            if (!v.repor && !v.motivo) { frappe.msgprint(__('Indique o motivo.')); return; }
            d.hide();
            enviar('marcar_situacao', v.repor
              ? { linhas, situacao: 'Vai receber' }
              : { linhas, situacao: GP_NAO, motivo: v.motivo, detalhe: v.detalhe || '' });
          },
        });
        d.show();
      }
      function removerSel() {
        const n = seleccionados.size;
        frappe.confirm(__('Remover {0} candidato(s) da lista? Para quem não vai receber, use antes "Situação…".', [n]), async () => {
          await gpApi('remover', { nome: nome.value, linhas: [...seleccionados] });
          seleccionados.clear();
          await carregar();
          frappe.show_alert({ message: __('{0} removido(s).', [n]), indicator: 'green' });
        });
      }

      // ── Acções do cabeçalho ───────────────────────────────────────────────
      async function accao(qual) {
        menu.value = '';
        if (qual === 'listar') {
          const r = await gpApi('listar_candidatos', { nome: nome.value });
          await carregar();
          frappe.msgprint(r.adicionados
            ? __('Adicionados {0} candidato(s); {1} actualizado(s).', [r.adicionados, r.actualizados])
            : __('Nenhum novo candidato. {0} actualizado(s).', [r.actualizados]));
        } else if (qual === 'sincronizar') {
          const r = await gpApi('sincronizar', { nome: nome.value });
          if (!r.removidos.length) { frappe.msgprint(__('Todos os candidatos continuam válidos.')); return; }
          const li = r.removidos.map((x) => `<li><b>${frappe.utils.escape_html(x.catecumeno || '')}</b> — ${frappe.utils.escape_html(x.motivo)}</li>`).join('');
          frappe.confirm(`<p>${__('Serão removidos {0} candidato(s):', [r.removidos.length])}</p><ul>${li}</ul>`, async () => {
            await gpApi('sincronizar', { nome: nome.value, aplicar: 1 });
            await carregar();
          });
        } else if (qual === 'actualizar') {
          frappe.confirm(__('Copiar encarregados, padrinhos, contactos, sexo e idade desta lista para os Catecúmenos?'), async () => {
            const r = await gpApi('actualizar_catecumenos', { nome: nome.value });
            frappe.show_alert({ message: __('{0} catecúmeno(s) actualizado(s).', [r.actualizados]), indicator: 'green' });
            if (r.falhas && r.falhas.length) frappe.msgprint({ title: __('Não actualizados'), indicator: 'orange',
              message: r.falhas.map((f) => `<b>${frappe.utils.escape_html(f.catecumeno)}</b>: ${frappe.utils.escape_html(f.erro)}`).join('<br>') });
          });
        }
      }
      const urlImprimir = (f) => `/printview?doctype=${encodeURIComponent(GP_DT)}&name=${encodeURIComponent(nome.value)}&format=${encodeURIComponent(f)}&no_letterhead=0`;
      const urlPdf = (f) => `/api/method/frappe.utils.print_format.download_pdf?doctype=${encodeURIComponent(GP_DT)}&name=${encodeURIComponent(nome.value)}&format=${encodeURIComponent(f)}`;

      const linkActivo = computed(() => p.value && p.value.link.url && p.value.link.expira_em
        && frappe.datetime.str_to_obj(p.value.link.expira_em) > new Date());
      function copiarLink() { menu.value = ''; frappe.utils.copy_to_clipboard(p.value.link.url); }
      function gerarLink() {
        menu.value = '';
        const boot = frappe.boot.catequese || {};
        const d = new frappe.ui.Dialog({
          title: __('Link para o grupo dos encarregados'),
          fields: [
            { fieldname: 'expira_em', fieldtype: 'Datetime', label: __('Válido até'), reqd: 1,
              default: frappe.datetime.add_days(frappe.datetime.now_datetime(), boot.link_validade_dias || 7) },
            { fieldname: 'permite_editar', fieldtype: 'Check', default: boot.link_permite_editar ?? 1,
              label: __('Encarregados podem corrigir dados e deixar observações') },
          ],
          primary_action_label: __('Gerar'),
          async primary_action(v) {
            d.hide();
            const url = await gpApi('gerar_link', { nome: nome.value, expira_em: v.expira_em, permite_editar: v.permite_editar });
            frappe.utils.copy_to_clipboard(url);
            await carregar();
            frappe.msgprint({ title: __('Link gerado e copiado'), indicator: 'green',
              message: `<p>${__('Cole no grupo de WhatsApp:')}</p><p><a href="${url}" target="_blank">${url}</a></p>` });
          },
        });
        d.show();
      }
      function revogarLink() {
        menu.value = '';
        frappe.confirm(__('O link deixa de funcionar imediatamente. Continuar?'), async () => {
          await gpApi('revogar_link', { nome: nome.value });
          await carregar();
        });
      }
      function submeter() {
        const faltas = progresso.value.filter((k) => k.n < vao.value.length).map((k) => `${k.rotulo}: ${k.n}/${vao.value.length}`);
        frappe.confirm(`<p>${__('Submeter a preparação? <b>{0}</b> recebem o sacramento; {1} não vão receber.', [vao.value.length, naoN.value])}</p>
          ${faltas.length ? `<p class="text-warning">${__('Ainda incompleto')}: ${faltas.join(' · ')}</p>` : ''}
          <p class="text-muted small">${__('Depois de submetida a lista já não pode ser alterada.')}</p>`, async () => {
          const r = await gpApi('submeter', { nome: nome.value });
          await carregar();
          frappe.msgprint(__('Submetida: {0} receberam o sacramento.', [r.recebem]));
        });
      }

      // ── Derivados ─────────────────────────────────────────────────────────
      const NAO = GP_NAO;
      const vao = computed(() => (p.value ? p.value.candidatos.filter((r) => r.situacao !== NAO) : []));
      const naoN = computed(() => (p.value ? p.value.candidatos.length - vao.value.length : 0));
      const pagCols = computed(() => (p.value ? p.value.pagamentos : []));
      const pagEsperados = computed(() => pagCols.value.filter((c) => p.value.esperado[c.campo] > 0));
      const pagoTudo = (r) => pagEsperados.value.length && pagEsperados.value.every((c) => (+r[c.campo] || 0) >= p.value.esperado[c.campo]);
      const progresso = computed(() => {
        const k = [
          { rotulo: 'Ficha', n: vao.value.filter((r) => r.ficha).length },
          { rotulo: 'Docs. padrinhos', n: vao.value.filter((r) => r.documentos_padrinhos).length },
          { rotulo: 'Dia marcado', n: vao.value.filter((r) => r.dia).length },
        ];
        if (pagEsperados.value.length) k.push({ rotulo: 'Pagamento completo', n: vao.value.filter(pagoTudo).length });
        return k;
      });
      const esperadoTotal = computed(() => vao.value.length * pagEsperados.value.reduce((s, c) => s + p.value.esperado[c.campo], 0));
      const recebidoTotal = computed(() => vao.value.reduce((t, r) => t + pagCols.value.reduce((s, c) => s + (+r[c.campo] || 0), 0), 0));

      const FILTROS = [
        { id: 'todos', rotulo: 'Todos' },
        { id: 'ficha', rotulo: 'Sem ficha' },
        { id: 'docs', rotulo: 'Sem docs. padrinhos' },
        { id: 'pagamento', rotulo: 'Pagamento em falta' },
        { id: 'dia', rotulo: 'Sem dia' },
        { id: 'enc', rotulo: '💬 Notas' },
        { id: 'nao', rotulo: 'Não vão receber' },
      ];
      const passaFiltro = (r, f) => ({
        todos: true,
        ficha: r.situacao !== NAO && !r.ficha,
        docs: r.situacao !== NAO && !r.documentos_padrinhos,
        pagamento: r.situacao !== NAO && pagEsperados.value.length && !pagoTudo(r),
        dia: r.situacao !== NAO && !r.dia,
        enc: !!r.enc_obs,
        nao: r.situacao === NAO,
      }[f]);
      const contar = (f) => (p.value ? p.value.candidatos.filter((r) => passaFiltro(r, f)).length : 0);
      const turmas = computed(() => (p.value ? [...new Set(p.value.candidatos.map((r) => r.turma).filter(Boolean))].sort() : []));
      const visiveis = computed(() => {
        if (!p.value) return [];
        const q = busca.value.trim().toLowerCase();
        const lst = p.value.candidatos.filter((r) => passaFiltro(r, filtro.value)
          && (!turma.value || r.turma === turma.value)
          && (!q || [r.catecumeno, r.turma, r.encarregado, r.padrinhos, r.sacerdote].some((v) => (v || '').toLowerCase().includes(q))));
        const chave = { nome: (r) => r.catecumeno || '', turma: (r) => (r.turma || '') + (r.catecumeno || ''), dia: (r) => (r.dia || 'zz') + (r.catecumeno || '') }[ordem.value];
        return lst.slice().sort((a, b) => chave(a).localeCompare(chave(b)));
      });
      const linhaPainel = computed(() => (p.value && painel.value ? p.value.candidatos.find((r) => r.name === painel.value) : null));

      const todosSel = computed(() => visiveis.value.length && visiveis.value.every((r) => seleccionados.has(r.name)));
      function seleccionarTodos(v) { visiveis.value.forEach((r) => (v ? seleccionados.add(r.name) : seleccionados.delete(r.name))); }
      function alternarSel(n) { if (seleccionados.has(n)) seleccionados.delete(n); else seleccionados.add(n); }

      const estadoGuardar = computed(() => (erroGuardar.value ? 'erro' : aGuardar.value ? 'a' : ultimoGuardado.value ? 'ok' : ''));
      const textoGuardar = computed(() => ({ erro: '⚠ não guardado', a: 'A guardar…', ok: '✓ Guardado', '': '' }[estadoGuardar.value]));

      const dia = (d) => (d ? frappe.datetime.str_to_user(String(d).split(' ')[0]) : '—');
      const moeda = (v) => (window.format_currency ? format_currency(v) : (+v || 0).toFixed(2));
      const pct = (k) => (vao.value.length ? Math.round((k / vao.value.length) * 100) : 0);
      const tel = (n) => (window.cq ? window.cq.telefone(n) : frappe.utils.escape_html(n));

      // ── Colunas da tabela (escolha guardada por utilizador) ─────────────
      const PADRAO = ['dia', 'ficha', 'documentos_padrinhos', 'valor_ofertorio', 'valor_cracha', 'valor_accao_gracas', 'valor_fotos', 'sacerdote'];
      const escolhidas = ref(PADRAO.slice());
      const todasColunas = computed(() => {
        const esp = (p.value && p.value.esperado) || {};
        return [
          { id: 'dia', rotulo: 'Dia', tipo: 'sel', opcoes: 'dia', grupo: 'Agendamento' },
          { id: 'date', rotulo: 'Data', tipo: 'data', grupo: 'Agendamento' },
          { id: 'sacerdote', rotulo: 'Sacerdote', tipo: 'txt', grupo: 'Agendamento' },
          { id: 'banco', rotulo: 'Banco', tipo: 'txt', grupo: 'Agendamento' },
          { id: 'ficha', rotulo: 'Ficha', tipo: 'chk', grupo: 'Documentos' },
          { id: 'documentos_padrinhos', rotulo: 'Docs. pad.', tipo: 'chk', grupo: 'Documentos' },
          ...pagCols.value.map((c) => ({ id: c.campo, rotulo: c.rotulo, tipo: 'num', grupo: 'Pagamentos', esperado: esp[c.campo] || 0 })),
          { id: 'valor_tenda', rotulo: 'Tenda', tipo: 'num', grupo: 'Pagamentos' },
          { id: 'encarregado', rotulo: 'Encarregado', tipo: 'txt', grupo: 'Contactos' },
          { id: 'contacto_encarregado', rotulo: 'Contacto enc.', tipo: 'tel', grupo: 'Contactos' },
          { id: 'padrinhos', rotulo: 'Padrinhos', tipo: 'txt', grupo: 'Contactos' },
          { id: 'contacto_padrinhos', rotulo: 'Contacto pad.', tipo: 'tel', grupo: 'Contactos' },
          { id: 'sexo', rotulo: 'Sexo', tipo: 'sel', opcoes: 'sexo', grupo: 'Pessoal' },
          { id: 'idade', rotulo: 'Idade', tipo: 'num', grupo: 'Pessoal' },
          { id: 'data_de_nascimento', rotulo: 'Nascimento', tipo: 'data', grupo: 'Pessoal' },
          { id: 'comunidade', rotulo: 'Comunidade', tipo: 'sel', opcoes: 'comunidade', grupo: 'Pessoal' },
        ].map((c) => Object.assign({ campo: c.id }, c));
      });
      const colunasVisiveis = computed(() => todasColunas.value.filter((c) => escolhidas.value.includes(c.id)));
      const gruposColunas = computed(() => {
        const g = [];
        todasColunas.value.forEach((c) => {
          let x = g.find((y) => y.nome === c.grupo);
          if (!x) g.push((x = { nome: c.grupo, itens: [] }));
          x.itens.push(c);
        });
        return g;
      });
      function gravarColunas() {
        frappe.call({ method: 'frappe.model.utils.user_settings.save',
          args: { doctype: GP_DT, user_settings: JSON.stringify({ gp_colunas: escolhidas.value }) } });
      }
      function alternarColuna(id) {
        escolhidas.value = escolhidas.value.includes(id) ? escolhidas.value.filter((x) => x !== id) : escolhidas.value.concat(id);
        gravarColunas();
      }
      function reporColunas() { escolhidas.value = PADRAO.slice(); gravarColunas(); menu.value = ''; }
      frappe.call({ method: 'frappe.model.utils.user_settings.get', args: { doctype: GP_DT },
        callback: (r) => {
          try {
            const g = JSON.parse(r.message || '{}').gp_colunas;
            if (Array.isArray(g)) escolhidas.value = g;
          } catch (e) { /* preferência inválida: fica o padrão */ }
        } });
      const wa = (n) => {
        const d = String(n || '').split(/[\/,;|]| e /)[0].replace(/\D/g, '');
        return 'https://wa.me/' + (d.length === 9 ? '258' + d : d);
      };

      // fecha menus ao clicar fora
      document.addEventListener('click', (e) => { if (!e.target.closest('.gp-menu')) menu.value = ''; });

      return {
        nome, p, lista, carregandoLista, listaPorAno, busca, filtro, turma, ordem, painel, menu, seleccionados,
        abrirRota, carregar, guardar, emMassa, massaTexto, massaData, pagoCompleto, situacaoUma, dialogoSituacao, removerSel,
        accao, urlImprimir, urlPdf, linkActivo, copiarLink, gerarLink, revogarLink, submeter,
        NAO, vao, naoN, pagCols, progresso, esperadoTotal, recebidoTotal, FILTROS, contar, turmas, visiveis, linhaPainel,
        todosSel, seleccionarTodos, alternarSel, estadoGuardar, textoGuardar, dia, moeda, pct, tel,
        escolhidas, colunasVisiveis, gruposColunas, alternarColuna, reporColunas, wa,
      };
    },
  });
}

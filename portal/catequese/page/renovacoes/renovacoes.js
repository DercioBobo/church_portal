/* global frappe, Vue */
// Renovações — quem renovou, quanto, e o que cada catequista já entregou (Vue 3 CDN, sem build)

frappe.pages['renovacoes'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({ parent: wrapper, title: __('Renovações'), single_column: true });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    wrapper.rvApp = createRenovacoesApp().mount(mount);
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

frappe.pages['renovacoes'].on_page_show = function (wrapper) {
  if (wrapper.rvApp && wrapper.rvApp.carregar) wrapper.rvApp.carregar();
};

function createRenovacoesApp() {
  const { createApp, ref, computed, onMounted } = Vue;
  const API = 'portal.catequese.page.renovacoes.renovacoes.';

  return createApp({
    template: `
<div id="rv-app">
  <div class="rv-head">
    <div>
      <h1>🔁 Renovações</h1>
      <p class="rv-muted">Marcadas pelos catequistas na turma. O ano é o da turma.
        <span v-if="d.valor_padrao">Valor: <b>{{ moeda(d.valor_padrao) }}</b></span>
        <span v-else class="rv-aviso">Defina o valor em Catequese Settings → Turmas.</span></p>
    </div>
    <div class="rv-head-accoes">
      <select class="rv-select" v-model="ano" @change="carregar">
        <option v-for="a in d.anos || []" :key="a" :value="a">{{ a }}</option>
      </select>
      <button class="rv-btn" @click="exportar">⬇ Excel (CSV)</button>
      <button class="rv-btn" @click="carregar" :disabled="loading">↻</button>
    </div>
  </div>

  <div v-if="loading && !d.totais" class="rv-loading"><div class="rv-spinner"></div></div>

  <template v-else-if="d.totais">
    <div class="rv-kpis">
      <div class="rv-kpi" :class="{ completo: t.esperados && t.renovados === t.esperados }">
        <b>{{ t.renovados }}<small>/{{ t.esperados }}</small></b><span>renovaram</span>
        <i><em :style="{ width: pct(t.renovados, t.esperados) + '%' }"></em></i>
        <small>{{ pct(t.renovados, t.esperados) }}%<template v-if="t.isentos"> · {{ t.isentos }} isento(s)</template></small>
      </div>
      <div class="rv-kpi">
        <b>{{ moeda(t.valor) }}</b><span>recebido pelos catequistas</span>
        <i><em :style="{ width: pct(t.valor, t.esperado_valor) + '%' }"></em></i>
        <small v-if="t.esperado_valor">de {{ moeda(t.esperado_valor) }} esperados</small>
      </div>
      <div class="rv-kpi"><b>{{ moeda(t.entregue) }}</b><span>entregue à coordenação</span></div>
      <div class="rv-kpi" :class="{ alerta: t.por_entregar > 0 }"><b>{{ moeda(t.por_entregar) }}</b><span>por entregar</span></div>
    </div>

    <div v-if="semValor.length" class="rv-aviso-box">
      <span>⚠ <b>{{ semValor.length }}</b> renovação(ões) marcada(s) antes de haver valor — sem valor nem data.</span>
      <button class="rv-link" @click="vista = 'ren'; soSemValor = true">ver</button>
      <button class="rv-btn rv-btn-ouro" @click="completar(semValor)">Completar todas…</button>
    </div>

    <div class="rv-tabs">
      <button class="rv-tab" :class="{ active: vista === 'turmas' }" @click="vista = 'turmas'">Por turma <span>{{ d.turmas.length }}</span></button>
      <button class="rv-tab" :class="{ active: vista === 'por' }" @click="vista = 'por'">Ainda não renovaram <span class="aviso">{{ d.por_renovar.length }}</span></button>
      <button class="rv-tab" :class="{ active: vista === 'ren' }" @click="vista = 'ren'">Renovados <span class="ok">{{ d.renovados.length }}</span></button>
    </div>

    <div class="rv-filtros">
      <input class="rv-search" v-model="busca" placeholder="Procurar turma, catequista, catecúmeno, encarregado…">
      <select v-if="vista !== 'turmas'" class="rv-select" v-model="turma"><option value="">Todas as turmas</option>
        <option v-for="x in d.turmas" :key="x.name" :value="x.name">{{ x.name }}</option></select>
      <label v-if="vista === 'ren' && semValor.length" class="rv-check"><input type="checkbox" v-model="soSemValor"> só sem valor</label>
    </div>

    <!-- Por turma -->
    <section v-if="vista === 'turmas'" class="rv-card">
      <div v-if="!turmasVis.length" class="rv-vazio">Nenhuma turma com catecúmenos neste ano.</div>
      <table v-else class="rv-table">
        <thead><tr><th>Turma</th><th>Catequista</th><th>Renovaram</th><th class="num">Recebido</th><th class="num">Entregue</th><th class="num">Por entregar</th><th></th></tr></thead>
        <tbody>
          <tr v-for="x in turmasVis" :key="x.name">
            <td data-l="Turma"><a class="rv-nome" :href="'/app/turma/' + encodeURIComponent(x.name)">{{ x.name }}</a>
              <div class="rv-small rv-muted">{{ x.fase }}<template v-if="x.status !== 'Activo'"> · {{ x.status }}</template></div></td>
            <td data-l="Catequista" class="rv-small">{{ x.catequista || '—' }}<div v-if="x.catequista_adj" class="rv-muted">{{ x.catequista_adj }}</div></td>
            <td data-l="Renovaram">
              <div class="rv-prog"><b>{{ x.renovados }}/{{ x.esperados }}</b><i><em :style="{ width: pct(x.renovados, x.esperados) + '%' }"></em></i></div>
              <div class="rv-small rv-muted"><template v-if="x.isentos">{{ x.isentos }} isento(s) </template><template v-if="x.sem_valor">· <a href="#" @click.prevent="vista = 'ren'; turma = x.name; soSemValor = true">{{ x.sem_valor }} sem valor registado</a></template></div>
            </td>
            <td data-l="Recebido" class="num">{{ moeda(x.valor) }}</td>
            <td data-l="Entregue" class="num">{{ moeda(x.entregue) }}</td>
            <td data-l="Por entregar" class="num"><b :class="{ 'rv-falta': x.por_entregar > 0 }">{{ moeda(x.por_entregar) }}</b></td>
            <td class="rv-acc">
              <button v-if="x.por_entregar > 0" class="rv-btn rv-btn-ouro" @click="entregar(x)">✓ Recebido</button>
              <span v-else-if="x.valor" class="rv-chip ok">entregue</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Ainda não renovaram -->
    <section v-else-if="vista === 'por'" class="rv-card">
      <div v-if="!porVis.length" class="rv-vazio">Todos renovaram{{ busca || turma ? ' (com este filtro)' : '' }}. 🎉</div>
      <table v-else class="rv-table">
        <thead><tr><th>Catecúmeno</th><th>Turma</th><th>Catequista</th><th>Encarregado</th></tr></thead>
        <tbody>
          <tr v-for="r in porVis" :key="r.linha">
            <td data-l="Catecúmeno"><a class="rv-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a>
              <span v-if="r.renovacao === 'Não'" class="rv-chip erro">Não</span></td>
            <td data-l="Turma" class="rv-small">{{ r.turma }}</td>
            <td data-l="Catequista" class="rv-small">{{ r.catequista || '—' }}</td>
            <td data-l="Encarregado"><div class="rv-small">{{ r.encarregado || '—' }}</div><span v-if="r.contacto" v-html="tel(r.contacto)"></span></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Renovados -->
    <section v-else class="rv-card">
      <div v-if="!renVis.length" class="rv-vazio">Ainda ninguém renovou{{ busca || turma ? ' (com este filtro)' : '' }}.</div>
      <table v-else class="rv-table">
        <thead><tr><th>Catecúmeno</th><th>Turma</th><th></th><th class="num">Valor</th><th>Data</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in renVis" :key="r.linha" :class="{ 'rv-sem-valor': r.sem_valor }">
            <td data-l="Catecúmeno"><a class="rv-nome" :href="'/app/catecumeno/' + encodeURIComponent(r.catecumeno)">{{ r.catecumeno }}</a></td>
            <td data-l="Turma" class="rv-small">{{ r.turma }}</td>
            <td><span class="rv-chip" :class="r.renovacao === 'Isento' ? 'ouro' : 'ok'">{{ r.renovacao }}</span></td>
            <td data-l="Valor" class="num">{{ r.renovacao === 'Isento' ? '—' : (r.valor_renovacao ? moeda(r.valor_renovacao) : 'sem valor') }}</td>
            <td data-l="Data" class="rv-small">
              {{ dia(r.data_renovacao) }}
              <div v-if="r.sem_valor" class="rv-pista" title="Última alteração desta linha (pista de quando foi marcado)">
                última alteração: {{ dia(r.alterado_em) }}<template v-if="r.alterado_por_nome"> · {{ r.alterado_por_nome }}</template></div>
            </td>
            <td class="rv-acc"><button v-if="r.sem_valor" class="rv-btn" @click="completar([r])">Completar…</button></td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</div>`,

    setup() {
      const d = ref({});
      const ano = ref(null);
      const loading = ref(false);
      const vista = ref('turmas');
      const busca = ref('');
      const turma = ref('');
      const soSemValor = ref(false);

      function carregar() {
        loading.value = true;
        frappe.call({
          method: API + 'get_dados', args: { ano: ano.value },
          callback: (r) => { d.value = r.message || {}; ano.value = d.value.ano; },
          always: () => { loading.value = false; },
        });
      }
      onMounted(carregar);

      const t = computed(() => d.value.totais || {});
      const q = () => busca.value.trim().toLowerCase();
      const tem = (vals) => !q() || vals.some((v) => (v || '').toLowerCase().includes(q()));
      const turmasVis = computed(() => (d.value.turmas || []).filter((x) => tem([x.name, x.fase, x.catequista, x.catequista_adj])));
      const filtroLinha = (r) => (!turma.value || r.turma === turma.value) && tem([r.catecumeno, r.turma, r.catequista, r.encarregado]);
      const porVis = computed(() => (d.value.por_renovar || []).filter(filtroLinha));
      const renVis = computed(() => (d.value.renovados || []).filter((r) => filtroLinha(r) && (!soSemValor.value || r.sem_valor)));
      const semValor = computed(() => (d.value.renovados || []).filter((r) => r.sem_valor));

      function completar(linhas) {
        const dlg = new frappe.ui.Dialog({
          title: linhas.length === 1 ? __('Completar: {0}', [linhas[0].catecumeno]) : __('Completar {0} renovação(ões)', [linhas.length]),
          fields: [
            { fieldname: 'valor', fieldtype: 'Currency', label: __('Valor'), reqd: 1, default: d.value.valor_padrao },
            { fieldname: 'usar_data_alteracao', fieldtype: 'Check', default: 1,
              label: __('Usar a data da última alteração de cada linha (quando o catequista mexeu)') },
            { fieldname: 'data', fieldtype: 'Date', label: __('Data'), depends_on: 'eval:!doc.usar_data_alteracao',
              mandatory_depends_on: 'eval:!doc.usar_data_alteracao', default: frappe.datetime.get_today() },
            { fieldname: 'info', fieldtype: 'HTML', options: `<p class="text-muted small">${__('A última alteração é só uma pista: se a linha foi mexida depois (ex.: faltas), a data é dessa altura.')}</p>` },
          ],
          primary_action_label: __('Completar'),
          primary_action(v) {
            dlg.hide();
            frappe.call({
              method: API + 'completar',
              args: { linhas: linhas.map((r) => r.linha), valor: v.valor,
                      usar_data_alteracao: v.usar_data_alteracao ? 1 : 0, data: v.usar_data_alteracao ? null : v.data },
              freeze: true,
              callback: (r) => {
                frappe.show_alert({ message: __('{0} completada(s).', [r.message.completadas]), indicator: 'green' });
                soSemValor.value = false;
                carregar();
              },
            });
          },
        });
        dlg.show();
      }

      function entregar(x) {
        const dlg = new frappe.ui.Dialog({
          title: __('Recebido do catequista — {0}', [x.name]),
          fields: [
            { fieldname: 'valor', fieldtype: 'Currency', label: __('Valor entregue'), reqd: 1, default: x.por_entregar },
            { fieldname: 'data', fieldtype: 'Date', label: __('Data'), reqd: 1, default: frappe.datetime.get_today() },
            { fieldname: 'notas', fieldtype: 'Small Text', label: __('Notas') },
            { fieldname: 'info', fieldtype: 'HTML',
              options: `<p class="text-muted small">${__('Fica registado como Receita (fonte Renovação) do ano {0}, em Despesas e Receitas.', [d.value.ano])}</p>` },
          ],
          primary_action_label: __('Registar'),
          primary_action(v) {
            dlg.hide();
            frappe.call({
              method: API + 'registar_entrega', args: { turma: x.name, valor: v.valor, data: v.data, notas: v.notas || null },
              freeze: true,
              callback: (r) => {
                frappe.show_alert({ message: __('Registado: {0}', [moeda(r.message.valor)]), indicator: 'green' });
                carregar();
              },
            });
          },
        });
        dlg.show();
      }

      function exportar() {
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        let linhas;
        if (vista.value === 'turmas') {
          linhas = [['Turma', 'Fase', 'Catequista', 'Esperados', 'Renovados', 'Isentos', 'Recebido', 'Entregue', 'Por entregar']]
            .concat(turmasVis.value.map((x) => [x.name, x.fase, x.catequista, x.esperados, x.renovados, x.isentos, x.valor, x.entregue, x.por_entregar]));
        } else {
          const lst = vista.value === 'por' ? porVis.value : renVis.value;
          linhas = [['Catecúmeno', 'Turma', 'Catequista', 'Renovação', 'Valor', 'Data', 'Encarregado', 'Contacto']]
            .concat(lst.map((r) => [r.catecumeno, r.turma, r.catequista, r.renovacao, r.valor_renovacao, r.data_renovacao, r.encarregado, r.contacto]));
        }
        const csv = '\ufeff' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `renovacoes-${d.value.ano}-${vista.value}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }

      const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
      const moeda = (v) => (window.format_currency ? format_currency(v || 0) : (+v || 0).toFixed(2));
      const dia = (x) => (x ? frappe.datetime.str_to_user(String(x).split(' ')[0]) : '—');
      const tel = (n) => (window.cq ? window.cq.telefone(n) : frappe.utils.escape_html(n));

      return { d, ano, loading, vista, busca, turma, soSemValor, semValor, completar, carregar, t, turmasVis, porVis, renVis, entregar, exportar, pct, moeda, dia, tel };
    },
  });
}

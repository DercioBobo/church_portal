/* global frappe, Vue */
// Receber Fichas — escreve o nome, Enter, ficha marcada; a caixa limpa para o próximo (Vue 3 CDN, sem build)

frappe.pages['receber-fichas'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({ parent: wrapper, title: __('Receber Fichas'), single_column: true });

  function _mountApp() {
    const mount = document.createElement('div');
    wrapper.querySelector('.page-content').appendChild(mount);
    wrapper.rfApp = createReceberFichasApp().mount(mount);
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

frappe.pages['receber-fichas'].on_page_show = function (wrapper) {
  if (wrapper.rfApp && wrapper.rfApp.carregar) wrapper.rfApp.carregar();
};

function createReceberFichasApp() {
  const { createApp, ref, computed, onMounted, nextTick } = Vue;
  const API = 'portal.catequese.page.receber_fichas.receber_fichas.';
  // Sem acentos nem maiúsculas: "joao" encontra "João"
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  return createApp({
    template: `
<div id="rf-app">
  <div class="rf-head">
    <div>
      <h1>📋 Receber Fichas</h1>
      <p class="rf-muted">Escreva o nome, <b>Enter</b> marca a ficha e a caixa limpa para o próximo. ↑ ↓ para escolher.
        Nome ou data diferentes na ficha? <b>✎ Corrigir</b>.</p>
    </div>
    <div class="rf-kpi"><b>{{ comFicha }}<small>/{{ lista.length }}</small></b><span>com ficha</span>
      <i><em :style="{ width: (lista.length ? Math.round(comFicha * 100 / lista.length) : 0) + '%' }"></em></i></div>
  </div>

  <div class="rf-busca">
    <input ref="caixa" class="rf-input" v-model="busca" @input="sel = 0" @keydown="tecla"
           placeholder="Nome do catecúmeno ou do encarregado…" autocomplete="off" spellcheck="false">
    <select class="rf-select" v-model="turma" @change="foco">
      <option value="">Todas as turmas</option>
      <option v-for="t in turmas" :key="t" :value="t">{{ t }}</option>
    </select>
    <label class="rf-check"><input type="checkbox" v-model="soSem" @change="foco"> só sem ficha</label>
  </div>

  <div v-if="ultimo" class="rf-feito" :class="{ desfeito: !ultimo.ficha }">
    <span v-if="ultimo.ficha">✓ <b>{{ ultimo.nome }}</b> — ficha marcada</span>
    <span v-else>↩ <b>{{ ultimo.nome }}</b> — ficha desmarcada</span>
    <button class="rf-link" @click="marcar(ultimo.nome, ultimo.ficha ? 0 : 1)">{{ ultimo.ficha ? 'Desfazer' : 'Refazer' }}</button>
  </div>
  <div v-if="ultimo && ultimo.ficha && porNome[ultimo.nome] && !porNome[ultimo.nome].data_de_nascimento" class="rf-falta-nasc">
    <span>⚠ <b>{{ ultimo.nome }}</b> não tem data de nascimento registada. Está na ficha?</span>
    <button class="rf-btn rf-btn-ouro" @click="corrigir(porNome[ultimo.nome])">Adicionar data</button>
  </div>

  <div v-if="loading && !lista.length" class="rf-loading"><div class="rf-spinner"></div></div>

  <section v-else-if="busca.trim() || turma" class="rf-card">
    <div v-if="!resultados.length" class="rf-vazio">
      <template v-if="busca.trim()">Ninguém encontrado com “{{ busca }}”<template v-if="soSem"> sem ficha</template>.</template>
      <template v-else>Todos desta turma já têm ficha. 🎉</template>
    </div>
    <div v-for="(c, i) in resultados" :key="c.name" class="rf-linha" :class="{ activa: i === sel, ok: c.ficha }"
         @mouseenter="sel = i" @click="marcar(c.name, c.ficha ? 0 : 1)">
      <div class="rf-info">
        <div class="rf-nome">{{ c.name }}</div>
        <div class="rf-muted rf-small">{{ c.turma || 'sem turma' }}<template v-if="c.data_de_nascimento"> · nasc. <b class="rf-nasc">{{ dataUser(c.data_de_nascimento) }}</b></template><template v-if="c.encarregado"> · {{ c.encarregado }}</template></div>
        <div v-if="c.catequistas" class="rf-muted rf-small">🙋 {{ c.catequistas }}</div>
      </div>
      <button v-if="!c.data_de_nascimento" class="rf-chip aviso" title="Adicionar a data de nascimento da ficha" @click.stop="corrigir(c)">⚠ sem data de nascimento</button>
      <span v-if="c.ficha" class="rf-chip ok">✓ tem ficha</span>
      <button class="rf-btn" title="Corrigir nome ou data de nascimento" @click.stop="corrigir(c)">✎ Corrigir</button>
      <button class="rf-btn" :class="c.ficha ? '' : 'rf-btn-ouro'" :disabled="aGravar === c.name">
        {{ c.ficha ? 'Desmarcar' : '✓ Marcar ficha' }}
      </button>
    </div>
    <div v-if="mais" class="rf-vazio rf-small">+{{ mais }} — escreva mais do nome para afinar.</div>
  </section>

  <section v-if="sessao.length" class="rf-card rf-sessao">
    <h3>Marcadas agora <span>{{ sessao.length }}</span></h3>
    <div v-for="s in sessao" :key="s" class="rf-linha-s">
      <a :href="'/app/catecumeno/' + encodeURIComponent(s)">{{ s }}</a>
      <span class="rf-muted rf-small">{{ (porNome[s] || {}).turma }}<template v-if="(porNome[s] || {}).catequistas"> · {{ porNome[s].catequistas }}</template></span>
      <button v-if="porNome[s] && !porNome[s].data_de_nascimento" class="rf-chip aviso" @click="corrigir(porNome[s])">⚠ sem data de nascimento</button>
      <button class="rf-link" @click="marcar(s, 0)">desfazer</button>
    </div>
  </section>
</div>`,

    setup() {
      const lista = ref([]);
      const loading = ref(false);
      const busca = ref('');
      const turma = ref('');
      const soSem = ref(true);
      const sel = ref(0);
      const aGravar = ref(null);
      const ultimo = ref(null);
      const sessao = ref([]);
      const caixa = ref(null);
      const LIMITE = 12;

      const dataUser = (d) => (d ? frappe.datetime.str_to_user(d) : '');
      const foco = () => nextTick(() => caixa.value && caixa.value.focus());
      const porNome = computed(() => Object.fromEntries(lista.value.map((c) => [c.name, c])));
      const turmas = computed(() => [...new Set(lista.value.map((c) => c.turma).filter(Boolean))].sort());
      const comFicha = computed(() => lista.value.filter((c) => c.ficha).length);

      const filtrados = computed(() => {
        const palavras = norm(busca.value).split(/\s+/).filter(Boolean);
        return lista.value.filter((c) => {
          if (turma.value && c.turma !== turma.value) return false;
          // Os marcados agora continuam visíveis (para poder desfazer) mesmo com "só sem ficha"
          if (soSem.value && c.ficha && !sessao.value.includes(c.name)) return false;
          if (!palavras.length) return true;
          const alvo = c._busca || (c._busca = norm(c.name + ' ' + (c.encarregado || '')));
          return palavras.every((p) => alvo.includes(p));
        });
      });
      // Com turma escolhida e sem busca mostra a turma toda; numa busca, só os primeiros
      const resultados = computed(() => (busca.value.trim() ? filtrados.value.slice(0, LIMITE) : filtrados.value));
      const mais = computed(() => filtrados.value.length - resultados.value.length);

      function carregar() {
        loading.value = true;
        frappe.call({ method: API + 'get_dados' })
          .then((r) => { lista.value = r.message.catecumenos; })
          .always(() => { loading.value = false; foco(); });
      }

      function marcar(nome, ficha) {
        aGravar.value = nome;
        frappe.call({ method: API + 'marcar', args: { nome, ficha } })
          .then(() => {
            const c = porNome.value[nome];
            if (c) c.ficha = ficha;
            ultimo.value = { nome, ficha };
            sessao.value = ficha ? [nome, ...sessao.value.filter((s) => s !== nome)] : sessao.value.filter((s) => s !== nome);
            if (ficha) { busca.value = ''; sel.value = 0; }
          })
          .always(() => { aGravar.value = null; foco(); });
      }

      // Nome / data de nascimento diferentes na ficha: corrige no Catecúmeno (e marca a ficha no mesmo passo)
      function corrigir(c) {
        const idadeDe = (d) => {
          if (!d) return '';
          const n = frappe.datetime.str_to_obj(d), h = new Date();
          return h.getFullYear() - n.getFullYear() - ((h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) ? 1 : 0);
        };
        const dlg = new frappe.ui.Dialog({
          title: __('Corrigir: {0}', [c.name]),
          fields: [
            { fieldname: 'novo_nome', fieldtype: 'Data', label: __('Nome completo (como na ficha)'), default: c.name, reqd: 1 },
            { fieldname: 'data_de_nascimento', fieldtype: 'Date', label: __('Data de nascimento'), default: c.data_de_nascimento,
              onchange() { const i = idadeDe(dlg.get_value('data_de_nascimento')); dlg.set_df_property('idade', 'options', `<p class="text-muted small">${i === '' ? '' : __('Idade: <b>{0} anos</b>', [i])}</p>`); } },
            { fieldname: 'idade', fieldtype: 'HTML', options: c.data_de_nascimento ? `<p class="text-muted small">${__('Idade: <b>{0} anos</b>', [idadeDe(c.data_de_nascimento)])}</p>` : '' },
            { fieldname: 'ficha', fieldtype: 'Check', label: __('Marcar também a ficha como entregue'), default: c.ficha ? 0 : 1, hidden: c.ficha ? 1 : 0 },
            { fieldname: 'info', fieldtype: 'HTML', options: `<p class="text-muted small">${__('Mudar o nome actualiza a turma, as preparações e as ligações nos livros.')}</p>` },
          ],
          primary_action_label: __('Guardar'),
          primary_action(v) {
            const novo = (v.novo_nome || '').replace(/\s+/g, ' ').trim();
            const args = { nome: c.name };
            if (novo && novo !== c.name) args.novo_nome = novo;
            if (v.data_de_nascimento && v.data_de_nascimento !== c.data_de_nascimento) args.data_de_nascimento = v.data_de_nascimento;
            if (!c.ficha && v.ficha) args.ficha = 1;
            if (Object.keys(args).length === 1) { dlg.hide(); return; }
            dlg.disable_primary_action();
            frappe.call({ method: API + 'corrigir', args, freeze: !!args.novo_nome, freeze_message: __('A mudar o nome…') })
              .then((r) => {
                const m = r.message, antigo = c.name;
                Object.assign(c, { name: m.name, idade: m.idade, data_de_nascimento: m.data_de_nascimento, ficha: m.ficha, _busca: null });
                sessao.value = sessao.value.map((s) => (s === antigo ? m.name : s));
                if (args.ficha) {
                  sessao.value = [m.name, ...sessao.value.filter((s) => s !== m.name)];
                  ultimo.value = { nome: m.name, ficha: 1 };
                  busca.value = ''; sel.value = 0;
                }
                frappe.show_alert({ message: __('Corrigido: {0}', [m.name]), indicator: 'green' });
                dlg.hide();
              })
              .always(() => { dlg.enable_primary_action(); });
          },
        });
        dlg.onhide = foco;
        dlg.show();
      }

      function tecla(e) {
        const n = resultados.value.length;
        if (e.key === 'ArrowDown') { e.preventDefault(); sel.value = n ? (sel.value + 1) % n : 0; }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel.value = n ? (sel.value - 1 + n) % n : 0; }
        else if (e.key === 'Escape') { busca.value = ''; sel.value = 0; }
        else if (e.key === 'Enter') {
          e.preventDefault();
          const c = resultados.value[sel.value];
          if (!c || aGravar.value) return;
          if (c.ficha) frappe.show_alert({ message: __('{0} já tem ficha.', [c.name]), indicator: 'blue' });
          else marcar(c.name, 1);
        }
      }

      onMounted(carregar);
      return { lista, loading, busca, turma, soSem, sel, aGravar, ultimo, sessao, caixa, porNome, turmas, comFicha,
        resultados, mais, carregar, marcar, corrigir, tecla, foco, dataUser };
    },
  });
}

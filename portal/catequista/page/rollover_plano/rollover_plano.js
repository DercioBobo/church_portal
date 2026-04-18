/* global frappe, Vue */
// Rollover do Plano Anual — Vue 3 CDN, no build step

frappe.pages['rollover-plano'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: 'Rollover do Plano Anual',
    single_column: true,
  });

  const mount = document.createElement('div');
  wrapper.querySelector('.page-content').appendChild(mount);
  createRolloverApp().mount(mount);
};

function createRolloverApp() {
  const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES_PT    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return Vue.createApp({
    template: `
<div class="rp-page">

  <!-- Header -->
  <div class="rp-header">
    <div class="rp-header-icon">&#8635;</div>
    <div>
      <h1 class="rp-title">Rollover do Plano Anual</h1>
      <p class="rp-subtitle">Duplica actividades de um ano lectivo para outro, ajustando datas automaticamente.</p>
    </div>
  </div>

  <!-- ── STEP: form ─────────────────────────────────────────────── -->
  <div v-if="step === 'form'" class="rp-card">
    <div class="rp-form-row">
      <div class="rp-field">
        <label class="rp-label">Copiar de</label>
        <select v-model="anoOrigem" class="rp-select">
          <option value="">— seleccionar —</option>
          <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
      <div class="rp-arrow">→</div>
      <div class="rp-field">
        <label class="rp-label">Para</label>
        <select v-model="anoDestino" class="rp-select">
          <option value="">— seleccionar —</option>
          <option v-for="a in anos" :key="a" :value="a" :disabled="a === anoOrigem">{{ a }}</option>
        </select>
      </div>
    </div>

    <div class="rp-options">
      <label class="rp-checkbox-label">
        <input type="checkbox" v-model="manterOrador" />
        <span>Manter orador / responsável</span>
      </label>
      <label class="rp-checkbox-label">
        <input type="checkbox" v-model="ajustarDatas" />
        <span>
          Ajustar datas (+1 ano, mesmo dia/mês)
          <span class="rp-hint">Actividades ao Sáb/Dom mantêm o mesmo dia da semana no ano seguinte</span>
        </span>
      </label>
    </div>

    <div v-if="formError" class="rp-alert rp-alert-error">{{ formError }}</div>

    <button class="rp-btn rp-btn-primary" :disabled="!canPreview || loading" @click="doPreview">
      <span v-if="loading" class="rp-spinner"></span>
      <span v-else>Pré-visualizar</span>
    </button>
  </div>

  <!-- ── STEP: preview ──────────────────────────────────────────── -->
  <div v-if="step === 'preview'">

    <div class="rp-summary">
      <div class="rp-summary-stat rp-stat-create">
        <span class="rp-stat-num">{{ preview.to_create.length }}</span>
        <span class="rp-stat-label">a criar</span>
      </div>
      <div class="rp-summary-stat rp-stat-skip">
        <span class="rp-stat-num">{{ preview.to_skip.length }}</span>
        <span class="rp-stat-label">a ignorar</span>
      </div>
      <div class="rp-summary-meta">
        <strong>{{ preview.ano_origem }}</strong>
        <span class="rp-arrow-sm">→</span>
        <strong>{{ preview.ano_destino }}</strong>
      </div>
    </div>

    <!-- To create -->
    <div class="rp-card rp-card-create">
      <div class="rp-section-header">
        <span class="rp-badge rp-badge-create">{{ preview.to_create.length }}</span>
        Actividades a criar
      </div>
      <div v-if="preview.to_create.length === 0" class="rp-empty">Nenhuma actividade nova para criar.</div>
      <table v-else class="rp-table">
        <thead>
          <tr>
            <th>Actividade</th>
            <th>Tipologia</th>
            <th>Data origem</th>
            <th>Data destino</th>
            <th v-if="manterOrador">Orador</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in preview.to_create" :key="row.actividade">
            <td>{{ row.actividade }}</td>
            <td><span class="rp-tip" v-if="row.tipologia">{{ row.tipologia }}</span></td>
            <td class="rp-date">{{ fmtDate(row.data_origem) }}</td>
            <td class="rp-date rp-date-new">
              {{ fmtDate(row.data_destino) }}
              <span v-if="row.data_destino" class="rp-weekday">{{ weekday(row.data_destino) }}</span>
            </td>
            <td v-if="manterOrador" class="rp-orador">{{ row.orador || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- To skip -->
    <div v-if="preview.to_skip.length > 0" class="rp-card rp-card-skip">
      <div class="rp-section-header">
        <span class="rp-badge rp-badge-skip">{{ preview.to_skip.length }}</span>
        Já existem em <strong>&nbsp;{{ preview.ano_destino }}</strong> — serão ignoradas
      </div>
      <table class="rp-table rp-table-muted">
        <thead>
          <tr>
            <th>Actividade</th>
            <th>Tipologia</th>
            <th>Data origem</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in preview.to_skip" :key="row.actividade">
            <td>{{ row.actividade }}</td>
            <td><span class="rp-tip" v-if="row.tipologia">{{ row.tipologia }}</span></td>
            <td class="rp-date">{{ fmtDate(row.data_origem) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="execError" class="rp-alert rp-alert-error">{{ execError }}</div>

    <div class="rp-actions">
      <button class="rp-btn rp-btn-ghost" @click="step = 'form'">← Voltar</button>
      <button
        class="rp-btn rp-btn-primary"
        :disabled="preview.to_create.length === 0 || loading"
        @click="doExecutar"
      >
        <span v-if="loading" class="rp-spinner"></span>
        <span v-else>Confirmar e criar ({{ preview.to_create.length }})</span>
      </button>
    </div>
  </div>

  <!-- ── STEP: done ─────────────────────────────────────────────── -->
  <div v-if="step === 'done'" class="rp-card rp-card-done">
    <div class="rp-done-icon">✓</div>
    <h2 class="rp-done-title">
      {{ result.created }} actividade{{ result.created !== 1 ? 's' : '' }}
      criada{{ result.created !== 1 ? 's' : '' }} com sucesso!
    </h2>
    <p v-if="result.skipped > 0" class="rp-done-sub">
      {{ result.skipped }} ignorada{{ result.skipped !== 1 ? 's' : '' }} (já existiam em {{ result.ano_destino }}).
    </p>
    <div class="rp-done-actions">
      <button class="rp-btn rp-btn-primary" @click="openPlano">
        Abrir em Plano Anual →
      </button>
      <button class="rp-btn rp-btn-ghost" @click="reset">Fazer outro rollover</button>
    </div>
  </div>

</div>
    `,

    data() {
      return {
        step:         'form',
        anos:         [],
        anoOrigem:    '',
        anoDestino:   '',
        manterOrador: true,
        ajustarDatas: true,
        loading:      false,
        formError:    '',
        execError:    '',
        preview:      null,
        result:       null,
      };
    },

    computed: {
      canPreview() {
        return this.anoOrigem && this.anoDestino && this.anoOrigem !== this.anoDestino;
      },
    },

    methods: {
      fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) return iso;
        return `${String(d.getDate()).padStart(2,'0')} ${MESES_PT[d.getMonth()]} ${d.getFullYear()}`;
      },

      weekday(iso) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) return '';
        return WEEKDAYS_PT[d.getDay()];
      },

      doPreview() {
        this.formError = '';
        if (!this.canPreview) return;
        this.loading = true;
        frappe.call({
          method: 'portal.catequista.page.plano_anual.plano_anual.preview_rollover',
          args: {
            ano_origem:    this.anoOrigem,
            ano_destino:   this.anoDestino,
            manter_orador: this.manterOrador ? '1' : '0',
            ajustar_datas: this.ajustarDatas ? '1' : '0',
          },
          callback: (r) => {
            this.loading = false;
            if (r.message) {
              this.preview = r.message;
              this.step    = 'preview';
            }
          },
          error: (err) => {
            this.loading   = false;
            this.formError = (err._server_messages
              ? JSON.parse(err._server_messages).map(m => {
                  try { return JSON.parse(m).message; } catch { return m; }
                }).join(' ')
              : null) || err.message || 'Erro ao pré-visualizar.';
          },
        });
      },

      doExecutar() {
        this.execError = '';
        this.loading   = true;
        frappe.call({
          method: 'portal.catequista.page.plano_anual.plano_anual.executar_rollover',
          args: {
            ano_origem:    this.anoOrigem,
            ano_destino:   this.anoDestino,
            manter_orador: this.manterOrador ? '1' : '0',
            ajustar_datas: this.ajustarDatas ? '1' : '0',
          },
          callback: (r) => {
            this.loading = false;
            if (r.message) {
              this.result = r.message;
              this.step   = 'done';
            }
          },
          error: (err) => {
            this.loading   = false;
            this.execError = err.message || 'Erro ao executar rollover.';
          },
        });
      },

      openPlano() {
        frappe.set_route('plano-anual');
      },

      reset() {
        this.step         = 'form';
        this.anoOrigem    = '';
        this.anoDestino   = '';
        this.manterOrador = true;
        this.ajustarDatas = true;
        this.loading      = false;
        this.formError    = '';
        this.execError    = '';
        this.preview      = null;
        this.result       = null;
      },

      _loadAnos() {
        frappe.call({
          method: 'portal.catequista.page.plano_anual.plano_anual.get_anos_lectivos',
          callback: (r) => {
            if (r.message) {
              // get_anos_lectivos returns DESC; reverse so oldest is at top
              this.anos = [...r.message].reverse();
            }
          },
        });
      },
    },

    mounted() {
      this._loadAnos();
    },
  });
}

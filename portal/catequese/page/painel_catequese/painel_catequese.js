/* global frappe */
// Painel da Catequese — página inicial com todas as páginas da app.
// A lista vem do servidor (todas as Pages da app a que o utilizador tem acesso),
// por isso páginas novas aparecem sozinhas.

frappe.pages['painel-catequese'].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Painel da Catequese'),
    single_column: true,
  });

  const $root = $('<div id="pc-app"><div class="pc-loading"><div class="pc-spinner"></div></div></div>')
    .appendTo($(wrapper).find('.page-content'));

  const esc = (s) => frappe.utils.escape_html(s == null ? '' : String(s));

  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? __('Bom dia') : h < 19 ? __('Boa tarde') : __('Boa noite');
  }

  function render(d) {
    const resumo = (d.resumo || []).map((r) => `
      <a class="pc-stat" href="${esc(r.rota)}">
        <span class="pc-stat-n">${esc(r.valor)}</span>
        <span class="pc-stat-l">${esc(r.rotulo)}</span>
      </a>`).join('');

    const grupos = (d.grupos || []).map((g) => `
      <section class="pc-group">
        <h2>${esc(g.nome)}</h2>
        <div class="pc-grid">
          ${g.paginas.map((p) => `
            <a class="pc-card" href="/app/${esc(p.name)}">
              <span class="pc-icon">${esc(p.icone)}</span>
              <span class="pc-card-body">
                <b>${esc(p.titulo)}</b>
                ${p.descricao ? `<small>${esc(p.descricao)}</small>` : ''}
              </span>
              <span class="pc-arrow">→</span>
            </a>`).join('')}
        </div>
      </section>`).join('');

    const registos = (d.registos || []).map((r) => `
      <a class="pc-pill" href="${esc(r.rota)}"><span>${esc(r.icone)}</span>${esc(r.rotulo)}</a>`).join('');

    $root.html(`
      <header class="pc-hero">
        <div>
          <p class="pc-hello">${esc(saudacao())}${d.utilizador ? ', ' + esc(d.utilizador) : ''} 👋</p>
          <h1>${__('Catequese')}</h1>
          <p class="pc-sub">${esc(d.paroquia || '')}</p>
        </div>
        ${d.ano ? `<a class="pc-year" href="/app/abrir-encerrar-ano" title="${__('Abrir e Encerrar Ano')}">
          <small>${__('Ano lectivo')}</small><b>${esc(d.ano)}</b></a>` : ''}
      </header>

      ${resumo ? `<div class="pc-stats">${resumo}</div>` : ''}

      ${grupos || `<p class="pc-empty">${__('Não tem acesso a nenhuma página da catequese.')}</p>`}

      ${registos ? `
        <section class="pc-group">
          <h2>${__('Registos')}</h2>
          <div class="pc-pills">${registos}</div>
        </section>` : ''}
    `);
  }

  function carregar() {
    frappe.call({
      method: 'portal.catequese.page.painel_catequese.painel_catequese.get_painel',
      callback: (r) => render(r.message || {}),
      error: () => $root.html(`<p class="pc-empty">${__('Não foi possível carregar o painel.')}</p>`),
    });
  }

  wrapper.painel_carregar = carregar;
  carregar();
};

// Ao voltar ao painel, actualiza os números
frappe.pages['painel-catequese'].on_page_show = function (wrapper) {
  if (wrapper.painel_carregar && wrapper.painel_visto) wrapper.painel_carregar();
  wrapper.painel_visto = true;
};

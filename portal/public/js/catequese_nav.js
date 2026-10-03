/* global frappe, $ */
// Link "← Painel da Catequese" em todas as páginas da app portal.
// A lista de páginas vem do boot (frappe.boot.catequese.paginas), por isso
// qualquer página nova da app recebe o link sem mais código.

(function () {
  const PAINEL = 'painel-catequese';

  function adicionarLink() {
    const route = frappe.get_route && frappe.get_route();
    if (!route || !route.length) return;
    const nome = route[0];
    const paginas = (frappe.boot.catequese && frappe.boot.catequese.paginas) || [];
    if (nome === PAINEL || !paginas.includes(nome)) return;

    const wrapper = frappe.pages && frappe.pages[nome];
    const page = wrapper && wrapper.page;
    if (!page) return false;  // página ainda a carregar
    if (wrapper.dataset && wrapper.dataset.painelLink) return true;
    if (wrapper.dataset) wrapper.dataset.painelLink = '1';

    // Botão à esquerda do título da página
    const $link = $(`<a class="btn btn-default btn-sm painel-catequese-link" href="/app/${PAINEL}"
                       title="${__('Painel da Catequese')}" style="margin-right: 10px; flex-shrink: 0;">← ${__('Painel')}</a>`);
    const $titulo = page.$title_area || $(wrapper).find('.page-head .title-area');
    if ($titulo && $titulo.length) {
      $titulo.prepend($link);
    } else {
      page.add_inner_button(`← ${__('Painel da Catequese')}`, () => frappe.set_route(PAINEL));
    }
    return true;
  }

  function tentar(n) {
    if (adicionarLink() === false && n > 0) setTimeout(() => tentar(n - 1), 250);
  }

  $(document).on('page-change', () => tentar(8));
  $(() => tentar(8));
})();

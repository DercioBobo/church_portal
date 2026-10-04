/* global frappe, $ */
// Tema dos formulários da catequese (estilo próprio, não o formulário nativo do Frappe).
// Cada DocType estilizado chama cq.estilizar(frm) no refresh e usa os blocos abaixo
// (cartão de resumo, pílulas de estado, telefones). Estilos em public/css/catequese_forms.css.

(function () {
  const esc = (s) => frappe.utils.escape_html(s == null ? '' : String(s));

  // "84 123 4567 / 82…" → primeiro número só com dígitos
  function digitos(n) {
    return String(n || '').split(/[\/,;|]| e /)[0].replace(/\D/g, '');
  }

  const ESTADOS = {
    activo: 'ok', activa: 'ok', 'em curso': 'ok', realizada: 'ok', crismado: 'info', submetida: 'ok', final: 'ok',
    pendente: 'aviso', planeado: 'aviso', rascunho: 'aviso', adiada: 'aviso', 'em progresso': 'aviso',
    inactivo: 'off', inativo: 'off', inactiva: 'off', encerrado: 'off', transferido: 'off', cancelada: 'erro',
  };

  window.cq = {
    esc,

    // Liga o tema no formulário (só nos DocTypes que o chamam)
    estilizar(frm) {
      const $w = frm.page && frm.page.wrapper;
      if (!$w) return;
      $w.addClass('cq-form').addClass('cq-form--' + frappe.scrub(frm.doctype));
    },

    pill(estado) {
      if (!estado) return '';
      const tom = ESTADOS[String(estado).toLowerCase()] || 'info';
      return `<span class="cq-pill cq-pill--${tom}">${esc(estado)}</span>`;
    },

    telefone(numero, { escuro = false } = {}) {
      const d = digitos(numero);
      if (!d) return '<span class="cq-muted">sem contacto</span>';
      const intl = d.length === 9 ? '258' + d : d;
      return `<span class="cq-tel${escuro ? ' cq-tel--escuro' : ''}">
        <a href="tel:+${intl}">${esc(numero)}</a>
        <a class="cq-wa" href="https://wa.me/${intl}" target="_blank" title="WhatsApp">WA</a></span>`;
    },

    // Marca ✓ / ✗ com rótulo
    marca(ok, rotulo, extra) {
      return `<span class="cq-marca ${ok ? 'sim' : 'nao'}">${ok ? '✓' : '✗'} ${esc(rotulo)}${extra ? ` <small>${esc(extra)}</small>` : ''}</span>`;
    },

    // Cartão de resumo no topo (campo HTML): {titulo, subtitulo, pills[], linhas[], factos[{v,l}], aviso, acoes[]}
    resumo(frm, campo, o) {
      const f = frm.fields_dict[campo];
      if (!f) return;
      const factos = (o.factos || []).filter(Boolean).map((x) =>
        `<div class="cq-facto"><b>${x.v}</b><span>${esc(x.l)}</span></div>`).join('');
      f.$wrapper.html(`
        <div class="cq-resumo">
          <div class="cq-resumo-top">
            <div class="cq-resumo-id">
              <div class="cq-resumo-pills">${(o.pills || []).join('')}</div>
              <h2>${esc(o.titulo)}</h2>
              ${o.subtitulo ? `<p>${o.subtitulo}</p>` : ''}
            </div>
            ${factos ? `<div class="cq-factos">${factos}</div>` : ''}
          </div>
          ${(o.linhas || []).filter(Boolean).map((l) => `<div class="cq-resumo-linha">${l}</div>`).join('')}
          ${o.aviso ? `<div class="cq-resumo-aviso">${o.aviso}</div>` : ''}
        </div>`);
      // botões declarados em o.acoes: [{rotulo, accao}]
      (o.acoes || []).forEach((a, i) => {
        f.$wrapper.find(`[data-cq-accao="${i}"]`).on('click', a.accao);
      });
    },

    botao(rotulo, i, { primario = true } = {}) {
      return `<button class="btn btn-sm ${primario ? 'btn-primary' : 'btn-default'}" data-cq-accao="${i}">${esc(rotulo)}</button>`;
    },
  };
})();

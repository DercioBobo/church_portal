// Preparacao do Sacramento — scripts de formulário
// Listar / Sincronizar / Actualizar correm no servidor (portal.catequese.preparacao),
// a mesma versão usada pela página "Gerir Preparação".

const PS_API = 'portal.catequese.preparacao.';

function ps_chamar(frm, metodo, args = {}) {
    return frappe.call({ method: PS_API + metodo, args: Object.assign({ nome: frm.doc.name }, args), freeze: true })
        .then((r) => r.message);
}

frappe.ui.form.on('Preparacao do Sacramento', {
    refresh(frm) {
        if (frm.is_new() || frm.doc.docstatus !== 0) return;

        // 🔘 Listar Candidatos
        frm.add_custom_button('Listar Candidatos', async () => {
            if (frm.is_dirty()) await frm.save();
            const r = await ps_chamar(frm, 'listar_candidatos');
            await frm.reload_doc();
            frappe.msgprint(r.adicionados
                ? `Foram adicionados ${r.adicionados} novo(s) candidato(s); ${r.actualizados} actualizado(s).`
                : 'Lista actualizada. Nenhum novo candidato foi adicionado.');
        });

        // 🧹 Sincronizar Lista (remover quem já não cumpre critérios; nunca quem "Não vai receber")
        frm.add_custom_button('Sincronizar Lista', async () => {
            if (frm.is_dirty()) await frm.save();
            const r = await ps_chamar(frm, 'sincronizar');
            if (!r.removidos.length) {
                frappe.msgprint('Todos os candidatos continuam válidos. Nenhuma alteração necessária.');
                return;
            }
            const lista = r.removidos.map((x) =>
                `<li><strong>${frappe.utils.escape_html(x.catecumeno || '')}</strong> — ${frappe.utils.escape_html(x.motivo)}</li>`).join('');
            frappe.confirm(`<p>Os seguintes ${r.removidos.length} candidato(s) serão removidos da lista:</p><ul>${lista}</ul>`,
                async () => {
                    await ps_chamar(frm, 'sincronizar', { aplicar: 1 });
                    await frm.reload_doc();
                    frappe.show_alert({ message: `${r.removidos.length} candidato(s) removido(s).`, indicator: 'green' });
                });
        });

        // 🔁 Actualizar Dados nos Catecumenos
        frm.add_custom_button('Actualizar Dados nos Catecumenos', () => {
            frappe.confirm('Deseja actualizar os dados dos Catecúmenos com as informações desta tabela?', async () => {
                if (frm.is_dirty()) await frm.save();
                const r = await ps_chamar(frm, 'actualizar_catecumenos');
                const falhas = (r.falhas || []).map((f) => `<li><b>${frappe.utils.escape_html(f.catecumeno)}</b>: ${frappe.utils.escape_html(f.erro)}</li>`).join('');
                frappe.msgprint(`Dados actualizados em ${r.actualizados} catecúmeno(s).` + (falhas ? `<p>Não actualizados:</p><ul>${falhas}</ul>` : ''));
            });
        });
    },
});

// ── Atribuir Datas e Sacerdote ────────────────────────────────────────────

frappe.ui.form.on('Preparacao do Sacramento', {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button('Atribuir aos Selecionados', () => {
                const selected = frm.fields_dict.candidatos_sacramento_table.grid.get_selected_children();

                if (!selected.length) {
                    frappe.show_alert({
                        message: 'Selecione pelo menos um candidato.',
                        indicator: 'orange'
                    });
                    return;
                }

                _show_atribuir_dialog(frm, selected);

            }, __('Ações'));
        }
    }
});

function _show_atribuir_dialog(frm, selected) {
    // Inject custom styles once
    if (!document.getElementById('pnsa-dialog-styles')) {
        const style = document.createElement('style');
        style.id = 'pnsa-dialog-styles';
        style.textContent = `
            .pnsa-atribuir-dialog .modal-dialog { max-width: 480px; }
            .pnsa-atribuir-dialog .modal-header {
                background: #1a1a2e;
                border-radius: 8px 8px 0 0;
                padding: 18px 22px 14px;
            }
            .pnsa-atribuir-dialog .modal-title {
                color: #fff !important;
                font-size: 15px;
                font-weight: 600;
                letter-spacing: 0.02em;
            }
            .pnsa-atribuir-dialog .btn-modal-close { color: rgba(255,255,255,0.6) !important; }
            .pnsa-atribuir-dialog .modal-body { padding: 22px 22px 8px; }

            /* Badge showing count */
            .pnsa-count-badge {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                background: #f0f4ff;
                border: 1px solid #c7d4f7;
                border-radius: 20px;
                padding: 5px 14px 5px 10px;
                margin-bottom: 18px;
                font-size: 12.5px;
                color: #3b5bdb;
                font-weight: 500;
            }
            .pnsa-count-badge .dot {
                width: 8px; height: 8px;
                background: #3b5bdb;
                border-radius: 50%;
                display: inline-block;
            }

            /* Section headers inside dialog */
            .pnsa-section-label {
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: #8492a6;
                margin: 14px 0 8px;
            }
            .pnsa-section-label:first-of-type { margin-top: 4px; }

            /* Check toggles */
            .pnsa-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #f8f9fc;
                border: 1px solid #e8ecf4;
                border-radius: 8px;
                padding: 10px 14px;
                margin-bottom: 8px;
            }
            .pnsa-toggle-row label {
                font-size: 13px;
                color: #2d3748;
                font-weight: 500;
                margin: 0;
                cursor: pointer;
            }
            .pnsa-toggle-row .pnsa-toggle-desc {
                font-size: 11px;
                color: #a0aec0;
                margin-top: 1px;
            }

            /* Toggle switch */
            .pnsa-switch {
                position: relative;
                width: 38px;
                height: 22px;
                flex-shrink: 0;
            }
            .pnsa-switch input { opacity: 0; width: 0; height: 0; }
            .pnsa-switch .slider {
                position: absolute;
                cursor: pointer;
                inset: 0;
                background: #dde1ea;
                border-radius: 22px;
                transition: 0.2s;
            }
            .pnsa-switch .slider::before {
                content: '';
                position: absolute;
                width: 16px; height: 16px;
                left: 3px; top: 3px;
                background: #fff;
                border-radius: 50%;
                transition: 0.2s;
                box-shadow: 0 1px 3px rgba(0,0,0,0.18);
            }
            .pnsa-switch input:checked + .slider { background: #3b5bdb; }
            .pnsa-switch input:checked + .slider::before { transform: translateX(16px); }

            /* Divider */
            .pnsa-divider {
                border: none;
                border-top: 1px solid #edf0f7;
                margin: 16px 0 4px;
            }

            /* Override frappe dialog footer */
            .pnsa-atribuir-dialog .modal-footer {
                padding: 12px 22px 16px;
                border-top: 1px solid #edf0f7;
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            .pnsa-atribuir-dialog .btn-primary {
                background: #1a1a2e !important;
                border-color: #1a1a2e !important;
                border-radius: 7px !important;
                font-size: 13px !important;
                padding: 7px 20px !important;
                font-weight: 500 !important;
            }
            .pnsa-atribuir-dialog .btn-primary:hover {
                background: #2d2d4e !important;
            }
            .pnsa-atribuir-dialog .btn-secondary {
                border-radius: 7px !important;
                font-size: 13px !important;
                padding: 7px 16px !important;
            }
        `;
        document.head.appendChild(style);
    }

    const dialog = new frappe.ui.Dialog({
        title: 'Atribuir aos Candidatos',
        fields: [
            // Hidden HTML block for the count badge + custom layout
            {
                fieldtype: 'HTML',
                fieldname: 'header_html',
                options: `<div class="pnsa-count-badge">
                    <span class="dot"></span>
                    ${selected.length} candidato${selected.length !== 1 ? 's' : ''} selecionado${selected.length !== 1 ? 's' : ''}
                </div>
                <div class="pnsa-section-label">Agendamento</div>`
            },
            {
                label: 'Data do Sacramento',
                fieldname: 'data_sacramento',
                fieldtype: 'Date',
                reqd: 0
            },
            {
                label: 'Dia',
                fieldname: 'dia',
                fieldtype: 'Select',
                options: '\nSábado\nDomingo',
                reqd: 0
            },
            {
                label: 'Sacerdote',
                fieldname: 'sacerdote',
                fieldtype: 'Data',
                reqd: 0
            },
            {
                fieldtype: 'HTML',
                fieldname: 'divider_html',
                options: '<hr class="pnsa-divider"><div class="pnsa-section-label">Documentação</div>'
            },
            // Ficha toggle
            {
                fieldtype: 'HTML',
                fieldname: 'ficha_html',
                options: `<div class="pnsa-toggle-row" id="pnsa-ficha-row">
                    <div>
                        <label for="pnsa-ficha-check">Ficha</label>
                        <div class="pnsa-toggle-desc">Marcar ficha como entregue</div>
                    </div>
                    <label class="pnsa-switch">
                        <input type="checkbox" id="pnsa-ficha-check">
                        <span class="slider"></span>
                    </label>
                </div>`
            },
            // Documentos Padrinhos toggle
            {
                fieldtype: 'HTML',
                fieldname: 'docs_padrinhos_html',
                options: `<div class="pnsa-toggle-row" id="pnsa-docs-row">
                    <div>
                        <label for="pnsa-docs-check">Documentos dos Padrinhos</label>
                        <div class="pnsa-toggle-desc">Marcar documentos como recebidos</div>
                    </div>
                    <label class="pnsa-switch">
                        <input type="checkbox" id="pnsa-docs-check">
                        <span class="slider"></span>
                    </label>
                </div>`
            },
        ],
        primary_action_label: 'Atribuir',
        primary_action(values) {
            const fichaChecked   = dialog.$wrapper.find('#pnsa-ficha-check').is(':checked');
            const docsChecked    = dialog.$wrapper.find('#pnsa-docs-check').is(':checked');
            const fichaEnabled   = dialog.$wrapper.find('#pnsa-ficha-row').data('enabled');
            const docsEnabled    = dialog.$wrapper.find('#pnsa-docs-row').data('enabled');

            let changed = 0;

            selected.forEach(row => {
                if (values.data_sacramento) {
                    frappe.model.set_value(row.doctype, row.name, 'date', values.data_sacramento);
                    changed++;
                }
                if (values.dia) {
                    frappe.model.set_value(row.doctype, row.name, 'dia', values.dia);
                }
                if (values.sacerdote) {
                    frappe.model.set_value(row.doctype, row.name, 'sacerdote', values.sacerdote);
                }
                if (fichaEnabled !== undefined) {
                    frappe.model.set_value(row.doctype, row.name, 'ficha', fichaChecked ? 1 : 0);
                }
                if (docsEnabled !== undefined) {
                    frappe.model.set_value(row.doctype, row.name, 'documentos_padrinhos', docsChecked ? 1 : 0);
                }
            });

            frm.refresh_field('candidatos_sacramento_table');
            dialog.hide();

            frappe.show_alert({
                message: `Atribuído a ${selected.length} candidato${selected.length !== 1 ? 's' : ''}.`,
                indicator: 'green'
            });
        }
    });

    // Add our CSS class to the modal for scoped styles
    dialog.show();
    dialog.$wrapper.addClass('pnsa-atribuir-dialog');

    // Mark toggle rows as "interacted" when user clicks them
    dialog.$wrapper.find('#pnsa-ficha-row').on('click', function() {
        $(this).data('enabled', true);
    });
    dialog.$wrapper.find('#pnsa-docs-row').on('click', function() {
        $(this).data('enabled', true);
    });
}

// ── Link para encarregados ────────────────────────────────────────────────

frappe.ui.form.on('Preparacao do Sacramento', {
    refresh(frm) {
        if (frm.is_new()) return;
        const grupo = __('Link para encarregados');
        const activo = frm.doc.link_token && frm.doc.link_expira_em
            && frappe.datetime.str_to_obj(frm.doc.link_expira_em) > new Date();

        frm.add_custom_button(activo ? __('Gerar novo link') : __('Gerar link'), () => {
            const d = new frappe.ui.Dialog({
                title: __('Link para o grupo dos encarregados'),
                fields: [
                    {
                        fieldname: 'expira_em', fieldtype: 'Datetime', label: __('Válido até'), reqd: 1,
                        default: frappe.datetime.add_days(frappe.datetime.now_datetime(),
                            (frappe.boot.catequese && frappe.boot.catequese.link_validade_dias) || 7),
                    },
                    {
                        fieldname: 'permite_editar', fieldtype: 'Check',
                        default: frappe.boot.catequese ? frappe.boot.catequese.link_permite_editar : 1,
                        label: __('Encarregados podem corrigir dados e deixar observações'),
                    },
                    {
                        fieldname: 'aviso', fieldtype: 'HTML',
                        options: `<p class="text-muted small">${__('Quem tiver o link vê todos os candidatos desta preparação até à data indicada. Gerar um novo link desactiva o anterior.')}</p>`,
                    },
                ],
                primary_action_label: __('Gerar'),
                primary_action(v) {
                    frm.call({
                        doc: frm.doc,
                        method: 'gerar_link_encarregados',
                        args: { expira_em: v.expira_em, permite_editar: v.permite_editar },
                        callback(r) {
                            d.hide();
                            frm.reload_doc();
                            if (r.message) {
                                frappe.utils.copy_to_clipboard(r.message);
                                frappe.msgprint({
                                    title: __('Link gerado e copiado'),
                                    indicator: 'green',
                                    message: `<p>${__('Cole no grupo de WhatsApp:')}</p><p><a href="${r.message}" target="_blank">${r.message}</a></p>`,
                                });
                            }
                        },
                    });
                },
            });
            d.show();
        }, grupo);

        if (activo) {
            frm.add_custom_button(__('Copiar link'), () => {
                frappe.utils.copy_to_clipboard(frm.doc.link_url);
            }, grupo);
            frm.add_custom_button(__('Revogar link'), () => {
                frappe.confirm(__('O link deixa de funcionar imediatamente. Continuar?'), () => {
                    frm.call({ doc: frm.doc, method: 'revogar_link_encarregados', callback: () => frm.reload_doc() });
                });
            }, grupo);
            frm.dashboard.add_comment(
                __('Link para encarregados activo até {0}{1}.', [
                    frappe.datetime.str_to_user(frm.doc.link_expira_em),
                    frm.doc.link_permite_editar ? '' : __(' (só leitura)'),
                ]),
                'blue', true
            );
        }
    },
});

// ── Valores por omissão do sacramento (Catequese Settings) ─────────────────

frappe.ui.form.on('Preparacao do Sacramento', {
    sacramento(frm) {
        if (!frm.is_new() || !frm.doc.sacramento) return;
        frappe.call({
            method: 'portal.catequese.utils.valores_sacramento',
            args: { sacramento: frm.doc.sacramento },
            callback(r) {
                Object.entries(r.message || {}).forEach(([campo, valor]) => {
                    if (!frm.doc[campo] && valor) frm.set_value(campo, valor);
                });
            },
        });
    },
});

// ── Situação dos candidatos (Vai receber / Não vai receber) ───────────────
// Em vez de apagar quem não vai receber, marca-se com o motivo. Não aparece nos PDFs
// nem no link para encarregados, e fica visível na página Sacramentos.

const PS_NAO_RECEBE = 'Não vai receber';
const PS_MOTIVOS = ['Comportamento', 'Faltas', 'Documentos', 'Desistiu', 'Repete a fase', 'Outro'];

frappe.ui.form.on('Preparacao do Sacramento', {
    refresh(frm) {
        ps_mostrar_situacao(frm);
        if (frm.is_new() || frm.doc.docstatus !== 0) return;
        frm.add_custom_button(__('Marcar situação'), () => {
            const sel = frm.fields_dict.candidatos_sacramento_table.grid.get_selected_children();
            if (!sel.length) {
                frappe.show_alert({ message: __('Seleccione pelo menos um candidato na tabela.'), indicator: 'orange' });
                return;
            }
            ps_dialogo_situacao(frm, sel);
        }, __('Ações'));
    },
    candidatos_sacramento_table_on_form_rendered: ps_mostrar_situacao,
});

frappe.ui.form.on('Candidatos ao Sacramento Table', {
    situacao(frm) { ps_mostrar_situacao(frm); },
    candidatos_sacramento_table_remove(frm) { ps_mostrar_situacao(frm); },
});

function ps_dialogo_situacao(frm, linhas) {
    const d = new frappe.ui.Dialog({
        title: __('Situação de {0} candidato(s)', [linhas.length]),
        fields: [
            { fieldname: 'situacao', fieldtype: 'Select', label: __('Situação'), reqd: 1,
              options: ['Vai receber', PS_NAO_RECEBE].join('\n'), default: PS_NAO_RECEBE },
            { fieldname: 'motivo', fieldtype: 'Select', label: __('Motivo'),
              options: [''].concat(PS_MOTIVOS).join('\n'),
              depends_on: `eval:doc.situacao=='${PS_NAO_RECEBE}'`,
              mandatory_depends_on: `eval:doc.situacao=='${PS_NAO_RECEBE}'` },
            { fieldname: 'detalhe', fieldtype: 'Small Text', label: __('Detalhe (opcional)'),
              depends_on: `eval:doc.situacao=='${PS_NAO_RECEBE}'` },
            { fieldname: 'nomes', fieldtype: 'HTML',
              options: `<p class="text-muted small">${linhas.map((r) => frappe.utils.escape_html(r.catecumeno || '')).join(', ')}</p>` },
        ],
        primary_action_label: __('Aplicar'),
        primary_action(v) {
            const nao = v.situacao === PS_NAO_RECEBE;
            linhas.forEach((r) => {
                frappe.model.set_value(r.doctype, r.name, {
                    situacao: v.situacao,
                    motivo_nao_recebe: nao ? v.motivo : '',
                    detalhe_situacao: nao ? (v.detalhe || '') : '',
                });
            });
            d.hide();
            frm.fields_dict.candidatos_sacramento_table.grid.clear_checked_items?.();
            frm.save();
        },
    });
    d.show();
}

// Linhas de quem não vai receber a cinzento com o motivo, e contagem no topo
function ps_mostrar_situacao(frm) {
    const linhas = frm.doc.candidatos_sacramento_table || [];
    const nao = linhas.filter((r) => r.situacao === PS_NAO_RECEBE);
    const grid = frm.fields_dict.candidatos_sacramento_table && frm.fields_dict.candidatos_sacramento_table.grid;
    setTimeout(() => {
        (grid && grid.grid_rows || []).forEach((gr) => {
            const doc = gr.doc || {};
            const fora = doc.situacao === PS_NAO_RECEBE;
            const $row = $(gr.row);
            $row.toggleClass('ps-nao-recebe', fora);
            $row.find('.ps-motivo').remove();
            if (fora) {
                $row.find('[data-fieldname="catecumeno"] .static-area, [data-fieldname="catecumeno"] .field-area').first()
                    .append(`<span class="ps-motivo">${frappe.utils.escape_html(doc.motivo_nao_recebe || PS_NAO_RECEBE)}</span>`);
            }
        });
    }, 0);
    if (!linhas.length) { frm.set_intro(''); return; }
    const recebem = linhas.length - nao.length;
    frm.set_intro(nao.length
        ? __('<b>{0}</b> vão receber · <b>{1}</b> não vão receber (a cinzento na tabela; não aparecem nos PDFs nem no link).', [recebem, nao.length])
        : __('<b>{0}</b> candidatos vão receber o sacramento.', [recebem]),
        nao.length ? 'orange' : 'blue');
}

(function () {
    if (document.getElementById('ps-situacao-css')) return;
    const st = document.createElement('style');
    st.id = 'ps-situacao-css';
    st.textContent = `
        .ps-nao-recebe .data-row { opacity: .55; background: repeating-linear-gradient(135deg, transparent 0 8px, rgba(220,38,38,.04) 8px 16px); }
        .ps-nao-recebe .data-row { box-shadow: inset 3px 0 0 #dc2626; }
        .ps-motivo { margin-left: 6px; padding: 0 6px; border-radius: 999px; font-size: 10px; font-weight: 700;
            background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; white-space: nowrap; }`;
    document.head.appendChild(st);
})();

// ── Formulário estilizado: resumo no topo + atalho para a página de gestão ─

frappe.ui.form.on('Preparacao do Sacramento', {
    refresh(frm) {
        cq.estilizar(frm);
        ps_resumo(frm);
        if (!frm.is_new()) {
            frm.add_custom_button(__('Gerir na página'), () => ps_abrir_pagina(frm)).addClass('btn-primary');
        }
    },
});

['ficha', 'documentos_padrinhos', 'valor_ofertorio', 'valor_cracha', 'valor_accao_gracas', 'valor_fotos', 'situacao']
    .forEach((campo) => frappe.ui.form.on('Candidatos ao Sacramento Table', { [campo]: (frm) => ps_resumo(frm) }));

function ps_abrir_pagina(frm) {
    window.location.href = '/app/gerir-preparacao/' + encodeURIComponent(frm.doc.name);
}

function ps_resumo(frm) {
    const d = frm.doc;
    if (frm.is_new()) { frm.fields_dict.cq_resumo.$wrapper.empty(); return; }
    const linhas = (d.candidatos_sacramento_table || []).filter((r) => r.catecumeno);
    const vao = linhas.filter((r) => r.situacao !== PS_NAO_RECEBE);
    const nao = linhas.length - vao.length;
    const pag = [['valor_ofertorio', 'Ofertório'], ['valor_cracha', 'Crachá'], ['valor_accao_gracas', 'Acção de graças'], ['valor_fotos', 'Fotos']]
        .filter(([c]) => flt(d[c]) > 0);
    const pago = (r) => pag.every(([c]) => flt(r[c]) >= flt(d[c]));
    const recebido = vao.reduce((t, r) => t + pag.reduce((s, [c]) => s + flt(r[c]), 0), 0);
    const esperado = vao.length * pag.reduce((s, [c]) => s + flt(d[c]), 0);
    const n = (f) => vao.filter(f).length;
    const pct = (k) => (vao.length ? Math.round((k / vao.length) * 100) : 0);
    const barra = (rotulo, k) => `<span class="ps-prog"><small>${rotulo}</small> <b>${k}/${vao.length}</b>
        <i><em style="width:${pct(k)}%"></em></i></span>`;

    const activo = d.link_token && d.link_expira_em && frappe.datetime.str_to_obj(d.link_expira_em) > new Date();
    const estado = d.docstatus === 1 ? 'Submetida' : d.docstatus === 2 ? 'Cancelada' : 'Rascunho';

    cq.resumo(frm, 'cq_resumo', {
        titulo: `${d.sacramento || ''} ${d.ano_lectivo || ''}`.trim(),
        pills: [cq.pill(estado), activo ? cq.pill('Link activo') : ''],
        subtitulo: d.data_do_sacramento ? '📅 ' + frappe.datetime.str_to_user(d.data_do_sacramento) : 'Sem data definida',
        factos: [
            { v: vao.length, l: 'Vão receber' },
            nao ? { v: nao, l: 'Não vão' } : null,
        ],
        linhas: [
            barra('Ficha', n((r) => r.ficha)) + barra('Docs. padrinhos', n((r) => r.documentos_padrinhos))
            + (pag.length ? barra('Pagamento completo', n(pago)) : ''),
            pag.length ? `<span><small>Recebido:</small> <b>${format_currency(recebido)}</b> <small>de ${format_currency(esperado)} esperados</small></span>`
                + (activo ? `<span><small>Link válido até</small> ${frappe.datetime.str_to_user(d.link_expira_em)}</span>` : '') : '',
        ],
    });
}

(function () {
    if (document.getElementById('ps-resumo-css')) return;
    const st = document.createElement('style');
    st.id = 'ps-resumo-css';
    st.textContent = `
        .ps-prog { display: inline-flex; align-items: center; gap: 6px; }
        .ps-prog i { display: inline-block; width: 70px; height: 6px; border-radius: 3px; background: rgba(184,136,46,.18); overflow: hidden; }
        .ps-prog em { display: block; height: 100%; background: linear-gradient(90deg, #e8c464, #b8882e); }`;
    document.head.appendChild(st);
})();

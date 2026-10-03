// Preparacao do Sacramento — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── Listar Candidatos ao sacramento ───────────────────────────────────────

frappe.ui.form.on('Preparacao do Sacramento', {
    refresh(frm) {
        if (!frm.is_new()) {

            // 🔘 Listar Candidatos
            frm.add_custom_button('Listar Candidatos', async () => {
                if (!frm.doc.sacramento) {
                    frappe.msgprint('Por favor, seleccione o Sacramento primeiro.');
                    return;
                }

                const field_map = {
                    "Baptismo":   "baptismo",
                    "Eucaristia": "eucaristia",
                    "Crisma":     "crisma"
                };
                const sacramento_field = field_map[frm.doc.sacramento] || "";

                // 1. Buscar as fases relacionadas com este sacramento
                const fases = await frappe.db.get_list('Fase', {
                    filters: {
                        fase_de_sacramento: 1,
                        sacramento: frm.doc.sacramento
                    },
                    fields: ['name'],
                    limit: 999
                });

                if (!fases.length) {
                    frappe.msgprint('Nenhuma Fase encontrada marcada para este Sacramento.');
                    return;
                }

                const fase_names = fases.map(f => f.name);

                // 2. Buscar turmas Activas (para filtrar catecúmenos)
                const turmas_activas = await frappe.db.get_list('Turma', {
                    filters: { status: 'Activo' },
                    fields: ['name'],
                    limit: 999
                });

                if (!turmas_activas.length) {
                    frappe.msgprint('Nenhuma Turma Activa encontrada.');
                    return;
                }

                const turma_names = turmas_activas.map(t => t.name);

                // 3. Buscar catecúmenos: fase correcta + activo + sem sacramento + turma activa preenchida
                let filters = {
                    fase:  ['in', fase_names],
                    status: 'Activo',
                    turma: ['in', turma_names]   // turma preenchida E com status Activo
                };
                if (sacramento_field) {
                    filters[sacramento_field] = 0;
                }

                const fetched = await frappe.db.get_list('Catecumeno', {
                    filters,
                    fields: ['name', 'fase', 'turma', 'sexo', 'idade', 'encarregado', 'contacto', 'padrinhos', 'contacto_padrinhos'],
                    order_by: 'name asc',
                    limit: 999
                });

                if (!fetched.length) {
                    frappe.msgprint('Nenhum Catecúmeno encontrado com os critérios definidos.');
                    return;
                }

                // Mapa dos existentes para preservar campos locais
                const existing_map = {};
                (frm.doc.candidatos_sacramento_table || []).forEach(row => {
                    existing_map[row.catecumeno] = row;
                });

                let added = 0;

                fetched.forEach(c => {
                    if (existing_map[c.name]) {
                        // Actualizar campos sincronizados com Catecumeno
                        let row = existing_map[c.name];
                        row.turma                = c.turma;
                        row.fase                 = c.fase;
                        row.sexo                 = c.sexo;
                        row.idade                = c.idade;
                        row.encarregado          = c.encarregado;
                        row.contacto_encarregado = c.contacto;
                        row.padrinhos            = c.padrinhos;
                        row.contacto_padrinhos   = c.contacto_padrinhos;
                    } else {
                        // Adicionar nova linha
                        let row = frm.add_child('candidatos_sacramento_table');
                        row.catecumeno           = c.name;
                        row.turma                = c.turma;
                        row.fase                 = c.fase;
                        row.sexo                 = c.sexo;
                        row.idade                = c.idade;
                        row.encarregado          = c.encarregado;
                        row.contacto_encarregado = c.contacto;
                        row.padrinhos            = c.padrinhos;
                        row.contacto_padrinhos   = c.contacto_padrinhos;
                        // Campos locais inicializados a zero
                        row.ficha                = 0;
                        row.documentos_padrinhos = 0;
                        added++;
                    }
                });

                frm.refresh_field('candidatos_sacramento_table');

                if (added > 0) {
                    await frm.save();
                    frappe.msgprint(`Foram adicionados ${added} novo(s) candidato(s).`);
                } else {
                    frappe.msgprint('Lista actualizada. Nenhum novo candidato foi adicionado.');
                }
            });


            // 🧹 Sincronizar Lista (remover quem já não cumpre critérios)
            frm.add_custom_button('Sincronizar Lista', async () => {
                if (!frm.doc.candidatos_sacramento_table || frm.doc.candidatos_sacramento_table.length === 0) {
                    frappe.msgprint('A tabela de candidatos está vazia.');
                    return;
                }

                if (!frm.doc.sacramento) {
                    frappe.msgprint('Por favor, seleccione o Sacramento primeiro.');
                    return;
                }

                const field_map = {
                    "Baptismo":   "baptismo",
                    "Eucaristia": "eucaristia",
                    "Crisma":     "crisma"
                };
                const sacramento_field = field_map[frm.doc.sacramento] || "";

                // Buscar fases válidas para este sacramento
                const fases = await frappe.db.get_list('Fase', {
                    filters: { fase_de_sacramento: 1, sacramento: frm.doc.sacramento },
                    fields: ['name'],
                    limit: 999
                });
                const fase_names_set = new Set(fases.map(f => f.name));

                // Buscar turmas activas
                const turmas_activas = await frappe.db.get_list('Turma', {
                    filters: { status: 'Activo' },
                    fields: ['name'],
                    limit: 999
                });
                const turma_names_set = new Set(turmas_activas.map(t => t.name));

                // Buscar estado actual de cada catecúmeno na tabela
                const cat_names = frm.doc.candidatos_sacramento_table.map(r => r.catecumeno).filter(Boolean);

               const catecumenos_actuais = await frappe.db.get_list('Catecumeno', {
                filters: { name: ['in', cat_names] },
                fields: ['name', 'fase', 'turma', 'status', 'comunidade', 'baptismo', 'eucaristia', 'crisma'],
                limit: 999
            });
            
            const cat_map = {};
            catecumenos_actuais.forEach(c => cat_map[c.name] = c);
            
            // Avaliar quem sai e porquê
            const removidos = [];
            const manter = [];
            
            frm.doc.candidatos_sacramento_table.forEach(row => {
                    const c = cat_map[row.catecumeno];
                    if (!c) {
                        removidos.push({ nome: row.catecumeno, motivo: 'Catecúmeno não encontrado' });
                        return;
                    }

                    const is_santa_ana = c.comunidade === 'Santa Ana';

                    let motivo = null;
                    if (c.status !== 'Activo') {
                        motivo = 'Status inactivo';
                    } else if (!is_santa_ana && !c.turma) {
                        motivo = 'Sem turma atribuída';
                    } else if (!is_santa_ana && c.turma && !turma_names_set.has(c.turma)) {
                        motivo = `Turma "${c.turma}" não está Activa`;
                    } else if (!is_santa_ana && !fase_names_set.has(c.fase)) {
                        motivo = `Fase "${c.fase}" não corresponde ao sacramento`;
                    } else if (sacramento_field && c[sacramento_field]) {
                        motivo = 'Sacramento já recebido';
                    }

                    if (motivo) removidos.push({ nome: row.catecumeno, motivo });
                    else        manter.push(row);
                });

                if (!removidos.length) {
                    frappe.msgprint('Todos os candidatos continuam válidos. Nenhuma alteração necessária.');
                    return;
                }

                // Mostrar lista de quem vai ser removido e pedir confirmação
                const lista_html = removidos.map(r =>
                    `<li><strong>${r.nome}</strong> — ${r.motivo}</li>`
                ).join('');

                frappe.confirm(
                    `<p>Os seguintes ${removidos.length} candidato(s) serão removidos da lista:</p><ul>${lista_html}</ul>`,
                    async () => {
                        // Reconstruir tabela só com os válidos
                        frm.doc.candidatos_sacramento_table = manter;
                        frm.refresh_field('candidatos_sacramento_table');
                        await frm.save();
                        frappe.msgprint(`${removidos.length} candidato(s) removido(s). Lista sincronizada.`);
                    },
                    () => frappe.msgprint('Operação cancelada.')
                );
            });


            // 🔁 Actualizar Dados nos Catecumenos
            frm.add_custom_button('Actualizar Dados nos Catecumenos', async () => {
                if (!frm.doc.candidatos_sacramento_table || frm.doc.candidatos_sacramento_table.length === 0) {
                    frappe.msgprint('A tabela de candidatos está vazia.');
                    return;
                }

                frappe.confirm(
                    'Deseja actualizar os dados dos Catecumenos com as informações desta tabela?',
                    async () => {
                        const total = frm.doc.candidatos_sacramento_table.length;
                        let done = 0;
                        frappe.show_progress('Actualizar Catecumenos...', 0, 100);

                        for (const row of frm.doc.candidatos_sacramento_table) {
                            if (row.catecumeno) {
                                await frappe.db.set_value('Catecumeno', row.catecumeno, {
                                    encarregado:        row.encarregado,
                                    contacto:           row.contacto_encarregado,
                                    padrinhos:          row.padrinhos,
                                    contacto_padrinhos: row.contacto_padrinhos,
                                    sexo:               row.sexo,
                                    idade:              row.idade
                                });

                                done++;
                                frappe.show_progress('Actualizar Catecumenos...', (done / total) * 100);
                            }
                        }

                        frappe.hide_progress();
                        frappe.msgprint('Dados actualizados com sucesso nos registos dos Catecumenos.');
                    },
                    () => frappe.msgprint('Actualização cancelada.')
                );
            });
        }
    }
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

// ── Update child with parent on Sacramento ────────────────────────────────

frappe.ui.form.on("Candidatos ao Sacramento Table", {

    valor_fotos: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        // Só actua se estiver null/undefined — 0 digitado manualmente não activa
        if (row.valor_fotos === null || row.valor_fotos === undefined) {
            const val = frm.doc.valor_fotos;
            if (val && val > 0) frappe.model.set_value(cdt, cdn, "valor_fotos", val);
        }
    },

    valor_cracha: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (row.valor_cracha === null || row.valor_cracha === undefined) {
            const val = frm.doc.valor_cracha;
            if (val && val > 0) frappe.model.set_value(cdt, cdn, "valor_cracha", val);
        }
    },

    valor_ofertorio: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (row.valor_ofertorio === null || row.valor_ofertorio === undefined) {
            const val = frm.doc.valor_ofertorio;
            if (val && val > 0) frappe.model.set_value(cdt, cdn, "valor_ofertorio", val);
        }
    },

    valor_accao_gracas: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (row.valor_accao_gracas === null || row.valor_accao_gracas === undefined) {
            const val = frm.doc.valor_accao_gracas;
            if (val && val > 0) frappe.model.set_value(cdt, cdn, "valor_accao_gracas", val);
        }
    }
});

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

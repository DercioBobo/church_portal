// Turma — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── Listar Catecumenos on Turma ───────────────────────────────────────────

frappe.ui.form.on('Turma', {
    refresh(frm) {
        if (!frm.is_new()) {

            // ─── Listar Catecumenos ───────────────────────────────────────
            frm.add_custom_button('Listar Catecumenos', async () => {

                // Buscar catecúmenos cujo campo `turma` aponta para esta turma
                const catecumenos = await frappe.db.get_list('Catecumeno', {
                    filters: { turma: frm.doc.name },
                    fields: [
                        'name',
                        'data_de_nascimento',
                        'contacto',
                        'encarregado',
                        'status',
                        'observacoes',
                        'sexo',
                        'idade',
                        'ficha_de_catecumeno',
                        'padrinhos',
                        'contacto_padrinhos'
                    ],
                    order_by: 'name asc',
                    limit: 999
                });

                if (!catecumenos.length) {
                    frappe.msgprint('Nenhum catecúmeno encontrado para esta turma.');
                    return;
                }

                // Guardar os valores que só existem na turma, indexados pelo nome do catecúmeno
                const preserved = {};
                (frm.doc.lista_catecumenos || []).forEach(row => {
                    preserved[row.catecumeno] = {
                        pre_avaliacao: row.pre_avaliacao || '',
                        renovacao:     row.renovacao     || 0,
                        nr_de_faltas:  row.nr_de_faltas  || 0
                    };
                });

                // Função para calcular idade a partir da data de nascimento
                const calcularIdade = (birthdate) => {
                    if (!birthdate) return null;
                    const today = new Date();
                    const birth = new Date(birthdate);
                    let age = today.getFullYear() - birth.getFullYear();
                    const m = today.getMonth() - birth.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                    return age;
                };

                // Reconstruir a tabela
                frm.clear_table('lista_catecumenos');

                catecumenos.forEach(c => {
                    const prev = preserved[c.name] || {};
                    let row = frm.add_child('lista_catecumenos');

                    // Campos vindos do Catecumeno
                    row.catecumeno          = c.name;
                    row.data_de_nascimento  = c.data_de_nascimento;
                    row.idade               = c.idade || calcularIdade(c.data_de_nascimento);
                    row.sexo                = c.sexo;
                    row.encarregado         = c.encarregado;
                    row.contacto            = c.contacto;
                    row.status              = c.status;
                    row.observacoes         = c.observacoes;
                    row.ficha_de_catecumeno = c.ficha_de_catecumeno;
                    row.padrinhos           = c.padrinhos;
                    row.contacto_padrinhos  = c.contacto_padrinhos;

                    // Campos preservados da turma (não sobrescrever com dados do catecúmeno)
                    row.pre_avaliacao = prev.pre_avaliacao !== undefined ? prev.pre_avaliacao : '';
                    row.renovacao     = prev.renovacao     !== undefined ? prev.renovacao     : 0;
                    row.nr_de_faltas  = prev.nr_de_faltas  !== undefined ? prev.nr_de_faltas  : 0;
                });

                frm.refresh_field('lista_catecumenos');
                await frm.save();
                frappe.msgprint(`${catecumenos.length} catecúmenos listados e turma guardada com sucesso.`);
            });


            // ─── Actualizar Turma nos Catecumenos ────────────────────────
            frm.add_custom_button('Actualizar Turma nos Catecumenos', async () => {

                if (!frm.doc.lista_catecumenos || frm.doc.lista_catecumenos.length === 0) {
                    frappe.msgprint('Nenhum catecumeno na lista. Use o botão "Listar Catecumenos" primeiro.');
                    return;
                }

                frappe.confirm(
                    `Deseja actualizar a Fase e a Turma nos ${frm.doc.lista_catecumenos.length} catecúmeno(s) desta lista?`,
                    async () => {
                        const total = frm.doc.lista_catecumenos.length;
                        let done = 0;
                        frappe.show_progress('A actualizar catecúmenos...', 0, 100);

                        for (const row of frm.doc.lista_catecumenos) {
                            await frappe.db.set_value('Catecumeno', row.catecumeno, {
                                turma: frm.doc.name,
                                fase:  frm.doc.fase
                            });
                            done++;
                            frappe.show_progress('A actualizar catecúmenos...', (done / total) * 100);
                        }

                        frappe.hide_progress();
                        frappe.msgprint('Catecúmenos actualizados com sucesso.');
                    },
                    () => frappe.msgprint('Operação cancelada.')
                );
            });
        }
    }
});


// ─── Auto-preencher campo catequistas ────────────────────────────────────────
frappe.ui.form.on('Turma', {
    catequista(frm)     { update_catequistas(frm); },
    catequista_adj(frm) { update_catequistas(frm); }
});

function update_catequistas(frm) {
    const cat = frm.doc.catequista;
    const adj = frm.doc.catequista_adj;

    if (cat && adj)       frm.set_value('catequistas', `${cat} & ${adj}`);
    else if (cat)         frm.set_value('catequistas', cat);
    else if (adj)         frm.set_value('catequistas', adj);
    else                  frm.set_value('catequistas', '');
}

// ── Ano novo na turma ─────────────────────────────────────────────────────

frappe.ui.form.on('Turma', {
    onload: function (frm) {
        if (frm.is_new() && !frm.doc.ano_lectivo) {
            const currentYear = new Date().getFullYear().toString();
            frm.set_value('ano_lectivo', currentYear);
        }
    }
});

// ── Multi Select Catecumento ──────────────────────────────────────────────

// Client Script para Turma
// DocType: Turma
// Permite alterar estado e pré-avaliação em massa para linhas seleccionadas

frappe.ui.form.on('Turma', {
    refresh: function(frm) {
        // Só mostrar botões se não estiver submetido/cancelado
        if (frm.doc.docstatus === 0) {
            
            // === BOTÕES DE ESTADO ===
            frm.add_custom_button(__('Activo'), function() {
                alterar_seleccionados(frm, 'estado', 'Activo');
            }, __('Alterar Estado'));
            
            frm.add_custom_button(__('Pendente'), function() {
                alterar_seleccionados(frm, 'estado', 'Pendente');
            }, __('Alterar Estado'));
            
            frm.add_custom_button(__('Inativo'), function() {
                alterar_seleccionados(frm, 'estado', 'Inativo');
            }, __('Alterar Estado'));
            
            // === BOTÕES DE PRÉ-AVALIAÇÃO ===
            frm.add_custom_button(__('Transita'), function() {
                alterar_seleccionados(frm, 'pre_avaliacao', 'Transita');
            }, __('Pré-Avaliação'));
            
            frm.add_custom_button(__('Permanece'), function() {
                alterar_seleccionados(frm, 'pre_avaliacao', 'Permanece');
            }, __('Pré-Avaliação'));
            
            frm.add_custom_button(__('Limpar'), function() {
                alterar_seleccionados(frm, 'pre_avaliacao', '');
            }, __('Pré-Avaliação'));
            
            // === BOTÃO ACTIVAR TRANSITAM ===
            frm.add_custom_button(__('Activar Transitam'), function() {
                activar_todos_transitam(frm);
            });
        }
    }
});

// Quando altera pre_avaliacao numa linha individual
frappe.ui.form.on('Lista de Catecumenos', {
    pre_avaliacao: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        
        // Se pre_avaliacao é Transita, estado deve ser Activo
        if (row.pre_avaliacao === 'Transita' && row.estado !== 'Activo') {
            frappe.model.set_value(cdt, cdn, 'estado', 'Activo');
        }
    }
});

// Função para activar todos que transitam
function activar_todos_transitam(frm) {
    let tabela = frm.doc.lista_catecumenos || [];
    let count = 0;
    
    tabela.forEach(function(row) {
        if (row.pre_avaliacao === 'Transita' && row.estado !== 'Activo') {
            row.estado = 'Activo';
            count++;
        }
    });
    
    if (count === 0) {
        frappe.show_alert({
            message: __('Nenhuma alteração necessária. Todos que transitam já estão Activos.'),
            indicator: 'blue'
        });
        return;
    }
    
    frm.refresh_field('lista_catecumenos');
    
    frappe.show_alert({
        message: __('{0} catecúmeno(s) definidos como Activo', [count]),
        indicator: 'green'
    });
}

// Função para alterar campo das linhas seleccionadas
function alterar_seleccionados(frm, campo, valor) {
    let tabela = frm.doc.lista_catecumenos || [];
    let seleccionados = tabela.filter(row => row.__checked);
    
    if (seleccionados.length === 0) {
        frappe.msgprint(__('Seleccione pelo menos uma linha na tabela.'));
        return;
    }
    
    // Alterar o valor
    seleccionados.forEach(function(row) {
        row[campo] = valor;
        
        // Se pre_avaliacao é Transita, estado deve ser Activo
        if (campo === 'pre_avaliacao' && valor === 'Transita') {
            row.estado = 'Activo';
        }
    });
    
    frm.refresh_field('lista_catecumenos');
    
    // Mensagem de confirmação
    let campo_label = campo === 'estado' ? 'Estado' : 'Pré-Avaliação';
    let valor_label = valor || '(vazio)';
    let msg = __('{0} alterado para "{1}" em {2} linha(s)', [campo_label, valor_label, seleccionados.length]);
    
    // Mensagem extra se alterou estado automaticamente
    if (campo === 'pre_avaliacao' && valor === 'Transita') {
        msg += '. ' + __('Estado definido como "Activo".');
    }
    
    frappe.show_alert({
        message: msg,
        indicator: 'green'
    });
}

// ── Change turma bulk ─────────────────────────────────────────────────────

frappe.ui.form.on("Turma", {
    refresh: function(frm) {
        frm.fields_dict["lista_catecumenos"].grid.add_custom_button(
            __("Mover para Outra Turma"),
            function() {
                let selected = frm.fields_dict["lista_catecumenos"].grid.get_selected_children();

                if (!selected.length) {
                    frappe.msgprint(__("Seleccione pelo menos um catecúmeno na tabela."));
                    return;
                }

                let catecumenos = selected.map(row => row.catecumeno);

                let d = new frappe.ui.Dialog({
                    title: __("Mover {0} Catecúmeno(s)", [catecumenos.length]),
                    fields: [
                        {
                            fieldname: "nova_turma",
                            fieldtype: "Link",
                            options: "Turma",
                            label: __("Nova Turma"),
                            reqd: 1,
                            get_query: function() {
                                return {
                                    filters: {
                                        name: ["!=", frm.doc.name],
                                        status: "Activo"
                                    }
                                };
                            }
                        }
                    ],
                    primary_action_label: __("Mover"),
                    primary_action: function(values) {
                        frappe.call({
                            method: "portal.catequese.turma.mover_catecumenos_em_massa",
                            args: {
                                catecumenos: JSON.stringify(catecumenos),
                                turma_antiga: frm.doc.name,
                                nova_turma: values.nova_turma
                            },
                            freeze: true,
                            freeze_message: __("A mover catecúmenos..."),
                            callback: function(r) {
                                if (r.message) {
                                    frappe.msgprint(
                                        __("{0} catecúmeno(s) movido(s) para {1} (Fase: {2}).",
                                        [r.message.total, r.message.nova_turma, r.message.fase])
                                    );
                                    d.hide();
                                    frm.reload_doc();
                                }
                            }
                        });
                    }
                });

                d.show();
            }
        );
    }
});

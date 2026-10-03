// Inactivar Catecumeno — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── Inactivar Cat ─────────────────────────────────────────────────────────

// Client Script — Inactivar Catecumeno
// DocType: Inactivar Catecumeno

frappe.ui.form.on('Inactivar Catecumeno', {
    refresh: function(frm) {
        frm.disable_save();
        
            frm.set_query('turma', function() {
        return {
            filters: {
                status: 'Activo'
            }
            };
        });

        frm.add_custom_button(__('Carregar da Turma'), function() {
            carregar_da_turma(frm);
        }).addClass('btn-default');

        frm.add_custom_button(__('Inactivar Catecúmenos'), function() {
            inactivar_catecumenos(frm);
        }).addClass('btn-danger');
    },
    
    turma:function(frm){
        carregar_da_turma(frm)
    }
    
    
});

frappe.ui.form.on('Inactivar Catecumeno Item', {
    catecumeno: function(frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        if (!row.catecumeno) return;

        frappe.db.get_value('Catecumeno', row.catecumeno, ['turma', 'fase'], function(value) {
            if (value) {
                frappe.model.set_value(cdt, cdn, 'turma_actual', value.turma || '');
                frappe.model.set_value(cdt, cdn, 'fase', value.fase || '');
            }
        });
    },

    form_render: function(frm, cdt, cdn) {
        frm.fields_dict['lista_catecumenos'].grid.get_field('catecumeno').get_query = function() {
            return {
                filters: {
                    status: 'Activo'
                }
            };
        };
    }
});

function carregar_da_turma(frm) {
    if (!frm.doc.turma) {
        frappe.msgprint({
            title: __('Atenção'),
            message: __('Seleccione uma turma primeiro.'),
            indicator: 'orange'
        });
        return;
    }

    frappe.db.get_doc('Turma', frm.doc.turma).then(function(turma_doc) {
        var activos = turma_doc.lista_catecumenos.filter(function(r) {
            return r.estado === 'Activo';
        });

        if (!activos || activos.length === 0) {
            frappe.msgprint({
                title: __('Sem catecúmenos'),
                message: __('Não existem catecúmenos activos nesta turma.'),
                indicator: 'orange'
            });
            return;
        }

        // Check for existing rows to avoid duplicates
        var existentes = [];
        if (frm.doc.lista_catecumenos) {
            frm.doc.lista_catecumenos.forEach(function(r) {
                existentes.push(r.catecumeno);
            });
        }

        var adicionados = 0;
        activos.forEach(function(r) {
            if (existentes.indexOf(r.catecumeno) === -1) {
                var new_row = frm.add_child('lista_catecumenos');
                new_row.catecumeno = r.catecumeno;
                new_row.turma_actual = frm.doc.turma;
                new_row.fase = turma_doc.fase || '';
                adicionados++;
            }
        });

        frm.refresh_field('lista_catecumenos');

        frappe.msgprint({
            title: __('Carregado'),
            message: __(adicionados + ' catecúmeno(s) carregado(s). Elimine as linhas que não quer inactivar.'),
            indicator: 'green'
        });
    });
}

function inactivar_catecumenos(frm) {
    var lista = frm.doc.lista_catecumenos;

    if (!lista || lista.length === 0) {
        frappe.msgprint({
            title: __('Atenção'),
            message: __('Adicione pelo menos um catecúmeno à lista.'),
            indicator: 'orange'
        });
        return;
    }

    var nomes = lista.map(function(row) {
        return '<li>' + (row.catecumeno || '') + '</li>';
    }).join('');

    frappe.confirm(
        __('<b>Confirma a inactivação dos seguintes catecúmenos?</b><br><ul>' + nomes + '</ul><br>Esta acção irá:<br>• Definir status como <b>Inactivo</b><br>• Remover da turma activa<br>• Limpar o campo turma'),
        function() {
            var catecumenos_json = JSON.stringify(
                lista.map(function(row) {
                    return { catecumeno: row.catecumeno };
                })
            );

            frappe.call({
                method: 'inactivar_catecumenos',
                args: {
                    catecumenos_json: catecumenos_json,
                    motivo: frm.doc.motivo || '',
                    observacoes: frm.doc.observacoes || '',
                    data_inactivacao: frm.doc.data_inactivacao || frappe.datetime.get_today()
                },
                freeze: true,
                freeze_message: __('A inactivar catecúmenos...'),
                callback: function(r) {
                    if (r.message) {
                        var res = r.message;

                        var msg = '<b>' + res.sucesso + ' catecúmeno(s) inactivado(s) com sucesso.</b>';

                        if (res.erros && res.erros.length > 0) {
                            msg += '<br><br><b>Erros:</b><ul>';
                            res.erros.forEach(function(e) {
                                msg += '<li>' + e + '</li>';
                            });
                            msg += '</ul>';
                        }

                        frappe.msgprint({
                            title: __('Resultado'),
                            message: msg,
                            indicator: res.erros && res.erros.length > 0 ? 'orange' : 'green'
                        });

                        frm.clear_table('lista_catecumenos');
                        frm.refresh_field('lista_catecumenos');
                    }
                }
            });
        }
    );
}

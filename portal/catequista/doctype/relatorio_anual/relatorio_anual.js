frappe.ui.form.on('Relatorio Anual', {
    refresh(frm) {
        if (frm.is_new()) {
            frm.set_intro(__('Escolha o Ano Lectivo e grave — os dados do sistema são carregados automaticamente.'), 'blue');
            return;
        }

        frm.add_custom_button(__('Gerar documento Word'), () => {
            const gerar = () => frm.call({
                doc: frm.doc,
                method: 'gerar_documento',
                freeze: true,
                freeze_message: __('A gerar o relatório...'),
                callback(r) {
                    if (!r.message) return;
                    frm.reload_doc();
                    window.open(r.message, '_blank');
                },
            });
            if (frm.is_dirty()) {
                frm.save().then(gerar);
            } else {
                gerar();
            }
        }).addClass('btn-primary');

        frm.add_custom_button(__('Actualizar dados do sistema'), () => {
            const correr = () => frm.call({
                doc: frm.doc,
                method: 'actualizar_dados',
                freeze: true,
                freeze_message: __('A ler o plano anual, sacramentos e estatísticas...'),
                callback() {
                    frm.reload_doc();
                    frappe.show_alert({ message: __('Dados actualizados'), indicator: 'green' });
                },
            });
            if (frm.is_dirty()) {
                frm.save().then(correr);
            } else {
                correr();
            }
        }, __('Acções'));

        frm.add_custom_button(__('Importar propostas do ano anterior'), () => {
            frm.call({
                doc: frm.doc,
                method: 'importar_propostas',
                callback(r) {
                    frm.reload_doc();
                    frappe.show_alert({
                        message: __('{0} propostas importadas', [r.message || 0]),
                        indicator: r.message ? 'green' : 'orange',
                    });
                },
            });
        }, __('Acções'));

        frm.add_custom_button(__('Descarregar modelo Word'), () => {
            window.open('/api/method/portal.catequista.relatorio_anual.gerar.descarregar_modelo', '_blank');
        }, __('Acções'));

        if (frm.doc.data_actualizacao) {
            frm.set_intro(
                __('Dados do sistema lidos em {0}. Use "Acções → Actualizar dados do sistema" para os refrescar; as suas edições são mantidas.',
                    [frappe.datetime.str_to_user(frm.doc.data_actualizacao)]),
                'blue'
            );
        }
    },
});

frappe.ui.form.on('Relatorio Anual Estatistica', {
    sede: actualizarTotal,
    santa_ana: actualizarTotal,
});

function actualizarTotal(frm, cdt, cdn) {
    const r = locals[cdt][cdn];
    frappe.model.set_value(cdt, cdn, 'total', (r.sede || 0) + (r.santa_ana || 0));
}

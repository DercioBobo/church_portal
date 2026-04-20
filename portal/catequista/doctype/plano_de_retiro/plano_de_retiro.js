function suggestTitulo(frm) {
    if (!frm.is_new()) return;
    const f1 = frm.doc.fase_1;
    const f2 = frm.doc.fase_2;
    if (!f1) { frm.set_value('titulo', ''); return; }
    const ano = frm.doc.ano_lectivo ? frm.doc.ano_lectivo.split('-')[0] : new Date().getFullYear();
    const faseStr = f2 ? `${f1} e ${f2}` : f1;
    frm.set_value('titulo', `Retiro da ${faseStr} ${ano}`);
}

frappe.ui.form.on('Plano de Retiro', {
    fase_1: suggestTitulo,
    fase_2: suggestTitulo,

    data(frm) {
        if (!frm.doc.data) return;
        const day = new Date(frm.doc.data).getDay(); // 0=Sun, 6=Sat
        if (day !== 0 && day !== 6) {
            frappe.show_alert({
                message: __('Atenção: a data seleccionada não é sábado nem domingo.'),
                indicator: 'orange',
            }, 6);
        }
    },

    refresh(frm) {
        frm.add_custom_button(__('Copiar Programa de Retiro Anterior'), () => {
            // Fetch retiros that have a programa defined
            frappe.call({
                method: 'portal.catequista.plano_retiro.listar_retiros_com_programa',
                callback(r) {
                    const lista = r.message || [];
                    if (!lista.length) {
                        frappe.msgprint(__('Não existem retiros anteriores com programa definido.'));
                        return;
                    }

                    // Build Select options: "Titulo — DD/MM/YYYY"
                    const options = lista.map(x => {
                        const d = x.data ? frappe.format(x.data, { fieldtype: 'Date' }) : '—';
                        return { label: `${x.titulo} — ${d}`, value: x.name };
                    });

                    const d = new frappe.ui.Dialog({
                        title: __('Copiar Programa de Retiro Anterior'),
                        fields: [
                            {
                                label: __('Retiro de origem'),
                                fieldname: 'retiro',
                                fieldtype: 'Select',
                                options: options.map(o => o.label).join('\n'),
                                reqd: 1,
                                description: __('O programa do dia será copiado para este retiro. Poderá ajustar os horários depois.'),
                            }
                        ],
                        primary_action_label: __('Copiar Programa'),
                        primary_action({ retiro: selectedLabel }) {
                            const selected = options.find(o => o.label === selectedLabel);
                            if (!selected) return;

                            frappe.call({
                                method: 'portal.catequista.plano_retiro.get_programa_anterior',
                                args: { retiro_name: selected.value },
                                callback(res) {
                                    const items = res.message || [];
                                    if (!items.length) {
                                        frappe.msgprint(__('O retiro selecionado não tem programa.'));
                                        return;
                                    }

                                    // Replace programa child table
                                    frm.clear_table('programa');
                                    items.forEach(item => {
                                        frm.add_child('programa', {
                                            hora:        item.hora        || null,
                                            actividade:  item.actividade,
                                            responsavel: item.responsavel || null,
                                            notas:       item.notas       || null,
                                        });
                                    });
                                    frm.refresh_field('programa');
                                    frappe.show_alert({
                                        message: __(`${items.length} itens copiados com sucesso`),
                                        indicator: 'green',
                                    });
                                    d.hide();
                                },
                            });
                        },
                    });
                    d.show();
                },
            });
        }, __('Acções'));
    },
});

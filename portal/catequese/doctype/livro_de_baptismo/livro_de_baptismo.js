// Campos comuns dos livros sacramentais: ver portal/catequese/livros.py
frappe.ui.form.on('Livro de Baptismo', {
    refresh(frm) {
        cq.estilizar(frm);
    },
    catecumeno(frm) {
        // Preenche os dados da pessoa a partir do catecúmeno (só os campos vazios)
        if (!frm.doc.catecumeno) return;
        const campos = ['nome_completo', 'data_de_nascimento', 'sexo', 'comunidade', 'nome_do_pai',
                        'nome_da_mae', 'encarregado', 'contacto', 'padrinhos', 'contacto_padrinhos'];
        frappe.db.get_value('Catecumeno', frm.doc.catecumeno, campos).then(r => {
            const c = r.message || {};
            campos.forEach(f => { if (!frm.doc[f] && c[f]) frm.set_value(f, c[f]); });
        });
        if (!frm.doc.origem || frm.doc.origem === 'Extraordinário') frm.set_value('origem', 'Catequese');
    },
});

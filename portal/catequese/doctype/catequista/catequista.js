// Catequista — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── Script Catequista ─────────────────────────────────────────────────────

frappe.ui.form.on('Catequista', {
    data_de_nascimento(frm) {
        set_idade(frm);
    },

});

function set_idade(frm) {
    if (frm.doc.data_de_nascimento) {
        const birthDate = new Date(frm.doc.data_de_nascimento);
        const today = new Date();

        let idade = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();

        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            idade--;
        }

        frm.set_value('idade', idade);
    } else {
        frm.set_value('idade', null);
    }
}

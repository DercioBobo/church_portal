// Troca de Turma — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── TC Filter activo ──────────────────────────────────────────────────────

// Client Script - Troca de Turma
frappe.ui.form.on("Troca de Turma", {
    onload: function(frm) {
        frm.set_query("nova_turma", function() {
            return {
                filters: {
                    status: "Activo"
                }
            };
        });
    }
});

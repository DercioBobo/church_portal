frappe.pages['aniversariantes-hoje'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: '🎂 Aniversariantes Hoje',
        single_column: true
    });

    $(`
        <div id="birthday-block" class="p-4">
            <h2>🎂 Aniversariantes Hoje</h2>
            <div id="birthday-list">Carregando aniversariantes...</div>
        </div>
    `).appendTo(page.body);

    frappe.call({
        method: "portal.catequese.scheduler.get_catecumenos_aniversariantes",
        callback: function(r) {
            const listDiv = document.getElementById('birthday-list');
            if (r.message && r.message.length > 0) {
                let html = "<ul>";
                r.message.forEach(c => {
                    html += `<li><b>${c.name}</b> (${c.idade} anos) - Turma: ${c.turma}</li>`;
                });
                html += "</ul>";
                listDiv.innerHTML = html;
            } else {
                listDiv.innerHTML = "🎂 Nenhum aniversário hoje.";
            }
        }
    });
};

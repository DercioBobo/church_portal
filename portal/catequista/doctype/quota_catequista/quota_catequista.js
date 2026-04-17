frappe.ui.form.on('Quota Catequista', {
    onload: function (frm) {
        if (frm.is_new()) {
            frm.set_value('ano', String(new Date().getFullYear()));
        }
    },
});

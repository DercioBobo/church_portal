frappe.ui.form.on('Catequista Portal Settings', {
	sync_button: function(frm) {
		frappe.call({
			method: 'portal.api.sync_catecumeno_fields',
			freeze: true,
			freeze_message: __('A sincronizar campos...'),
			callback: function(r) {
				if (r.message) {
					if (r.message.added > 0) {
						frappe.msgprint(
							__('Sincronização concluída: {0} campo(s) adicionado(s).', [r.message.added])
						);
						frm.reload_doc();
					} else {
						frappe.msgprint(__('Nenhum campo novo encontrado. A configuração já está actualizada.'));
					}
				}
			}
		});
	}
});

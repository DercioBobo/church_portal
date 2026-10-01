// Catequista Portal Settings — friendlier editing of the portal's fields and panel sections.
//
//  • "Escolher Campos" opens a picker over Catecúmeno, Turma › linha do catecúmeno and Turma
//  • "Nova Secção" creates a section and moves fields into it in one step
//  • "Secção no Painel" on each field is a dropdown of the defined sections
//  • Renaming a section carries its fields along; removing one leaves them "sem secção"
//  • A live preview shows how the side panel, table and turma header will look

(() => {
	const PORTAL_SOURCE_LABELS = {
		catecumeno: __('Catecúmeno'),
		turma_catecumenos: __('Turma › linha do catecúmeno'),
		turma: __('Turma'),
	};

	// Must match the options of Catequista Portal Section.icon (lucide icon names used by the portal)
	const PORTAL_SECTION_ICONS = [
		'', 'User', 'Users', 'Heart', 'BookOpen', 'Book', 'MessageSquare', 'Calendar',
		'MapPin', 'Phone', 'Star', 'Info', 'FileText', 'Pencil', 'Home', 'Shield',
	];

	const NEW_SECTION = '__new__';
	const SUGGESTED_SECTION = '__auto__';

	frappe.ui.form.on('Catequista Portal Settings', {
		refresh(frm) {
			portal_settings.refresh_section_options(frm);
			portal_settings.render_preview(frm);
		},

		sync_button(frm) {
			portal_settings.open_field_picker(frm);
		},

		add_section_button(frm) {
			portal_settings.open_section_dialog(frm);
		},
	});

	// Grid add/remove/move events fire on the child DocType

	frappe.ui.form.on('Catequista Portal Section', {
		// The section key follows the label, and fields pointing at the old key follow too
		label(frm, cdt, cdn) {
			const row = locals[cdt][cdn];
			const new_key = (row.label || '').trim();
			const old_key = row.section_key;
			if (!new_key || new_key === old_key) return;

			const clash = (frm.doc.sections || []).some(s => s.name !== row.name && s.section_key === new_key);
			if (clash) {
				frappe.msgprint(__('Já existe uma secção chamada «{0}».', [new_key]));
				frappe.model.set_value(cdt, cdn, 'label', old_key || '');
				return;
			}

			if (old_key) {
				let moved = 0;
				(frm.doc.field_config || []).forEach(f => {
					if (f.panel_section === old_key) { f.panel_section = new_key; moved++; }
				});
				if (moved) frm.refresh_field('field_config');
			}
			frappe.model.set_value(cdt, cdn, 'section_key', new_key);
			portal_settings.on_layout_change(frm);
		},

		icon(frm) { portal_settings.render_preview(frm); },
		sections_remove(frm) { portal_settings.on_layout_change(frm); },
		sections_move(frm) { portal_settings.on_layout_change(frm); },

		before_sections_remove(frm, cdt, cdn) {
			const key = locals[cdt][cdn].section_key;
			if (!key) return;
			let moved = 0;
			(frm.doc.field_config || []).forEach(f => {
				if (f.panel_section === key) { f.panel_section = ''; moved++; }
			});
			if (moved) {
				frm.refresh_field('field_config');
				frappe.show_alert({
					message: __('{0} campo(s) da secção «{1}» ficaram sem secção.', [moved, key]),
					indicator: 'orange',
				});
			}
		},
	});

	frappe.ui.form.on('Catequista Portal Field', {
		panel_section(frm) { portal_settings.render_preview(frm); },
		label(frm) { portal_settings.render_preview(frm); },
		show_in_panel(frm) { portal_settings.render_preview(frm); },
		show_in_table(frm) { portal_settings.render_preview(frm); },
		show_in_header(frm) { portal_settings.render_preview(frm); },
		editable(frm) { portal_settings.render_preview(frm); },
		field_config_remove(frm) { portal_settings.on_layout_change(frm); },
		field_config_move(frm) { portal_settings.on_layout_change(frm); },
	});

	const portal_settings = {
		section_keys(frm) {
			return (frm.doc.sections || []).map(s => s.section_key).filter(Boolean);
		},

		on_layout_change(frm) {
			this.refresh_section_options(frm);
			this.render_preview(frm);
		},

		// "Secção no Painel" dropdown = defined sections, plus any value already in use
		// (so rows pointing at an undefined section still show their value)
		refresh_section_options(frm) {
			const keys = this.section_keys(frm);
			const extra = (frm.doc.field_config || [])
				.map(f => f.panel_section)
				.filter(k => k && !keys.includes(k));
			const options = ['', ...keys, ...new Set(extra)].join('\n');

			const grid = frm.fields_dict.field_config && frm.fields_dict.field_config.grid;
			if (grid && grid.update_docfield_property) {
				grid.update_docfield_property('panel_section', 'options', options);
			} else {
				const df = frappe.meta.get_docfield('Catequista Portal Field', 'panel_section', frm.doc.name);
				if (df) df.options = options;
				frm.refresh_field('field_config');
			}
		},

		// ── Field picker ───────────────────────────────────────────────────────────
		open_field_picker(frm) {
			frappe.call({
				method: 'portal.api.get_portal_field_candidates',
				freeze: true,
				freeze_message: __('A carregar campos...'),
				callback: r => r.message && this.show_field_picker(frm, r.message),
			});
		},

		show_field_picker(frm, groups) {
			// Use the form's current rows (including unsaved ones) to mark what's already there
			const configured = new Set((frm.doc.field_config || []).map(f => f.fieldname));
			const by_key = {};
			groups.forEach(g => g.fields.forEach(f => { by_key[`${f.source}:${f.fieldname}`] = f; }));

			const keys = this.section_keys(frm);
			const d = new frappe.ui.Dialog({
				title: __('Escolher Campos'),
				size: 'large',
				fields: [
					{ fieldname: 'search', fieldtype: 'Data', placeholder: __('Procurar campo...') },
					{ fieldname: 'list', fieldtype: 'HTML' },

					{ fieldtype: 'Section Break', label: __('Onde mostrar os campos escolhidos') },
					{
						fieldname: 'panel_section', fieldtype: 'Select', label: __('Secção no painel'),
						options: [
							{ value: SUGGESTED_SECTION, label: __('Sugerida automaticamente') },
							...keys.map(k => ({ value: k, label: k })),
							{ value: NEW_SECTION, label: __('+ Nova secção...') },
						],
						default: SUGGESTED_SECTION,
					},
					{
						fieldname: 'new_section_label', fieldtype: 'Data', label: __('Nome da nova secção'),
						depends_on: `eval:doc.panel_section=='${NEW_SECTION}'`,
						mandatory_depends_on: `eval:doc.panel_section=='${NEW_SECTION}'`,
					},
					{
						fieldname: 'new_section_icon', fieldtype: 'Select', label: __('Ícone'),
						options: PORTAL_SECTION_ICONS,
						depends_on: `eval:doc.panel_section=='${NEW_SECTION}'`,
					},
					{ fieldtype: 'Column Break' },
					{ fieldname: 'show_in_panel', fieldtype: 'Check', label: __('Mostrar no painel do catecúmeno'), default: 1 },
					{ fieldname: 'show_in_table', fieldtype: 'Check', label: __('Mostrar como coluna na tabela') },
					{
						fieldname: 'editable', fieldtype: 'Check', label: __('Editável pelo catequista'),
						description: __('Não se aplica a campos da Turma.'),
					},
					{
						fieldname: 'show_in_header', fieldtype: 'Check', label: __('Mostrar no cabeçalho da turma'),
						description: __('Só para campos da Turma.'),
					},
				],
				primary_action_label: __('Adicionar'),
				primary_action: values => {
					const picked = [...d.$wrapper.find('.pf-check:checked')].map(el => by_key[el.dataset.key]);
					if (!picked.length) {
						frappe.msgprint(__('Escolha pelo menos um campo.'));
						return;
					}
					if (this.add_picked_fields(frm, picked, values)) d.hide();
				},
			});

			const $list = d.fields_dict.list.$wrapper;
			$list.html(this.picker_html(groups, configured));

			const update_count = () => {
				const n = $list.find('.pf-check:checked').length;
				d.get_primary_btn().text(n ? __('Adicionar {0} campo(s)', [n]) : __('Adicionar'));
			};
			$list.on('change', '.pf-check', update_count);
			$list.on('click', '.pf-select-all', e => {
				e.preventDefault();
				const $boxes = $(e.currentTarget).closest('.pf-group').find('.pf-row:visible .pf-check:not(:disabled)');
				const all_checked = $boxes.length && $boxes.filter(':checked').length === $boxes.length;
				$boxes.prop('checked', !all_checked);
				update_count();
			});

			d.fields_dict.search.$input.on('input', e => {
				const q = (e.target.value || '').toLowerCase().trim();
				$list.find('.pf-row').each((_, row) => {
					$(row).toggle(!q || row.dataset.search.includes(q));
				});
				$list.find('.pf-group').each((_, g) => {
					$(g).toggle($(g).find('.pf-row').filter((_, r) => r.style.display !== 'none').length > 0);
				});
			});

			d.show();
		},

		picker_html(groups, configured) {
			const esc = frappe.utils.escape_html;
			const html = groups.map(g => {
				const available = g.fields.filter(f => !configured.has(f.fieldname)).length;
				const rows = g.fields.map(f => {
					const done = configured.has(f.fieldname);
					const search = `${f.label} ${f.fieldname}`.toLowerCase();
					return `
						<label class="pf-row" data-search="${esc(search)}" style="display:flex;align-items:center;gap:10px;padding:6px 8px;margin:0;border-radius:6px;cursor:${done ? 'default' : 'pointer'};${done ? 'opacity:.55;' : ''}">
							<input type="checkbox" class="pf-check" data-key="${esc(`${f.source}:${f.fieldname}`)}" ${done ? 'checked disabled' : ''} style="margin:0">
							<span style="flex:1;min-width:0">
								<span style="font-weight:500">${esc(f.label)}</span>
								<span class="text-muted small" style="margin-left:6px">${esc(f.fieldname)}</span>
							</span>
							<span class="text-muted small">${esc(f.fieldtype)}</span>
							${done ? `<span class="indicator-pill green" style="font-size:11px">${__('já adicionado')}</span>` : ''}
						</label>`;
				}).join('');
				return `
					<div class="pf-group" style="margin-bottom:14px">
						<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-color);margin-bottom:4px">
							<strong>${esc(PORTAL_SOURCE_LABELS[g.source] || g.label)}</strong>
							<span class="text-muted small">
								${__('{0} disponíveis', [available])}
								${available ? ` · <a href="#" class="pf-select-all">${__('Selecionar todos')}</a>` : ''}
							</span>
						</div>
						${rows || `<div class="text-muted small" style="padding:6px 8px">${__('Sem campos.')}</div>`}
					</div>`;
			}).join('');
			return `<div style="max-height:45vh;overflow-y:auto;padding-right:4px">${html}</div>`;
		},

		add_picked_fields(frm, picked, values) {
			let section = values.panel_section;
			if (section === NEW_SECTION) {
				section = (values.new_section_label || '').trim();
				if (!section) return false;
				if (!this.section_keys(frm).includes(section)) {
					frm.add_child('sections', { section_key: section, label: section, icon: values.new_section_icon || '' });
				}
			}

			picked.forEach(c => {
				const is_turma = c.source === 'turma';
				const row = Object.assign({}, c, {
					show_in_panel: values.show_in_panel ? 1 : 0,
					show_in_table: values.show_in_table ? 1 : 0,
					show_in_header: is_turma && values.show_in_header ? 1 : 0,
					editable: !is_turma && values.editable ? 1 : 0,
				});
				if (section !== SUGGESTED_SECTION) row.panel_section = section;
				delete row.configured;
				frm.add_child('field_config', row);
			});

			frm.refresh_field('sections');
			frm.refresh_field('field_config');
			this.on_layout_change(frm);
			frm.save().then(() => {
				frappe.show_alert({ message: __('{0} campo(s) adicionado(s).', [picked.length]), indicator: 'green' });
			});
			return true;
		},

		// ── New section ────────────────────────────────────────────────────────────
		open_section_dialog(frm) {
			const panel_fields = (frm.doc.field_config || []).filter(f => f.show_in_panel && f.fieldname !== 'name');
			const d = new frappe.ui.Dialog({
				title: __('Nova Secção'),
				fields: [
					{ fieldname: 'label', fieldtype: 'Data', label: __('Nome da secção'), reqd: 1 },
					{ fieldname: 'icon', fieldtype: 'Select', label: __('Ícone'), options: PORTAL_SECTION_ICONS },
					{
						fieldname: 'fields', fieldtype: 'MultiCheck', label: __('Campos a mover para esta secção'),
						columns: 2,
						options: panel_fields.map(f => ({
							label: `${f.label} (${f.panel_section || __('sem secção')})`,
							value: f.name,
						})),
					},
				],
				primary_action_label: __('Criar Secção'),
				primary_action: values => {
					const label = values.label.trim();
					if (this.section_keys(frm).includes(label)) {
						frappe.msgprint(__('Já existe uma secção chamada «{0}».', [label]));
						return;
					}
					frm.add_child('sections', { section_key: label, label: label, icon: values.icon || '' });
					const chosen = new Set(values.fields || []);
					(frm.doc.field_config || []).forEach(f => {
						if (chosen.has(f.name)) f.panel_section = label;
					});
					frm.refresh_field('sections');
					frm.refresh_field('field_config');
					this.on_layout_change(frm);
					d.hide();
					frm.save().then(() => {
						frappe.show_alert({ message: __('Secção «{0}» criada.', [label]), indicator: 'green' });
					});
				},
			});
			d.show();
		},

		// ── Live preview ───────────────────────────────────────────────────────────
		render_preview(frm) {
			const field = frm.fields_dict.layout_preview;
			if (!field) return;
			const esc = frappe.utils.escape_html;
			const rows = frm.doc.field_config || [];
			const sections = frm.doc.sections || [];
			const keys = sections.map(s => s.section_key);

			const chip = f => {
				const tags = [];
				if (f.source === 'turma') tags.push(__('Turma'));
				else if (f.source === 'turma_catecumenos') tags.push(__('Linha'));
				if (f.editable && f.source !== 'turma') tags.push('✎');
				return `<a href="#" class="pp-field" data-row="${esc(f.name)}" title="${esc(f.fieldname)}"
					style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;margin:0 6px 6px 0;border-radius:999px;
					background:var(--control-bg);border:1px solid var(--border-color);font-size:12px;color:var(--text-color);text-decoration:none">
					${esc(f.label || f.fieldname)}${tags.length ? ` <span class="text-muted">${esc(tags.join(' · '))}</span>` : ''}</a>`;
			};
			const card = (title, icon, fields, warning) => `
				<div style="border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;margin-bottom:10px">
					<div style="display:flex;align-items:center;gap:8px;margin-bottom:${fields.length ? 8 : 0}px">
						<strong style="font-size:13px">${esc(title)}</strong>
						${icon ? `<span class="text-muted small">${esc(icon)}</span>` : ''}
						<span class="text-muted small" style="margin-left:auto">${__('{0} campo(s)', [fields.length])}</span>
					</div>
					${warning ? `<div class="small" style="color:var(--orange-600);margin-bottom:6px">${esc(warning)}</div>` : ''}
					<div>${fields.map(chip).join('') || `<span class="text-muted small">${__('Vazia: não aparece no portal.')}</span>`}</div>
				</div>`;

			// Mirrors the portal: fields with no section first ("Informações"), declared sections in order,
			// then fields pointing at sections that aren't defined
			const panel = rows.filter(f => f.show_in_panel && f.fieldname !== 'name');
			let html = '';
			const unsectioned = panel.filter(f => !f.panel_section);
			if (unsectioned.length) html += card(__('Informações (sem secção)'), '', unsectioned);
			sections.forEach(s => {
				html += card(s.label || s.section_key || __('(sem nome)'), s.icon, panel.filter(f => f.panel_section === s.section_key));
			});
			[...new Set(panel.map(f => f.panel_section).filter(k => k && !keys.includes(k)))].forEach(k => {
				html += card(k, '', panel.filter(f => f.panel_section === k),
					__('Esta secção não está definida em «Secções do Painel»: aparece no fim, sem ícone.'));
			});

			const table = rows.filter(f => f.show_in_table);
			const header = rows.filter(f => f.source === 'turma' && f.show_in_header);
			const line = (title, fields) => `
				<div style="margin-top:6px">
					<div class="text-muted small" style="margin-bottom:4px">${esc(title)}</div>
					<div>${fields.map(chip).join('') || `<span class="text-muted small">${__('Nenhum')}</span>`}</div>
				</div>`;

			field.$wrapper.html(`
				<div class="text-muted small" style="margin-bottom:10px">
					${__('Como o portal vai mostrar a configuração actual. Clique num campo para o editar. ✎ = editável.')}
				</div>
				<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
					<div>
						<div style="font-weight:600;margin-bottom:8px">${__('Painel do catecúmeno')}</div>
						${html || `<span class="text-muted small">${__('Nenhum campo no painel.')}</span>`}
					</div>
					<div>
						<div style="font-weight:600;margin-bottom:2px">${__('Lista de catecúmenos e turma')}</div>
						${line(__('Colunas da tabela'), table)}
						${line(__('Cabeçalho da turma'), header)}
					</div>
				</div>`);

			field.$wrapper.off('click.pp').on('click.pp', '.pp-field', e => {
				e.preventDefault();
				const grid_row = frm.fields_dict.field_config.grid.get_row(e.currentTarget.dataset.row);
				if (grid_row) grid_row.toggle_view(true);
			});
		},
	};
})();

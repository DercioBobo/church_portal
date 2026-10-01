// Catequista Portal Settings — visual editor for the portal's fields and panel sections.
//
// Everything is edited from the "Editor do Portal" block, which mirrors what catequistas see:
//  • Sections are cards: rename inline, pick an icon, drag to reorder, delete
//  • Fields are rows inside their section: drag to move/reorder, rename inline, and
//    one-click toggles for Tabela / Editável / Cabeçalho / ½ largura
//  • "Fora do painel" holds fields that are only table columns or turma header items
//  • "+ Campos" opens a picker over Catecúmeno, Turma › linha do catecúmeno and Turma
// The raw child tables stay available (collapsed) under "Avançado"; edits in either place
// keep each other in sync. Nothing is saved until the form is saved (Ctrl+S).

(() => {
	const SOURCE_LABELS = {
		catecumeno: __('Catecúmeno'),
		turma_catecumenos: __('Turma › linha do catecúmeno'),
		turma: __('Turma'),
	};
	const SOURCE_BADGES = {
		turma_catecumenos: __('Linha da turma'),
		turma: __('Turma'),
	};

	// Must match the options of Catequista Portal Section.icon (lucide icon names used by the portal)
	const SECTION_ICONS = [
		'', 'User', 'Users', 'Heart', 'BookOpen', 'Book', 'MessageSquare', 'Calendar',
		'MapPin', 'Phone', 'Star', 'Info', 'FileText', 'Pencil', 'Home', 'Shield',
	];
	const TABLE_WIDTHS = [['xs', __('Estreita')], ['sm', __('Pequena')], ['md', __('Média')], ['lg', __('Larga')]];

	const OUT = '__out__';          // zone: not shown in the side panel
	const SUGGESTED = '__auto__';   // picker target: each field's suggested section
	const NEW_SECTION = '__new__';  // picker target: create a section

	const esc = s => frappe.utils.escape_html(s == null ? '' : String(s));

	frappe.ui.form.on('Catequista Portal Settings', {
		refresh(frm) {
			editor.inject_styles();
			editor.changed(frm, { silent: true });
		},
	});

	// Edits made in the "Avançado" tables re-render the editor.
	// Grid add/remove/move events fire on the child DocType.
	frappe.ui.form.on('Catequista Portal Section', {
		label(frm, cdt, cdn) {
			const row = locals[cdt][cdn];
			if (!editor.rename_section(frm, row, row.label)) row.label = row.section_key || '';
			// Only the field grid needs redrawing (renamed panel_section values); leave the
			// section grid alone so the cell being edited keeps focus
			frm.refresh_field('field_config');
			editor.changed(frm, { silent: true });
		},
		icon(frm) { editor.changed(frm, { silent: true }); },
		before_sections_remove(frm, cdt, cdn) { editor.release_section_fields(frm, locals[cdt][cdn]); },
		sections_remove(frm) { editor.changed(frm, { silent: true }); },
		sections_move(frm) { editor.changed(frm, { silent: true }); },
	});

	frappe.ui.form.on('Catequista Portal Field', {
		panel_section(frm) { editor.changed(frm, { silent: true }); },
		label(frm) { editor.changed(frm, { silent: true }); },
		show_in_panel(frm) { editor.changed(frm, { silent: true }); },
		show_in_table(frm) { editor.changed(frm, { silent: true }); },
		show_in_header(frm) { editor.changed(frm, { silent: true }); },
		editable(frm) { editor.changed(frm, { silent: true }); },
		col_span(frm) { editor.changed(frm, { silent: true }); },
		field_config_remove(frm) { editor.changed(frm, { silent: true }); },
		field_config_move(frm) { editor.changed(frm, { silent: true }); },
	});

	const editor = {
		// ── Model helpers ────────────────────────────────────────────────────────
		section_keys(frm) {
			return (frm.doc.sections || []).map(s => s.section_key).filter(Boolean);
		},

		zone_of(frm, f) {
			if (f.fieldname === 'name' || !f.show_in_panel) return OUT;
			return f.panel_section || '';
		},

		renumber(rows) {
			rows.forEach((r, i) => { r.idx = i + 1; });
		},

		// After any model change: mark dirty (unless the change came from the grid, which already
		// did), refresh the grids and the section dropdown, and re-render the editor.
		changed(frm, { silent = false } = {}) {
			if (!silent) {
				frm.dirty();
				frm.refresh_field('sections');
				frm.refresh_field('field_config');
			}
			this.refresh_section_options(frm);
			this.render(frm);
		},

		// "Secção no Painel" dropdown in the grid = defined sections + any value already in use
		refresh_section_options(frm) {
			const keys = this.section_keys(frm);
			const extra = (frm.doc.field_config || []).map(f => f.panel_section).filter(k => k && !keys.includes(k));
			const options = ['', ...keys, ...new Set(extra)].join('\n');
			const grid = frm.fields_dict.field_config && frm.fields_dict.field_config.grid;
			if (grid && grid.update_docfield_property) {
				grid.update_docfield_property('panel_section', 'options', options);
			} else {
				const df = frappe.meta.get_docfield('Catequista Portal Field', 'panel_section', frm.doc.name);
				if (df) df.options = options;
			}
		},

		// Renames a section; its key follows the label and fields pointing at it follow too
		rename_section(frm, row, label) {
			const new_key = (label || '').trim();
			if (!new_key) return false;
			const old_key = row.section_key;
			if (new_key !== old_key && (frm.doc.sections || []).some(s => s.name !== row.name && s.section_key === new_key)) {
				frappe.msgprint(__('Já existe uma secção chamada «{0}».', [new_key]));
				return false;
			}
			if (old_key && old_key !== new_key) {
				(frm.doc.field_config || []).forEach(f => {
					if (f.panel_section === old_key) f.panel_section = new_key;
				});
			}
			row.label = new_key;
			row.section_key = new_key;
			return true;
		},

		release_section_fields(frm, section) {
			const key = section.section_key;
			if (!key) return 0;
			let moved = 0;
			(frm.doc.field_config || []).forEach(f => {
				if (f.panel_section === key) { f.panel_section = ''; moved++; }
			});
			return moved;
		},

		add_section(frm, label, icon) {
			const keys = this.section_keys(frm);
			let name = (label || '').trim() || __('Nova secção');
			if (keys.includes(name)) {
				let n = 2;
				while (keys.includes(`${name} ${n}`)) n++;
				name = `${name} ${n}`;
			}
			frm.add_child('sections', { section_key: name, label: name, icon: icon || '' });
			return name;
		},

		// Moves a field into a zone (section key, '' = no section, OUT = outside the panel),
		// placing it before `before_name`, or after the zone's last field
		move_field(frm, name, zone, before_name) {
			const rows = frm.doc.field_config || [];
			const f = rows.find(r => r.name === name);
			if (!f || f.fieldname === 'name') return;

			if (zone === OUT) {
				f.show_in_panel = 0;
			} else {
				f.show_in_panel = 1;
				f.panel_section = zone;
			}

			rows.splice(rows.indexOf(f), 1);
			let pos = before_name ? rows.findIndex(r => r.name === before_name) : -1;
			if (pos < 0) {
				const members = rows.filter(r => this.zone_of(frm, r) === zone);
				pos = members.length ? rows.indexOf(members[members.length - 1]) + 1 : rows.length;
			}
			rows.splice(pos, 0, f);
			this.renumber(rows);
			this.changed(frm);
		},

		move_section(frm, name, before_name) {
			const rows = frm.doc.sections || [];
			const s = rows.find(r => r.name === name);
			if (!s || name === before_name) return;
			rows.splice(rows.indexOf(s), 1);
			const pos = before_name ? rows.findIndex(r => r.name === before_name) : -1;
			rows.splice(pos < 0 ? rows.length : pos, 0, s);
			this.renumber(rows);
			this.changed(frm);
		},

		remove_row(frm, doctype, name, table) {
			frappe.model.clear_doc(doctype, name);
			this.renumber(frm.doc[table] || []);
			this.changed(frm);
		},

		// ── Rendering ────────────────────────────────────────────────────────────
		render(frm) {
			const field = frm.fields_dict.layout_preview;
			if (!field) return;
			const $w = field.$wrapper;
			const rows = frm.doc.field_config || [];
			const sections = frm.doc.sections || [];
			const keys = sections.map(s => s.section_key);
			const in_zone = zone => rows.filter(f => this.zone_of(frm, f) === zone);

			// Order mirrors the portal: declared sections, then fields with no section
			// ("Informações"), then fields pointing at undefined sections
			let cards = sections.map(s => this.section_card_html(frm, s, in_zone(s.section_key))).join('');
			const orphans = [...new Set(rows.map(f => this.zone_of(frm, f)).filter(z => z && z !== OUT && !keys.includes(z)))];

			const loose = in_zone('');
			const extra_cards =
				(loose.length ? this.zone_card_html(frm, '', __('Sem secção'), __('Aparece no portal como «Informações».'), loose) : '') +
				orphans.map(k => this.zone_card_html(frm, k, k,
					__('Secção não definida: aparece no fim, sem ícone.'), in_zone(k), true)).join('');

			const out = in_zone(OUT);
			const table = rows.filter(f => f.show_in_table);
			const header = rows.filter(f => f.source === 'turma' && f.show_in_header);
			const summary = (title, list) => `
				<div class="pe-summary-block">
					<div class="pe-summary-title">${esc(title)}</div>
					${list.length
						? list.map(f => `<span class="pe-chip">${esc(f.label || f.fieldname)}</span>`).join('')
						: `<span class="pe-muted">${__('Nenhum')}</span>`}
				</div>`;

			$w.html(`
				<div class="pe">
					<div class="pe-toolbar">
						<input type="search" class="form-control input-sm pe-search" placeholder="${__('Procurar campo...')}" value="${esc(frm.__pe_query || '')}">
						<button class="btn btn-default btn-sm pe-add-fields" data-zone="${SUGGESTED}">+ ${__('Campos')}</button>
						<button class="btn btn-default btn-sm pe-add-section">+ ${__('Secção')}</button>
						${frm.is_dirty() ? `<span class="pe-dirty">${__('Alterações por guardar (Ctrl+S)')}</span>` : ''}
					</div>
					<div class="pe-hint">${__('Arraste ⋮⋮ para mover campos e secções. Clique nos botões de cada campo para ligar ou desligar.')}</div>
					<div class="pe-layout">
						<div>
							<div class="pe-label-title">${__('Painel do catecúmeno')}</div>
							<div class="pe-sections">${cards || `<div class="pe-muted pe-pad">${__('Ainda não há secções.')}</div>`}</div>
							${extra_cards}
							${this.zone_card_html(frm, OUT, __('Fora do painel'),
								__('Não aparecem no painel; podem ser colunas da tabela ou estar no cabeçalho da turma.'), out)}
						</div>
						<div class="pe-summary">
							<div class="pe-label-title">${__('Lista e turma')}</div>
							${summary(__('Colunas da tabela'), table)}
							${summary(__('Cabeçalho da turma'), header)}
						</div>
					</div>
				</div>`);

			this.apply_search($w, frm.__pe_query);
			this.bind(frm, $w);
		},

		section_card_html(frm, s, fields) {
			const icons = SECTION_ICONS.map(i =>
				`<option value="${esc(i)}" ${i === (s.icon || '') ? 'selected' : ''}>${esc(i || __('Sem ícone'))}</option>`).join('');
			return `
				<div class="pe-card" data-section="${esc(s.name)}">
					<div class="pe-card-head">
						<span class="pe-handle" title="${__('Arrastar para reordenar')}">⋮⋮</span>
						<input class="pe-sec-label" data-section="${esc(s.name)}" value="${esc(s.label || s.section_key)}" title="${__('Nome da secção')}">
						<select class="pe-sec-icon" data-section="${esc(s.name)}" title="${__('Ícone')}">${icons}</select>
						<span class="pe-count">${__('{0} campo(s)', [fields.length])}</span>
						<button class="btn btn-xs btn-default pe-add-fields" data-zone="${esc(s.section_key)}">+ ${__('Campo')}</button>
						<button class="btn btn-xs btn-default pe-del-section" data-section="${esc(s.name)}" title="${__('Remover secção')}">✕</button>
					</div>
					${this.zone_html(frm, s.section_key, fields)}
				</div>`;
		},

		zone_card_html(frm, zone, title, note, fields, can_define) {
			return `
				<div class="pe-card pe-card-alt">
					<div class="pe-card-head">
						<strong class="pe-card-title">${esc(title)}</strong>
						<span class="pe-count">${__('{0} campo(s)', [fields.length])}</span>
						${can_define ? `<button class="btn btn-xs btn-default pe-define-section" data-zone="${esc(zone)}">${__('Criar esta secção')}</button>` : ''}
						${zone === OUT ? `<button class="btn btn-xs btn-default pe-add-fields" data-zone="${OUT}">+ ${__('Campo')}</button>` : ''}
					</div>
					<div class="pe-note">${esc(note)}</div>
					${this.zone_html(frm, zone, fields)}
				</div>`;
		},

		zone_html(frm, zone, fields) {
			return `<div class="pe-zone" data-zone="${esc(zone)}">
				${fields.map(f => this.field_html(frm, f)).join('')
					|| `<div class="pe-empty">${__('Arraste campos para aqui')}</div>`}
			</div>`;
		},

		field_html(frm, f) {
			const is_name = f.fieldname === 'name';
			const is_turma = f.source === 'turma';
			const in_panel = this.zone_of(frm, f) !== OUT;
			const toggle = (prop, label, title, on) =>
				`<button class="pe-toggle ${on ? 'on' : ''}" data-row="${esc(f.name)}" data-prop="${prop}" title="${esc(title)}">${esc(label)}</button>`;

			const zone = this.zone_of(frm, f);
			const keys = this.section_keys(frm);
			const zone_options = [
				...keys.map(k => [k, k]),
				...(!keys.includes(zone) && zone !== '' && zone !== OUT ? [[zone, zone]] : []),
				['', __('Sem secção')],
				[OUT, __('Fora do painel')],
			].map(([v, l]) => `<option value="${esc(v)}" ${v === zone ? 'selected' : ''}>${esc(l)}</option>`).join('');

			const widths = TABLE_WIDTHS.map(([v, l]) =>
				`<option value="${v}" ${v === (f.column_width || 'sm') ? 'selected' : ''}>${esc(l)}</option>`).join('');

			return `
				<div class="pe-field" data-row="${esc(f.name)}" data-search="${esc(`${f.label} ${f.fieldname}`.toLowerCase())}">
					${is_name ? '<span class="pe-handle pe-handle-off">⋮⋮</span>' : `<span class="pe-handle" title="${__('Arrastar para mover')}">⋮⋮</span>`}
					<div class="pe-field-main">
						<div class="pe-line">
							<input class="pe-field-label" data-row="${esc(f.name)}" value="${esc(f.label)}" title="${__('Etiqueta mostrada no portal')}">
							<span class="pe-meta">${esc(f.fieldname)} · ${esc(f.fieldtype || 'Data')}</span>
							${SOURCE_BADGES[f.source] ? `<span class="pe-badge">${esc(SOURCE_BADGES[f.source])}</span>` : ''}
							${is_name ? `<span class="pe-badge">${__('Título do painel')}</span>` : ''}
						</div>
						<div class="pe-line pe-controls">
							${is_name ? '' : `<select class="pe-zone-select" data-row="${esc(f.name)}" title="${__('Mover para')}">${zone_options}</select>`}
							${toggle('show_in_table', __('Tabela'), __('Mostrar como coluna na lista de catecúmenos'), f.show_in_table)}
							${f.show_in_table ? `<select class="pe-width" data-row="${esc(f.name)}" title="${__('Largura da coluna')}">${widths}</select>` : ''}
							${!is_turma && !is_name ? toggle('editable', __('Editável'), __('O catequista pode alterar este campo'), f.editable) : ''}
							${is_turma ? toggle('show_in_header', __('Cabeçalho'), __('Mostrar no cabeçalho da turma'), f.show_in_header) : ''}
							${in_panel && !is_name ? toggle('col_span', __('½ largura'), __('Ocupa meia largura no painel (dois campos por linha)'), String(f.col_span) === '1') : ''}
						</div>
					</div>
					${is_name ? '' : `<button class="pe-remove" data-row="${esc(f.name)}" title="${__('Remover do portal')}">✕</button>`}
				</div>`;
		},

		apply_search($w, query) {
			const q = (query || '').toLowerCase().trim();
			$w.find('.pe-field').each((_, el) => { el.style.display = !q || el.dataset.search.includes(q) ? '' : 'none'; });
		},

		// ── Interaction ──────────────────────────────────────────────────────────
		bind(frm, $w) {
			$w.off('.pe');
			const field_row = name => (frm.doc.field_config || []).find(r => r.name === name);
			const section_row = name => (frm.doc.sections || []).find(r => r.name === name);

			$w.on('input.pe', '.pe-search', e => {
				frm.__pe_query = e.target.value;
				this.apply_search($w, frm.__pe_query);
			});

			$w.on('click.pe', '.pe-add-fields', e => {
				e.preventDefault();
				this.open_field_picker(frm, e.currentTarget.dataset.zone);
			});

			$w.on('click.pe', '.pe-add-section', e => {
				e.preventDefault();
				const key = this.add_section(frm);
				this.changed(frm);
				const $input = $w.find('.pe-sec-label').filter((_, el) => el.value === key);
				$input.trigger('focus').trigger('select');
			});

			$w.on('click.pe', '.pe-define-section', e => {
				e.preventDefault();
				this.add_section(frm, e.currentTarget.dataset.zone);
				this.changed(frm);
			});

			$w.on('change.pe', '.pe-sec-label', e => {
				const s = section_row(e.target.dataset.section);
				if (s && this.rename_section(frm, s, e.target.value)) this.changed(frm);
				else this.render(frm);
			});

			$w.on('change.pe', '.pe-sec-icon', e => {
				const s = section_row(e.target.dataset.section);
				if (s) { s.icon = e.target.value; this.changed(frm); }
			});

			$w.on('click.pe', '.pe-del-section', e => {
				e.preventDefault();
				const s = section_row(e.currentTarget.dataset.section);
				if (!s) return;
				const count = (frm.doc.field_config || []).filter(f => f.show_in_panel && f.panel_section === s.section_key).length;
				const remove = () => {
					this.release_section_fields(frm, s);
					this.remove_row(frm, s.doctype, s.name, 'sections');
				};
				if (!count) return remove();
				frappe.confirm(
					__('Remover a secção «{0}»? Os seus {1} campo(s) ficam sem secção.', [s.label || s.section_key, count]),
					remove,
				);
			});

			$w.on('keydown.pe', '.pe-sec-label, .pe-field-label', e => {
				if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
			});

			$w.on('change.pe', '.pe-field-label', e => {
				const f = field_row(e.target.dataset.row);
				const label = e.target.value.trim();
				if (f && label) { f.label = label; this.changed(frm); } else this.render(frm);
			});

			$w.on('click.pe', '.pe-toggle', e => {
				e.preventDefault();
				const f = field_row(e.currentTarget.dataset.row);
				if (!f) return;
				const prop = e.currentTarget.dataset.prop;
				if (prop === 'col_span') f.col_span = String(f.col_span) === '1' ? '2' : '1';
				else f[prop] = f[prop] ? 0 : 1;
				this.changed(frm);
			});

			$w.on('change.pe', '.pe-zone-select', e => this.move_field(frm, e.target.dataset.row, e.target.value, null));

			$w.on('change.pe', '.pe-width', e => {
				const f = field_row(e.target.dataset.row);
				if (f) { f.column_width = e.target.value; this.changed(frm); }
			});

			$w.on('click.pe', '.pe-remove', e => {
				e.preventDefault();
				const f = field_row(e.currentTarget.dataset.row);
				if (f) this.remove_row(frm, f.doctype, f.name, 'field_config');
			});

			this.bind_drag(frm, $w);
		},

		// Native drag & drop. Rows only become draggable while their ⋮⋮ handle is held,
		// so the inputs and buttons inside them keep working normally.
		bind_drag(frm, $w) {
			const ph = document.createElement('div');
			ph.className = 'pe-placeholder';
			let drag = null;

			const insert_at = (container, selector, y) => {
				const items = [...container.querySelectorAll(`:scope > ${selector}:not(.pe-dragging)`)];
				const next = items.find(el => {
					const b = el.getBoundingClientRect();
					return y < b.top + b.height / 2;
				});
				ph.classList.toggle('pe-placeholder-section', selector === '.pe-card');
				if (next) container.insertBefore(ph, next);
				else container.appendChild(ph);
			};
			const next_after_placeholder = selector => {
				let el = ph.nextElementSibling;
				while (el && (!el.matches(selector) || el.classList.contains('pe-dragging'))) el = el.nextElementSibling;
				return el;
			};

			$w.on('mousedown.pe', '.pe-handle:not(.pe-handle-off)', e => {
				$(e.currentTarget).closest('.pe-field, .pe-card[data-section]').attr('draggable', 'true');
			});
			$w.on('mouseup.pe', '.pe-handle', e => {
				$(e.currentTarget).closest('[draggable]').removeAttr('draggable');
			});

			$w.on('dragstart.pe', '[draggable="true"]', e => {
				e.stopPropagation();
				const el = e.currentTarget;
				const is_section = el.classList.contains('pe-card');
				drag = { kind: is_section ? 'section' : 'field', name: is_section ? el.dataset.section : el.dataset.row };
				e.originalEvent.dataTransfer.effectAllowed = 'move';
				e.originalEvent.dataTransfer.setData('text/plain', drag.name);
				setTimeout(() => el.classList.add('pe-dragging'));
			});

			$w.on('dragend.pe', '[draggable]', e => {
				e.currentTarget.removeAttribute('draggable');
				e.currentTarget.classList.remove('pe-dragging');
				ph.remove();
				drag = null;
			});

			$w.on('dragover.pe', '.pe-zone', e => {
				if (!drag || drag.kind !== 'field') return;
				e.preventDefault();
				e.stopPropagation();
				insert_at(e.currentTarget, '.pe-field', e.originalEvent.clientY);
			});
			$w.on('drop.pe', '.pe-zone', e => {
				if (!drag || drag.kind !== 'field') return;
				e.preventDefault();
				e.stopPropagation();
				const next = next_after_placeholder('.pe-field');
				const { name } = drag;
				drag = null;
				this.move_field(frm, name, e.currentTarget.dataset.zone, next ? next.dataset.row : null);
			});

			$w.on('dragover.pe', '.pe-sections', e => {
				if (!drag || drag.kind !== 'section') return;
				e.preventDefault();
				insert_at(e.currentTarget, '.pe-card', e.originalEvent.clientY);
			});
			$w.on('drop.pe', '.pe-sections', e => {
				if (!drag || drag.kind !== 'section') return;
				e.preventDefault();
				const next = next_after_placeholder('.pe-card');
				const { name } = drag;
				drag = null;
				this.move_section(frm, name, next ? next.dataset.section : null);
			});
		},

		// ── Field picker ─────────────────────────────────────────────────────────
		open_field_picker(frm, zone) {
			frappe.call({
				method: 'portal.api.get_portal_field_candidates',
				freeze: true,
				freeze_message: __('A carregar campos...'),
				callback: r => r.message && this.show_field_picker(frm, r.message, zone),
			});
		},

		show_field_picker(frm, groups, zone) {
			// Use the form's current rows (including unsaved ones) to mark what's already there
			const configured = new Set((frm.doc.field_config || []).map(f => f.fieldname));
			const by_key = {};
			groups.forEach(g => g.fields.forEach(f => { by_key[`${f.source}:${f.fieldname}`] = f; }));

			const d = new frappe.ui.Dialog({
				title: __('Adicionar Campos'),
				size: 'large',
				fields: [
					{ fieldname: 'search', fieldtype: 'Data', placeholder: __('Procurar campo...') },
					{ fieldname: 'list', fieldtype: 'HTML' },
					{ fieldtype: 'Section Break' },
					{
						fieldname: 'target', fieldtype: 'Select', label: __('Adicionar a'),
						options: [
							{ value: SUGGESTED, label: __('Secção sugerida para cada campo') },
							...this.section_keys(frm).map(k => ({ value: k, label: k })),
							{ value: '', label: __('Sem secção') },
							{ value: OUT, label: __('Fora do painel') },
							{ value: NEW_SECTION, label: __('+ Nova secção...') },
						],
						default: zone == null ? SUGGESTED : zone,
						description: __('Depois de adicionados, ajuste cada campo directamente no editor.'),
					},
					{ fieldtype: 'Column Break' },
					{
						fieldname: 'new_section', fieldtype: 'Data', label: __('Nome da nova secção'),
						depends_on: `eval:doc.target=='${NEW_SECTION}'`,
						mandatory_depends_on: `eval:doc.target=='${NEW_SECTION}'`,
					},
				],
				primary_action_label: __('Adicionar'),
				primary_action: values => {
					const picked = [...d.$wrapper.find('.pf-check:checked:not(:disabled)')].map(el => by_key[el.dataset.key]);
					if (!picked.length) {
						frappe.msgprint(__('Escolha pelo menos um campo.'));
						return;
					}
					let target = values.target;
					if (target === NEW_SECTION) {
						if (!(values.new_section || '').trim()) return;
						target = this.add_section(frm, values.new_section);
					}
					picked.forEach(c => {
						const row = Object.assign({}, c);
						delete row.configured;
						if (target === OUT) {
							row.show_in_panel = 0;
						} else if (target !== SUGGESTED) {
							row.show_in_panel = 1;
							row.panel_section = target;
						}
						frm.add_child('field_config', row);
					});
					d.hide();
					this.changed(frm);
					frappe.show_alert({ message: __('{0} campo(s) adicionado(s). Guarde para aplicar.', [picked.length]), indicator: 'green' });
				},
			});

			const $list = d.fields_dict.list.$wrapper;
			$list.html(this.picker_html(groups, configured));

			const update_count = () => {
				const n = $list.find('.pf-check:checked:not(:disabled)').length;
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
				$list.find('.pf-row').each((_, row) => { $(row).toggle(!q || row.dataset.search.includes(q)); });
				$list.find('.pf-group').each((_, g) => {
					$(g).toggle($(g).find('.pf-row').filter((_, r) => r.style.display !== 'none').length > 0);
				});
			});

			d.show();
		},

		picker_html(groups, configured) {
			const html = groups.map(g => {
				const available = g.fields.filter(f => !configured.has(f.fieldname)).length;
				const rows = g.fields.map(f => {
					const done = configured.has(f.fieldname);
					return `
						<label class="pf-row" data-search="${esc(`${f.label} ${f.fieldname}`.toLowerCase())}"
							style="display:flex;align-items:center;gap:10px;padding:6px 8px;margin:0;border-radius:6px;cursor:${done ? 'default' : 'pointer'};${done ? 'opacity:.55;' : ''}">
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
							<strong>${esc(SOURCE_LABELS[g.source] || g.label)}</strong>
							<span class="text-muted small">
								${__('{0} disponíveis', [available])}
								${available ? ` · <a href="#" class="pf-select-all">${__('Selecionar todos')}</a>` : ''}
							</span>
						</div>
						${rows || `<div class="text-muted small" style="padding:6px 8px">${__('Sem campos.')}</div>`}
					</div>`;
			}).join('');
			return `<div style="max-height:50vh;overflow-y:auto;padding-right:4px">${html}</div>`;
		},

		// ── Styles ───────────────────────────────────────────────────────────────
		inject_styles() {
			if (document.getElementById('portal-settings-editor-css')) return;
			const style = document.createElement('style');
			style.id = 'portal-settings-editor-css';
			style.textContent = `
				.pe { font-size: 13px; }
				.pe-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 6px; }
				.pe-toolbar .pe-search { max-width: 260px; }
				.pe-dirty { margin-left: auto; color: var(--orange-600, #c2410c); font-weight: 500; font-size: 12px; }
				.pe-hint, .pe-note, .pe-muted, .pe-meta, .pe-count { color: var(--text-muted); font-size: 12px; }
				.pe-hint { margin-bottom: 14px; }
				.pe-pad { padding: 8px 0; }
				.pe-layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 20px; align-items: start; }
				@media (max-width: 991px) { .pe-layout { grid-template-columns: 1fr; } }
				.pe-label-title { font-weight: 600; margin-bottom: 8px; }
				.pe-card { border: 1px solid var(--border-color); border-radius: 10px; background: var(--card-bg, var(--fg-color)); margin-bottom: 12px; }
				.pe-card-alt { border-style: dashed; background: transparent; }
				.pe-card.pe-dragging, .pe-field.pe-dragging { opacity: .35; }
				.pe-card-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
				.pe-card-alt .pe-card-head { border-bottom: 0; padding-bottom: 2px; }
				.pe-card-title { flex: 1; }
				.pe-note { padding: 0 10px 6px; }
				.pe-sec-label { flex: 1; min-width: 120px; font-weight: 600; border: 1px solid transparent; border-radius: 6px; padding: 3px 6px; background: transparent; color: var(--text-color); }
				.pe-sec-label:hover, .pe-sec-label:focus { border-color: var(--border-color); background: var(--control-bg); outline: none; }
				.pe-sec-icon, .pe-zone-select, .pe-width { border: 1px solid var(--border-color); border-radius: 6px; background: var(--control-bg); color: var(--text-color); font-size: 12px; padding: 2px 4px; height: 26px; }
				.pe-zone { padding: 6px; min-height: 44px; }
				.pe-empty { color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px; border: 1px dashed var(--border-color); border-radius: 8px; }
				.pe-field { display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; border-radius: 8px; border: 1px solid transparent; }
				.pe-field:hover { background: var(--control-bg); border-color: var(--border-color); }
				.pe-field + .pe-field { margin-top: 2px; }
				.pe-handle { cursor: grab; color: var(--text-muted); user-select: none; padding: 4px 2px; line-height: 1; letter-spacing: -2px; }
				.pe-handle-off { cursor: default; opacity: .3; }
				.pe-field-main { flex: 1; min-width: 0; }
				.pe-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
				.pe-controls { margin-top: 4px; }
				.pe-field-label { font-weight: 500; border: 1px solid transparent; border-radius: 6px; padding: 2px 6px; margin-left: -6px; background: transparent; color: var(--text-color); min-width: 80px; max-width: 100%; }
				.pe-field-label:hover, .pe-field-label:focus { border-color: var(--border-color); background: var(--fg-color); outline: none; }
				.pe-badge { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--bg-blue, #e0f2fe); color: var(--text-on-blue, #075985); }
				.pe-toggle { font-size: 12px; padding: 2px 9px; height: 26px; border-radius: 999px; border: 1px solid var(--border-color); background: var(--fg-color); color: var(--text-muted); cursor: pointer; }
				.pe-toggle:hover { color: var(--text-color); }
				.pe-toggle.on { background: var(--primary, #2490ef); border-color: var(--primary, #2490ef); color: #fff; }
				.pe-remove { border: 0; background: transparent; color: var(--text-muted); cursor: pointer; padding: 2px 6px; border-radius: 6px; }
				.pe-remove:hover { color: var(--red-600, #dc2626); background: var(--control-bg); }
				.pe-placeholder { height: 34px; border: 2px dashed var(--primary, #2490ef); border-radius: 8px; margin: 2px 0; opacity: .6; }
				.pe-placeholder-section { height: 56px; margin-bottom: 12px; }
				.pe-summary-block { margin-bottom: 14px; }
				.pe-summary-title { color: var(--text-muted); font-size: 12px; margin-bottom: 6px; }
				.pe-chip { display: inline-block; padding: 2px 9px; margin: 0 6px 6px 0; border-radius: 999px; background: var(--control-bg); border: 1px solid var(--border-color); font-size: 12px; }
			`;
			document.head.appendChild(style);
		},
	};
})();

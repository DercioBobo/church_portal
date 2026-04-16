frappe.ui.form.on('Catequista Aviso', {
	refresh(frm) {
		frm.add_custom_button(__('Prévia'), function () {
			show_aviso_preview(frm);
		}).addClass('btn-primary');

		load_aviso_stats(frm);
	},

	modo_exibicao(frm) {
		if (frm.doc.modo_exibicao === 'Cada login' && !frm.doc.data_fim) {
			frm.set_value('data_fim', frappe.datetime.add_days(frappe.datetime.get_today(), 30));
			frappe.show_alert({
				message: __('Data de fim definida para 30 dias (limite automático para "Cada login"). Pode alterar se necessário.'),
				indicator: 'blue',
			}, 5);
		}
	},
});

// ── Statistics ────────────────────────────────────────────────────────────────

function load_aviso_stats(frm) {
	if (frm.is_new()) {
		frm.set_df_property('stats_html', 'options',
			'<p style="color:#94a3b8;font-size:13px;padding:4px 0;">Guarde o documento para ver as estatísticas.</p>'
		);
		frm.refresh_field('stats_html');
		return;
	}

	frm.set_df_property('stats_html', 'options',
		'<p style="color:#94a3b8;font-size:13px;padding:4px 0;">A carregar…</p>'
	);
	frm.refresh_field('stats_html');

	frappe.call({
		method: 'portal.api.get_aviso_stats',
		args: { aviso_name: frm.doc.name },
		callback(r) {
			const html = build_stats_html(r.message || {});
			frm.set_df_property('stats_html', 'options', html);
			frm.refresh_field('stats_html');
		},
	});
}

function build_stats_html(data) {
	const leram          = data.leram      || [];
	const naoLeram       = data.nao_leram  || [];
	const totalAudiencia = data.total_audiencia || 0;

	/* ── Full empty state (no logs, no known audience) ── */
	if (!leram.length && !totalAudiencia) {
		return `
			<div style="padding:24px 0;text-align:center;">
				<div style="font-size:28px;margin-bottom:8px;opacity:0.4;">👁</div>
				<p style="font-size:13px;color:#94a3b8;margin:0;">
					Nenhum catequista viu este aviso ainda.
				</p>
			</div>`;
	}

	/* ── Summary badges ── */
	const totalViews  = leram.reduce((s, r) => s + (r.visualizacoes || 0), 0);
	const leramCount  = leram.length;
	const ratio       = totalAudiencia ? `${leramCount} / ${totalAudiencia}` : String(leramCount);

	const pendenteBadge = naoLeram.length ? `
		<div style="padding:10px 16px;background:#fff7ed;border:1px solid #fed7aa;
			border-radius:8px;display:flex;align-items:center;gap:8px;">
			<span style="font-size:18px;line-height:1;">⏳</span>
			<div>
				<div style="font-size:20px;font-weight:700;color:#c2410c;line-height:1.1;">
					${naoLeram.length}
				</div>
				<div style="font-size:10px;color:#fb923c;text-transform:uppercase;
					letter-spacing:0.06em;margin-top:1px;">
					Pendentes
				</div>
			</div>
		</div>` : '';

	const badges = `
		<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
			<div style="padding:10px 16px;background:#f0fdf4;border:1px solid #bbf7d0;
				border-radius:8px;display:flex;align-items:center;gap:8px;">
				<span style="font-size:18px;line-height:1;">👁</span>
				<div>
					<div style="font-size:20px;font-weight:700;color:#166534;line-height:1.1;">
						${ratio}
					</div>
					<div style="font-size:10px;color:#4ade80;text-transform:uppercase;
						letter-spacing:0.06em;margin-top:1px;">
						Leram
					</div>
				</div>
			</div>
			${pendenteBadge}
			<div style="padding:10px 16px;background:#eff6ff;border:1px solid #bfdbfe;
				border-radius:8px;display:flex;align-items:center;gap:8px;">
				<span style="font-size:18px;line-height:1;">🔁</span>
				<div>
					<div style="font-size:20px;font-weight:700;color:#1e40af;line-height:1.1;">
						${totalViews}
					</div>
					<div style="font-size:10px;color:#60a5fa;text-transform:uppercase;
						letter-spacing:0.06em;margin-top:1px;">
						Visualizações
					</div>
				</div>
			</div>
		</div>`;

	/* ── "Leram" table ── */
	const leramTable = leram.length ? (() => {
		const rows = leram.map(row => {
			const views = row.visualizacoes || 0;
			const dt    = row.ultima_visualizacao
				? frappe.datetime.str_to_user(row.ultima_visualizacao)
				: '—';
			const countColor = views >= 3 ? '#16a34a' : views >= 2 ? '#2563eb' : '#64748b';
			const repeatBadge = views > 1
				? `<span style="margin-left:4px;font-size:10px;padding:1px 5px;background:#eff6ff;
					color:#3b82f6;border-radius:4px;font-weight:600;">${views}×</span>`
				: '';
			return `
				<tr style="border-bottom:1px solid #f1f5f9;">
					<td style="padding:9px 12px;font-size:13px;color:#0f172a;font-weight:500;">
						${frappe.utils.escape_html(row.catequista)}
					</td>
					<td style="padding:9px 12px;text-align:center;">
						<span style="font-size:13px;font-weight:600;color:${countColor};">
							${views}${repeatBadge}
						</span>
					</td>
					<td style="padding:9px 12px;font-size:12px;color:#64748b;white-space:nowrap;">
						${frappe.utils.escape_html(dt)}
					</td>
				</tr>`;
		}).join('');

		return `
			<p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;
				letter-spacing:0.08em;margin:0 0 8px;">Leram</p>
			<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
				<table style="width:100%;border-collapse:collapse;">
					<thead>
						<tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
							<th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;
								color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Catequista</th>
							<th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;
								color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Visualizações</th>
							<th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;
								color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Última Leitura</th>
						</tr>
					</thead>
					<tbody>${rows}</tbody>
				</table>
			</div>`;
	})() : '';

	/* ── "Ainda não viram" section ── */
	const naoLeramSection = (() => {
		if (!totalAudiencia) return ''; // audience unknown — nothing to show

		if (!naoLeram.length) {
			return `
				<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
					background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
					<span style="font-size:15px;line-height:1;">✅</span>
					<span style="font-size:13px;color:#166534;font-weight:500;">
						Todos os destinatários já viram este aviso.
					</span>
				</div>`;
		}

		const chips = naoLeram.map(name => `
			<span style="display:inline-block;padding:4px 10px;background:#fff7ed;
				border:1px solid #fed7aa;border-radius:20px;font-size:12px;
				color:#9a3412;font-weight:500;">
				${frappe.utils.escape_html(name)}
			</span>`).join('');

		return `
			<p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;
				letter-spacing:0.08em;margin:0 0 8px;">Ainda não viram</p>
			<div style="display:flex;flex-wrap:wrap;gap:6px;">
				${chips}
			</div>`;
	})();

	return `<div style="padding:4px 0 10px;">${badges}${leramTable}${naoLeramSection}</div>`;
}

function show_aviso_preview(frm) {
	const titulo   = frm.doc.titulo   || '(sem título)';
	const mensagem = frm.doc.mensagem || '(sem mensagem)';
	const isUrgente = frm.doc.prioridade === 'Urgente';
	const isAtivo   = frm.doc.ativo;

	/* ── Colours matching the portal AvisoModal ── */
	const stripeColor  = isUrgente ? '#ef4444' : '#f59e0b';
	const cardBorder   = isUrgente ? 'border:2px solid #fca5a5' : 'border:1px solid #e2d9c9';
	const cardBg       = isUrgente ? '#fff1f2' : '#ffffff';
	const titleColor   = isUrgente ? '#4c0519'  : '#0f172a';
	const btnBg        = isUrgente ? '#dc2626'  : '#0f172a';

	/* ── Urgente badge (SVG AlertCircle) ── */
	const urgenteBadge = isUrgente ? `
		<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
				stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
				style="flex-shrink:0;">
				<circle cx="12" cy="12" r="10"/>
				<line x1="12" y1="8" x2="12" y2="12"/>
				<line x1="12" y1="16" x2="12.01" y2="16"/>
			</svg>
			<span style="font-size:11px;font-weight:700;color:#dc2626;
				text-transform:uppercase;letter-spacing:0.08em;">Urgente</span>
		</div>` : '';

	/* ── "Not active" warning shown above the card ── */
	const inactiveBanner = !isAtivo ? `
		<div style="margin-bottom:14px;padding:9px 13px;background:#fef9c3;
			border:1px solid #fde047;border-radius:8px;font-size:12px;color:#713f12;
			display:flex;align-items:flex-start;gap:7px;">
			<span style="flex-shrink:0;line-height:1.5;">⚠️</span>
			<span>Este aviso está <strong>inactivo</strong> — não será exibido
			aos catequistas até ser activado.</span>
		</div>` : '';

	/* ── Attachment button ── */
	const anexo = frm.doc.anexo || '';
	const anexoLabel = frm.doc.anexo_label || 'Descarregar Circular';
	const anexoBtn = anexo ? `
		<div style="padding:0 24px 12px;">
			<a href="${frappe.utils.escape_html(anexo)}" target="_blank" rel="noopener noreferrer"
				style="display:flex;align-items:center;justify-content:center;gap:8px;
					width:100%;padding:10px 16px;border-radius:10px;
					border:1px solid ${isUrgente ? '#fecdd3' : '#e2e8f0'};
					color:${isUrgente ? '#be123c' : '#334155'};
					font-size:14px;font-weight:600;text-decoration:none;
					background:${isUrgente ? '#fff1f2' : '#f8fafc'};">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
					stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
					<polyline points="7 10 12 15 17 10"/>
					<line x1="12" y1="15" x2="12" y2="3"/>
				</svg>
				${frappe.utils.escape_html(anexoLabel)}
			</a>
		</div>` : '';

	/* ── Targeting label ── */
	const tipo = frm.doc.tipo_destinatario || 'Todos';
	let targetLabel = 'Todos os catequistas';
	if (tipo === 'Por Fase' && frm.doc.fase_destino) {
		targetLabel = `Catequistas da <strong>${frappe.utils.escape_html(frm.doc.fase_destino)}</strong>`;
	} else if (tipo === 'Por Turma' && frm.doc.turma_destino) {
		targetLabel = `Turma <strong>${frappe.utils.escape_html(frm.doc.turma_destino)}</strong>`;
	} else if (tipo === 'Individuais') {
		const n = (frm.doc.destinatarios || []).length;
		targetLabel = n
			? `${n} catequista${n !== 1 ? 's' : ''} específico${n !== 1 ? 's' : ''}`
			: '<span style="color:#ef4444;">Nenhum catequista adicionado</span>';
	}

	/* ── Metadata bar (target · mode · views · expiry) ── */
	const metaParts = [
		`Para: <strong>${targetLabel}</strong>`,
		`Modo: <strong>${frappe.utils.escape_html(frm.doc.modo_exibicao || '—')}</strong>`,
	];
	if (frm.doc.modo_exibicao === 'N vezes') {
		metaParts.push(`Exibições: <strong>${frm.doc.nr_exibicoes || 3}×</strong>`);
	}
	if (frm.doc.data_fim) {
		metaParts.push(`Expira: <strong>${frappe.datetime.str_to_user(frm.doc.data_fim)}</strong>`);
	}
	const metaBar = `
		<div style="margin-top:10px;text-align:center;font-size:12px;color:#94a3b8;line-height:1.8;">
			${metaParts.join(' &nbsp;·&nbsp; ')}
		</div>`;

	/* ── Scoped rich-text styles (mirrors .aviso-richtext in globals.css) ── */
	const richTextStyles = `
		<style>
			.avp-body p            { margin-bottom: 0.55em; }
			.avp-body p:last-child { margin-bottom: 0; }
			.avp-body ul           { list-style-type: disc;    padding-left: 1.4em; margin-bottom: 0.55em; }
			.avp-body ol           { list-style-type: decimal; padding-left: 1.4em; margin-bottom: 0.55em; }
			.avp-body li           { margin-bottom: 0.2em; }
			.avp-body strong       { font-weight: 700; }
			.avp-body em           { font-style: italic; }
			.avp-body u            { text-decoration: underline; text-underline-offset: 2px; }
			.avp-body a            { color: #2563eb; text-decoration: underline; }
			.avp-body h1           { font-size: 1.15em; font-weight: 700; margin-bottom: 0.35em; }
			.avp-body h2           { font-size: 1.05em; font-weight: 700; margin-bottom: 0.3em; }
			.avp-body h3           { font-size: 1em;    font-weight: 700; margin-bottom: 0.25em; }
			.avp-body blockquote   { border-left: 3px solid #e2e8f0; padding-left: 0.85em;
			                         color: #64748b; margin: 0.5em 0; }
		</style>`;

	/* ── Full preview card ── */
	const html = `
		${richTextStyles}
		<div style="padding:4px 0 8px;">
			${inactiveBanner}
			<div style="overflow:hidden;border-radius:12px;${cardBorder};background:${cardBg};
				font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
				box-shadow:0 4px 20px rgba(0,0,0,0.09);">

				<div style="height:6px;background:${stripeColor};"></div>

				<div style="padding:24px 24px 16px;">
					${urgenteBadge}
					<h2 style="font-size:18px;font-weight:700;color:${titleColor};
						margin:0 0 12px;line-height:1.35;">
						${frappe.utils.escape_html(titulo)}
					</h2>
					<div class="avp-body" style="font-size:14px;color:#475569;line-height:1.65;">
						${mensagem}
					</div>
				</div>

				${anexoBtn}
				<div style="padding:0 24px 24px;">
					<div style="padding:12px;border-radius:10px;background:${btnBg};
						color:#fff;font-size:14px;font-weight:600;text-align:center;
						opacity:0.75;user-select:none;">
						Compreendi
					</div>
				</div>
			</div>
			${metaBar}
		</div>`;

	const d = new frappe.ui.Dialog({
		title: __('Prévia do Aviso'),
		fields: [{ fieldtype: 'HTML', fieldname: 'preview_html', options: html }],
		primary_action_label: __('Fechar'),
		primary_action() { d.hide(); }
	});
	d.show();
}

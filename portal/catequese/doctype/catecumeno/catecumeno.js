// Catecumeno — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── Catecumenos Script ────────────────────────────────────────────────────

frappe.ui.form.on('Catecumeno', {
    refresh(frm) {
        update_concatenated_fields(frm);
    },

    nome_do_pai: update_concatenated_fields,
    nome_da_mae: update_concatenated_fields,
    contacto_do_pai: update_concatenated_fields,
    contacto_da_mae: update_concatenated_fields,
    padrinho: update_concatenated_fields,
    madrinha: update_concatenated_fields,
    contacto_do_padrinho: update_concatenated_fields,
    contacto_da_madrinha: update_concatenated_fields,
});

function update_concatenated_fields(frm) {
    // Nome do Encarregado
    const has_pais = frm.doc.nome_do_pai || frm.doc.nome_da_mae;
    const encarregado = [frm.doc.nome_do_pai, frm.doc.nome_da_mae].filter(Boolean).join(' e ');
    if (has_pais && encarregado !== frm.doc.encarregado) {
        frm.set_value('encarregado', encarregado);
    }

    // Contacto do Encarregado
    const has_contacto_pais = frm.doc.contacto_do_pai || frm.doc.contacto_da_mae;
    const contacto = [frm.doc.contacto_do_pai, frm.doc.contacto_da_mae].filter(Boolean).join(' / ');
    if (has_contacto_pais && contacto !== frm.doc.contacto) {
        frm.set_value('contacto', contacto);
    }

    // Padrinhos
    const has_padrinhos = frm.doc.padrinho || frm.doc.madrinha;
    const padrinhos = [frm.doc.padrinho, frm.doc.madrinha].filter(Boolean).join(' e ');
    if (has_padrinhos && padrinhos !== frm.doc.padrinhos) {
        frm.set_value('padrinhos', padrinhos);
    }

    // Contacto dos Padrinhos
    const has_contacto_padrinhos = frm.doc.contacto_do_padrinho || frm.doc.contacto_da_madrinha;
    const contacto_padrinhos = [frm.doc.contacto_do_padrinho, frm.doc.contacto_da_madrinha].filter(Boolean).join(' / ');
    if (has_contacto_padrinhos && contacto_padrinhos !== frm.doc.contacto_padrinhos) {
        frm.set_value('contacto_padrinhos', contacto_padrinhos);
    }
}

// ── Idade Catecumeno ──────────────────────────────────────────────────────

frappe.ui.form.on('Catecumeno', {
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

// ── Reactivar Catecumeno ──────────────────────────────────────────────────

// Client Script para Catecumeno - Alocar Turma (Pré-Inscrições)
// DocType: Catecumeno
// Adicionar ao Client Script existente do Catecumeno

// Este script adiciona o botão "Alocar Turma" para catecúmenos sem turma

frappe.ui.form.on('Catecumeno', {
    refresh(frm) {
        if (frm.is_new()) return;
        // Alocar Turma: sem turma e Pendente/Activo (o resumo no topo também tem o botão)
        if (!frm.doc.turma && ['Pendente', 'Activo'].includes(frm.doc.status)) {
            frm.add_custom_button(__('Alocar Turma'), () => alocar_turma(frm), __('Acções'));
        }
        // Reactivar: catecúmeno inactivo
        if (['Inactivo', 'Inativo'].includes(frm.doc.status)) {
            frm.add_custom_button(__('Reactivar Catecúmeno'), () => reactivar_catecumeno(frm), __('Acções'));
        }
    }
});

// Trigger para o botão no banner
frappe.ui.form.on('Catecumeno', 'alocar_turma_click', function(frm) {
    alocar_turma(frm);
});

function alocar_turma(frm) {
    // Verificar se tem fase
    if (!frm.doc.fase) {
        frappe.msgprint({
            title: __('Fase não definida'),
            indicator: 'orange',
            message: __('Por favor, defina a Fase do catecúmeno antes de alocar uma turma.')
        });
        return;
    }
    
    // Buscar turmas disponíveis
    frappe.call({
        method: 'portal.catequese.inscricao_utils.get_turmas_disponiveis',
        args: { fase: frm.doc.fase },
        callback: function(r) {
            let turmas = r.message || [];
            
            if (turmas.length === 0) {
                frappe.msgprint({
                    title: __('Sem Turmas Disponíveis'),
                    indicator: 'orange',
                    message: `Não existem turmas activas para a fase <strong>${frm.doc.fase}</strong>.<br><br>
                             Crie uma nova turma primeiro ou seleccione outra fase.`
                });
                return;
            }
            
            // Criar dialog com lista de turmas
            mostrar_dialog_alocar(frm, turmas);
        }
    });
}

function mostrar_dialog_alocar(frm, turmas) {
    // Gerar HTML das turmas
    let turmas_html = turmas.map(t => {
        return {
            label: `${t.name} - ${t.catequistas || 'Sem catequista'} (${t.total_catecumenos} catecúmenos) | ${t.dia || '-'} ${t.hora || ''}`,
            value: t.name
        };
    });
    
    let d = new frappe.ui.Dialog({
        title: `📚 Alocar Turma - ${frm.doc.name}`,
        size: 'large',
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'info_html',
                options: `
                    <div style="padding: 10px; background: #e8f5e9; border-radius: 8px; margin-bottom: 15px;">
                        <strong>Catecúmeno:</strong> ${frm.doc.name}<br>
                        <strong>Fase:</strong> ${frm.doc.fase}<br>
                        <strong>Idade:</strong> ${frm.doc.idade || '-'} anos
                    </div>
                `
            },
            {
                fieldtype: 'HTML',
                fieldname: 'turmas_preview',
                options: gerar_html_turmas_seleccao(turmas, '')
            },
            {
                fieldtype: 'Link',
                fieldname: 'turma',
                label: 'Seleccionar Turma',
                options: 'Turma',
                reqd: 1,
                get_query: function() {
                    return {
                        filters: {
                            fase: frm.doc.fase,
                            status: 'Activo'
                        }
                    };
                },
                change: function() {
                    let turma_sel = d.get_value('turma');
                    d.fields_dict.turmas_preview.df.options = gerar_html_turmas_seleccao(turmas, turma_sel);
                    d.fields_dict.turmas_preview.refresh();
                }
            }
        ],
        primary_action_label: __('Alocar'),
        primary_action: function(values) {
            if (!values.turma) {
                frappe.msgprint(__('Seleccione uma turma.'));
                return;
            }
            
            // Confirmar
            frappe.confirm(
                `Alocar <strong>${frm.doc.name}</strong> à turma <strong>${values.turma}</strong>?`,
                function() {
                    executar_alocacao(frm, values.turma, d);
                }
            );
        }
    });
    
    d.show();
    
    // Ajustar tamanho
    d.$wrapper.find('.modal-dialog').css('max-width', '700px');
}

function gerar_html_turmas_seleccao(turmas, turma_seleccionada) {
    let html = `<div style="max-height: 250px; overflow-y: auto; margin-bottom: 15px;">`;
    
    turmas.forEach(t => {
        let is_selected = t.name === turma_seleccionada;
        html += `
            <div style="
                padding: 12px;
                background: ${is_selected ? '#c8e6c9' : 'white'};
                border: 2px solid ${is_selected ? '#28a745' : '#dee2e6'};
                border-radius: 8px;
                margin-bottom: 8px;
                cursor: pointer;
            " onclick="cur_dialog.set_value('turma', '${t.name}')">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${t.name}</strong>
                        ${is_selected ? '<span class="badge badge-success" style="margin-left: 8px;">✓</span>' : ''}
                        <br>
                        <span style="font-size: 12px; color: #666;">
                            👨‍🏫 ${t.catequistas || 'Sem catequista'}<br>
                            📍 ${t.local || '-'} | ${t.dia || '-'} às ${t.hora || '-'}
                        </span>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 20px; font-weight: bold; color: #333;">${t.total_catecumenos}</div>
                        <div style="font-size: 11px; color: #666;">catecúmenos</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    return html;
}

function executar_alocacao(frm, turma, dialog) {
    frappe.call({
        method: 'portal.catequese.inscricao_utils.alocar_catecumeno_turma',
        args: {
            catecumeno: frm.doc.name,
            turma: turma
        },
        freeze: true,
        freeze_message: __('A alocar turma...'),
        callback: function(r) {
            if (r.message && r.message.success) {
                dialog.hide();
                
                frappe.show_alert({
                    message: __('Turma alocada com sucesso!'),
                    indicator: 'green'
                }, 5);
                
                frm.reload_doc();
            } else {
                frappe.msgprint({
                    title: __('Erro'),
                    indicator: 'red',
                    message: r.message ? r.message.error : __('Erro desconhecido')
                });
            }
        }
    });
}

// ============ FUNÇÕES DO REACTIVAR (do script anterior) ============

function reactivar_catecumeno(frm) {
    let d = new frappe.ui.Dialog({
        title: '🔄 Reactivar Catecúmeno',
        size: 'small',
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'info_html',
                options: `
                    <div style="padding: 10px; background: #fff3cd; border-radius: 8px; margin-bottom: 15px;">
                        <strong>⚠️ Reactivação de Catecúmeno</strong><br>
                        <span style="font-size: 13px;">
                            Catecúmeno: <strong>${frm.doc.name}</strong><br>
                            Status actual: <strong style="color: #dc3545;">${frappe.utils.escape_html(frm.doc.status || '')}</strong><br>
                            ${frm.doc.fase ? 'Última fase: <strong>' + frm.doc.fase + '</strong><br>' : ''}
                            ${frm.doc.turma ? 'Última turma: <strong>' + frm.doc.turma + '</strong>' : ''}
                        </span>
                    </div>
                `
            },
            {
                fieldtype: 'Section Break',
                label: 'Seleccionar Nova Colocação'
            },
            {
                fieldtype: 'Link',
                fieldname: 'fase',
                label: 'Fase',
                options: 'Fase',
                reqd: 1,
                default: frm.doc.fase || '',
                change: function() {
                    d.set_value('turma', '');
                    d.fields_dict.turma.get_query = function() {
                        return {
                            filters: {
                                fase: d.get_value('fase'),
                                status: 'Activo'
                            }
                        };
                    };
                }
            },
            {
                fieldtype: 'Link',
                fieldname: 'turma',
                label: 'Turma',
                options: 'Turma',
                reqd: 1,
                get_query: function() {
                    return {
                        filters: {
                            fase: d.get_value('fase') || ['is', 'set'],
                            status: 'Activo'
                        }
                    };
                }
            },
            {
                fieldtype: 'Section Break'
            },
            {
                fieldtype: 'Small Text',
                fieldname: 'observacoes',
                label: 'Observações (opcional)'
            }
        ],
        primary_action_label: __('Reactivar'),
        primary_action: function(values) {
            if (!values.fase || !values.turma) {
                frappe.msgprint(__('Seleccione a Fase e a Turma.'));
                return;
            }
            
            frappe.call({
                method: 'portal.catequese.catecumeno_reactivar.reactivar_catecumeno',
                args: {
                    catecumeno: frm.doc.name,
                    fase: values.fase,
                    turma: values.turma,
                    observacoes: values.observacoes || ''
                },
                freeze: true,
                freeze_message: __('A reactivar...'),
                callback: function(r) {
                    if (r.message && r.message.success) {
                        d.hide();
                        frappe.show_alert({message: __('Reactivado com sucesso!'), indicator: 'green'});
                        frm.reload_doc();
                    } else {
                        frappe.msgprint({title: __('Erro'), indicator: 'red', message: r.message?.error || 'Erro'});
                    }
                }
            });
        }
    });
    
    d.show();
}

// ── Formulário estilizado: resumo e histórico ─────────────────────────────

frappe.ui.form.on('Catecumeno', {
    refresh(frm) {
        cq.estilizar(frm);
        if (frm.is_new()) {
            frm.fields_dict.cq_resumo.$wrapper.empty();
            frm.fields_dict.cq_historico.$wrapper.html('<div class="cq-vazio">O histórico aparece depois de gravar.</div>');
            return;
        }
        cq_resumo_catecumeno(frm);
        cq_historico_catecumeno(frm);
    },
});

function cq_resumo_catecumeno(frm) {
    const d = frm.doc;
    frappe.call({
        method: 'portal.catequese.formularios.resumo_catecumeno',
        args: { nome: d.name },
        callback(r) {
            const x = r.message || {};
            const t = x.turma;
            const linha = x.linha || {};
            const horario = t ? [t.dia, t.hora, t.local].filter(Boolean).join(' · ') : '';
            const turmaHtml = t
                ? `<a href="/app/turma/${encodeURIComponent(t.name)}"><b>${cq.esc(t.name)}</b></a>${horario ? ` <small>${cq.esc(horario)}</small>` : ''}`
                : '<span class="cq-muted">Sem turma</span>';
            const catequistas = (x.catequistas || []).map((c) =>
                `<span><small>${cq.esc(c.papel)}:</small> ${cq.esc(c.nome)} ${cq.telefone(c.contacto)}</span>`).join('');

            const acoes = [];
            let aviso = '';
            if (!d.turma && ['Pendente', 'Activo'].includes(d.status)) {
                acoes.push({ accao: () => alocar_turma(frm) });
                aviso = `<span>📋 <b>Aguarda turma</b> — fase ${cq.esc(d.fase || 'não definida')}</span>${cq.botao('Alocar turma', 0)}`;
            } else if (['Inactivo', 'Inativo'].includes(d.status)) {
                acoes.push({ accao: () => reactivar_catecumeno(frm) });
                aviso = `<span>⏸ <b>Catecúmeno inactivo</b></span>${cq.botao('Reactivar', 0)}`;
            }

            cq.resumo(frm, 'cq_resumo', {
                titulo: d.nome_completo || d.name,
                pills: [cq.pill(d.status), d.comunidade ? cq.pill(d.comunidade) : ''],
                subtitulo: [d.idade ? d.idade + ' anos' : '', d.sexo, d.fase].filter(Boolean).map(cq.esc).join(' · '),
                factos: [
                    { v: linha.nr_de_faltas != null ? linha.nr_de_faltas : '—', l: 'Faltas' },
                    { v: d.ficha_de_catecumeno ? '✓' : '✗', l: 'Ficha' },
                ],
                linhas: [
                    `<span>🏫 ${turmaHtml}</span>${catequistas}`,
                    `${cq.marca(d.baptismo, 'Baptismo', d.data_do_baptismo && frappe.datetime.str_to_user(d.data_do_baptismo))}
                     ${cq.marca(d.eucaristia, 'Eucaristia', d.data_da_eucaristia && frappe.datetime.str_to_user(d.data_da_eucaristia))}
                     ${cq.marca(d.crisma, 'Crisma', d.data_do_crisma && frappe.datetime.str_to_user(d.data_do_crisma))}
                     <span><small>Encarregado:</small> ${cq.esc(d.encarregado || '—')} ${d.contacto ? cq.telefone(d.contacto) : ''}</span>`,
                ],
                aviso,
                acoes,
            });
        },
    });
}

function cq_historico_catecumeno(frm) {
    const $w = frm.fields_dict.cq_historico.$wrapper;
    $w.html('<div class="cq-vazio">A carregar o histórico…</div>');
    frappe.call({
        method: 'portal.catequese.catecumeno_historico_api.get_historico_catecumeno',
        args: { catecumeno: frm.doc.name },
        callback(r) {
            // mais recente primeiro; eventos sem data vão para o fim
            const quando = (e) => (e.data && e.data !== 'None' ? String(e.data) : '');
            const eventos = ((r.message && r.message.eventos) || []).slice()
                .sort((x, y) => quando(y).localeCompare(quando(x)));
            if (!eventos.length) {
                $w.html('<div class="cq-vazio">Ainda não há eventos no histórico.</div>');
                return;
            }
            $w.html(`<div class="cq-timeline">${eventos.map((e) => {
                const dia = e.data && e.data !== 'None' ? frappe.datetime.str_to_user(String(e.data).split(' ')[0]) : '—';
                return `<div class="cq-evento">
                    <div class="cq-evento-ponto" style="border-color:${e.cor || 'var(--cq-accent)'}">${e.icone || ''}</div>
                    <div class="cq-evento-card" style="border-left-color:${e.cor || 'var(--cq-accent)'}">
                        <div class="cq-evento-top"><b>${e.titulo || ''}</b><span>📅 ${dia}</span></div>
                        <div class="cq-evento-desc">${e.descricao || ''}</div>
                    </div>
                </div>`;
            }).join('')}</div>`);
        },
        error() {
            $w.html('<div class="cq-vazio">Não foi possível carregar o histórico.</div>');
        },
    });
}

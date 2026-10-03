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

// ── Historico de Catecumeno ───────────────────────────────────────────────

// Client Script para Catecumeno - Histórico em Timeline (Versão Completa)
// DocType: Catecumeno
// Tipo: Client Script
// NOTA: Requer API Python em portal/catequese/catecumeno_historico_api.py

frappe.ui.form.on('Catecumeno', {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Ver Histórico'), function() {
                mostrar_historico(frm);
            }, __('Acções'));
        }
    }
});

function mostrar_historico(frm) {
    frappe.call({
        method: 'portal.catequese.catecumeno_historico_api.get_historico_catecumeno',
        args: {
            catecumeno: frm.doc.name
        },
        freeze: true,
        freeze_message: __('A carregar histórico...'),
        callback: function(r) {
            if (!r.message) {
                frappe.msgprint(__('Erro ao carregar histórico.'));
                return;
            }
            
            let data = r.message;
            let html = gerar_timeline_html(data.catecumeno, data.eventos);
            
            // Mostrar modal
            let d = new frappe.ui.Dialog({
                title: `📜 Histórico Completo`,
                size: 'extra-large',
                fields: [
                    {
                        fieldtype: 'HTML',
                        fieldname: 'timeline_content',
                        options: html
                    }
                ],
                primary_action_label: __('Fechar'),
                primary_action: function() {
                    d.hide();
                },
                secondary_action_label: __('Imprimir'),
                secondary_action: function() {
                    // Abrir janela de impressão
                    let printWindow = window.open('', '_blank');
                    printWindow.document.write(`
                        <html>
                        <head>
                            <title>Histórico - ${data.catecumeno.name}</title>
                            <style>
                                body { font-family: Arial, sans-serif; padding: 20px; }
                                @media print { button { display: none; } }
                            </style>
                        </head>
                        <body>
                            ${html}
                            <script>window.print();</script>
                        </body>
                        </html>
                    `);
                }
            });
            
            d.show();
            
            // Ajustar tamanho do modal
            d.$wrapper.find('.modal-dialog').css('max-width', '900px');
        },
        error: function(err) {
            frappe.msgprint({
                title: __('Erro'),
                indicator: 'red',
                message: __('Erro ao carregar histórico: ') + (err.message || err)
            });
        }
    });
}

function gerar_timeline_html(catecumeno, eventos) {
    let sacramentos_count = catecumeno.total_sacramentos || 0;
    let total_turmas = catecumeno.total_turmas || 0;
    
    // Sacramentos como badges
    let sacramentos_badges = '';
    if (catecumeno.sacramentos && catecumeno.sacramentos.length > 0) {
        sacramentos_badges = catecumeno.sacramentos.map(s => {
            let icon = s === 'Baptismo' ? '💧' : (s === 'Eucaristia' ? '🍞' : '🔥');
            return `<span class="sacramento-badge">${icon} ${s}</span>`;
        }).join(' ');
    } else {
        sacramentos_badges = '<span class="sacramento-badge pending">Nenhum ainda</span>';
    }
    
    let html = `
        <style>
            .historico-container {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                padding: 10px;
                max-height: 70vh;
                overflow-y: auto;
            }
            
            /* Cabeçalho do Catecúmeno */
            .catecumeno-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 25px;
                border-radius: 16px;
                margin-bottom: 25px;
                box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
            }
            .catecumeno-nome {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 5px;
            }
            .catecumeno-info {
                opacity: 0.9;
                font-size: 14px;
                margin-bottom: 15px;
            }
            
            /* Resumo em cards */
            .resumo-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
                gap: 12px;
                margin-top: 15px;
            }
            .resumo-card {
                background: rgba(255,255,255,0.15);
                padding: 6px;
                border-radius: 8px;
                text-align: center;
            }
            .resumo-valor {
                font-size: 12px;
                font-weight: bold;
            }
            .resumo-label {
                font-size: 11px;
                opacity: 0.85;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            /* Sacramentos badges */
            .sacramentos-section {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid rgba(255,255,255,0.2);
            }
            .sacramento-badge {
                display: inline-block;
                background: rgba(255,255,255,0.2);
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                margin-right: 8px;
                margin-bottom: 5px;
            }
            .sacramento-badge.pending {
                opacity: 0.6;
            }
            
            /* Legenda */
            .timeline-legenda {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 20px;
                padding: 12px;
                background: #f8f9fa;
                border-radius: 10px;
            }
            .legenda-item {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                padding: 4px 8px;
                background: white;
                border-radius: 6px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            }
            .legenda-cor {
                width: 10px;
                height: 10px;
                border-radius: 50%;
            }
            
            /* Timeline */
            .timeline {
                position: relative;
                padding-left: 35px;
            }
            .timeline::before {
                content: '';
                position: absolute;
                left: 14px;
                top: 0;
                bottom: 0;
                width: 3px;
                background: linear-gradient(180deg, #667eea 0%, #764ba2 50%, #28a745 100%);
                border-radius: 3px;
            }
            
            .timeline-item {
                position: relative;
                padding-bottom: 20px;
            }
            .timeline-item:last-child {
                padding-bottom: 0;
            }
            
            .timeline-marker {
                position: absolute;
                left: -35px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: white;
                border: 3px solid #667eea;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                z-index: 1;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            
            .timeline-content {
                background: white;
                border: 1px solid #e9ecef;
                border-radius: 12px;
                padding: 16px;
                margin-left: 10px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                transition: all 0.2s ease;
            }
            .timeline-content:hover {
                transform: translateX(5px);
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                border-color: #667eea;
            }
            
            .timeline-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 10px;
                flex-wrap: wrap;
                gap: 8px;
            }
            .timeline-titulo {
                font-weight: 600;
                font-size: 14px;
                color: #333;
            }
            .timeline-data {
                font-size: 11px;
                color: #666;
                background: #f1f3f4;
                padding: 3px 10px;
                border-radius: 12px;
                white-space: nowrap;
            }
            .timeline-descricao {
                font-size: 13px;
                color: #555;
                line-height: 1.6;
            }
            .timeline-descricao strong {
                color: #333;
            }
            .timeline-descricao em {
                color: #777;
                font-style: italic;
            }
            
            /* Tipos de eventos - cores específicas */
            .timeline-item.inscricao .timeline-marker { border-color: #28a745; background: #e8f5e9; }
            .timeline-item.inscricao .timeline-content { border-left: 4px solid #28a745; }
            
            .timeline-item.criacao .timeline-marker { border-color: #6c757d; background: #f5f5f5; }
            .timeline-item.criacao .timeline-content { border-left: 4px solid #6c757d; }
            
            .timeline-item.turma .timeline-marker { border-color: #17a2b8; background: #e0f7fa; }
            .timeline-item.turma .timeline-content { border-left: 4px solid #17a2b8; }
            
            .timeline-item.turma_actual .timeline-marker { border-color: #28a745; background: #c8e6c9; }
            .timeline-item.turma_actual .timeline-content { 
                border-left: 4px solid #28a745; 
                background: linear-gradient(135deg, #f0fff4 0%, #ffffff 100%);
            }
            .timeline-item.turma_actual .timeline-titulo {
                color: #28a745;
            }
            
            .timeline-item.troca .timeline-marker { border-color: #fd7e14; background: #fff3e0; }
            .timeline-item.troca .timeline-content { border-left: 4px solid #fd7e14; }
            
            .timeline-item.transferencia .timeline-marker { border-color: #dc3545; background: #ffebee; }
            .timeline-item.transferencia .timeline-content { border-left: 4px solid #dc3545; }
            
            .timeline-item.apuramento .timeline-marker { border-color: #6f42c1; background: #f3e5f5; }
            .timeline-item.apuramento .timeline-content { border-left: 4px solid #6f42c1; }
            
            .timeline-item.preparacao .timeline-marker { border-color: #20c997; background: #e0f2f1; }
            .timeline-item.preparacao .timeline-content { border-left: 4px solid #20c997; }
            
            .timeline-item.sacramento .timeline-marker { border-color: #007bff; background: #e3f2fd; }
            .timeline-item.sacramento .timeline-content { border-left: 4px solid #007bff; }
            
            .timeline-item.actual .timeline-marker { border-color: #28a745; background: #c8e6c9; }
            .timeline-item.actual .timeline-content { 
                border-left: 4px solid #28a745;
                background: linear-gradient(135deg, #e8f5e9 0%, #ffffff 100%);
            }
            
            /* Responsivo */
            @media (max-width: 600px) {
                .resumo-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
                .timeline-header {
                    flex-direction: column;
                }
                .catecumeno-nome {
                    font-size: 20px;
                }
            }
            
            /* Print styles */
            @media print {
                .historico-container {
                    max-height: none;
                    overflow: visible;
                }
                .timeline-content:hover {
                    transform: none;
                    box-shadow: none;
                }
            }
        </style>
        
        <div class="historico-container">
            <!-- Cabeçalho -->
            <div class="catecumeno-header">
                <div class="catecumeno-nome">${catecumeno.name}</div>
                <div class="catecumeno-info">
                    ${catecumeno.idade ? catecumeno.idade + ' anos' : ''} 
                    ${catecumeno.sexo ? ' • ' + catecumeno.sexo : ''}
                    ${catecumeno.encarregado ? ' • Enc: ' + catecumeno.encarregado : ''}
                </div>
                
                <div class="resumo-grid">
                    <div class="resumo-card">
                        <div class="resumo-valor">${catecumeno.status || '-'}</div>
                        <div class="resumo-label">Status</div>
                    </div>
                    <div class="resumo-card">
                        <div class="resumo-valor">${catecumeno.fase || '-'}</div>
                        <div class="resumo-label">Fase Actual</div>
                    </div>
                    <div class="resumo-card">
                        <div class="resumo-valor">${total_turmas}</div>
                        <div class="resumo-label">Turmas</div>
                    </div>
                    <div class="resumo-card">
                        <div class="resumo-valor">${sacramentos_count}/3</div>
                        <div class="resumo-label">Sacramentos</div>
                    </div>
                    <div class="resumo-card">
                        <div class="resumo-valor">${eventos.length}</div>
                        <div class="resumo-label">Eventos</div>
                    </div>
                </div>
                
                <div class="sacramentos-section">
                    <strong>Sacramentos:</strong> ${sacramentos_badges}
                </div>
            </div>
            
            <!-- Legenda -->
            <div class="timeline-legenda">
                <div class="legenda-item"><span class="legenda-cor" style="background:#28a745"></span> Inscrição/Actual</div>
                <div class="legenda-item"><span class="legenda-cor" style="background:#17a2b8"></span> Turmas</div>
                <div class="legenda-item"><span class="legenda-cor" style="background:#fd7e14"></span> Trocas</div>
                <div class="legenda-item"><span class="legenda-cor" style="background:#dc3545"></span> Transferências</div>
                <div class="legenda-item"><span class="legenda-cor" style="background:#6f42c1"></span> Apuramentos</div>
                <div class="legenda-item"><span class="legenda-cor" style="background:#20c997"></span> Preparações</div>
                <div class="legenda-item"><span class="legenda-cor" style="background:#007bff"></span> Sacramentos</div>
            </div>
            
            <!-- Timeline -->
            <div class="timeline">
    `;
    
    eventos.forEach(function(evento) {
        let data_formatada = '-';
        if (evento.data) {
            try {
                // Tentar formatar a data
                let d = evento.data.split(' ')[0]; // Pegar só a parte da data
                if (d && d !== 'None') {
                    data_formatada = frappe.datetime.str_to_user(d);
                }
            } catch(e) {
                data_formatada = evento.data.split(' ')[0] || '-';
            }
        }
        
        html += `
            <div class="timeline-item ${evento.tipo}">
                <div class="timeline-marker" style="border-color: ${evento.cor}">
                    ${evento.icone}
                </div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="timeline-titulo">${evento.titulo}</span>
                        <span class="timeline-data">📅 ${data_formatada}</span>
                    </div>
                    <div class="timeline-descricao">${evento.descricao}</div>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

// ── Reactivar Catecumeno ──────────────────────────────────────────────────

// Client Script para Catecumeno - Alocar Turma (Pré-Inscrições)
// DocType: Catecumeno
// Adicionar ao Client Script existente do Catecumeno

// Este script adiciona o botão "Alocar Turma" para catecúmenos sem turma

frappe.ui.form.on('Catecumeno', {
    refresh(frm) {
        // Botão Alocar Turma - aparece se não tem turma e status é Pendente ou Activo
        if (!frm.is_new() && !frm.doc.turma && ['Pendente', 'Activo'].includes(frm.doc.status)) {
            frm.add_custom_button(__('Alocar Turma'), function() {
                alocar_turma(frm);
            }, __('Acções'));
            
            // Destacar o botão em azul
            frm.page.get_inner_group_button(__('Acções'))
                .find(`[data-label="${encodeURIComponent(__('Alocar Turma'))}"]`)
                .removeClass('btn-default')
                .addClass('btn-primary');
            
            // Mostrar aviso no topo
            mostrar_aviso_sem_turma(frm);
        }
        
        // Botão Reactivar - só aparece se status é Inativo
        if (!frm.is_new() && frm.doc.status === 'Inativo') {
            frm.add_custom_button(__('Reactivar Catecúmeno'), function() {
                reactivar_catecumeno(frm);
            }, __('Acções'));
            
            frm.page.get_inner_group_button(__('Acções'))
                .find(`[data-label="${encodeURIComponent(__('Reactivar Catecúmeno'))}"]`)
                .removeClass('btn-default')
                .addClass('btn-success');
        }
        
        // Botão Ver Histórico
        if (!frm.is_new()) {
            frm.add_custom_button(__('Ver Histórico'), function() {
                mostrar_historico(frm);
            }, __('Acções'));
        }
    }
});

function mostrar_aviso_sem_turma(frm) {
    // Remover aviso anterior
    $(frm.fields_dict.nome_completo.wrapper).closest('.form-layout').find('.sem-turma-banner').remove();
    
    let html = `
        <div class="sem-turma-banner" style="
            padding: 15px; 
            background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); 
            border-radius: 8px; 
            border-left: 4px solid #2196f3;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
        ">
            <span style="font-size: 32px;">📋</span>
            <div style="flex: 1;">
                <strong style="font-size: 16px;">Pré-Inscrição - Aguarda Turma</strong><br>
                <span style="font-size: 13px; color: #555;">
                    Este catecúmeno ainda não tem turma atribuída.<br>
                    Fase: <strong>${frm.doc.fase || 'Não definida'}</strong>
                </span>
            </div>
            <button class="btn btn-primary btn-sm" onclick="cur_frm.trigger('alocar_turma_click')">
                Alocar Turma
            </button>
        </div>
    `;
    
    $(frm.fields_dict.nome_completo.wrapper).before(html);
}

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
                            Status actual: <strong style="color: #dc3545;">Inativo</strong><br>
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

// ============ FUNÇÃO DO HISTÓRICO (do script anterior) ============

function mostrar_historico(frm) {
    frappe.call({
        method: 'portal.catequese.catecumeno_historico_api.get_historico_catecumeno',
        args: { catecumeno: frm.doc.name },
        freeze: true,
        freeze_message: __('A carregar histórico...'),
        callback: function(r) {
            if (!r.message) {
                frappe.msgprint(__('Erro ao carregar histórico.'));
                return;
            }
            
            let data = r.message;
            let html = gerar_timeline_html(data.catecumeno, data.eventos);
            
            let d = new frappe.ui.Dialog({
                title: `📜 Histórico de ${frm.doc.name}`,
                size: 'extra-large',
                fields: [{fieldtype: 'HTML', fieldname: 'content', options: html}],
                primary_action_label: __('Fechar'),
                primary_action: function() { d.hide(); }
            });
            
            d.show();
            d.$wrapper.find('.modal-dialog').css('max-width', '900px');
        }
    });
}

// Função gerar_timeline_html copiada do script de histórico
function gerar_timeline_html(catecumeno, eventos) {
    let sacramentos_count = catecumeno.total_sacramentos || 0;
    let total_turmas = catecumeno.total_turmas || 0;
    
    let sacramentos_badges = '';
    if (catecumeno.sacramentos && catecumeno.sacramentos.length > 0) {
        sacramentos_badges = catecumeno.sacramentos.map(s => {
            let icon = s === 'Baptismo' ? '💧' : (s === 'Eucaristia' ? '🍞' : '🔥');
            return `<span style="display:inline-block;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:20px;font-size:12px;margin-right:8px;">${icon} ${s}</span>`;
        }).join(' ');
    } else {
        sacramentos_badges = '<span style="opacity:0.6;">Nenhum ainda</span>';
    }
    
    let html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:10px;max-height:70vh;overflow-y:auto;">
            <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:25px;border-radius:16px;margin-bottom:25px;">
                <div style="font-size:24px;font-weight:bold;margin-bottom:5px;">${catecumeno.name}</div>
                <div style="opacity:0.9;font-size:14px;margin-bottom:15px;">
                    ${catecumeno.idade ? catecumeno.idade + ' anos' : ''} 
                    ${catecumeno.sexo ? ' • ' + catecumeno.sexo : ''}
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-top:15px;">
                    <div style="background:rgba(255,255,255,0.15);padding:12px;border-radius:10px;text-align:center;">
                        <div style="font-size:12px;font-weight:bold;">${catecumeno.status || '-'}</div>
                        <div style="font-size:11px;opacity:0.85;">Status</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.15);padding:12px;border-radius:10px;text-align:center;">
                        <div style="font-size:12px;font-weight:bold;">${catecumeno.fase || '-'}</div>
                        <div style="font-size:11px;opacity:0.85;">Fase</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.15);padding:12px;border-radius:10px;text-align:center;">
                        <div style="font-size:12px;font-weight:bold;">${sacramentos_count}/3</div>
                        <div style="font-size:11px;opacity:0.85;">Sacramentos</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.15);padding:12px;border-radius:10px;text-align:center;">
                        <div style="font-size:12px;font-weight:bold;">${eventos.length}</div>
                        <div style="font-size:11px;opacity:0.85;">Eventos</div>
                    </div>
                </div>
                <div style="margin-top:15px;padding-top:15px;border-top:1px solid rgba(255,255,255,0.2);">
                    <strong>Sacramentos:</strong> ${sacramentos_badges}
                </div>
            </div>
            <div style="position:relative;padding-left:35px;">
                <div style="position:absolute;left:14px;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#667eea 0%,#764ba2 50%,#28a745 100%);border-radius:3px;"></div>
    `;
    
    eventos.forEach(function(evento) {
        let data_formatada = '-';
        if (evento.data) {
            try {
                let d = evento.data.split(' ')[0];
                if (d && d !== 'None') data_formatada = frappe.datetime.str_to_user(d);
            } catch(e) {
                data_formatada = evento.data.split(' ')[0] || '-';
            }
        }
        
        html += `
            <div style="position:relative;padding-bottom:20px;">
                <div style="position:absolute;left:-35px;width:12px;height:12px;border-radius:50%;background:white;border:3px solid ${evento.cor};display:flex;align-items:center;justify-content:center;font-size:12px;z-index:1;">${evento.icone}</div>
                <div style="background:white;border:1px solid #e9ecef;border-left:4px solid ${evento.cor};border-radius:12px;padding:16px;margin-left:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                        <span style="font-weight:600;font-size:14px;">${evento.titulo}</span>
                        <span style="font-size:11px;color:#666;background:#f1f3f4;padding:3px 10px;border-radius:12px;">📅 ${data_formatada}</span>
                    </div>
                    <div style="font-size:13px;color:#555;line-height:1.6;">${evento.descricao}</div>
                </div>
            </div>
        `;
    });
    
    html += `</div></div>`;
    return html;
}

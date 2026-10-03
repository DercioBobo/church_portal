// Alocacao em Massa — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── alocacao em massa ─────────────────────────────────────────────────────

// Client Script para Alocação em Massa
// DocType: Alocacao em Massa
// Assistente inteligente para alocação de catecúmenos

frappe.ui.form.on('Alocacao em Massa', {
    
    refresh(frm) {
        // Esconder botões padrão se não submetido
        if (frm.doc.docstatus === 0) {
            
            // Botão principal: Carregar Dados
            frm.add_custom_button(__('1. Carregar Dados'), function() {
                carregar_dados(frm);
            }).addClass('btn-primary');
            
            // Só mostrar outros botões se já carregou dados
            if (frm.doc.total_pendentes > 0) {
                
                frm.add_custom_button(__('2. Gerar Sugestão'), function() {
                    gerar_sugestao(frm);
                }).addClass('btn-info');
                
                frm.add_custom_button(__('Criar Nova Turma'), function() {
                    criar_nova_turma(frm);
                }, __('Acções'));
                
                frm.add_custom_button(__('3. Executar Alocação'), function() {
                    executar_alocacao(frm);
                }).addClass('btn-success');
            }
        }
        
        // Actualizar HTML de botões
        actualizar_botoes_html(frm);
    },
    
    fase(frm) {
        // Limpar dados quando muda a fase
        if (frm.doc.fase) {
            frm.set_value('total_pendentes', 0);
            frm.set_value('total_turmas', 0);
            frm.set_value('vagas_disponiveis', 0);
            frm.clear_table('turmas_table');
            frm.clear_table('pendentes_table');
            frm.refresh_fields();
            
            frappe.show_alert({
                message: __('Fase seleccionada: {0}. Clique em "Carregar Dados".', [frm.doc.fase]),
                indicator: 'blue'
            });
        }
    },
    
    capacidade_recomendada(frm) {
        // Recalcular se já tem dados
        if (frm.doc.total_pendentes > 0) {
            frappe.show_alert({
                message: __('Capacidade alterada. Clique em "Gerar Sugestão" para recalcular.'),
                indicator: 'blue'
            });
        }
    }
});

// ========== FUNÇÕES PRINCIPAIS ==========

function carregar_dados(frm) {
    if (!frm.doc.fase) {
        frappe.msgprint(__('Seleccione uma Fase primeiro.'));
        return;
    }
    
    frappe.call({
        method: 'portal.catequese.alocacao_em_massa.carregar_dados',
        args: {
            fase: frm.doc.fase,
            capacidade_recomendada: frm.doc.capacidade_recomendada || 25
        },
        freeze: true,
        freeze_message: __('A carregar dados...'),
        callback: function(r) {
            if (r.message.error) {
                frappe.msgprint(r.message.error);
                return;
            }
            
            let dados = r.message;
            
            // Actualizar totais
            frm.set_value('total_pendentes', dados.total_pendentes);
            frm.set_value('total_turmas', dados.total_turmas);
            frm.set_value('vagas_disponiveis', dados.vagas_disponiveis);
            
            // Preencher tabela de turmas
            frm.clear_table('turmas_table');
            dados.turmas.forEach(t => {
                let row = frm.add_child('turmas_table');
                row.turma = t.name;
                row.catequistas = t.catequistas || '-';
                row.actual = t.actual;
                row.a_adicionar = 0;
                row.total_final = t.actual;
                row.capacidade = dados.capacidade;
                row.status_ocupacao = t.status;
            });
            
            // Preencher tabela de pendentes
            frm.clear_table('pendentes_table');
            dados.pendentes.forEach(p => {
                let row = frm.add_child('pendentes_table');
                row.catecumeno = p.name;
                row.idade = p.idade;
                row.sexo = p.sexo;
                row.encarregado = p.encarregado;
                row.turma_destino = '';
                row.seleccionado = 1;
            });
            
            frm.refresh_fields();
            frm.save();
            
            // Mostrar resumo
            let msg = `<strong>Dados carregados:</strong><br>
                      • ${dados.total_pendentes} catecúmeno(s) pendente(s)<br>
                      • ${dados.total_turmas} turma(s) existente(s)<br>
                      • ${dados.vagas_disponiveis} vaga(s) disponível(eis)`;
            
            if (dados.total_pendentes > dados.vagas_disponiveis) {
                let faltam = dados.total_pendentes - dados.vagas_disponiveis;
                msg += `<br><br><span style="color: #dc3545;">⚠️ Faltam ${faltam} vaga(s). Será necessário criar nova(s) turma(s).</span>`;
            }
            
            frappe.msgprint({
                title: __('Dados Carregados'),
                indicator: 'green',
                message: msg
            });
            
            // Actualizar HTML
            actualizar_botoes_html(frm);
        }
    });
}

function gerar_sugestao(frm) {
    if (!frm.doc.fase) {
        frappe.msgprint(__('Seleccione uma Fase primeiro.'));
        return;
    }
    
    if (frm.doc.total_pendentes === 0) {
        frappe.msgprint(__('Carregue os dados primeiro.'));
        return;
    }
    
    frappe.call({
        method: 'portal.catequese.alocacao_em_massa.gerar_sugestao',
        args: {
            fase: frm.doc.fase,
            capacidade_recomendada: frm.doc.capacidade_recomendada || 25
        },
        freeze: true,
        freeze_message: __('A gerar sugestão...'),
        callback: function(r) {
            if (r.message.error) {
                frappe.msgprint(r.message.error);
                return;
            }
            
            let dados = r.message;
            
            // Actualizar tabela de turmas com sugestão
            let turmas_existentes = {};
            (frm.doc.turmas_table || []).forEach(row => {
                turmas_existentes[row.turma] = row;
            });
            
            // Aplicar sugestão às turmas existentes
            dados.sugestao.forEach(sug => {
                if (sug.tipo === 'existente' && turmas_existentes[sug.turma]) {
                    let row = turmas_existentes[sug.turma];
                    row.a_adicionar = sug.a_adicionar;
                    row.total_final = sug.total_final;
                }
            });
            
            // Adicionar novas turmas sugeridas
            dados.sugestao.forEach(sug => {
                if (sug.tipo === 'nova') {
                    let row = frm.add_child('turmas_table');
                    row.turma = sug.turma;
                    row.catequistas = sug.catequistas;
                    row.actual = 0;
                    row.a_adicionar = sug.a_adicionar;
                    row.total_final = sug.total_final;
                    row.capacidade = sug.capacidade;
                    row.status_ocupacao = '🆕 Nova';
                }
            });
            
            // Actualizar turma_destino nos pendentes
            dados.sugestao.forEach(sug => {
                sug.catecumenos.forEach(cat_name => {
                    (frm.doc.pendentes_table || []).forEach(row => {
                        if (row.catecumeno === cat_name) {
                            row.turma_destino = sug.turma;
                        }
                    });
                });
            });
            
            frm.refresh_fields();
            
            // Gerar HTML da sugestão
            let html = gerar_html_sugestao(dados);
            frm.set_df_property('sugestao_html', 'options', html);
            frm.refresh_field('sugestao_html');
            
            frappe.show_alert({
                message: dados.mensagem,
                indicator: 'green'
            }, 7);
        }
    });
}

function gerar_html_sugestao(dados) {
    let html = `
        <div style="padding: 15px; background: #e8f5e9; border-radius: 8px; border-left: 4px solid #28a745;">
            <h4 style="margin-top: 0;">📊 Sugestão de Distribuição</h4>
            <p>${dados.mensagem}</p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 15px;">
    `;
    
    dados.sugestao.forEach(sug => {
        let cor = sug.tipo === 'nova' ? '#2196f3' : '#28a745';
        let icone = sug.tipo === 'nova' ? '🆕' : '📚';
        
        html += `
            <div style="background: white; border-radius: 8px; padding: 15px; border-left: 4px solid ${cor};">
                <div style="font-weight: bold; margin-bottom: 10px;">
                    ${icone} ${sug.turma}
                </div>
                <div style="font-size: 13px; color: #666;">
                    👨‍🏫 ${sug.catequistas}<br>
                    📊 ${sug.actual} actual + ${sug.a_adicionar} novos = <strong>${sug.total_final}</strong>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            
            <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 6px;">
                <strong>💡 Nota:</strong> Esta é apenas uma sugestão. Pode ajustar manualmente na tabela acima 
                ou alterar o destino de cada catecúmeno na tabela de pendentes.
            </div>
        </div>
    `;
    
    return html;
}

function criar_nova_turma(frm) {
    if (!frm.doc.fase) {
        frappe.msgprint(__('Seleccione uma Fase primeiro.'));
        return;
    }
    
    frappe.call({
        method: 'portal.catequese.alocacao_em_massa.criar_nova_turma',
        args: {
            fase: frm.doc.fase,
            ano_lectivo: frm.doc.ano_lectivo || new Date().getFullYear().toString()
        },
        freeze: true,
        freeze_message: __('A criar turma...'),
        callback: function(r) {
            if (r.message.success) {
                frappe.show_alert({
                    message: r.message.mensagem,
                    indicator: 'green'
                });
                
                // Adicionar à tabela
                let row = frm.add_child('turmas_table');
                row.turma = r.message.turma;
                row.catequistas = '(A definir)';
                row.actual = 0;
                row.a_adicionar = 0;
                row.total_final = 0;
                row.capacidade = frm.doc.capacidade_recomendada || 25;
                row.status_ocupacao = '🆕 Nova';
                
                frm.refresh_field('turmas_table');
                frm.set_value('total_turmas', (frm.doc.total_turmas || 0) + 1);
                
            } else {
                frappe.msgprint({
                    title: __('Erro'),
                    indicator: 'red',
                    message: r.message.error
                });
            }
        }
    });
}

function executar_alocacao(frm) {
    if (!frm.doc.fase) {
        frappe.msgprint(__('Seleccione uma Fase primeiro.'));
        return;
    }
    
    // Construir lista de alocações
    let alocacoes = [];
    let criar_turmas = [];
    let sem_destino = [];
    
    (frm.doc.pendentes_table || []).forEach(row => {
        if (row.seleccionado) {
            if (row.turma_destino) {
                alocacoes.push({
                    catecumeno: row.catecumeno,
                    turma: row.turma_destino
                });
                
                // Verificar se é nova turma
                if (row.turma_destino.startsWith('Nova Turma')) {
                    let numero = parseInt(row.turma_destino.replace('Nova Turma T', ''));
                    if (!criar_turmas.find(t => t.numero === numero)) {
                        criar_turmas.push({ numero: numero });
                    }
                }
            } else {
                sem_destino.push(row.catecumeno);
            }
        }
    });
    
    if (alocacoes.length === 0) {
        frappe.msgprint(__('Nenhuma alocação definida. Defina o destino de cada catecúmeno ou gere uma sugestão.'));
        return;
    }
    
    // Avisar sobre catecúmenos sem destino
    let msg_confirmacao = `
        <strong>Confirmar Alocação:</strong><br><br>
        • ${alocacoes.length} catecúmeno(s) serão alocados<br>
        ${criar_turmas.length > 0 ? `• ${criar_turmas.length} nova(s) turma(s) serão criadas<br>` : ''}
        ${sem_destino.length > 0 ? `<br><span style="color: #dc3545;">⚠️ ${sem_destino.length} catecúmeno(s) sem destino definido (não serão alocados)</span>` : ''}
    `;
    
    frappe.confirm(
        msg_confirmacao,
        function() {
            // Executar
            frappe.call({
                method: 'portal.catequese.alocacao_em_massa.executar_alocacao',
                args: {
                    alocacoes_json: JSON.stringify(alocacoes),
                    fase: frm.doc.fase,
                    ano_lectivo: frm.doc.ano_lectivo || new Date().getFullYear().toString(),
                    criar_turmas_json: JSON.stringify(criar_turmas)
                },
                freeze: true,
                freeze_message: __('A executar alocação...'),
                callback: function(r) {
                    if (r.message.success) {
                        // Mostrar resultado
                        let resultado_html = gerar_html_resultado(r.message);
                        frm.set_df_property('resultado_html', 'options', resultado_html);
                        frm.refresh_field('resultado_html');
                        
                        frappe.msgprint({
                            title: __('✅ Alocação Concluída'),
                            indicator: 'green',
                            message: r.message.mensagem
                        });
                        
                        // Recarregar dados
                        carregar_dados(frm);
                        
                    } else {
                        frappe.msgprint({
                            title: __('Erro'),
                            indicator: 'red',
                            message: r.message.error
                        });
                    }
                }
            });
        }
    );
}

function gerar_html_resultado(resultado) {
    let html = `
        <div style="padding: 15px; background: #d4edda; border-radius: 8px; border-left: 4px solid #28a745;">
            <h4 style="margin-top: 0;">✅ Resultado da Alocação</h4>
            <p><strong>${resultado.catecumenos_alocados}</strong> catecúmeno(s) alocado(s) com sucesso.</p>
    `;
    
    if (resultado.turmas_criadas && resultado.turmas_criadas.length > 0) {
        html += `
            <p><strong>Turmas criadas:</strong></p>
            <ul>
                ${resultado.turmas_criadas.map(t => `<li>${t}</li>`).join('')}
            </ul>
        `;
    }
    
    if (resultado.erros && resultado.erros.length > 0) {
        html += `
            <div style="margin-top: 10px; padding: 10px; background: #f8d7da; border-radius: 6px;">
                <strong>⚠️ Erros:</strong>
                <ul style="margin-bottom: 0;">
                    ${resultado.erros.map(e => `<li>${e}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    html += `</div>`;
    return html;
}

function actualizar_botoes_html(frm) {
    let html = `
        <div style="display: flex; gap: 10px; flex-wrap: wrap; padding: 10px 0;">
            <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; flex: 1; min-width: 150px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #1976d2;">${frm.doc.total_pendentes || 0}</div>
                <div style="font-size: 12px; color: #666;">Pendentes</div>
            </div>
            <div style="padding: 15px; background: #e8f5e9; border-radius: 8px; flex: 1; min-width: 150px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #388e3c;">${frm.doc.total_turmas || 0}</div>
                <div style="font-size: 12px; color: #666;">Turmas</div>
            </div>
            <div style="padding: 15px; background: #fff3e0; border-radius: 8px; flex: 1; min-width: 150px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #f57c00;">${frm.doc.vagas_disponiveis || 0}</div>
                <div style="font-size: 12px; color: #666;">Vagas</div>
            </div>
        </div>
    `;
    
    frm.set_df_property('botoes_html', 'options', html);
    frm.refresh_field('botoes_html');
}

// ========== EVENTOS DA CHILD TABLE ==========

frappe.ui.form.on('Alocacao Pendente Item', {
    turma_destino(frm, cdt, cdn) {
        // Quando altera manualmente o destino
        frm.refresh_field('pendentes_table');
    },
    
    seleccionado(frm, cdt, cdn) {
        // Quando marca/desmarca
        frm.refresh_field('pendentes_table');
    }
});

frappe.ui.form.on('Alocacao Turma Item', {
    a_adicionar(frm, cdt, cdn) {
        // Recalcular total final
        let row = locals[cdt][cdn];
        row.total_final = (row.actual || 0) + (row.a_adicionar || 0);
        frm.refresh_field('turmas_table');
    }
});

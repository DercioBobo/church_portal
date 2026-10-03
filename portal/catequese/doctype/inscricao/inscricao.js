// Inscricao — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── Inscricao ─────────────────────────────────────────────────────────────

// Client Script para Inscrição - Versão com Nova Inscrição e Transferência
// DocType: Inscricao
// Funcionalidades:
// - Nova Inscrição vs Transferência (mutuamente exclusivos)
// - Sugestão automática de fase por idade (nova inscrição)
// - Sugestão automática de próxima fase (transferência)
// - Turma opcional (pré-inscrição)
// - Detecção de duplicados

frappe.ui.form.on('Inscricao', {
    
    refresh(frm) {
        // Se tem fase mas não tem turma, mostrar opção de alocar
        if (!frm.is_new() && frm.doc.docstatus === 0 && frm.doc.fase && !frm.doc.turma) {
            mostrar_aviso_sem_turma(frm);
        }
        
        // Mostrar painel de turmas disponíveis se fase estiver seleccionada
        if (frm.doc.fase) {
            mostrar_turmas_disponiveis(frm);
        }
        
        // Botão para submeter como pré-inscrição (sem turma)
        if (!frm.is_new() && frm.doc.docstatus === 0 && frm.doc.fase && !frm.doc.turma) {
            frm.add_custom_button(__('Submeter como Pré-Inscrição'), function() {
                submeter_pre_inscricao(frm);
            }, __('Acções'));
        }
    },
    
    // ========== NOVA INSCRIÇÃO ==========
    nova_inscricao(frm) {
        if (frm.doc.nova_inscricao) {
            // Se marcou nova_inscricao, limpar transferência e seus campos
            if (frm.doc.transferencia) {
                frm.set_value('transferencia', 0);
            }
            
            // Limpar campos de transferência
            frm.set_value('paroquia_que_frequentava', '');
            frm.set_value('fase_que_frequentava', '');
            
            // Limpar fase para sugerir nova por idade
            frm.set_value('fase', '');
            
            // Sugerir fase por idade
            if (frm.doc.data_de_nascimento) {
                sugerir_fase_por_idade(frm);
            } else {
                frappe.show_alert({
                    message: __('Nova Inscrição: Preencha a data de nascimento para sugerir a fase.'),
                    indicator: 'blue'
                }, 5);
            }
        }
    },
    
    // ========== TRANSFERÊNCIA ==========
    transferencia(frm) {
        if (frm.doc.transferencia) {
            // Se marcou transferência, limpar nova_inscricao
            if (frm.doc.nova_inscricao) {
                frm.set_value('nova_inscricao', 0);
            }
            
            // Limpar fase para sugerir nova por transferência
            frm.set_value('fase', '');
            
            frappe.show_alert({
                message: __('Transferência: Preencha a fase que frequentava para sugerir a próxima fase.'),
                indicator: 'blue'
            }, 5);
        } else {
            // Se desmarcou transferência, limpar campos
            frm.set_value('paroquia_que_frequentava', '');
            frm.set_value('fase_que_frequentava', '');
        }
    },
    
    // ========== NOME ==========
    nome_completo(frm) {
        if (frm.doc.nome_completo && frm.doc.nome_completo.length > 5) {
            verificar_duplicados(frm);
        }
    },
    
    // ========== DATA DE NASCIMENTO ==========
    data_de_nascimento(frm) {
        if (frm.doc.data_de_nascimento) {
            // Calcular idade
            calcular_idade(frm);
            
            // Verificar duplicados com mais precisão
            if (frm.doc.nome_completo) {
                verificar_duplicados(frm);
            }
            
            // Sugerir fase se for nova inscrição (ou se não for transferência)
            if (frm.doc.nova_inscricao || !frm.doc.transferencia) {
                sugerir_fase_por_idade(frm);
            }
        }
    },
    
    // ========== FASE QUE FREQUENTAVA (Transferência) ==========
    fase_que_frequentava(frm) {
        if (frm.doc.transferencia && frm.doc.fase_que_frequentava) {
            sugerir_fase_por_transferencia(frm);
        }
    },
    
    // ========== FASE ==========
    fase(frm) {
        if (frm.doc.fase) {
            // Limpar turma anterior
            frm.set_value('turma', '');
            
            // Mostrar turmas disponíveis
            mostrar_turmas_disponiveis(frm);
        } else {
            // Limpar preview
            limpar_preview_turmas(frm);
        }
    },
    
    // ========== TURMA ==========
    turma(frm) {
        if (frm.doc.turma) {
            // Actualizar preview para mostrar selecção
            mostrar_turmas_disponiveis(frm);
        }
    },
    
    // ========== VALIDAÇÃO ==========
    validate(frm) {
        // Validar que pelo menos um tipo está seleccionado
        if (!frm.doc.nova_inscricao && !frm.doc.transferencia) {
            frappe.msgprint({
                title: __('Tipo de Inscrição'),
                indicator: 'orange',
                message: __('Seleccione se é uma Nova Inscrição ou Transferência.')
            });
        }
        
        // Validar idade mínima (6 anos) - apenas aviso
        if (frm.doc.idade && frm.doc.idade < 5) {
            frappe.msgprint({
                title: __('Idade Insuficiente'),
                indicator: 'orange',
                message: __('O catecúmeno tem {0} anos. A idade mínima recomendada é 6 anos.', [frm.doc.idade])
            });
        }
        
        // Validar campos obrigatórios de transferência
        if (frm.doc.transferencia) {
            if (!frm.doc.paroquia_que_frequentava) {
                frappe.throw(__('Para transferências, indique a Paróquia que frequentava.'));
            }
            if (!frm.doc.fase_que_frequentava) {
                frappe.throw(__('Para transferências, indique a Fase que frequentava.'));
            }
        }
    },
    
    // ========== ANTES DE SUBMETER ==========
    before_submit(frm) {
        if (!frm.doc.turma) {
            frappe.show_alert({
                message: __('Pré-inscrição: Catecúmeno será criado sem turma.'),
                indicator: 'blue'
            }, 5);
        }
    }
});

// ========== FUNÇÕES AUXILIARES ==========

function calcular_idade(frm) {
    if (frm.doc.data_de_nascimento) {
        const birthDate = new Date(frm.doc.data_de_nascimento);
        const today = new Date();
        let idade = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            idade--;
        }
        frm.set_value('idade', idade);
    }
}

function verificar_duplicados(frm) {
    frappe.call({
        method: 'portal.catequese.inscricao_utils.verificar_duplicados',
        args: {
            nome: frm.doc.nome_completo,
            data_nascimento: frm.doc.data_de_nascimento || ''
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                mostrar_alerta_duplicados(frm, r.message);
            }
        }
    });
}

function mostrar_alerta_duplicados(frm, duplicados) {
    let html = `
        <div style="max-height: 300px; overflow-y: auto;">
            <p><strong>Encontrámos ${duplicados.length} catecúmeno(s) com dados semelhantes:</strong></p>
            <table class="table table-bordered table-sm">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Data Nasc.</th>
                        <th>Status</th>
                        <th>Fase</th>
                        <th>Turma</th>
                        <th>Acção</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    duplicados.forEach(d => {
        let data_nasc = d.data_de_nascimento ? frappe.datetime.str_to_user(d.data_de_nascimento) : '-';
        let is_catecumeno = !d.name.startsWith('[Inscrição]');
        html += `
            <tr>
                <td>${d.name}</td>
                <td>${data_nasc}</td>
                <td><span class="badge badge-${d.status === 'Activo' ? 'success' : (d.status === 'Inativo' ? 'secondary' : 'warning')}">${d.status || '-'}</span></td>
                <td>${d.fase || '-'}</td>
                <td>${d.turma || '-'}</td>
                <td>
                    ${is_catecumeno ? `<button class="btn btn-xs btn-primary" onclick="frappe.set_route('Form', 'Catecumeno', '${d.name}')">Ver</button>` : '-'}
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            <p class="text-muted">
                <strong>Nota:</strong> Se for o mesmo catecúmeno e estiver <strong>Inativo</strong>, 
                use a opção <strong>Reactivar</strong> no registo existente em vez de criar nova inscrição.
            </p>
        </div>
    `;
    
    frappe.msgprint({
        title: __('⚠️ Possíveis Duplicados Detectados'),
        indicator: 'orange',
        message: html
    });
}

function sugerir_fase_por_idade(frm) {
    if (!frm.doc.idade) return;
    
    let idade = frm.doc.idade;
    
    frappe.call({
        method: 'portal.catequese.inscricao_utils.buscar_fase_por_idade',
        args: { idade: idade },
        callback: function(r) {
            if (r.message && r.message.fase) {
                frm.set_value('fase', r.message.fase);
                frappe.show_alert({
                    message: `Idade ${idade} anos → Fase sugerida: ${r.message.fase}`,
                    indicator: 'green'
                }, 5);
            } else {
                frappe.show_alert({
                    message: __('Não foi possível sugerir fase. Seleccione manualmente.'),
                    indicator: 'orange'
                }, 5);
            }
        }
    });
}

function sugerir_fase_por_transferencia(frm) {
    let fase_anterior = frm.doc.fase_que_frequentava;
    
    if (!fase_anterior) return;
    
    frappe.call({
        method: 'portal.catequese.inscricao_utils.sugerir_proxima_fase',
        args: { fase_anterior: fase_anterior },
        callback: function(r) {
            if (r.message && r.message.fase) {
                frm.set_value('fase', r.message.fase);
                frappe.show_alert({
                    message: `Transferência: ${fase_anterior} → ${r.message.fase}`,
                    indicator: 'green'
                }, 5);
            } else {
                frappe.show_alert({
                    message: __('Não foi possível sugerir fase. Seleccione manualmente.'),
                    indicator: 'orange'
                }, 5);
            }
        }
    });
}

function mostrar_aviso_sem_turma(frm) {
    let html = `
        <div class="sem-turma-aviso" style="
            padding: 10px; 
            background: linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%); 
            border-radius: 8px; 
            border-left: 4px solid #ffc107;
            margin-bottom: 15px;
        ">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">📋</span>
                <div>
                    <strong>Pré-Inscrição (Sem Turma)</strong><br>
                    <span style="font-size: 13px; color: #666;">
                        Este catecúmeno ainda não tem turma atribuída. 
                        Seleccione uma turma abaixo ou submeta como pré-inscrição.
                    </span>
                </div>
            </div>
        </div>
    `;
    
    // Inserir no topo do form
    $(frm.fields_dict.observacoes.wrapper).closest('.form-layout').find('.sem-turma-aviso').remove();
    $(frm.fields_dict.observacoes.wrapper).before(html);
}

function mostrar_turmas_disponiveis(frm) {
    if (!frm.doc.fase) {
        limpar_preview_turmas(frm);
        return;
    }
    
    frappe.call({
        method: 'portal.catequese.inscricao_utils.get_turmas_disponiveis',
        args: { fase: frm.doc.fase },
        callback: function(r) {
            let turmas = r.message || [];
            
            if (turmas.length === 0) {
                // Mostrar aviso de nenhuma turma
                let html = `
                    <div class="turmas-preview" style="margin-top: 15px; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">
                        <strong>ℹ️ Nenhuma turma activa para ${frm.doc.fase}</strong><br>
                        <span style="font-size: 13px; color: #666;">
                            As turmas ainda não foram criadas para esta fase.<br>
                            Pode submeter a inscrição sem turma (pré-inscrição) e alocar depois.
                        </span>
                    </div>
                `;
                inserir_preview_turmas(frm, html);
                return;
            }
            
            let html = `
                <div class="turmas-preview" style="margin-top: 15px;">
                    <div style="padding: 10px; background: #e8f5e9; border-radius: 8px; margin-bottom: 10px;">
                        <strong>📋 Turmas Disponíveis para ${frm.doc.fase}</strong>
                        <span class="text-muted">(${turmas.length} turma${turmas.length > 1 ? 's' : ''})</span>
                        <br>
                        <small class="text-muted">Clique numa turma para seleccionar, ou deixe em branco para pré-inscrição</small>
                    </div>
                    <div style="max-height: 300px; overflow-y: auto;">
            `;
            
            turmas.forEach(t => {
                let is_selected = frm.doc.turma === t.name;
                
                html += `
                    <div class="turma-card" style="
                        padding: 12px; 
                        background: ${is_selected ? '#c8e6c9' : 'white'}; 
                        border: 2px solid ${is_selected ? '#28a745' : '#dee2e6'}; 
                        border-radius: 8px; 
                        margin-bottom: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " 
                    onmouseover="this.style.borderColor='#28a745'; this.style.background='${is_selected ? '#c8e6c9' : '#f0fff4'}';"
                    onmouseout="this.style.borderColor='${is_selected ? '#28a745' : '#dee2e6'}'; this.style.background='${is_selected ? '#c8e6c9' : 'white'}';"
                    onclick="cur_frm.set_value('turma', '${t.name}')">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${t.name}</strong>
                                ${is_selected ? '<span class="badge badge-success" style="margin-left: 8px;">✓ Seleccionada</span>' : ''}
                                <br>
                                <span style="font-size: 12px; color: #666;">
                                    👨‍🏫 ${t.catequistas || 'Sem catequista'}<br>
                                    📍 ${t.local || '-'} | ${t.dia || '-'} às ${t.hora || '-'}
                                </span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 20px; font-weight: bold; color: #333;">
                                    ${t.total_catecumenos}
                                </div>
                                <div style="font-size: 11px; color: #666;">catecúmenos</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            // Opção para deixar sem turma
            let sem_turma_selected = !frm.doc.turma;
            html += `
                <div class="turma-card" style="
                    padding: 12px; 
                    background: ${sem_turma_selected ? '#fff3cd' : '#f8f9fa'}; 
                    border: 2px dashed ${sem_turma_selected ? '#ffc107' : '#dee2e6'}; 
                    border-radius: 8px; 
                    margin-bottom: 8px;
                    cursor: pointer;
                "
                onclick="cur_frm.set_value('turma', '')">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">📋</span>
                        <div>
                            <strong>Sem Turma (Pré-Inscrição)</strong>
                            ${sem_turma_selected ? '<span class="badge badge-warning" style="margin-left: 8px;">✓ Seleccionado</span>' : ''}
                            <br>
                            <span style="font-size: 12px; color: #666;">
                                Guardar inscrição para alocar turma mais tarde
                            </span>
                        </div>
                    </div>
                </div>
            `;
            
            html += `
                    </div>
                </div>
            `;
            
            inserir_preview_turmas(frm, html);
        }
    });
}

function inserir_preview_turmas(frm, html) {
    limpar_preview_turmas(frm);
    $(frm.fields_dict.turma.wrapper).append(html);
}

function limpar_preview_turmas(frm) {
    $(frm.fields_dict.turma.wrapper).find('.turmas-preview').remove();
}

function submeter_pre_inscricao(frm) {
    frappe.confirm(
        `<strong>Submeter como Pré-Inscrição?</strong><br><br>
        O catecúmeno <strong>${frm.doc.nome_completo}</strong> será criado com:<br>
        • Fase: <strong>${frm.doc.fase}</strong><br>
        • Turma: <strong>Sem turma (a alocar)</strong><br>
        • Status: <strong>Pendente</strong><br><br>
        Poderá alocar a turma depois através do botão "Alocar Turma" no registo do Catecúmeno.`,
        function() {
            frm.save('Submit');
        }
    );
}

// Apuramento de Turmas — scripts de formulário
// (antes eram Client Scripts no browser; mesma ordem em que o Frappe os carregava)

// ── Apuramento Script ─────────────────────────────────────────────────────

// Client Script para Apuramento de Turmas
// Tipo: Client Script
// DocType: Apuramento de Turmas

frappe.ui.form.on('Apuramento de Turmas', {
    refresh: function (frm) {
        // Só mostrar botões se não estiver submetido
        if (frm.doc.docstatus === 0) {


            // Botão para marcar todos como Transita
            frm.add_custom_button(__('Todos Transitam'), function () {
                frm.trigger('marcar_todos_transitam');
            }, __('Resultados'));

            // Botão para marcar todos como Permanece
            frm.add_custom_button(__('Todos Permanecem'), function () {
                frm.trigger('marcar_todos_permanecem');
            }, __('Resultados'));

            // Botão para pré-visualizar
            frm.add_custom_button(__('Pré-visualizar Distribuição'), function () {
                frm.trigger('pre_visualizar');
            }, __('Finalizar'));

        }

        // Limpar HTML de preview se vazio
        if (!frm.doc.preview_html) {
            frm.set_df_property('preview_html', 'options', '');
        }


    },

    carregar_turmas(frm) {
        frm.trigger('carregar_turmas_fase');
    },

    carregar_catecumeno(frm) {
        frm.trigger('carregar_catecumenos');
    },

    criar_novas_turmas(frm) {
        frm.trigger('criar_novas_turmas');
    },

    pre_visualizacao(frm) {
        frm.trigger('pre_visualizar');
    },





    criar_novas_turmas: function (frm) {
        // Validações básicas
        if (!frm.doc.ano_lectivo_actual || !frm.doc.ano_lectivo_seguinte) {
            frappe.msgprint(__('Preencha os Anos Lectivos primeiro.'));
            return;
        }
        if (!frm.doc.fase_actual || !frm.doc.fase_seguinte) {
            frappe.msgprint(__('Preencha as Fases primeiro.'));
            return;
        }
        if (!frm.doc.apuramento_item || frm.doc.apuramento_item.length === 0) {
            frappe.msgprint(__('Carregue os catecúmenos primeiro.'));
            return;
        }

        // Verificar se todos têm resultado
        let sem_resultado = (frm.doc.apuramento_item || []).filter(function (row) {
            let res = (row.resultado || '').trim();
            return !['Transita', 'Permanece', 'Desistente'].includes(res);
        });

        if (sem_resultado.length > 0) {
            frappe.msgprint(__('Existem {0} catecúmeno(s) sem resultado definido. Defina Transita, Permanece ou Desistente para todos.', [sem_resultado.length]));
            return;
        }

        // Verificar se já criou turmas
        if (frm.doc.apuramento_novas_turmas && frm.doc.apuramento_novas_turmas.length > 0) {
            frappe.msgprint(__('As turmas já foram criadas. Veja a tabela "Novas Turmas Criadas".'));
            return;
        }

        // Verificar se documento foi guardado
        if (frm.is_new()) {
            frappe.msgprint(__('Guarde o documento primeiro antes de criar as turmas.'));
            return;
        }

        // Confirmar
        frappe.confirm(
            __('Tem certeza que deseja criar as novas turmas? Esta acção irá:<br><br>' +
                '• Criar novas turmas para os catecúmenos<br>' +
                '• Actualizar a turma e fase de cada catecúmeno<br>' +
                '• Inactivar as turmas de origem'),
            function () {
                // Chamar API directamente sem save
                executar_criar_turmas(frm);
            }
        );
    },
    
    destino_repetentes: function(frm) {
        if (frm.doc.destino_repetentes === "Adicionar às Turmas Existentes") {
            // Mostrar turmas disponíveis
            let fase_repetentes = frm.doc.fase_seguinte_permanece || frm.doc.fase_actual;
            let ano = frm.doc.ano_lectivo_seguinte;
            
            if (!fase_repetentes || !ano) {
                frappe.msgprint(__('Preencha o Ano Lectivo Seguinte e a Fase primeiro.'));
                return;
            }
            
            frappe.call({
                method: 'portal.catequese.apuramento_turmas.get_turmas_disponiveis_para_repetentes',
                args: {
                    ano_lectivo: ano,
                    fase: fase_repetentes
                },
                callback: function(r) {
                    if (r.message && r.message.length > 0) {
                        let html = '<div style="background: #e8f5e9; padding: 10px; border-radius: 6px; margin-top: 10px;">';
                        html += '<strong>📚 Turmas disponíveis para adicionar repetentes:</strong><ul style="margin: 10px 0 0 0;">';
                        r.message.forEach(function(t) {
                            html += '<li><strong>' + t.turma + '</strong> - ' + t.total_catecumenos + ' catecúmenos (≈' + t.vagas + ' vagas)</li>';
                        });
                        html += '</ul></div>';
                        
                        frappe.msgprint({
                            title: __('Turmas Existentes'),
                            indicator: 'green',
                            message: html
                        });
                    } else {
                        frappe.msgprint({
                            title: __('Aviso'),
                            indicator: 'orange',
                            message: __('Não existem turmas activas para {0} {1}. Serão criadas novas turmas.', [ano, fase_repetentes])
                        });
                    }
                }
            });
        }
    },

    // Quando muda a fase_actual, limpar tabelas
    fase_actual: function (frm) {
        if (frm.doc.apuramento_turmas && frm.doc.apuramento_turmas.length > 0) {
            frappe.confirm(
                __('Mudar a fase vai limpar as turmas e catecúmenos carregados. Continuar?'),
                function () {
                    frm.clear_table('apuramento_turmas');
                    frm.clear_table('apuramento_item');
                    frm.refresh_field('apuramento_turmas');
                    frm.refresh_field('apuramento_item');
                    frm.set_value('total_catecumenos', 0);
                    frm.set_value('turmas_previstas', 0);
                }
            );
        }
    },

    carregar_turmas_fase: function (frm) {
        // Validações
        if (!frm.doc.ano_lectivo_actual) {
            frappe.msgprint(__('Preencha o Ano Lectivo Actual primeiro.'));
            return;
        }
        if (!frm.doc.fase_actual) {
            frappe.msgprint(__('Preencha a Fase Actual primeiro.'));
            return;
        }

        frappe.call({
            method: 'portal.catequese.apuramento_turmas.get_turmas_por_fase',
            args: {
                ano_lectivo: frm.doc.ano_lectivo_actual,
                fase: frm.doc.fase_actual
            },
            freeze: true,
            freeze_message: __('A carregar turmas...'),
            callback: function (r) {
                if (!r.message || r.message.length === 0) {
                    frappe.msgprint(__('Nenhuma turma activa encontrada para esta fase e ano lectivo.'));
                    return;
                }

                // Limpar tabela existente
                frm.clear_table('apuramento_turmas');

                // Adicionar turmas
                r.message.forEach(function (t) {
                    let row = frm.add_child('apuramento_turmas');
                    row.turma = t.turma;
                    row.total_catecumenos = t.total_catecumenos;
                    row.incluir = 1;
                });

                frm.refresh_field('apuramento_turmas');
                frappe.msgprint(__('Carregadas {0} turma(s). Agora clique em "Carregar Catecúmenos".', [r.message.length]));
            }
        });
    },

    carregar_catecumenos: function (frm) {
        if (!frm.doc.apuramento_turmas || frm.doc.apuramento_turmas.length === 0) {
            frappe.msgprint(__('Adicione turmas primeiro usando "Carregar Turmas da Fase".'));
            return;
        }

        let turmas_a_processar = (frm.doc.apuramento_turmas || []).filter(t => t.incluir && t.turma);

        if (turmas_a_processar.length === 0) {
            frappe.msgprint(__('Selecione pelo menos uma turma para incluir.'));
            return;
        }

        // Preparar dados
        let turmas_data = turmas_a_processar.map(function (row) {
            return {
                turma: row.turma,
                incluir: 1
            };
        });

        frappe.call({
            method: 'portal.catequese.apuramento_turmas.carregar_catecumenos_das_turmas',
            args: {
                turmas_json: JSON.stringify(turmas_data)
            },
            freeze: true,
            freeze_message: __('A carregar catecúmenos...'),
            callback: function (r) {
                if (!r.message || r.message.length === 0) {
                    frappe.msgprint(__('Nenhum catecúmeno activo encontrado nas turmas seleccionadas.'));
                    return;
                }

                // Limpar tabela existente
                frm.clear_table('apuramento_item');

                // Adicionar catecúmenos
                r.message.forEach(function (cat) {
                    let row = frm.add_child('apuramento_item');
                    row.catecumeno = cat.catecumeno;
                    row.nome_catecumeno = cat.nome_catecumeno;
                    row.turma_nome = cat.turma_nome;
                    row.status = cat.status;
                    row.encarregado = cat.encarregado;
                    row.contacto = cat.contacto;
                    row.data_de_nascimento = cat.data_de_nascimento;
                    row.idade = cat.idade;
                    row.sexo = cat.sexo;
                    row.resultado = cat.resultado || '';  // Vem do pre_avaliacao da turma
                });

                frm.refresh_field('apuramento_item');
                frm.set_value('total_catecumenos', r.message.length);

                // Contar quantos já têm resultado
                let com_resultado = r.message.filter(c => c.resultado).length;
                let sem_resultado = r.message.length - com_resultado;

                let msg = __('Carregados {0} catecúmeno(s).', [r.message.length]);
                if (com_resultado > 0) {
                    msg += ' ' + __('{0} já têm resultado definido.', [com_resultado]);
                }
                if (sem_resultado > 0) {
                    msg += ' ' + __('{0} sem resultado - defina manualmente.', [sem_resultado]);
                }
                frappe.msgprint(msg);
            }
        });
    },

    marcar_todos_transitam: function (frm) {
        (frm.doc.apuramento_item || []).forEach(function (row) {
            row.resultado = 'Transita';
        });
        frm.refresh_field('apuramento_item');
        frappe.show_alert({ message: __('Todos marcados como Transita'), indicator: 'green' });
    },

    marcar_todos_permanecem: function (frm) {
        (frm.doc.apuramento_item || []).forEach(function (row) {
            row.resultado = 'Permanece';
        });
        frm.refresh_field('apuramento_item');
        frappe.show_alert({ message: __('Todos marcados como Permanece'), indicator: 'orange' });
    },

    pre_visualizar: function (frm) {
        // Validações
        if (!frm.doc.fase_seguinte) {
            frappe.msgprint(__('Preencha a Fase Seguinte primeiro.'));
            return;
        }

        if (!frm.doc.apuramento_item || frm.doc.apuramento_item.length === 0) {
            frappe.msgprint(__('Carregue os catecúmenos primeiro.'));
            return;
        }

        // Verificar se todos têm resultado
        let sem_resultado = (frm.doc.apuramento_item || []).filter(function (row) {
            let res = (row.resultado || '').trim();
            return !['Transita', 'Permanece', 'Desistente'].includes(res);
        });

        if (sem_resultado.length > 0) {
            frappe.msgprint(__('Existem {0} catecúmeno(s) sem resultado definido. Defina Transita, Permanece ou Desistente para todos.', [sem_resultado.length]));
            return;
        }

        // Preparar dados
        let items_data = (frm.doc.apuramento_item || []).map(function (row) {
            return {
                catecumeno: row.catecumeno,
                turma_nome: row.turma_nome,
                status: row.status,
                resultado: row.resultado
            };
        });

        frappe.call({
            method: 'portal.catequese.apuramento_turmas.preview_distribuicao',
            args: {
                apuramento_items_json: JSON.stringify(items_data),
                tamanho_min: frm.doc.tamanho_minimo || ((frappe.boot.catequese && frappe.boot.catequese.tamanho_minimo) || 20),
                tamanho_ideal: frm.doc.tamanho_ideal || ((frappe.boot.catequese && frappe.boot.catequese.tamanho_ideal) || 25),
                tamanho_max: frm.doc.tamanho_maximo || ((frappe.boot.catequese && frappe.boot.catequese.tamanho_maximo) || 30),
                manter_estrutura: frm.doc.tipo_distribuicao === "Manter Estrutura",
                destino_repetentes: frm.doc.destino_repetentes || "Criar Novas Turmas",
                ano_lectivo_seguinte: frm.doc.ano_lectivo_seguinte,
                fase_permanece: frm.doc.fase_seguinte_permanece || frm.doc.fase_actual
            },
            freeze: true,
            freeze_message: __('A gerar pré-visualização...'),
            callback: function (r) {
                if (!r.message) {
                    frappe.msgprint(__('Erro ao gerar pré-visualização.'));
                    return;
                }

                let data = r.message;
                let turmas_transitam = data.turmas_transitam || [];
                let turmas_permanecem = data.turmas_permanecem || [];
                let totais = data.totais || {};

                // Obter lista de turmas origem
                let turmas_origem = (frm.doc.apuramento_turmas || [])
                    .filter(t => t.incluir)
                    .map(t => t.turma);

                // Determinar fase para permanecem
                let fase_para_permanecem = frm.doc.fase_seguinte_permanece || frm.doc.fase_actual;

                // Gerar HTML
                let html = gerar_html_preview(
                    turmas_transitam,
                    turmas_permanecem,
                    frm.doc.fase_seguinte,
                    fase_para_permanecem,
                    frm.doc.ano_lectivo_seguinte,
                    turmas_origem,
                    totais
                );

                // Mostrar no dialog
                let d = new frappe.ui.Dialog({
                    title: __('Pré-visualização da Distribuição'),
                    size: 'extra-large',
                    fields: [
                        {
                            fieldtype: 'HTML',
                            fieldname: 'preview_content',
                            options: html
                        }
                    ],
                    primary_action_label: __('Fechar'),
                    primary_action: function () {
                        d.hide();
                    }
                });

                d.show();

                // Actualizar campo HTML e totais
                frm.set_df_property('preview_html', 'options', html);
                frm.set_value('total_catecumenos', totais.total || 0);
                frm.set_value('turmas_previstas', turmas_transitam.length + turmas_permanecem.length);
            }
        });
    }
});

// Actualizar totais quando muda resultado
frappe.ui.form.on('Apuramento Item', {
    resultado: function (frm, cdt, cdn) {
        actualizar_contagem(frm);
    },

    apuramento_item_remove: function (frm) {
        actualizar_contagem(frm);
    }
});

function actualizar_contagem(frm) {
    let transitam = 0;
    let permanecem = 0;

    (frm.doc.apuramento_item || []).forEach(function (row) {
        let res = (row.resultado || '').trim();
        if (res === 'Transita') transitam++;
        else if (res === 'Permanece') permanecem++;
    });

    frm.set_value('total_catecumenos', transitam + permanecem);
}

// Função para gerar HTML de pré-visualização
function gerar_html_preview(turmas_transitam, turmas_permanecem, fase_seguinte, fase_permanece, ano_seguinte, turmas_origem, totais) {

    let total_turmas = turmas_transitam.length + turmas_permanecem.length;

    let html = `
        <style>
            .preview-container { font-family: var(--font-stack); }
            .preview-summary { 
                background: var(--bg-light-gray); 
                padding: 15px; 
                border-radius: 8px; 
                margin-bottom: 20px;
            }
            .preview-summary h4 { margin: 0 0 10px 0; color: var(--text-color); }
            .preview-stats { display: flex; gap: 15px; flex-wrap: wrap; }
            .preview-stat { 
                background: white; 
                padding: 10px 15px; 
                border-radius: 6px;
                border-left: 4px solid var(--primary);
                min-width: 100px;
            }
            .preview-stat.transitam { border-left-color: #28a745; }
            .preview-stat.permanecem { border-left-color: #ffc107; }
            .preview-stat-value { font-size: 24px; font-weight: bold; color: var(--primary); }
            .preview-stat-label { font-size: 12px; color: var(--text-muted); }
            .section-title {
                font-size: 16px;
                font-weight: bold;
                margin: 20px 0 10px 0;
                padding: 8px 12px;
                border-radius: 6px;
            }
            .section-title.transitam { background: #d4edda; color: #155724; }
            .section-title.permanecem { background: #fff3cd; color: #856404; }
            .turma-card {
                border: 1px solid var(--border-color);
                border-radius: 8px;
                margin-bottom: 15px;
                overflow: hidden;
            }
            .turma-header {
                background: var(--bg-color);
                padding: 12px 15px;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .turma-title { font-weight: bold; font-size: 14px; }
            .turma-count { 
                background: var(--primary); 
                color: white; 
                padding: 2px 10px; 
                border-radius: 12px;
                font-size: 12px;
            }
            .turma-count.transitam { background: #28a745; }
            .turma-count.permanecem { background: #ffc107; color: #333; }
            .turma-body { padding: 15px; }
            .turma-origens { 
                font-size: 12px; 
                color: var(--text-muted); 
                margin-bottom: 10px;
            }
            .turma-lista {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 8px;
                max-height: 200px;
                overflow-y: auto;
            }
            .catecumeno-item {
                background: var(--bg-light-gray);
                padding: 6px 10px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .catecumeno-item.transitam { border-left: 3px solid #28a745; }
            .catecumeno-item.permanecem { border-left: 3px solid #ffc107; }
            .warning-box {
                background: #fff3cd;
                border: 1px solid #ffc107;
                padding: 10px 15px;
                border-radius: 6px;
                margin-top: 15px;
                font-size: 13px;
            }
            .turmas-antigas {
                margin-top: 20px;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 8px;
            }
            .turmas-antigas h5 { margin: 0 0 10px 0; }
            .turmas-antigas ul { margin: 0; padding-left: 20px; }
            .empty-section {
                padding: 20px;
                text-align: center;
                color: var(--text-muted);
                background: var(--bg-light-gray);
                border-radius: 8px;
                margin-bottom: 15px;
            }
        </style>
        
        <div class="preview-container">
            <div class="preview-summary">
                <h4>📊 Resumo da Distribuição</h4>
                <div class="preview-stats">
                    <div class="preview-stat transitam">
                        <div class="preview-stat-value">${totais.transitam || 0}</div>
                        <div class="preview-stat-label">Transitam</div>
                    </div>
                    <div class="preview-stat permanecem">
                        <div class="preview-stat-value">${totais.permanecem || 0}</div>
                        <div class="preview-stat-label">Permanecem</div>
                    </div>
                    <div class="preview-stat">
                        <div class="preview-stat-value">${total_turmas}</div>
                        <div class="preview-stat-label">Novas Turmas</div>
                    </div>
                    <div class="preview-stat">
                        <div class="preview-stat-value">${ano_seguinte || '-'}</div>
                        <div class="preview-stat-label">Ano Lectivo</div>
                    </div>
                </div>
            </div>
    `;

    // Secção Transitam
    html += `<div class="section-title transitam">🟢 Transitam para ${fase_seguinte} (${turmas_transitam.length} turma${turmas_transitam.length !== 1 ? 's' : ''})</div>`;

    if (turmas_transitam.length === 0) {
        html += `<div class="empty-section">Nenhum catecúmeno a transitar</div>`;
    } else {
        turmas_transitam.forEach(function (turma) {
            html += gerar_turma_card(turma, ano_seguinte, fase_seguinte, 'transitam', 'T');
        });
    }

    // Secção Permanecem - usa fase_permanece
    // Secção Permanecem - usa fase_permanece
    let permanecem_titulo = turmas_permanecem.length > 0 && turmas_permanecem[0].turma_existente 
        ? `🟡 Repetentes → Adicionar às Turmas Existentes (${fase_permanece})`
        : `🟡 Permanecem → ${fase_permanece} (${turmas_permanecem.length} turma${turmas_permanecem.length !== 1 ? 's' : ''})`;
    
    html += `<div class="section-title permanecem">${permanecem_titulo}</div>`;

    if (turmas_permanecem.length === 0) {
        html += `<div class="empty-section">Nenhum catecúmeno a permanecer</div>`;
    } else {
        turmas_permanecem.forEach(function (turma) {
            html += gerar_turma_card(turma, ano_seguinte, fase_permanece, 'permanecem', 'P');
        });
    }

    // Turmas antigas
    html += `
        <div class="turmas-antigas">
            <h5>⚠️ Turmas que serão inactivadas após submissão:</h5>
            <ul>
    `;

    turmas_origem.forEach(function (t) {
        html += `<li>${t}</li>`;
    });

    html += `
            </ul>
        </div>
        
        <div class="warning-box">
            <strong>⚡ Nota:</strong> Esta é apenas uma pré-visualização. 
            As turmas só serão criadas após clicar em <strong>Submeter</strong>.
        </div>
    </div>
    `;

    return html;
}

// Função para executar a criação de turmas
function executar_criar_turmas(frm) {
    frappe.call({
        method: 'portal.catequese.apuramento_turmas.criar_novas_turmas',
        args: {
            apuramento_name: frm.doc.name
        },
        freeze: true,
        freeze_message: __('A criar novas turmas...'),
        callback: function (r) {
            if (r.message && r.message.success) {
                frappe.show_alert({
                    message: __('Criadas {0} turma(s) com sucesso!', [r.message.total_turmas]),
                    indicator: 'green'
                });
                frm.reload_doc();
            } else {
                frappe.msgprint(__('Erro: ') + (r.message ? r.message.error : 'Erro desconhecido'));
            }
        },
        error: function (err) {
            frappe.msgprint(__('Erro: ') + (err.message || err));
        }
    });
}

function gerar_turma_card(turma, ano_seguinte, fase, tipo, prefixo) {
    let catecumenos = turma.catecumenos || [];
    let primeiro = catecumenos[0]?.catecumeno || '';
    let ultimo = catecumenos[catecumenos.length - 1]?.catecumeno || '';
    let letra_inicio = primeiro.charAt(0).toUpperCase();
    let letra_fim = ultimo.charAt(0).toUpperCase();

    // Verificar se é turma existente (para repetentes)
    let is_turma_existente = turma.turma_existente ? true : false;
    let nome_turma = is_turma_existente 
        ? turma.turma_existente 
        : `${ano_seguinte} ${fase} ${prefixo}${turma.numero}`;
    
    let info_adicional = '';
    if (is_turma_existente) {
        info_adicional = `
            <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-bottom: 10px; font-size: 12px;">
                📊 <strong>Actual:</strong> ${turma.total_actual || 0} → 
                <strong>Após:</strong> ${turma.total_apos || 0} catecúmenos
            </div>
        `;
    }

    // Origens
    let origens = turma.origens || {};
    let origens_arr = [];
    for (let origem in origens) {
        origens_arr.push(origem + ' (' + origens[origem] + ')');
    }
    let origens_str = origens_arr.join(', ');

    let html = `
        <div class="turma-card">
            <div class="turma-header">
                <span class="turma-title">
                    ${is_turma_existente ? '📥 ' : ''}${nome_turma}
                    <span style="color: var(--text-muted); font-weight: normal;">
                        (${letra_inicio} - ${letra_fim})
                    </span>
                </span>
                <span class="turma-count ${tipo}">${catecumenos.length} ${is_turma_existente ? 'a adicionar' : 'catecúmenos'}</span>
            </div>
            <div class="turma-body">
                ${info_adicional}
                <div class="turma-origens">
                    <strong>Origens:</strong> ${origens_str}
                </div>
                <div class="turma-lista">
    `;

    catecumenos.forEach(function (cat) {
        html += `<div class="catecumeno-item ${tipo}">${cat.catecumeno}</div>`;
    });

    html += `
                </div>
            </div>
        </div>
    `;

    return html;
}

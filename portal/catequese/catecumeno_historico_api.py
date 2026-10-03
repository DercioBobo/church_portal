# API para Histórico do Catecúmeno - Versão Corrigida
# Localização: portal/catequese/catecumeno_historico.py
#
# ALTERAÇÃO: Busca Inscrição por nome_completo em vez de name

import frappe
from frappe import _
from frappe.utils import getdate, format_date, cstr

@frappe.whitelist()
def get_historico_catecumeno(catecumeno):
    """
    Retorna o histórico completo de um catecúmeno.
    Inclui: inscrição, turmas (com catequistas), trocas, transferências, 
    preparações, apuramentos, sacramentos.
    """
    if not catecumeno:
        frappe.throw(_("Catecúmeno não especificado"))
    
    # Verificar se existe
    if not frappe.db.exists("Catecumeno", catecumeno):
        frappe.throw(_("Catecúmeno não encontrado"))
    
    # Buscar dados do catecúmeno
    cat = frappe.get_doc("Catecumeno", catecumeno)
    
    eventos = []
    
    # === 1. INSCRIÇÃO ===
    # CORRIGIDO: Buscar por nome_completo (o name da Inscrição agora é série INS-0001)
    try:
        inscricao = frappe.db.get_value(
            "Inscricao", 
            {"nome_completo": catecumeno},  # Buscar pelo nome_completo
            ["name", "creation", "fase", "turma", "nome_completo"],
            as_dict=True
        )
        
        if inscricao:
            # Buscar detalhes da turma de inscrição
            turma_inscricao_info = ""
            if inscricao.turma:
                turma_insc = frappe.db.get_value("Turma", inscricao.turma, 
                    ["catequistas", "local", "dia", "hora"], as_dict=True)
                if turma_insc:
                    turma_inscricao_info = f"<br>Catequistas: <strong>{turma_insc.catequistas or '-'}</strong>"
                    if turma_insc.local or turma_insc.dia or turma_insc.hora:
                        turma_inscricao_info += f"<br>📍 {turma_insc.local or ''} | {turma_insc.dia or ''} {turma_insc.hora or ''}"
            
            eventos.append({
                "data": str(inscricao.creation),
                "tipo": "inscricao",
                "icone": "📝",
                "titulo": "Inscrição na Catequese",
                "descricao": f"Inscrito na fase <strong>{inscricao.fase or '-'}</strong><br>"
                            f"Turma: <strong>{inscricao.turma or 'Sem turma (pré-inscrição)'}</strong>"
                            f"{turma_inscricao_info}",
                "cor": "#28a745"
            })
        else:
            eventos.append({
                "data": str(cat.creation),
                "tipo": "criacao",
                "icone": "👤",
                "titulo": "Registo Criado",
                "descricao": "Catecúmeno registado no sistema",
                "cor": "#6c757d"
            })
    except Exception as e:
        frappe.log_error(f"Erro inscrição: {str(e)}", "Histórico Catecúmeno")
        eventos.append({
            "data": str(cat.creation),
            "tipo": "criacao",
            "icone": "👤",
            "titulo": "Registo Criado",
            "descricao": "Catecúmeno registado no sistema",
            "cor": "#6c757d"
        })
    
    # === 2. HISTÓRICO DE TURMAS (com detalhes completos) ===
    try:
        turmas_registos = frappe.db.sql("""
            SELECT 
                tc.parent as turma_name,
                tc.creation,
                tc.estado,
                tc.pre_avaliacao,
                tc.nr_de_faltas,
                tc.renovacao,
                tc.ficha_de_catecumeno,
                tc.observacoes as obs_catecumeno,
                t.fase,
                t.ano_lectivo,
                t.status as turma_status,
                t.catequista,
                t.catequista_adj,
                t.catequistas,
                t.local,
                t.dia,
                t.hora,
                t.observacoes as obs_turma
            FROM `tabTurma Catecumenos` tc
            INNER JOIN `tabTurma` t ON t.name = tc.parent
            WHERE tc.catecumeno = %s
            ORDER BY tc.creation ASC
        """, catecumeno, as_dict=True)
        
        for idx, t in enumerate(turmas_registos):
            is_turma_actual = (t.turma_name == cat.turma)
            
            # Construir descrição detalhada
            desc = f"Fase: <strong>{t.fase or '-'}</strong> | Ano: <strong>{t.ano_lectivo or '-'}</strong><br>"
            desc += f"Catequistas: <strong>{t.catequistas or '-'}</strong><br>"
            
            # Local e horário
            if t.local or t.dia or t.hora:
                desc += f"📍 {t.local or '-'} | {t.dia or '-'} às {t.hora or '-'}<br>"
            
            # Estado e avaliação
            desc += f"Estado: <strong>{t.estado or '-'}</strong>"
            if t.pre_avaliacao:
                avaliacao_icone = "✅" if t.pre_avaliacao == "Transita" else "🔁"
                desc += f" | Avaliação: {avaliacao_icone} <strong>{t.pre_avaliacao}</strong>"
            
            # Faltas
            if t.nr_de_faltas:
                desc += f"<br>Faltas: <strong>{t.nr_de_faltas}</strong>"
            
            # Renovação e Ficha
            extras = []
            if t.renovacao:
                extras.append(f"Renovação: {t.renovacao}")
            if t.ficha_de_catecumeno:
                extras.append("📋 Ficha entregue")
            if extras:
                desc += f"<br>{' | '.join(extras)}"
            
            # Observações
            if t.obs_catecumeno:
                desc += f"<br><em>Obs: {t.obs_catecumeno}</em>"
            
            if is_turma_actual:
                eventos.append({
                    "data": str(t.creation) if t.creation else "",
                    "tipo": "turma_actual",
                    "icone": "🎯",
                    "titulo": f"TURMA ACTUAL: {t.turma_name}",
                    "descricao": desc,
                    "cor": "#28a745"
                })
            else:
                eventos.append({
                    "data": str(t.creation) if t.creation else "",
                    "tipo": "turma",
                    "icone": "👥",
                    "titulo": f"Turma: {t.turma_name}",
                    "descricao": desc,
                    "cor": "#17a2b8" if t.turma_status == "Activo" else "#6c757d"
                })
                
    except Exception as e:
        frappe.log_error(f"Erro ao buscar turmas: {str(e)}", "Histórico Catecúmeno")
    
    # === 3. TROCAS DE TURMA ===
    try:
        trocas = frappe.db.sql("""
            SELECT 
                tt.name,
                tt.creation,
                tt.data_da_troca,
                tt.turma_actual,
                tt.nova_turma,
                tt.motivo,
                tt.docstatus,
                ta.fase as fase_anterior,
                ta.ano_lectivo as ano_anterior,
                ta.catequistas as catequistas_anterior,
                tn.fase as fase_nova,
                tn.ano_lectivo as ano_nova,
                tn.catequistas as catequistas_nova
            FROM `tabTroca de Turma` tt
            LEFT JOIN `tabTurma` ta ON ta.name = tt.turma_actual
            LEFT JOIN `tabTurma` tn ON tn.name = tt.nova_turma
            WHERE tt.catecumeno = %s AND tt.docstatus = 1
            ORDER BY COALESCE(tt.data_da_troca, tt.creation) ASC
        """, catecumeno, as_dict=True)
        
        for troca in trocas:
            data_evento = str(troca.data_da_troca) if troca.data_da_troca else str(troca.creation)
            
            desc = f"<strong>De:</strong> {troca.turma_actual or '-'}"
            if troca.fase_anterior:
                desc += f" ({troca.fase_anterior})"
            desc += f"<br><strong>Para:</strong> {troca.nova_turma or '-'}"
            if troca.fase_nova:
                desc += f" ({troca.fase_nova})"
            
            if troca.motivo:
                desc += f"<br><em>Motivo: {troca.motivo}</em>"
            
            eventos.append({
                "data": data_evento,
                "tipo": "troca",
                "icone": "🔄",
                "titulo": "Troca de Turma",
                "descricao": desc,
                "cor": "#fd7e14"
            })
    except Exception as e:
        frappe.log_error(f"Erro ao buscar trocas: {str(e)}", "Histórico Catecúmeno")
    
    # === 4. TRANSFERÊNCIAS PARA OUTRA PARÓQUIA ===
    try:
        transferencias = frappe.db.sql("""
            SELECT 
                name,
                creation,
                data,
                fase,
                turma,
                nova_paroquia,
                arquidiocese,
                docstatus
            FROM `tabTransferencia de Catecumeno`
            WHERE catecumeno = %s AND docstatus = 1
            ORDER BY COALESCE(data, creation) ASC
        """, catecumeno, as_dict=True)
        
        for transf in transferencias:
            data_evento = str(transf.data) if transf.data else str(transf.creation)
            
            desc = f"Transferido da turma <strong>{transf.turma or '-'}</strong> ({transf.fase or '-'})<br>"
            desc += f"<strong>Nova Paróquia:</strong> {transf.nova_paroquia or '-'}"
            if transf.arquidiocese:
                desc += f"<br><strong>Arquidiocese:</strong> {transf.arquidiocese}"
            
            eventos.append({
                "data": data_evento,
                "tipo": "transferencia",
                "icone": "✈️",
                "titulo": "Transferência para outra Paróquia",
                "descricao": desc,
                "cor": "#dc3545"
            })
    except Exception as e:
        frappe.log_error(f"Erro ao buscar transferências: {str(e)}", "Histórico Catecúmeno")
    
    # === 5. PREPARAÇÕES DE SACRAMENTO ===
    try:
        preparacoes = frappe.db.sql("""
            SELECT 
                cst.parent as preparacao,
                cst.creation,
                cst.ficha,
                cst.documentos_padrinhos,
                cst.sacerdote,
                cst.date as data_candidato,
                ps.sacramento,
                ps.data_do_sacramento,
                ps.ano_lectivo,
                ps.docstatus
            FROM `tabCandidatos Sacramento Table` cst
            INNER JOIN `tabPreparacao do Sacramento` ps ON ps.name = cst.parent
            WHERE cst.catecumeno = %s
            ORDER BY cst.creation ASC
        """, catecumeno, as_dict=True)
        
        for p in preparacoes:
            status_prep = "✅ Concluída" if p.docstatus == 1 else "⏳ Em preparação"
            data_sac = format_date(p.data_do_sacramento) if p.data_do_sacramento else None
            
            desc = f"Ano Lectivo: <strong>{p.ano_lectivo or '-'}</strong><br>"
            desc += f"Status: <strong>{status_prep}</strong>"
            
            if data_sac:
                desc += f"<br>Data do Sacramento: <strong>{data_sac}</strong>"
            
            if p.sacerdote:
                desc += f"<br>Sacerdote: <strong>{p.sacerdote}</strong>"
            
            # Documentação
            docs = []
            if p.ficha:
                docs.append("📋 Ficha")
            if p.documentos_padrinhos:
                docs.append("📄 Docs Padrinhos")
            if docs:
                desc += f"<br>Documentos: {', '.join(docs)}"
            
            eventos.append({
                "data": str(p.creation) if p.creation else "",
                "tipo": "preparacao",
                "icone": "⛪",
                "titulo": f"Preparação: {p.sacramento}",
                "descricao": desc,
                "cor": "#28a745" if p.docstatus == 1 else "#ffc107"
            })
    except Exception as e:
        frappe.log_error(f"Erro ao buscar preparações: {str(e)}", "Histórico Catecúmeno")
    
    # === 6. APURAMENTOS (Progressões) ===
    try:
        apuramentos = frappe.db.sql("""
            SELECT 
                ai.parent as apuramento,
                ai.creation,
                ai.resultado,
                ai.turma_nome,
                ap.ano_lectivo_actual,
                ap.ano_lectivo_seguinte,
                ap.fase_actual,
                ap.fase_seguinte,
                ap.docstatus
            FROM `tabApuramento Item` ai
            INNER JOIN `tabApuramento de Turmas` ap ON ap.name = ai.parent
            WHERE ai.catecumeno = %s
            ORDER BY ai.creation ASC
        """, catecumeno, as_dict=True)
        
        for a in apuramentos:
            resultado_icone = "✅" if a.resultado == "Transita" else ("🔁" if a.resultado == "Permanece" else "❓")
            status_apur = "Concluído" if a.docstatus == 1 else "Em processamento"
            
            desc = f"Ano: <strong>{a.ano_lectivo_actual}</strong> → <strong>{a.ano_lectivo_seguinte}</strong><br>"
            desc += f"Fase: <strong>{a.fase_actual}</strong> → <strong>{a.fase_seguinte}</strong><br>"
            desc += f"Resultado: {resultado_icone} <strong>{a.resultado or 'Pendente'}</strong><br>"
            desc += f"Status: {status_apur}"
            
            if a.turma_nome:
                desc += f"<br>Turma origem: {a.turma_nome}"
            
            eventos.append({
                "data": str(a.creation) if a.creation else "",
                "tipo": "apuramento",
                "icone": "📊",
                "titulo": f"Apuramento de Fim de Ano",
                "descricao": desc,
                "cor": "#28a745" if a.resultado == "Transita" else ("#ffc107" if a.resultado == "Permanece" else "#6c757d")
            })
    except Exception as e:
        frappe.log_error(f"Erro ao buscar apuramentos: {str(e)}", "Histórico Catecúmeno")
    
    # === 7. SACRAMENTOS RECEBIDOS ===
    if cat.baptismo:
        data_bapt = str(cat.data_do_baptismo) if cat.data_do_baptismo else str(cat.modified)
        eventos.append({
            "data": data_bapt,
            "tipo": "sacramento",
            "icone": "💧",
            "titulo": "Sacramento: Baptismo",
            "descricao": f"Recebeu o sacramento do <strong>Baptismo</strong>"
                        f"{'<br>Data: <strong>' + format_date(cat.data_do_baptismo) + '</strong>' if cat.data_do_baptismo else ''}",
            "cor": "#007bff"
        })
    
    if cat.eucaristia:
        data_euc = str(cat.data_da_eucaristia) if cat.data_da_eucaristia else str(cat.modified)
        eventos.append({
            "data": data_euc,
            "tipo": "sacramento",
            "icone": "🍞",
            "titulo": "Sacramento: Primeira Eucaristia",
            "descricao": f"Recebeu a <strong>Primeira Eucaristia</strong>"
                        f"{'<br>Data: <strong>' + format_date(cat.data_da_eucaristia) + '</strong>' if cat.data_da_eucaristia else ''}",
            "cor": "#007bff"
        })
    
    if cat.crisma:
        data_crisma = str(cat.data_do_crisma) if cat.data_do_crisma else str(cat.modified)
        eventos.append({
            "data": data_crisma,
            "tipo": "sacramento",
            "icone": "🔥",
            "titulo": "Sacramento: Crisma",
            "descricao": f"Recebeu o sacramento do <strong>Crisma</strong>"
                        f"{'<br>Data: <strong>' + format_date(cat.data_do_crisma) + '</strong>' if cat.data_do_crisma else ''}",
            "cor": "#dc3545"
        })
    
    # === 8. ESTADO ACTUAL ===
    # Buscar detalhes da turma actual
    turma_actual_info = ""
    if cat.turma:
        try:
            turma_act = frappe.db.get_value("Turma", cat.turma,
                ["fase", "ano_lectivo", "catequistas", "local", "dia", "hora", "status"], as_dict=True)
            if turma_act:
                turma_actual_info = f"<br>Fase: <strong>{turma_act.fase or '-'}</strong> | Ano: <strong>{turma_act.ano_lectivo or '-'}</strong>"
                turma_actual_info += f"<br>Catequistas: <strong>{turma_act.catequistas or '-'}</strong>"
                if turma_act.local or turma_act.dia or turma_act.hora:
                    turma_actual_info += f"<br>📍 {turma_act.local or '-'} | {turma_act.dia or '-'} às {turma_act.hora or '-'}"
        except:
            pass
    
    eventos.append({
        "data": str(cat.modified),
        "tipo": "actual",
        "icone": "📍",
        "titulo": "Estado Actual",
        "descricao": f"Status: <strong>{cat.status or '-'}</strong><br>"
                    f"Turma: <strong>{cat.turma or 'Sem turma'}</strong>"
                    f"{turma_actual_info}",
        "cor": "#28a745" if cat.status == "Activo" else ("#007bff" if cat.status == "Crismado" else "#6c757d")
    })
    
    # Ordenar por data
    def sort_key(x):
        if x["data"]:
            return x["data"]
        return ""
    
    eventos.sort(key=sort_key)
    
    # Dados do catecúmeno para o resumo
    sacramentos = []
    if cat.baptismo:
        sacramentos.append("Baptismo")
    if cat.eucaristia:
        sacramentos.append("Eucaristia")
    if cat.crisma:
        sacramentos.append("Crisma")
    
    # Contar turmas por onde passou
    total_turmas = len([e for e in eventos if e["tipo"] in ["turma", "turma_actual"]])
    
    return {
        "catecumeno": {
            "name": cat.name,
            "nome_completo": getattr(cat, 'nome_completo', cat.name),
            "idade": getattr(cat, 'idade', None),
            "sexo": getattr(cat, 'sexo', None),
            "fase": getattr(cat, 'fase', None),
            "turma": getattr(cat, 'turma', None),
            "status": getattr(cat, 'status', None),
            "encarregado": getattr(cat, 'encarregado', None),
            "contacto": getattr(cat, 'contacto', None),
            "sacramentos": sacramentos,
            "total_sacramentos": len(sacramentos),
            "total_turmas": total_turmas
        },
        "eventos": eventos,
        "total_eventos": len(eventos)
    }
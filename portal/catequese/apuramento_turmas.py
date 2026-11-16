# -*- coding: utf-8 -*-
# Ficheiro: portal/catequese/apuramento_turmas.py
# Métodos whitelisted para Apuramento de Turmas

import frappe
from frappe import _

from portal.catequese.utils import tamanhos_turma

@frappe.whitelist()
def get_turmas_por_fase(ano_lectivo, fase):
    """
    Busca turmas activas de uma fase e ano lectivo.
    
    Args:
        ano_lectivo: Ano lectivo
        fase: Fase das turmas
    
    Returns:
        Lista de turmas com informações
    """
    
    turmas = frappe.get_all(
        "Turma",
        filters={
            "fase": fase,
            "ano_lectivo": ano_lectivo,
            "status": "Activo"
        },
        fields=["name", "fase", "ano_lectivo", "catequista"]
    )
    
    resultado = []
    
    for turma in turmas:
        turma_doc = frappe.get_doc("Turma", turma.name)
        lista = turma_doc.get("lista_catecumenos") or []
        
        # Contar apenas activos
        total = 0
        for cat in lista:
            status = (cat.get("estado") or "").lower()
            if status not in ["inactivo", "inativo", "desistente"]:
                total += 1
        
        resultado.append({
            "turma": turma.name,
            "fase": turma.fase,
            "catequista": turma.catequista,
            "total_catecumenos": total
        })
    
    return resultado


@frappe.whitelist()
def carregar_catecumenos_das_turmas(turmas_json):
    """
    Carrega todos os catecúmenos das turmas seleccionadas.
    Busca o resultado (Transita/Permanece) da tabela lista_catecumenos da turma original.
    
    Args:
        turmas_json: JSON string com lista de turmas
                     [{"turma": "...", "incluir": 1}, ...]
    
    Returns:
        Lista de catecúmenos para preencher apuramento_item
    """
    import json
    
    turmas = json.loads(turmas_json)
    turmas_a_processar = [t for t in turmas if t.get("incluir") and t.get("turma")]
    
    if not turmas_a_processar:
        return []
    
    todos_catecumenos = []
    
    for t in turmas_a_processar:
        turma_nome = t.get("turma")
        
        turma_doc = frappe.get_doc("Turma", turma_nome)
        
        if turma_doc.status != "Activo":
            continue
        
        lista = turma_doc.get("lista_catecumenos") or []
        # Estado actual de cada catecúmeno (os que já saíram não entram)
        info = {c.name: c for c in frappe.get_all(
            "Catecumeno", filters={"name": ["in", [r.catecumeno for r in lista if r.catecumeno] or [""]]},
            fields=["name", "nome_completo", "status"], limit_page_length=0)}
        
        for cat in lista:
            catecumeno_id = cat.get("catecumeno")
            if not catecumeno_id:
                continue
            c_info = info.get(catecumeno_id)
            if not c_info or c_info.status in ("Transferido", "Inactivo", "Inativo", "Crismado"):
                continue   # já saiu (transferido, inactivo, crismado): não entra no apuramento
            
            status = cat.get("estado") or "Activo"
            status_lower = status.lower()
            
            # Ignorar inactivos
            if status_lower in ["inactivo", "inativo", "desistente"]:
                continue
            
            # Buscar resultado da tabela original (campo pre_avaliacao)
            resultado_original = cat.get("pre_avaliacao") or ""
            
            todos_catecumenos.append({
                "catecumeno": catecumeno_id,
                "nome_catecumeno": c_info.nome_completo or catecumeno_id,
                "turma_nome": turma_nome,
                "status": status,
                "encarregado": cat.get("encarregado"),
                "contacto": cat.get("contacto"),
                "data_de_nascimento": cat.get("data_de_nascimento"),
                "idade": cat.get("idade"),
                "sexo": cat.get("sexo"),
                "resultado": resultado_original  # Vem do campo pre_avaliacao da turma
            })
    
    # Ordenar alfabeticamente
    todos_catecumenos.sort(key=lambda x: x.get("catecumeno") or "")
    
    return todos_catecumenos


@frappe.whitelist()
def get_turmas_disponiveis_para_repetentes(ano_lectivo, fase):
    """
    Busca turmas activas onde os repetentes podem ser adicionados.
    
    Args:
        ano_lectivo: Ano lectivo seguinte
        fase: Fase dos repetentes (fase_seguinte_permanece ou fase_actual)
    
    Returns:
        Lista de turmas com contagem de catecúmenos
    """
    if not ano_lectivo or not fase:
        return []
    
    turmas = frappe.get_all(
        "Turma",
        filters={
            "ano_lectivo": ano_lectivo,
            "fase": fase,
            "status": "Activo"
        },
        fields=["name", "fase", "catequista", "catequista_adj"]
    )
    
    resultado = []
    
    for turma in turmas:
        turma_doc = frappe.get_doc("Turma", turma.name)
        lista = turma_doc.get("lista_catecumenos") or []
        
        # Contar apenas activos
        total = 0
        for cat in lista:
            status = (cat.get("estado") or "").lower()
            if status not in ["inactivo", "inativo", "desistente"]:
                total += 1
        
        resultado.append({
            "turma": turma.name,
            "fase": turma.fase,
            "catequista": turma.catequista,
            "total_catecumenos": total,
            "vagas": tamanhos_turma()[2] - total  # tamanho máximo (Catequese Settings)
        })
    
    # Ordenar por vagas disponíveis (mais vagas primeiro)
    resultado.sort(key=lambda x: x.get("vagas", 0), reverse=True)
    
    return resultado





@frappe.whitelist()
def preview_distribuicao(apuramento_items_json, tamanho_min=None, tamanho_ideal=None, tamanho_max=None, manter_estrutura=False, destino_repetentes="Criar Novas Turmas", ano_lectivo_seguinte=None, fase_permanece=None):

    """
    Gera pré-visualização da distribuição de catecúmenos em novas turmas.
    
    Args:
        apuramento_items_json: JSON string com lista de catecúmenos e resultados
        tamanho_min: Tamanho mínimo da turma
        tamanho_ideal: Tamanho ideal da turma
        tamanho_max: Tamanho máximo da turma
    
    Returns:
        Estrutura das novas turmas com catecúmenos distribuídos
    """
    import json
    
    items = json.loads(apuramento_items_json)
    
    padrao = tamanhos_turma()
    tamanho_min = int(tamanho_min or padrao[0])
    tamanho_ideal = int(tamanho_ideal or padrao[1])
    tamanho_max = int(tamanho_max or padrao[2])
    
    # Separar por resultado
    transitam = []
    permanecem = []
    sem_resultado = []
    
    for item in items:
        resultado = (item.get("resultado") or "").strip()
        status = (item.get("status") or "").lower()
        
        # Ignorar inactivos
        if status in ["inactivo", "inativo", "desistente"]:
            continue
        
        if resultado == "Transita":
            transitam.append(item)
        elif resultado == "Permanece":
            permanecem.append(item)
        elif resultado == "Desistente":
            continue  # fica Inactivo no apuramento
        else:
            sem_resultado.append(item)
    
    # Ordenar alfabeticamente
   # Converter manter_estrutura para boolean
    manter_estrutura_bool = manter_estrutura in [True, 1, "1", "true", "True"]
    
    if manter_estrutura_bool:
        # MANTER ESTRUTURA: Agrupar por turma de origem
        transitam_por_turma = {}
        permanecem_por_turma = {}
        
        for cat in transitam:
            turma_origem = cat.get("turma_nome") or "Sem Turma"
            if turma_origem not in transitam_por_turma:
                transitam_por_turma[turma_origem] = []
            transitam_por_turma[turma_origem].append(cat)
        
        for cat in permanecem:
            turma_origem = cat.get("turma_nome") or "Sem Turma"
            if turma_origem not in permanecem_por_turma:
                permanecem_por_turma[turma_origem] = []
            permanecem_por_turma[turma_origem].append(cat)
        
        # Criar turmas mantendo estrutura
        turmas_transitam = manter_estrutura_preview(transitam_por_turma, "Transitam")
        turmas_permanecem = manter_estrutura_preview(permanecem_por_turma, "Permanecem")
    else:
        # REDISTRIBUIR: Ordenar e distribuir equilibradamente
        transitam.sort(key=lambda x: x.get("catecumeno") or "")
        permanecem.sort(key=lambda x: x.get("catecumeno") or "")
        
        turmas_transitam = distribuir_em_turmas(transitam, tamanho_min, tamanho_ideal, tamanho_max, "Transitam")
        turmas_permanecem = distribuir_em_turmas(permanecem, tamanho_min, tamanho_ideal, tamanho_max, "Permanecem")
    
    # Verificar se deve adicionar às turmas existentes
    turmas_existentes_info = []
    if destino_repetentes == "Adicionar às Turmas Existentes" and ano_lectivo_seguinte and fase_permanece and permanecem:
        turmas_existentes = frappe.get_all(
            "Turma",
            filters={
                "ano_lectivo": ano_lectivo_seguinte,
                "fase": fase_permanece,
                "status": "Activo"
            },
            fields=["name"],
            order_by="name asc"
        )
        
        if turmas_existentes:
            turmas_nomes = [t.name for t in turmas_existentes]
            
            # Simular distribuição pelas turmas existentes
            # Simular distribuição pelas turmas existentes - EQUILIBRADA
            turmas_permanecem = []
            
            # Buscar totais actuais de cada turma
            turmas_com_totais = []
            for turma_nome in turmas_nomes:
                turma_doc = frappe.get_doc("Turma", turma_nome)
                lista = turma_doc.get("lista_catecumenos") or []
                total_actual = len([c for c in lista if (c.get("estado") or "").lower() not in ["inactivo", "inativo", "desistente"]])
                turmas_com_totais.append({
                    "nome": turma_nome,
                    "total_actual": total_actual,
                    "catecumenos_novos": []
                })
            
            # Ordenar repetentes alfabeticamente
            permanecem_ordenados = sorted(permanecem, key=lambda x: x.get("catecumeno") or "")
            
            # Distribuir equilibradamente - sempre adicionar à turma com menos alunos
            for cat in permanecem_ordenados:
                # Encontrar turma com menor total (actual + novos)
                turmas_com_totais.sort(key=lambda t: t["total_actual"] + len(t["catecumenos_novos"]))
                turma_menor = turmas_com_totais[0]
                turma_menor["catecumenos_novos"].append(cat)
            
            # Converter para formato de distribuição
            distribuicao_por_turma = {t["nome"]: t["catecumenos_novos"] for t in turmas_com_totais}
            
            numero = 1
            for turma_nome in turmas_nomes:
                cats = distribuicao_por_turma[turma_nome]
                if cats:
                    # Buscar total actual da turma
                    turma_doc = frappe.get_doc("Turma", turma_nome)
                    lista = turma_doc.get("lista_catecumenos") or []
                    total_actual = len([c for c in lista if (c.get("estado") or "").lower() not in ["inactivo", "inativo", "desistente"]])
                    
                    turmas_permanecem.append({
                        "numero": numero,
                        "tipo": "Permanecem",
                        "catecumenos": cats,
                        "origens": {"Repetentes → " + turma_nome: len(cats)},
                        "turma_existente": turma_nome,
                        "total_actual": total_actual,
                        "total_apos": total_actual + len(cats)
                    })
                    
                    turmas_existentes_info.append({
                        "turma": turma_nome,
                        "actual": total_actual,
                        "adicionar": len(cats),
                        "total": total_actual + len(cats)
                    })
                    numero += 1
    
    return {
        "turmas_transitam": turmas_transitam,
        "turmas_permanecem": turmas_permanecem,
        "turmas_existentes_info": turmas_existentes_info,
        "totais": {
            "transitam": len(transitam),
            "permanecem": len(permanecem),
            "sem_resultado": len(sem_resultado),
            "total": len(transitam) + len(permanecem)
        },
        "sem_resultado": [s.get("catecumeno") for s in sem_resultado]
    }
   
def manter_estrutura_preview(catecumenos_por_turma, tipo):
    """
    Mantém a estrutura original para preview - uma nova turma por cada turma de origem.
    """
    if not catecumenos_por_turma:
        return []
    
    novas_turmas = []
    numero = 1
    
    # Ordenar por nome da turma origem
    for turma_origem in sorted(catecumenos_por_turma.keys()):
        catecumenos = catecumenos_por_turma[turma_origem]
        if not catecumenos:
            continue
        
        # Ordenar catecúmenos alfabeticamente
        catecumenos_ordenados = sorted(catecumenos, key=lambda x: x.get("catecumeno") or "")
        
        novas_turmas.append({
            "numero": numero,
            "tipo": tipo,
            "catecumenos": catecumenos_ordenados,
            "origens": {turma_origem: len(catecumenos_ordenados)}
        })
        numero += 1
    
    return novas_turmas


def distribuir_em_turmas(catecumenos, tamanho_min, tamanho_ideal, tamanho_max, tipo):
    """
    Distribui catecúmenos em turmas equilibradas.
    """
    if not catecumenos:
        return []
    
    total = len(catecumenos)
    
    # Calcular número de turmas
    if total <= tamanho_max:
        num_turmas = 1
    else:
        num_turmas = (total + tamanho_ideal - 1) // tamanho_ideal
        
        while num_turmas > 1:
            media = total // num_turmas
            if media >= tamanho_min:
                break
            num_turmas -= 1
    
    # Criar turmas vazias
    novas_turmas = []
    for i in range(num_turmas):
        novas_turmas.append({
            "numero": i + 1,
            "tipo": tipo,
            "catecumenos": [],
            "origens": {}
        })
    
    # Distribuir usando round-robin
    for idx, cat in enumerate(catecumenos):
        turma_idx = idx % num_turmas
        novas_turmas[turma_idx]["catecumenos"].append(cat)
        
        origem = cat.get("turma_nome") or "Sem turma"
        if origem not in novas_turmas[turma_idx]["origens"]:
            novas_turmas[turma_idx]["origens"][origem] = 0
        novas_turmas[turma_idx]["origens"][origem] += 1
    
    return novas_turmas


@frappe.whitelist()
def calcular_totais(apuramento_items_json):
    """
    Calcula totais de catecúmenos por resultado.
    """
    import json
    
    items = json.loads(apuramento_items_json)
    
    transitam = 0
    permanecem = 0
    desistentes = 0
    sem_resultado = 0
    
    for item in items:
        resultado = (item.get("resultado") or "").strip()
        status = (item.get("status") or "").lower()
        
        if status in ["inactivo", "inativo", "desistente"]:
            continue
        
        if resultado == "Transita":
            transitam += 1
        elif resultado == "Permanece":
            permanecem += 1
        elif resultado == "Desistente":
            desistentes += 1
        else:
            sem_resultado += 1
    
    return {
        "transitam": transitam,
        "permanecem": permanecem,
        "desistentes": desistentes,
        "sem_resultado": sem_resultado,
        "total": transitam + permanecem
    }


@frappe.whitelist()
def validar_apuramento(doc_name, turmas_json, ano_lectivo_actual):
    """
    Valida se o apuramento pode ser submetido.
    Verifica turmas já apuradas e catecúmenos duplicados.
    
    Args:
        doc_name: Nome do documento actual
        turmas_json: JSON com lista de turmas a processar
        ano_lectivo_actual: Ano lectivo actual
    
    Returns:
        Dict com erros encontrados ou vazio se OK
    """
    import json
    
    turmas = json.loads(turmas_json)
    turmas_a_processar = [t.get("turma") for t in turmas if t.get("incluir") and t.get("turma")]
    
    erros = []
    avisos = []
    
    if not turmas_a_processar:
        erros.append("Nenhuma turma seleccionada para processar.")
        return {"erros": erros, "avisos": avisos}
    
    # Verificar turmas inactivas
    turmas_inactivas = []
    for turma_nome in turmas_a_processar:
        turma_status = frappe.db.get_value("Turma", turma_nome, "status")
        if turma_status != "Activo":
            turmas_inactivas.append(turma_nome)
    
    if turmas_inactivas:
        erros.append("Turmas inactivas: " + ", ".join(turmas_inactivas))
    
    # Verificar turmas já apuradas
    apuramentos_existentes = frappe.db.sql("""
        SELECT DISTINCT apt.turma, ap.name
        FROM `tabApuramento Turmas Table` apt
        INNER JOIN `tabApuramento de Turmas` ap ON apt.parent = ap.name
        WHERE ap.docstatus = 1
        AND ap.name != %s
        AND apt.turma IN %s
        AND apt.incluir = 1
    """, (doc_name or "NOVO", turmas_a_processar), as_dict=True)
    
    if apuramentos_existentes:
        turmas_ja_apuradas = []
        for ap in apuramentos_existentes:
            turmas_ja_apuradas.append(str(ap.turma) + " (em " + str(ap.name) + ")")
        erros.append("Turmas já apuradas: " + ", ".join(turmas_ja_apuradas))
    
    return {
        "erros": erros,
        "avisos": avisos,
        "valido": len(erros) == 0
    }


@frappe.whitelist()
def verificar_turmas_existentes(ano_lectivo, fase):
    """
    Verifica se existem turmas activas para uma fase e ano lectivo.
    
    Args:
        ano_lectivo: Ano lectivo
        fase: Fase
    
    Returns:
        Lista de turmas existentes com contagem de catecúmenos
    """
    
    turmas = frappe.get_all(
        "Turma",
        filters={
            "fase": fase,
            "ano_lectivo": ano_lectivo,
            "status": "Activo"
        },
        fields=["name", "fase", "catequista"]
    )
    
    resultado = []
    total_catecumenos = 0
    
    for turma in turmas:
        turma_doc = frappe.get_doc("Turma", turma.name)
        lista = turma_doc.get("lista_catecumenos") or []
        
        # Contar apenas activos
        count = 0
        for cat in lista:
            status = (cat.get("estado") or "").lower()
            if status not in ["inactivo", "inativo", "desistente"]:
                count += 1
        
        total_catecumenos += count
        resultado.append({
            "turma": turma.name,
            "catequista": turma.catequista,
            "total_catecumenos": count
        })
    
    return {
        "turmas": resultado,
        "total_turmas": len(resultado),
        "total_catecumenos": total_catecumenos
    }


@frappe.whitelist()
def obter_catecumenos_turmas_existentes(turmas_json):
    """
    Obtém todos os catecúmenos das turmas existentes para juntar.
    
    Args:
        turmas_json: JSON string com lista de nomes de turmas
    
    Returns:
        Lista de catecúmenos
    """
    import json
    
    turmas = json.loads(turmas_json)
    
    todos_catecumenos = []
    
    for turma_nome in turmas:
        turma_doc = frappe.get_doc("Turma", turma_nome)
        lista = turma_doc.get("lista_catecumenos") or []
        
        for cat in lista:
            catecumeno_id = cat.get("catecumeno")
            if not catecumeno_id:
                continue
            
            status = cat.get("estado") or "Activo"
            status_lower = status.lower()
            
            if status_lower in ["inactivo", "inativo", "desistente"]:
                continue
            
            todos_catecumenos.append({
                "catecumeno": catecumeno_id,
                "encarregado": cat.get("encarregado"),
                "contacto": cat.get("contacto"),
                "data_de_nascimento": cat.get("data_de_nascimento"),
                "idade": cat.get("idade"),
                "sexo": cat.get("sexo"),
                "status": status,
                "turma_origem": turma_nome
            })
    
    return todos_catecumenos


@frappe.whitelist()
def criar_novas_turmas(apuramento_name):
    """Antigo botão "Criar Novas Turmas": criava as turmas por fora da submissão (e o documento ficava
    em rascunho, sem poder ser submetido). Agora submete o documento: é a submissão que cria as turmas."""
    doc = frappe.get_doc("Apuramento de Turmas", apuramento_name)
    if doc.docstatus != 0:
        return {"success": False, "error": "Este apuramento já foi submetido."}
    doc.submit()
    return {
        "success": True,
        "total_turmas": len(doc.apuramento_novas_turmas),
        "turmas": [t.turma for t in doc.apuramento_novas_turmas],
    }

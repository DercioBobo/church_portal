# API para Alocação em Massa de Catecúmenos
# Localização: portal/catequese/alocacao_em_massa.py

import frappe
from frappe import _
from frappe.utils import cint, nowdate
import math

from portal.catequese.utils import definicao

# Capacidade por omissão: tamanho ideal das Catequese Settings


@frappe.whitelist()
def carregar_dados(fase, capacidade_recomendada=None):
    """
    Carrega catecúmenos pendentes e turmas existentes para uma fase.
    """
    if not fase:
        return {"error": "Fase não especificada"}
    
    capacidade = cint(capacidade_recomendada) or cint(definicao("tamanho_ideal"))
    
    # 1. Buscar catecúmenos pendentes (sem turma)
    pendentes = frappe.get_all(
        "Catecumeno",
        filters={
            "fase": fase,
            "turma": ["is", "not set"],
            "status": ["in", ["Pendente", "Activo"]]
        },
        fields=[
            "name", "idade", "sexo", "encarregado", "contacto",
            "data_de_nascimento", "creation"
        ],
        order_by="idade asc, name asc"
    )
    
    # 2. Buscar turmas activas da fase
    turmas = frappe.get_all(
        "Turma",
        filters={
            "fase": fase,
            "status": "Activo"
        },
        fields=[
            "name", "catequistas", "local", "dia", "hora",
            "ano_lectivo"
        ],
        order_by="name asc"
    )
    
    # 3. Contar catecúmenos em cada turma
    total_vagas = 0
    for turma in turmas:
        count = frappe.db.count(
            "Turma Catecumenos",
            filters={
                "parent": turma.name,
                "estado": ["in", ["Activo", "Pendente"]]
            }
        )
        turma["actual"] = count
        turma["capacidade"] = capacidade
        turma["vagas"] = capacidade - count
        total_vagas += turma["vagas"]
        
        # Status de ocupação
        percentagem = (count / capacidade * 100) if capacidade > 0 else 0
        if percentagem >= 100:
            turma["status"] = "🔴 Cheia"
        elif percentagem >= 80:
            turma["status"] = "🟡 Quase cheia"
        else:
            turma["status"] = "🟢 Disponível"
    
    return {
        "pendentes": pendentes,
        "turmas": turmas,
        "total_pendentes": len(pendentes),
        "total_turmas": len(turmas),
        "vagas_disponiveis": max(0, total_vagas),
        "capacidade": capacidade
    }


@frappe.whitelist()
def gerar_sugestao(fase, capacidade_recomendada=None):
    """
    Gera sugestão inteligente de distribuição.
    Regras:
    - Até 30: pode ser 1 turma
    - 31-50: 2 turmas
    - Distribuir por idade (mais novos primeiro)
    - Preencher turmas existentes primeiro
    """
    dados = carregar_dados(fase, capacidade_recomendada)
    
    if "error" in dados:
        return dados
    
    pendentes = dados["pendentes"]
    turmas = dados["turmas"]
    capacidade = cint(capacidade_recomendada) or cint(definicao("tamanho_ideal"))
    
    total_pendentes = len(pendentes)
    
    if total_pendentes == 0:
        return {
            "sugestao": [],
            "novas_turmas": 0,
            "mensagem": "Não há catecúmenos pendentes para alocar."
        }
    
    # Ordenar pendentes por idade (mais novos primeiro)
    pendentes_ordenados = sorted(pendentes, key=lambda x: (x.get("idade") or 0, x.get("name")))
    
    sugestao = []
    pendentes_restantes = pendentes_ordenados.copy()
    
    # 1. Primeiro, preencher turmas existentes
    for turma in turmas:
        if turma["vagas"] > 0 and pendentes_restantes:
            # Quantos adicionar a esta turma
            qtd_adicionar = min(turma["vagas"], len(pendentes_restantes))
            
            # Pegar os primeiros N pendentes
            a_alocar = pendentes_restantes[:qtd_adicionar]
            pendentes_restantes = pendentes_restantes[qtd_adicionar:]
            
            sugestao.append({
                "tipo": "existente",
                "turma": turma["name"],
                "catequistas": turma["catequistas"],
                "actual": turma["actual"],
                "a_adicionar": qtd_adicionar,
                "total_final": turma["actual"] + qtd_adicionar,
                "capacidade": capacidade,
                "catecumenos": [p["name"] for p in a_alocar]
            })
    
    # 2. Se ainda há pendentes, calcular novas turmas necessárias
    novas_turmas_necessarias = 0
    if pendentes_restantes:
        restantes = len(pendentes_restantes)
        
        # Lógica de criação de turmas (tamanhos das Catequese Settings):
        # - até ao tamanho máximo: 1 turma
        # - acima: turmas com cerca da capacidade (tamanho ideal)
        if restantes <= cint(definicao("tamanho_maximo")):
            novas_turmas_necessarias = 1
        else:
            novas_turmas_necessarias = math.ceil(restantes / capacidade)
        
        # Distribuir equilibradamente
        if novas_turmas_necessarias > 0:
            por_turma = restantes // novas_turmas_necessarias
            extra = restantes % novas_turmas_necessarias
            
            idx = 0
            for i in range(novas_turmas_necessarias):
                qtd = por_turma + (1 if i < extra else 0)
                a_alocar = pendentes_restantes[idx:idx + qtd]
                idx += qtd
                
                # Determinar número da nova turma
                turmas_existentes = len(turmas) + i + 1
                
                sugestao.append({
                    "tipo": "nova",
                    "turma": f"Nova Turma T{turmas_existentes}",
                    "turma_numero": turmas_existentes,
                    "catequistas": "(A definir)",
                    "actual": 0,
                    "a_adicionar": qtd,
                    "total_final": qtd,
                    "capacidade": capacidade,
                    "catecumenos": [p["name"] for p in a_alocar]
                })
    
    # Gerar mensagem resumo
    turmas_existentes_usadas = len([s for s in sugestao if s["tipo"] == "existente"])
    novas = len([s for s in sugestao if s["tipo"] == "nova"])
    
    mensagem = f"Sugestão: Alocar {total_pendentes} catecúmenos"
    if turmas_existentes_usadas > 0:
        mensagem += f" em {turmas_existentes_usadas} turma(s) existente(s)"
    if novas > 0:
        mensagem += f" + criar {novas} nova(s) turma(s)"
    
    return {
        "sugestao": sugestao,
        "novas_turmas": novas,
        "total_alocados": total_pendentes,
        "mensagem": mensagem,
        "pendentes_ordenados": pendentes_ordenados
    }


@frappe.whitelist()
def executar_alocacao(alocacoes_json, fase, ano_lectivo, criar_turmas_json=None):
    """
    Executa a alocação dos catecúmenos às turmas.
    
    Args:
        alocacoes_json: JSON com lista de {catecumeno, turma}
        fase: Fase dos catecúmenos
        ano_lectivo: Ano lectivo para novas turmas
        criar_turmas_json: JSON com turmas a criar {numero, qtd_catecumenos}
    """
    try:
        alocacoes = frappe.parse_json(alocacoes_json) or []
        criar_turmas = frappe.parse_json(criar_turmas_json) or []
        
        if not alocacoes and not criar_turmas:
            return {"success": False, "error": "Nenhuma alocação especificada"}
        
        turmas_criadas = []
        catecumenos_alocados = 0
        erros = []
        
        # 1. Criar novas turmas primeiro (se necessário)
        turmas_map = {}  # Mapeia "Nova Turma T1" -> nome real
        
        for nova in criar_turmas:
            try:
                numero = nova.get("numero", 1)
                
                # Gerar nome da turma
                nome_turma = f"{ano_lectivo} {fase} T{numero}"
                
                # Verificar se já existe
                if frappe.db.exists("Turma", nome_turma):
                    # Tentar outro número
                    for i in range(numero, numero + 10):
                        nome_turma = f"{ano_lectivo} {fase} T{i}"
                        if not frappe.db.exists("Turma", nome_turma):
                            break
                
                # Criar turma
                turma_doc = frappe.new_doc("Turma")
                turma_doc.ano_lectivo = ano_lectivo
                turma_doc.fase = fase
                turma_doc.status = "Activo"
                turma_doc.nome = nome_turma
                turma_doc.insert(ignore_permissions=True)
                
                turmas_criadas.append(nome_turma)
                turmas_map[f"Nova Turma T{numero}"] = turma_doc.name
                
            except Exception as e:
                erros.append(f"Erro ao criar turma {numero}: {str(e)}")
        
        # 2. Executar alocações
        for aloc in alocacoes:
            catecumeno = aloc.get("catecumeno")
            turma = aloc.get("turma")
            
            if not catecumeno or not turma:
                continue
            
            # Se é nova turma, pegar o nome real
            if turma.startswith("Nova Turma"):
                turma = turmas_map.get(turma, turma)
            
            try:
                # Verificar se turma existe
                if not frappe.db.exists("Turma", turma):
                    erros.append(f"Turma '{turma}' não encontrada para {catecumeno}")
                    continue
                
                # Buscar catecúmeno
                cat = frappe.get_doc("Catecumeno", catecumeno)
                
                # Buscar turma
                turma_doc = frappe.get_doc("Turma", turma)
                
                # Verificar se já está na turma
                ja_existe = False
                for row in turma_doc.lista_catecumenos:
                    if row.catecumeno == catecumeno:
                        ja_existe = True
                        break
                
                if not ja_existe:
                    # Adicionar à turma
                    turma_doc.append("lista_catecumenos", {
                        "catecumeno": cat.name,
                        "estado": "Activo",
                        "fase": fase,
                        "turma": turma,
                        "idade": cat.idade,
                        "data_de_nascimento": cat.data_de_nascimento,
                        "sexo": cat.sexo,
                        "encarregado": cat.encarregado,
                        "contacto": cat.contacto
                    })
                    turma_doc.save(ignore_permissions=True)
                
                # Actualizar catecúmeno
                cat.turma = turma
                cat.fase = fase
                cat.status = "Activo"
                cat.save(ignore_permissions=True)
                
                catecumenos_alocados += 1
                
            except Exception as e:
                erros.append(f"Erro ao alocar {catecumeno}: {str(e)}")
        
        return {
            "success": True,
            "turmas_criadas": turmas_criadas,
            "catecumenos_alocados": catecumenos_alocados,
            "erros": erros,
            "mensagem": f"Alocação concluída: {catecumenos_alocados} catecúmeno(s) alocado(s)"
                       + (f", {len(turmas_criadas)} turma(s) criada(s)" if turmas_criadas else "")
                       + (f". {len(erros)} erro(s)." if erros else ".")
        }
        
    except Exception as e:
        frappe.log_error(str(e), "Erro Alocação em Massa")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def alocar_seleccionados(catecumenos_json, turma, fase):
    """
    Aloca uma lista de catecúmenos a uma turma específica.
    Usado para alocação manual de seleccionados.
    """
    try:
        catecumenos = frappe.parse_json(catecumenos_json) or []
        
        if not catecumenos:
            return {"success": False, "error": "Nenhum catecúmeno seleccionado"}
        
        if not turma:
            return {"success": False, "error": "Turma não especificada"}
        
        # Verificar se turma existe
        if not frappe.db.exists("Turma", turma):
            return {"success": False, "error": f"Turma '{turma}' não encontrada"}
        
        turma_doc = frappe.get_doc("Turma", turma)
        alocados = 0
        erros = []
        
        for cat_name in catecumenos:
            try:
                cat = frappe.get_doc("Catecumeno", cat_name)
                
                # Verificar se já está na turma
                ja_existe = False
                for row in turma_doc.lista_catecumenos:
                    if row.catecumeno == cat_name:
                        ja_existe = True
                        break
                
                if not ja_existe:
                    turma_doc.append("lista_catecumenos", {
                        "catecumeno": cat.name,
                        "estado": "Activo",
                        "fase": fase or turma_doc.fase,
                        "turma": turma,
                        "idade": cat.idade,
                        "data_de_nascimento": cat.data_de_nascimento,
                        "sexo": cat.sexo,
                        "encarregado": cat.encarregado,
                        "contacto": cat.contacto
                    })
                
                # Actualizar catecúmeno
                cat.turma = turma
                cat.fase = fase or turma_doc.fase
                cat.status = "Activo"
                cat.save(ignore_permissions=True)
                
                alocados += 1
                
            except Exception as e:
                erros.append(f"{cat_name}: {str(e)}")
        
        # Guardar turma uma vez no final
        turma_doc.save(ignore_permissions=True)
        
        return {
            "success": True,
            "alocados": alocados,
            "erros": erros,
            "mensagem": f"{alocados} catecúmeno(s) alocado(s) à turma '{turma}'"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def criar_nova_turma(fase, ano_lectivo, numero=None):
    """
    Cria uma nova turma para a fase.
    """
    try:
        # Determinar número da turma
        if not numero:
            # Contar turmas existentes da fase
            count = frappe.db.count("Turma", {
                "fase": fase,
                "ano_lectivo": ano_lectivo
            })
            numero = count + 1
        
        nome_turma = f"{ano_lectivo} {fase} T{numero}"
        
        # Verificar se já existe
        while frappe.db.exists("Turma", nome_turma):
            numero += 1
            nome_turma = f"{ano_lectivo} {fase} T{numero}"
        
        # Criar turma
        turma = frappe.new_doc("Turma")
        turma.ano_lectivo = ano_lectivo
        turma.fase = fase
        turma.status = "Activo"
        turma.insert(ignore_permissions=True)
        
        return {
            "success": True,
            "turma": turma.name,
            "mensagem": f"Turma '{turma.name}' criada com sucesso"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}
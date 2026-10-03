# API para Utilitários de Inscrição
# Localização: portal/catequese/inscricao_utils.py

import frappe
from frappe import _
from frappe.utils import getdate, nowdate, cint

# Mapeamento de fases para progressão (transferências)
# Ajustar conforme as fases reais do sistema
PROGRESSAO_FASES = {
    "1ª Fase": "2ª Fase",
    "2ª Fase": "3ª Fase", 
    "3ª Fase": "4ª Fase",
    "4ª Fase": "Crisma",
    "Pré-catecumenato": "1º Ano Catecumenato",
    "1º Ano Catecumenato": "2º Ano Catecumenato",
    "2º Ano Catecumenato": "Crisma",
    "Iniciao Adultos": "Preparacao para Baptismo - Adultos",
    # Adicionar mais mapeamentos conforme necessário
}

# Regras de idade para fase (novos catecúmenos)
# Formato: (idade_min, idade_max, fase)
REGRAS_IDADE_FASE = [
    (7, 11, "1ª Fase"),
    (12, 25, "Pré-catecumenato"),
    (26, 99, "Iniciao Adultos"),
]


@frappe.whitelist()
def verificar_duplicados(nome, data_nascimento=''):
    """
    Verifica se existem catecúmenos com nome ou data de nascimento semelhantes.
    """
    if not nome or len(nome) < 3:
        return []
    
    duplicados = []
    
    # Buscar por nome semelhante
    nome_busca = f"%{nome}%"
    
    catecumenos = frappe.get_all(
        "Catecumeno",
        filters=[["name", "like", nome_busca]],
        fields=["name", "data_de_nascimento", "status", "fase", "turma", "idade"],
        limit=10
    )
    
    duplicados.extend(catecumenos)
    
    # Se tem data de nascimento, buscar também por data
    if data_nascimento:
        catecumenos_data = frappe.get_all(
            "Catecumeno",
            filters={"data_de_nascimento": data_nascimento},
            fields=["name", "data_de_nascimento", "status", "fase", "turma", "idade"],
            limit=10
        )
        
        # Adicionar sem duplicar
        nomes_existentes = [d["name"] for d in duplicados]
        for c in catecumenos_data:
            if c["name"] not in nomes_existentes:
                duplicados.append(c)
    
    # Verificar também nas inscrições não submetidas
    inscricoes = frappe.get_all(
        "Inscricao",
        filters={
            "nome_completo": ["like", nome_busca],
            "docstatus": 0  # Rascunho
        },
        fields=["name", "nome_completo", "data_de_nascimento"],
        limit=5
    )
    
    for insc in inscricoes:
        duplicados.append({
            "name": f"[Inscrição] {insc.nome_completo}",
            "data_de_nascimento": insc.data_de_nascimento,
            "status": "Inscrição Pendente",
            "fase": "-",
            "turma": "-"
        })
    
    return duplicados


@frappe.whitelist()
def buscar_fase_por_idade(idade):
    """
    Retorna a fase sugerida com base na idade.
    
    Regras:
    - Até 12 anos → 1ª Fase
    - 12-25 anos → Pré-catecumenato
    - 25+ anos → Iniciacao Adultos
    """
    idade = cint(idade)
    
    if not idade or idade < 7:
        return {"fase": None, "mensagem": "Idade insuficiente (mínimo 7 anos)"}
    
    fase_sugerida = None
    
    for idade_min, idade_max, fase in REGRAS_IDADE_FASE:
        if idade_min <= idade <= idade_max:
            # Verificar se a fase existe
            if frappe.db.exists("Fase", fase):
                fase_sugerida = fase
                break
    
    # Se não encontrou, tentar buscar por nome similar
    if not fase_sugerida:
        for idade_min, idade_max, fase in REGRAS_IDADE_FASE:
            if idade_min <= idade <= idade_max:
                # Buscar fase com nome similar
                fases = frappe.get_all("Fase", 
                    filters=[["name", "like", f"%{fase.split()[0]}%"]],
                    limit=1
                )
                if fases:
                    fase_sugerida = fases[0].name
                    break
    
    # Se ainda não encontrou, buscar primeira fase disponível
    if not fase_sugerida:
        fases = frappe.get_all("Fase", limit=1, order_by="creation asc")
        if fases:
            fase_sugerida = fases[0].name
    
    return {
        "fase": fase_sugerida,
        "idade": idade,
        "mensagem": f"Fase sugerida para {idade} anos: {fase_sugerida}"
    }


@frappe.whitelist()
def sugerir_proxima_fase(fase_anterior):
    """
    Sugere a próxima fase para catecúmenos de transferência.
    """
    if not fase_anterior:
        return {"fase": None, "mensagem": "Fase anterior não especificada"}
    
    fase_anterior = fase_anterior.strip()
    
    # Procurar no mapeamento directo
    if fase_anterior in PROGRESSAO_FASES:
        proxima_fase = PROGRESSAO_FASES[fase_anterior]
        if frappe.db.exists("Fase", proxima_fase):
            return {
                "fase": proxima_fase,
                "fase_anterior": fase_anterior,
                "mensagem": f"Transferência: {fase_anterior} → {proxima_fase}"
            }
    
    # Tentar encontrar fase pelo campo fase_seguinte_transita
    fase_doc = frappe.db.get_value(
        "Fase", 
        {"name": ["like", f"%{fase_anterior}%"]},
        ["name", "fase_seguinte_transita"],
        as_dict=True
    )
    
    if fase_doc and fase_doc.fase_seguinte_transita:
        return {
            "fase": fase_doc.fase_seguinte_transita,
            "fase_anterior": fase_anterior,
            "mensagem": f"Transferência: {fase_anterior} → {fase_doc.fase_seguinte_transita}"
        }
    
    # Se a fase anterior existe no sistema, sugerir a mesma
    if frappe.db.exists("Fase", fase_anterior):
        return {
            "fase": fase_anterior,
            "fase_anterior": fase_anterior,
            "mensagem": f"Fase {fase_anterior} encontrada - continua na mesma fase"
        }
    
    # Procurar fase com nome similar
    fases = frappe.get_all("Fase", 
        filters=[["name", "like", f"%{fase_anterior.split()[0]}%"]],
        fields=["name", "fase_seguinte_transita"],
        limit=1
    )
    
    if fases:
        fase_encontrada = fases[0]
        if fase_encontrada.fase_seguinte_transita:
            return {
                "fase": fase_encontrada.fase_seguinte_transita,
                "fase_anterior": fase_anterior,
                "mensagem": f"Encontrada fase similar: {fase_encontrada.name} → {fase_encontrada.fase_seguinte_transita}"
            }
        else:
            return {
                "fase": fase_encontrada.name,
                "fase_anterior": fase_anterior,
                "mensagem": f"Encontrada fase similar: {fase_encontrada.name}"
            }
    
    return {
        "fase": None,
        "fase_anterior": fase_anterior,
        "mensagem": f"Não foi possível determinar a próxima fase para '{fase_anterior}'"
    }


@frappe.whitelist()
def get_turmas_disponiveis(fase):
    """
    Retorna turmas activas para uma fase com contagem de catecúmenos.
    Sem gestão de capacidade - apenas informativo.
    """
    if not fase:
        return []
    
    turmas = frappe.get_all(
        "Turma",
        filters={
            "fase": fase,
            "status": "Activo"
        },
        fields=[
            "name", "ano_lectivo", "catequistas", 
            "local", "dia", "hora", "status"
        ],
        order_by="name asc"
    )
    
    for turma in turmas:
        # Contar catecúmenos na turma
        count = frappe.db.count(
            "Turma Catecumenos",
            filters={
                "parent": turma.name,
                "estado": ["in", ["Activo", "Pendente"]]
            }
        )
        turma["total_catecumenos"] = count
    
    # Ordenar por número de catecúmenos (menos primeiro, para balancear)
    turmas.sort(key=lambda x: x["total_catecumenos"])
    
    return turmas


@frappe.whitelist()
def sugerir_melhor_turma(fase):
    """
    Sugere a turma com menos catecúmenos (para balancear).
    """
    if not fase:
        return {"turma": None, "motivo": "Fase não especificada"}
    
    turmas = get_turmas_disponiveis(fase)
    
    if not turmas:
        return {"turma": None, "motivo": "Nenhuma turma activa encontrada"}
    
    # Pegar a turma com menos catecúmenos
    melhor_turma = turmas[0]  # Já está ordenado
    
    return {
        "turma": melhor_turma["name"],
        "total": melhor_turma["total_catecumenos"],
        "motivo": f"Turma com {melhor_turma['total_catecumenos']} catecúmenos"
    }


@frappe.whitelist()
def get_pre_inscricoes(fase=None):
    """
    Retorna catecúmenos sem turma (pré-inscrições) para alocar.
    """
    filters = {
        "turma": ["is", "not set"],
        "status": ["in", ["Pendente", "Activo"]]
    }
    
    if fase:
        filters["fase"] = fase
    
    catecumenos = frappe.get_all(
        "Catecumeno",
        filters=filters,
        fields=[
            "name", "nome_completo", "idade", "sexo",
            "fase", "encarregado", "contacto",
            "creation", "modified"
        ],
        order_by="fase asc, creation asc"
    )
    
    return catecumenos


@frappe.whitelist()
def alocar_catecumeno_turma(catecumeno, turma):
    """
    Aloca um catecúmeno a uma turma.
    Usado para alocar pré-inscrições.
    """
    if not catecumeno or not turma:
        return {"success": False, "error": "Catecúmeno e Turma são obrigatórios"}
    
    try:
        # Buscar catecúmeno
        cat = frappe.get_doc("Catecumeno", catecumeno)
        
        # Buscar turma
        turma_doc = frappe.get_doc("Turma", turma)
        
        # Verificar se turma está activa
        if turma_doc.status != "Activo":
            return {"success": False, "error": f"Turma '{turma}' não está activa"}
        
        # Verificar se já está na turma
        for row in turma_doc.lista_catecumenos:
            if row.catecumeno == catecumeno:
                return {"success": False, "error": "Catecúmeno já está nesta turma"}
        
        # Adicionar à turma
        nova_linha = turma_doc.append("lista_catecumenos", {})
        nova_linha.catecumeno = cat.name
        nova_linha.estado = "Activo"
        nova_linha.fase = turma_doc.fase
        nova_linha.turma = turma_doc.name
        nova_linha.idade = cat.idade
        nova_linha.data_de_nascimento = cat.data_de_nascimento
        nova_linha.sexo = cat.sexo
        nova_linha.encarregado = cat.encarregado
        nova_linha.contacto = cat.contacto
        
        turma_doc.save(ignore_permissions=True)
        
        # Actualizar catecúmeno
        cat.turma = turma
        cat.fase = turma_doc.fase
        cat.status = "Activo"
        cat.save(ignore_permissions=True)
        
        return {
            "success": True,
            "message": f"Catecúmeno '{catecumeno}' alocado à turma '{turma}'"
        }
        
    except Exception as e:
        frappe.log_error(str(e), "Erro ao alocar catecúmeno")
        return {"success": False, "error": str(e)}
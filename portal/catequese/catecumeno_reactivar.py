# API para Reactivação de Catecúmeno
# Localização: portal/catequese/catecumeno_reactivar.py

import frappe
from frappe import _
from frappe.utils import nowdate, now_datetime

ESTADOS_INACTIVO = ("Inactivo", "Inativo")

@frappe.whitelist()
def reactivar_catecumeno(catecumeno, fase, turma, observacoes=''):
    """
    Reactiva um catecúmeno inativo, actualizando seus dados e adicionando-o à turma.
    
    Args:
        catecumeno: Nome do catecúmeno
        fase: Nova fase
        turma: Nova turma
        observacoes: Observações opcionais
    
    Returns:
        dict com success/error
    """
    try:
        # Validações
        if not catecumeno:
            return {"success": False, "error": "Catecúmeno não especificado"}
        
        if not fase:
            return {"success": False, "error": "Fase não especificada"}
        
        if not turma:
            return {"success": False, "error": "Turma não especificada"}
        
        # Verificar se catecúmeno existe
        if not frappe.db.exists("Catecumeno", catecumeno):
            return {"success": False, "error": f"Catecúmeno '{catecumeno}' não encontrado"}
        
        # Buscar catecúmeno
        cat = frappe.get_doc("Catecumeno", catecumeno)
        
        # Verificar se está inativo
        # O estado é "Inactivo" (opção do campo); "Inativo" mantido por compatibilidade
        if cat.status not in ESTADOS_INACTIVO:
            return {"success": False, "error": f"Catecúmeno não está Inactivo (status actual: {cat.status})"}
        
        # Verificar se turma existe e está activa
        if not frappe.db.exists("Turma", turma):
            return {"success": False, "error": f"Turma '{turma}' não encontrada"}
        
        turma_doc = frappe.get_doc("Turma", turma)
        
        if turma_doc.status != "Activo":
            return {"success": False, "error": f"Turma '{turma}' não está activa"}
        
        if turma_doc.fase != fase:
            return {"success": False, "error": f"A turma '{turma}' não pertence à fase '{fase}'"}
        
        # Verificar se catecúmeno já está na turma
        ja_na_turma = False
        for row in turma_doc.lista_catecumenos:
            if row.catecumeno == catecumeno:
                ja_na_turma = True
                # Actualizar estado na turma
                row.estado = "Activo"
                row.pre_avaliacao = ""
                if observacoes:
                    row.observacoes = f"[Reactivado {nowdate()}] {observacoes}"
                break
        
        # Se não está na turma, adicionar
        if not ja_na_turma:
            nova_linha = turma_doc.append("lista_catecumenos", {})
            nova_linha.catecumeno = cat.name
            nova_linha.estado = "Activo"
            nova_linha.fase = fase
            nova_linha.turma = turma
            nova_linha.idade = cat.idade
            nova_linha.data_de_nascimento = cat.data_de_nascimento
            nova_linha.sexo = cat.sexo
            nova_linha.encarregado = cat.encarregado
            nova_linha.contacto = cat.contacto
            nova_linha.pre_avaliacao = ""
            nova_linha.nr_de_faltas = 0
            if observacoes:
                nova_linha.observacoes = f"[Reactivado {nowdate()}] {observacoes}"
        
        # Guardar turma
        turma_doc.save(ignore_permissions=True)
        
        # Actualizar catecúmeno
        cat.status = "Activo"
        cat.fase = fase
        cat.turma = turma
        
        # Adicionar observação ao histórico
        obs_anterior = cat.observacoes or ""
        nova_obs = f"[{nowdate()}] Reactivado - Fase: {fase}, Turma: {turma}"
        if observacoes:
            nova_obs += f" - {observacoes}"
        
        if obs_anterior:
            cat.observacoes = f"{nova_obs}\n{obs_anterior}"
        else:
            cat.observacoes = nova_obs
        
        cat.save(ignore_permissions=True)
        
        # Log da operação
        frappe.log_error(
            message=f"Catecúmeno: {catecumeno}\nFase: {fase}\nTurma: {turma}\nObservações: {observacoes}",
            title="Reactivação de Catecúmeno"
        )
        
        return {
            "success": True,
            "message": f"Catecúmeno '{catecumeno}' reactivado com sucesso",
            "catecumeno": catecumeno,
            "fase": fase,
            "turma": turma
        }
        
    except Exception as e:
        frappe.log_error(
            message=f"Erro ao reactivar catecúmeno: {str(e)}\nCatecúmeno: {catecumeno}",
            title="Erro Reactivação Catecúmeno"
        )
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_catecumenos_inativos(fase=None):
    """
    Retorna lista de catecúmenos inativos, opcionalmente filtrados por fase.
    Útil para relatórios ou listagens.
    """
    filters = {"status": ["in", list(ESTADOS_INACTIVO)]}
    if fase:
        filters["fase"] = fase
    
    catecumenos = frappe.get_all(
        "Catecumeno",
        filters=filters,
        fields=[
            "name", "nome_completo", "idade", "sexo", 
            "fase", "turma", "encarregado", "contacto",
            "modified"
        ],
        order_by="modified desc"
    )
    
    return catecumenos


@frappe.whitelist()
def get_turmas_disponiveis(fase):
    """
    Retorna turmas activas para uma fase específica com contagem de catecúmenos.
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
            "local", "dia", "hora"
        ],
        order_by="name asc"
    )
    
    # Adicionar contagem de catecúmenos
    for turma in turmas:
        count = frappe.db.count(
            "Turma Catecumenos",
            filters={
                "parent": turma.name,
                "estado": "Activo"
            }
        )
        turma["total_catecumenos"] = count
    
    return turmas
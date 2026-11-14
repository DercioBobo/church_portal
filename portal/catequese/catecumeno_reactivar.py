# Reactivação / readmissão de Catecúmeno
# - Inactivo  → "Reactivar" (voltou depois de desistir)
# - Transferido → "Readmitir" (voltou à paróquia depois de uma transferência)
# Também usado ao cancelar uma Transferência de Catecumeno (anular por engano).

import frappe
from frappe.utils import nowdate

ESTADOS_INACTIVO = ("Inactivo", "Inativo")
ESTADOS_READMITIVEIS = (*ESTADOS_INACTIVO, "Transferido")

# Prefixos dos comentários "Info" no Catecúmeno — o histórico procura por eles.
PREFIXOS_HISTORICO = ("Reactivado", "Readmitido", "Transferência anulada")


def colocar_em_turma(cat, turma_doc, nota=""):
    """Põe o catecúmeno como Activo na turma (reactiva a linha se já lá estiver, senão acrescenta)
    e actualiza o Catecúmeno (status, fase, turma). Não valida o estado anterior."""
    marca = f"[{nota} {nowdate()}]" if nota else ""
    linha = next((r for r in turma_doc.lista_catecumenos if r.catecumeno == cat.name), None)
    if linha:
        linha.estado = "Activo"
        linha.pre_avaliacao = ""
    else:
        linha = turma_doc.append("lista_catecumenos", {
            "catecumeno": cat.name, "estado": "Activo", "fase": turma_doc.fase, "turma": turma_doc.name,
            "idade": cat.idade, "data_de_nascimento": cat.data_de_nascimento, "sexo": cat.sexo,
            "encarregado": cat.encarregado, "contacto": cat.contacto,
            "pre_avaliacao": "", "nr_de_faltas": 0,
        })
    if marca:
        linha.observacoes = f"{marca} {linha.observacoes or ''}".strip()
    turma_doc.save(ignore_permissions=True)

    cat.status = "Activo"
    cat.fase = turma_doc.fase
    cat.turma = turma_doc.name
    cat.save(ignore_permissions=True)


@frappe.whitelist()
def reactivar_catecumeno(catecumeno, fase, turma, observacoes=''):
    """Reactiva (Inactivo) ou readmite (Transferido) um catecúmeno numa turma activa."""
    try:
        if not catecumeno or not fase or not turma:
            return {"success": False, "error": "Indique o catecúmeno, a fase e a turma."}
        if not frappe.db.exists("Catecumeno", catecumeno):
            return {"success": False, "error": f"Catecúmeno '{catecumeno}' não encontrado"}

        cat = frappe.get_doc("Catecumeno", catecumeno)
        cat.check_permission("write")
        if cat.status not in ESTADOS_READMITIVEIS:
            return {"success": False,
                    "error": f"Só se reactivam catecúmenos Inactivos ou Transferidos (status actual: {cat.status})"}

        if not frappe.db.exists("Turma", turma):
            return {"success": False, "error": f"Turma '{turma}' não encontrada"}
        turma_doc = frappe.get_doc("Turma", turma)
        if turma_doc.status != "Activo":
            return {"success": False, "error": f"Turma '{turma}' não está activa"}
        if turma_doc.fase != fase:
            return {"success": False, "error": f"A turma '{turma}' não pertence à fase '{fase}'"}

        accao = "Readmitido" if cat.status == "Transferido" else "Reactivado"
        estado_anterior = cat.status

        resumo = f"{accao} - Fase: {fase}, Turma: {turma}"
        if observacoes:
            resumo += f" - {observacoes}"
        cat.observacoes = f"[{nowdate()}] {resumo}\n{cat.observacoes or ''}".strip()

        colocar_em_turma(cat, turma_doc, nota=accao)
        cat.add_comment("Info", f"{accao} (estava {estado_anterior}) na turma {turma}, fase {fase}."
                                + (f" {observacoes}" if observacoes else ""))

        return {"success": True, "message": f"Catecúmeno '{catecumeno}' {accao.lower()} com sucesso",
                "catecumeno": catecumeno, "fase": fase, "turma": turma}

    except frappe.PermissionError:
        return {"success": False, "error": "Sem permissão para alterar este catecúmeno."}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Erro ao reactivar catecúmeno {catecumeno}")
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

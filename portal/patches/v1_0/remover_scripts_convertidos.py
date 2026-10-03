"""
Apaga os Client Scripts e Server Scripts da catequese que passaram a ser código
da app (controladores Python e ficheiros .js de cada DocType).

Corre depois da sincronização dos modelos (post_model_sync), quando os novos
controladores já estão activos. Os 5 scripts que estavam desactivados não foram
convertidos; o seu código fica guardado em scripts_desactivados_arquivo.json.
"""

import frappe

SERVER_SCRIPTS = [
    "After Rename change on child",
    "Apuramento Script",
    "Catequistas Permissions",
    "Criar catecumeno na inscricao",
    "Finalizar Sacramento",
    "Finalize Crisma",
    "Mover catecumenos em massa",
    "New Inscricao",
    "PS Baptismo Script",
    "PS Eucaristia Script",
    "Transferencia",
    "Troca de Turma",
    "Update Catecumeno Idade",
    "Update Sacramento on catecumeno",
    "Update child Table on save catecumeno",
]

CLIENT_SCRIPTS = [
    "Ano novo na turma",
    "Apuramento Script",
    "Atribuir Datas e Sacerdote",
    "Catecumenos Script",
    "Change turma bulk",
    "Historico de Catecumeno",
    "Idade Catecumeno",
    "Inactivar Cat",
    "Inscricao",
    "Listar Candidatos ao sacramento",
    "Listar Catecumenos on Turma",
    "Multi Select Catecumento",
    "Reactivar Catecumeno",
    "Script Catequista",
    "Sugestoes na incricao",
    "TC Filter activo",
    "Update child with parent on Sacramento",
    "alocacao em massa",
]


def execute():
    for doctype, nomes in (("Server Script", SERVER_SCRIPTS), ("Client Script", CLIENT_SCRIPTS)):
        for nome in nomes:
            if frappe.db.exists(doctype, nome):
                frappe.delete_doc(doctype, nome, ignore_permissions=True, force=True)
    frappe.clear_cache()

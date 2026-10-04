"""
Dados extra para os formulários estilizados (cartão de resumo no topo).
"""

import frappe


@frappe.whitelist()
def resumo_catecumeno(nome):
    """Turma (horário, local, catequistas com contacto) e a linha do catecúmeno nessa turma."""
    doc = frappe.get_doc("Catecumeno", nome)
    doc.check_permission("read")
    out = {"turma": None, "catequistas": [], "linha": None}
    if not doc.turma or not frappe.db.exists("Turma", doc.turma):
        return out

    t = frappe.db.get_value("Turma", doc.turma,
                            ["name", "status", "dia", "hora", "local", "ano_lectivo", "catequista", "catequista_adj",
                             "contacto", "contacto_adj"], as_dict=True)
    out["turma"] = t
    for nome_cat, papel, contacto_turma in ((t.catequista, "Responsável", t.contacto),
                                           (t.catequista_adj, "Adjunto", t.contacto_adj)):
        if not nome_cat:
            continue
        q = frappe.db.get_value("Catequista", nome_cat, ["contacto_1", "contacto_2"], as_dict=True) or {}
        out["catequistas"].append({
            "nome": nome_cat, "papel": papel,
            "contacto": q.get("contacto_1") or q.get("contacto_2") or contacto_turma or "",
        })
    out["linha"] = frappe.db.get_value(
        "Turma Catecumenos", {"parent": doc.turma, "parenttype": "Turma", "catecumeno": doc.name},
        ["estado", "nr_de_faltas", "ficha_de_catecumeno", "renovacao", "pre_avaliacao"], as_dict=True,
    )
    return out

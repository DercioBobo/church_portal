"""
Propostas do Plano criadas antes dos campos organizador / a confirmar / incluir:
nas propostas em rascunho, classifica cada linha pelas palavras das Catequese
Settings (separador Plano Anual) e marca as externas como "a confirmar".
Não altera datas, nomes nem notas da reunião.
"""

import frappe

from portal.catequese.utils import classificar_organizador, e_externa


def execute():
    for nome in frappe.get_all("Proposta do Plano", filters={"docstatus": 0}, pluck="name"):
        linhas = frappe.get_all(
            "Proposta do Plano Item",
            filters={"parent": nome, "parenttype": "Proposta do Plano"},
            fields=["name", "actividade", "tipologia", "orador", "organizador", "incluir"],
        )
        for l in linhas:
            # Antes desta versão não era possível excluir linhas: todas ficam incluídas
            # (a coluna nova pode ter sido criada com 0 em vez do valor por omissão 1)
            valores = {"incluir": 1}
            if not l.organizador:
                organizador = classificar_organizador(l.actividade, l.tipologia, l.orador)
                valores["organizador"] = organizador
                if e_externa(organizador):
                    valores["a_confirmar"] = 1
            if valores:
                frappe.db.set_value("Proposta do Plano Item", l.name, valores, update_modified=False)

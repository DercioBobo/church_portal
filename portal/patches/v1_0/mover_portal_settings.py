"""
A configuração do Portal do Catequista passou de "Catequista Portal Settings"
para um separador das "Catequese Settings". Copia as secções e os campos
(antes da sincronização, enquanto o DocType antigo ainda existe) e remove o antigo.
"""

import frappe

ANTIGO = "Catequista Portal Settings"
NOVO = "Catequese Settings"
TABELAS = (("Catequista Portal Section", "sections"), ("Catequista Portal Field", "field_config"))


def execute():
    for child, campo in TABELAS:
        if not frappe.db.table_exists(child):
            continue
        ja_copiado = frappe.db.sql(
            f"SELECT COUNT(*) FROM `tab{child}` WHERE parenttype = %s AND parentfield = %s", (NOVO, campo)
        )[0][0]
        if ja_copiado:
            continue
        colunas = [c for c in frappe.db.get_table_columns(child) if c != "name"]
        lista = ", ".join(f"`{c}`" for c in colunas)
        valores = ", ".join(
            "%(novo)s" if c in ("parent", "parenttype") else f"`{c}`" for c in colunas
        )
        frappe.db.sql(
            f"INSERT INTO `tab{child}` ({lista}) SELECT {valores} FROM `tab{child}` "
            f"WHERE parenttype = %(antigo)s AND parentfield = %(campo)s ORDER BY idx",
            {"novo": NOVO, "antigo": ANTIGO, "campo": campo},
        )

    # Só apaga o antigo se a cópia estiver completa
    for child, campo in TABELAS:
        if not frappe.db.table_exists(child):
            continue
        contar = "SELECT COUNT(*) FROM `tab{0}` WHERE parenttype = %s AND parentfield = %s".format(child)
        antigos = frappe.db.sql(contar, (ANTIGO, campo))[0][0]
        novos = frappe.db.sql(contar, (NOVO, campo))[0][0]
        if novos < antigos:
            frappe.throw(f"Cópia incompleta de {child}: {novos} de {antigos} linhas. Nada foi apagado.")

    # Remover o DocType antigo e as suas linhas (os dados já estão nas Catequese Settings)
    for child, _campo in TABELAS:
        if frappe.db.table_exists(child):
            frappe.db.sql(f"DELETE FROM `tab{child}` WHERE parenttype = %s", ANTIGO)
    frappe.db.delete("Singles", {"doctype": ANTIGO})
    if frappe.db.exists("DocType", ANTIGO):
        frappe.delete_doc("DocType", ANTIGO, force=True, ignore_permissions=True)
    frappe.clear_cache()

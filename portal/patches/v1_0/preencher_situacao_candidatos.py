import frappe


def execute():
    """Candidatos já existentes passam a "Vai receber" (a coluna Situação é nova)."""
    frappe.db.sql("""
        UPDATE `tabCandidatos ao Sacramento Table`
        SET situacao = 'Vai receber'
        WHERE IFNULL(situacao, '') = ''
    """)

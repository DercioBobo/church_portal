import frappe


def execute():
    """Candidatos ao Sacramento: o novo campo `nome_completo` (nome das pessoas que não são
    catecúmenos, nas preparações extraordinárias) passa a ter também o nome do catecúmeno,
    para os formatos de impressão ordenarem e mostrarem todos pelo mesmo campo."""
    frappe.db.sql("""
        UPDATE `tabCandidatos ao Sacramento Table`
        SET nome_completo = catecumeno
        WHERE IFNULL(catecumeno, '') != '' AND IFNULL(nome_completo, '') = ''""")

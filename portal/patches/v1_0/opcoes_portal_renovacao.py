import frappe


def execute():
    """O portal guarda as opções dos campos Select na configuração: actualiza-as para
    incluir "Isento" (renovação) e "Desistente" (pré-avaliação)."""
    meta = frappe.get_meta("Turma Catecumenos")
    for campo in ("renovacao", "pre_avaliacao"):
        opcoes = meta.get_field(campo).options or ""
        frappe.db.sql("""
            UPDATE `tabCatequista Portal Field` SET options = %s
            WHERE fieldname = %s AND fieldtype = 'Select' AND IFNULL(source, '') = 'turma_catecumenos'
        """, (opcoes, campo))

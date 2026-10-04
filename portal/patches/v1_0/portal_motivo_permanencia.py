import frappe


def execute():
    """Põe o "Motivo de permanência" no Portal do Catequista logo a seguir à pré-avaliação
    (mesma secção e mesma permissão de edição). Aparece só quando a pré-avaliação é Permanece."""
    if not frappe.db.exists("DocType", "Catequista Portal Field"):
        return
    s = frappe.get_single("Catequese Settings")
    linhas = list(s.get("field_config") or [])
    if any(r.fieldname == "motivo_permanencia" for r in linhas):
        return
    pre = next((r for r in linhas if r.fieldname == "pre_avaliacao"), None)
    if not pre:
        return
    nova = s.append("field_config", {
        "fieldname": "motivo_permanencia", "label": "Motivo de permanência", "fieldtype": "Small Text",
        "options": "", "source": "turma_catecumenos", "show_in_table": 0, "show_in_panel": 1,
        "editable": pre.editable, "panel_section": pre.panel_section, "column_width": "md", "col_span": "2",
    })
    # logo a seguir à pré-avaliação
    linhas.insert(linhas.index(pre) + 1, nova)
    s.set("field_config", linhas)
    for i, r in enumerate(s.field_config, start=1):
        r.idx = i
    s.flags.ignore_validate = True
    s.save(ignore_permissions=True)

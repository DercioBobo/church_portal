import frappe
from frappe import _
import json


def _assert_coordenador():
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    roles = frappe.get_roles(user)
    if "System Manager" not in roles and "Coordenador Catequese" not in roles:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


@frappe.whitelist()
def get_actividades(ano_lectivo):
    _assert_coordenador()

    rows = frappe.db.sql("""
        SELECT
            a.name, a.actividade, a.data, a.data_original,
            a.orador, a.local, a.orcamento,
            a.tipologia, a.estado, a.notas_execucao,
            a.ano_lectivo,
            t.cor AS tipologia_cor,
            t.icone AS tipologia_icone
        FROM `tabActividade do Plano` a
        LEFT JOIN `tabTipologia Actividade` t ON t.name = a.tipologia
        WHERE a.ano_lectivo = %s
        ORDER BY a.data IS NULL ASC, a.data ASC, a.name ASC
    """, (ano_lectivo,), as_dict=True)

    return rows


@frappe.whitelist()
def get_tipologias():
    _assert_coordenador()
    return frappe.db.sql(
        "SELECT name, cor, icone FROM `tabTipologia Actividade` ORDER BY name ASC",
        as_dict=True,
    )


@frappe.whitelist()
def get_anos_lectivos():
    _assert_coordenador()
    try:
        anos = frappe.db.sql(
            "SELECT name FROM `tabAno Lectivo` ORDER BY name DESC LIMIT 10",
            as_dict=True,
        )
        return [a.name for a in anos]
    except Exception:
        return []


@frappe.whitelist()
def get_ano_lectivo_atual():
    _assert_coordenador()
    try:
        # Try is_current flag first (common Frappe pattern)
        ano = None
        try:
            ano = frappe.db.get_value("Ano Lectivo", {"is_current": 1}, "name")
        except Exception:
            pass
        if not ano:
            # fallback: most recent by name (assumes "YYYY-YYYY" format)
            rows = frappe.db.sql(
                "SELECT name FROM `tabAno Lectivo` ORDER BY name DESC LIMIT 1",
                as_dict=True,
            )
            ano = rows[0].name if rows else None
        return ano
    except Exception:
        return None


@frappe.whitelist()
def create_actividade(data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json

    doc = frappe.new_doc("Actividade do Plano")
    doc.actividade    = data.get("actividade")
    doc.tipologia     = data.get("tipologia") or None
    doc.estado        = data.get("estado") or "Pendente"
    doc.ano_lectivo   = data.get("ano_lectivo")
    doc.data          = data.get("data") or None
    doc.orador        = data.get("orador") or None
    doc.local         = data.get("local") or None
    doc.orcamento     = data.get("orcamento") or None
    doc.notas_execucao = data.get("notas_execucao") or None
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    # Return full row with tipologia details
    row = frappe.db.sql("""
        SELECT a.name, a.actividade, a.data, a.data_original,
               a.orador, a.local, a.orcamento,
               a.tipologia, a.estado, a.notas_execucao, a.ano_lectivo,
               t.cor AS tipologia_cor, t.icone AS tipologia_icone
        FROM `tabActividade do Plano` a
        LEFT JOIN `tabTipologia Actividade` t ON t.name = a.tipologia
        WHERE a.name = %s
    """, (doc.name,), as_dict=True)
    return row[0] if row else {"name": doc.name}


@frappe.whitelist()
def update_actividade(name, data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json

    doc = frappe.get_doc("Actividade do Plano", name)

    # Preserve original date if date changes
    new_data = data.get("data") or None
    if new_data and doc.data and str(doc.data) != str(new_data) and not doc.data_original:
        doc.data_original = doc.data

    doc.actividade     = data.get("actividade", doc.actividade)
    doc.tipologia      = data.get("tipologia") or None
    doc.estado         = data.get("estado", doc.estado)
    doc.data           = new_data
    doc.orador         = data.get("orador") or None
    doc.local          = data.get("local") or None
    doc.orcamento      = data.get("orcamento") or None
    doc.notas_execucao = data.get("notas_execucao") or None
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    row = frappe.db.sql("""
        SELECT a.name, a.actividade, a.data, a.data_original,
               a.orador, a.local, a.orcamento,
               a.tipologia, a.estado, a.notas_execucao, a.ano_lectivo,
               t.cor AS tipologia_cor, t.icone AS tipologia_icone
        FROM `tabActividade do Plano` a
        LEFT JOIN `tabTipologia Actividade` t ON t.name = a.tipologia
        WHERE a.name = %s
    """, (name,), as_dict=True)
    return row[0] if row else {"name": name}


@frappe.whitelist()
def delete_actividade(name):
    _assert_coordenador()
    if not frappe.db.exists("Actividade do Plano", name):
        frappe.throw(_("Actividade não encontrada"))
    frappe.delete_doc("Actividade do Plano", name, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def update_estado(name, estado):
    _assert_coordenador()
    allowed = {"Pendente", "Realizada", "Cancelada", "Adiada"}
    if estado not in allowed:
        frappe.throw(_("Estado inválido"))
    frappe.db.set_value("Actividade do Plano", name, "estado", estado)
    frappe.db.commit()
    return {"success": True, "estado": estado}


@frappe.whitelist()
def reorder_actividades(ano_lectivo, ordered_names):
    """
    Persist drag-and-drop order within a month by updating a sort_order field.
    ordered_names is a JSON list of document names in the new order.
    """
    _assert_coordenador()
    names = json.loads(ordered_names) if isinstance(ordered_names, str) else ordered_names
    for idx, name in enumerate(names):
        frappe.db.set_value("Actividade do Plano", name, "idx", idx)
    frappe.db.commit()
    return {"success": True}

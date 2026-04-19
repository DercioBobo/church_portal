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
def get_anos_lectivos():
    _assert_coordenador()
    try:
        rows = frappe.db.sql(
            "SELECT name FROM `tabAno Lectivo` ORDER BY name DESC LIMIT 10",
            as_dict=True,
        )
        return [r.name for r in rows]
    except Exception:
        return []


@frappe.whitelist()
def get_ano_lectivo_atual():
    _assert_coordenador()
    try:
        ano = frappe.db.get_value("Ano Lectivo", {"is_current": 1}, "name")
        if not ano:
            rows = frappe.db.sql(
                "SELECT name FROM `tabAno Lectivo` ORDER BY name DESC LIMIT 1",
                as_dict=True,
            )
            ano = rows[0].name if rows else None
        return ano
    except Exception:
        return None


@frappe.whitelist()
def get_fases():
    _assert_coordenador()
    try:
        rows = frappe.db.sql(
            "SELECT name FROM `tabFase` ORDER BY name ASC",
            as_dict=True,
        )
        return [r.name for r in rows]
    except Exception:
        return []


@frappe.whitelist()
def get_retiros(ano_lectivo):
    _assert_coordenador()
    rows = frappe.db.sql("""
        SELECT
            name, titulo, data, estado,
            local, orador, tema,
            fase_1, fase_2
        FROM `tabPlano de Retiro`
        WHERE ano_lectivo = %s
        ORDER BY data IS NULL ASC, data ASC
    """, (ano_lectivo,), as_dict=True)
    return rows


@frappe.whitelist()
def create_retiro(data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json

    doc = frappe.new_doc("Plano de Retiro")
    doc.titulo      = data.get("titulo")
    doc.data        = data.get("data") or None
    doc.ano_lectivo = data.get("ano_lectivo")
    doc.estado      = data.get("estado") or "Planeado"
    doc.local       = data.get("local") or None
    doc.orador      = data.get("orador") or None
    doc.tema        = data.get("tema") or None
    doc.fase_1      = data.get("fase_1") or None
    doc.fase_2      = data.get("fase_2") or None
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    return _fetch_retiro(doc.name)


@frappe.whitelist()
def update_retiro(name, data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json

    doc = frappe.get_doc("Plano de Retiro", name)
    doc.titulo  = data.get("titulo", doc.titulo)
    doc.data    = data.get("data") or None
    doc.estado  = data.get("estado", doc.estado)
    doc.local   = data.get("local") or None
    doc.orador  = data.get("orador") or None
    doc.tema    = data.get("tema") or None
    doc.fase_1  = data.get("fase_1") or None
    doc.fase_2  = data.get("fase_2") or None
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return _fetch_retiro(name)


@frappe.whitelist()
def delete_retiro(name):
    _assert_coordenador()
    if not frappe.db.exists("Plano de Retiro", name):
        frappe.throw(_("Retiro não encontrado"))
    frappe.delete_doc("Plano de Retiro", name, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def update_estado(name, estado):
    _assert_coordenador()
    allowed = {"Planeado", "Realizado", "Cancelado"}
    if estado not in allowed:
        frappe.throw(_("Estado inválido"))
    frappe.db.set_value("Plano de Retiro", name, "estado", estado)
    frappe.db.commit()
    return {"success": True, "estado": estado}


def _fetch_retiro(name):
    rows = frappe.db.sql("""
        SELECT name, titulo, data, estado,
               local, orador, tema,
               fase_1, fase_2
        FROM `tabPlano de Retiro`
        WHERE name = %s
    """, (name,), as_dict=True)
    return rows[0] if rows else {"name": name}

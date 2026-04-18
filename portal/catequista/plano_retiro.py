"""
Plano de Retiros — desk-side helpers.

Portal API (get_proximos_retiros) lives in portal/api.py alongside the
other catequista portal endpoints.
"""

import frappe
from frappe import _


def _assert_coordenador():
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    roles = frappe.get_roles(user)
    if "System Manager" not in roles and "Coordenador Catequese" not in roles:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


@frappe.whitelist()
def listar_retiros_com_programa():
    """
    Returns retiros that have at least one Retiro Item (programme defined).
    Used to populate the 'copy from previous' dialog.
    """
    _assert_coordenador()
    return frappe.db.sql("""
        SELECT DISTINCT p.name, p.titulo, p.data
        FROM `tabPlano de Retiro` p
        INNER JOIN `tabRetiro Item` ri ON ri.parent = p.name
        ORDER BY p.data DESC
        LIMIT 30
    """, as_dict=True)


@frappe.whitelist()
def get_programa_anterior(retiro_name):
    """
    Returns the programme items of a given retiro, ordered by idx.
    Used by the client script to populate the child table of the current retiro.
    """
    _assert_coordenador()
    if not frappe.db.exists("Plano de Retiro", retiro_name):
        frappe.throw(_("Retiro não encontrado"))

    return frappe.db.sql("""
        SELECT hora, actividade, responsavel, notas
        FROM `tabRetiro Item`
        WHERE parent = %s
        ORDER BY idx ASC
    """, (retiro_name,), as_dict=True)

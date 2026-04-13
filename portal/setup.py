"""
Portal de Catequese — Installation setup.

Run automatically after `bench install-app portal`.
Can also be re-run manually:
    bench execute portal.setup.after_install
"""

import frappe
from frappe.permissions import add_permission, update_permission_property

ROLE = "Catequista"

# DocTypes and the CRUD flags catequistas need
# (read, write, create, delete, submit, cancel, amend)
DOCTYPE_PERMISSIONS = [
    # Catequistas can read and write their Turma (but not create/delete)
    {
        "doctype": "Turma",
        "permlevel": 0,
        "read": 1, "write": 1, "create": 0, "delete": 0,
    },
    # Catequistas can read and write Catecumenos in their turma
    {
        "doctype": "Catecumeno",
        "permlevel": 0,
        "read": 1, "write": 1, "create": 0, "delete": 0,
    },
    # Child table — needed for inline editing (observações, etc.)
    {
        "doctype": "Turma Catecumenos",
        "permlevel": 0,
        "read": 1, "write": 1, "create": 0, "delete": 0,
    },
]


def after_install():
    _ensure_role()
    _setup_permissions()
    _setup_custom_fields()
    frappe.db.commit()
    print("[portal] Setup completo: papel 'Catequista', permissões e campos personalizados configurados.")


def _ensure_role():
    """Create the Catequista role if it doesn't exist yet."""
    if not frappe.db.exists("Role", ROLE):
        frappe.get_doc({
            "doctype": "Role",
            "role_name": ROLE,
            "desk_access": 1,
            "is_custom": 1,
        }).insert(ignore_permissions=True)
        print(f"[portal] Papel '{ROLE}' criado.")
    else:
        print(f"[portal] Papel '{ROLE}' já existe.")


def _setup_permissions():
    """
    Add DocType permissions for the Catequista role.
    Safe to run multiple times — skips if the permission already exists.
    """
    for p in DOCTYPE_PERMISSIONS:
        dt = p["doctype"]

        # add_permission is idempotent — won't duplicate
        add_permission(dt, ROLE, p["permlevel"])

        for prop in ("read", "write", "create", "delete"):
            update_permission_property(dt, ROLE, p["permlevel"], prop, p.get(prop, 0))

        print(f"[portal] Permissões definidas: {ROLE} → {dt}")


def _setup_custom_fields():
    """
    Add the senha_temporaria field to the Catequista doctype.
    Safe to run multiple times — skips if already exists.
    """
    if frappe.db.exists("Custom Field", "Catequista-senha_temporaria"):
        print("[portal] Campo 'senha_temporaria' já existe.")
        return

    frappe.get_doc({
        "doctype": "Custom Field",
        "dt": "Catequista",
        "label": "Senha Temporária",
        "fieldname": "senha_temporaria",
        "fieldtype": "Data",
        "insert_after": "user",
        "description": "Senha gerada automaticamente. Copie e partilhe com o catequista.",
        "no_copy": 1,
    }).insert(ignore_permissions=True)
    print("[portal] Campo 'senha_temporaria' adicionado ao Catequista.")

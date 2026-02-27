"""
Portal de Catequese — Permission helpers for the Catequista role.

How it works:
  - Each Catequista document has a `user` field (Link → User).
  - Turma has `catequista` and `catequista_adj` (both Link → Catequista).
  - When a catequista logs in, these functions restrict their view to only
    the turmas where they are listed (main or adj) and to the catecúmenos
    that belong to those turmas.
  - System Administrator and other privileged roles are unaffected
    (the functions return "" / None to fall through to normal permissions).
"""

import frappe

CATEQUISTA_ROLE = "Catequista"


def _get_catequista_name(user=None):
    """Return the Catequista document name linked to this ERPNext user, or None."""
    user = user or frappe.session.user
    return frappe.db.get_value("Catequista", {"user": user}, "name")


def _user_is_catequista(user=None):
    user = user or frappe.session.user
    return CATEQUISTA_ROLE in frappe.get_roles(user)


# ── Turma ─────────────────────────────────────────────────────────────────────

def turma_permission_query(user):
    """
    List-view filter: show only turmas where the logged-in user is
    catequista or catequista_adj.
    Returns "" to leave non-catequista users unaffected.
    """
    if not _user_is_catequista(user):
        return ""

    cat = _get_catequista_name(user)
    if not cat:
        return "1=0"  # catequista role but no linked Catequista record → no access

    e = frappe.db.escape(cat)
    return f"(`tabTurma`.`catequista` = {e} OR `tabTurma`.`catequista_adj` = {e})"


def turma_has_permission(doc, ptype, user):
    """
    Document-level check: can this user open/edit this specific Turma?
    Returns None to fall through for non-catequista users.
    """
    if not _user_is_catequista(user):
        return None

    cat = _get_catequista_name(user)
    if not cat:
        return False

    return doc.catequista == cat or doc.catequista_adj == cat


# ── Catecumeno ────────────────────────────────────────────────────────────────

def catecumeno_permission_query(user):
    """
    List-view filter: show only catecúmenos whose turma belongs to this user.
    """
    if not _user_is_catequista(user):
        return ""

    cat = _get_catequista_name(user)
    if not cat:
        return "1=0"

    e = frappe.db.escape(cat)
    return f"""EXISTS (
        SELECT 1 FROM `tabTurma` t
        WHERE t.`name` = `tabCatecumeno`.`turma`
          AND (t.`catequista` = {e} OR t.`catequista_adj` = {e})
          AND t.`status` = 'Activo'
    )"""


def catecumeno_has_permission(doc, ptype, user):
    """
    Document-level check: can this user open/edit this specific Catecumeno?
    """
    if not _user_is_catequista(user):
        return None

    cat = _get_catequista_name(user)
    if not cat:
        return False

    if not doc.turma:
        return False

    turma = frappe.db.get_value(
        "Turma", doc.turma,
        ["catequista", "catequista_adj", "status"],
        as_dict=True,
    )
    if not turma or turma.status != "Activo":
        return False

    return turma.catequista == cat or turma.catequista_adj == cat


# ── Catequista automation ─────────────────────────────────────────────────────

def on_catequista_update(doc, method):
    """
    When a Catequista record is saved with a user linked, ensure the
    Catequista role is automatically assigned to that ERPNext user.

    This means the admin only needs to:
      1. Open the Catequista record
      2. Set the `user` field to the ERPNext User
      3. Save — the role is assigned automatically
    """
    if not doc.user:
        return

    try:
        user_doc = frappe.get_doc("User", doc.user)
        existing_roles = {r.role for r in user_doc.roles}

        if CATEQUISTA_ROLE not in existing_roles:
            user_doc.add_roles(CATEQUISTA_ROLE)
            frappe.msgprint(
                f"Papel <b>Catequista</b> atribuído ao utilizador <b>{doc.user}</b>.",
                indicator="green",
                alert=True,
            )
    except frappe.DoesNotExistError:
        frappe.log_error(
            f"Utilizador '{doc.user}' não encontrado ao gravar Catequista '{doc.name}'.",
            title="Portal: erro ao atribuir papel Catequista",
        )

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

User automation:
  - When a Catequista record is saved without a linked user, an ERPNext user
    is automatically created:
      * email: from the `email` field, or generated as slug@pnsa.co.mz
      * username: first name, lowercased, without accents (unique)
      * password: pnsa@XXXX (random 4 digits), stored in senha_temporaria
  - If the user already exists (same email), it is linked without changes.
  - Admin can reset the password by editing senha_temporaria and saving.
"""

import re
import random
import string
import unicodedata

import frappe

CATEQUISTA_ROLE = "Catequista"
EMAIL_DOMAIN = "pnsa.co.mz"


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_catequista_name(user=None):
    """Return the Catequista document name linked to this ERPNext user, or None."""
    user = user or frappe.session.user
    return frappe.db.get_value("Catequista", {"user": user}, "name")


def _user_is_catequista(user=None):
    user = user or frappe.session.user
    if user == "Administrator":
        return False
    roles = frappe.get_roles(user)
    # Never restrict privileged users, even if they also carry the Catequista role
    if "System Manager" in roles:
        return False
    return CATEQUISTA_ROLE in roles


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


# ── User creation helpers ─────────────────────────────────────────────────────

def _slugify(name):
    """'Dércio Bobo' → 'dercio' (first word, lowercase, ascii-only)."""
    nfkd = unicodedata.normalize("NFKD", name or "")
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    first_word = (ascii_str.strip().split() or ["catequista"])[0]
    return re.sub(r"[^a-z0-9]", "", first_word.lower()) or "catequista"


def _unique_username(base):
    username, n = base, 2
    while frappe.db.exists("User", {"username": username}):
        username, n = f"{base}{n}", n + 1
    return username


def _unique_email(slug):
    email = f"{slug}@{EMAIL_DOMAIN}"
    n = 2
    while frappe.db.exists("User", email):
        email, n = f"{slug}{n}@{EMAIL_DOMAIN}", n + 1
    return email


def _make_password():
    return "pnsa@" + "".join(random.choices(string.digits, k=4))


# ── Catequista automation ─────────────────────────────────────────────────────

def on_catequista_update(doc, method):
    """
    Called on after_insert and on_update of Catequista.

    1. If no user is linked → auto-create one and store temp password.
    2. If user is linked and senha_temporaria changed → apply new password.
    3. Always ensure the Catequista role is assigned to the linked user.
    """
    if not doc.user:
        _create_and_link_user(doc)
        return  # _create_and_link_user already handles role assignment

    # Detect senha_temporaria change (skip on after_insert — handled above)
    is_new = method == "after_insert"
    if not is_new and doc.senha_temporaria:
        previous = doc.get_doc_before_save()
        prev_senha = (previous.senha_temporaria
                      if previous and hasattr(previous, "senha_temporaria") else None)
        if doc.senha_temporaria != prev_senha:
            _apply_password(doc.user, doc.senha_temporaria)

    _ensure_role(doc.user)


def _create_and_link_user(doc):
    """Create an ERPNext user for this Catequista and write it back."""
    from frappe.utils.password import update_password

    # Resolve email: use field if set, otherwise generate from name
    email = getattr(doc, "email", None) or None
    if not email:
        slug = _slugify(doc.name)
        email = _unique_email(slug)

    # If a user with that email already exists, just link it
    if frappe.db.exists("User", email):
        frappe.db.set_value("Catequista", doc.name, "user", email)
        doc.user = email
        _ensure_role(email)
        frappe.msgprint(
            f"Utilizador existente <b>{email}</b> ligado a este catequista.",
            indicator="blue",
            alert=True,
        )
        return

    # Build unique username from the email local-part
    slug = email.split("@")[0]
    username = _unique_username(slug)
    password = _make_password()

    # Create the User document
    user_doc = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "username": username,
        "first_name": doc.name,
        "send_welcome_email": 0,
        "roles": [{"role": CATEQUISTA_ROLE}],
    })
    user_doc.insert(ignore_permissions=True)
    update_password(email, password)

    # Write user + temp password back to the Catequista record
    frappe.db.set_value("Catequista", doc.name, {
        "user": email,
        "senha_temporaria": password,
    })
    doc.user = email
    doc.senha_temporaria = password

    frappe.msgprint(
        f"Utilizador <b>{email}</b> criado com senha temporária <b>{password}</b>.",
        indicator="green",
        alert=True,
    )


def _apply_password(user_email, password):
    """Apply a new password to the linked user."""
    from frappe.utils.password import update_password
    try:
        update_password(user_email, password)
        frappe.msgprint(
            f"Senha do utilizador <b>{user_email}</b> actualizada.",
            indicator="green",
            alert=True,
        )
    except Exception as exc:
        frappe.log_error(str(exc), "Portal: erro ao aplicar senha temporária")


def _ensure_role(user_email):
    """Assign the Catequista role to this user if not already assigned."""
    try:
        user_doc = frappe.get_doc("User", user_email)
        existing = {r.role for r in user_doc.roles}
        if CATEQUISTA_ROLE not in existing:
            user_doc.add_roles(CATEQUISTA_ROLE)
    except frappe.DoesNotExistError:
        frappe.log_error(
            f"Utilizador '{user_email}' não encontrado ao atribuir papel Catequista.",
            title="Portal: erro ao atribuir papel",
        )

app_name = "portal"
app_title = "Portal"
app_publisher = "PNSA"
app_description = "Portal público de Catequese"
app_email = "admin@pnsa.mz"
app_license = "MIT"
app_version = "0.0.1"

# Required apps (pnsa_app must be installed for DocTypes to exist)
# required_apps = ["pnsa_app"]

# ── After install ──────────────────────────────────────────────────────────────
# Sets up the Catequista role and DocType permissions automatically.
after_install = "portal.setup.after_install"

# ── Permission query conditions ────────────────────────────────────────────────
# These filter list views so Catequistas only see their own turmas/catecúmenos.
# System Administrators and other roles are unaffected.
permission_query_conditions = {
    "Turma": "portal.permissions.turma_permission_query",
    "Catecumeno": "portal.permissions.catecumeno_permission_query",
}

# ── Document-level permission checks ──────────────────────────────────────────
# Called when a user tries to open or edit a single document.
has_permission = {
    "Turma": "portal.permissions.turma_has_permission",
    "Catecumeno": "portal.permissions.catecumeno_has_permission",
}

# ── Doc events ─────────────────────────────────────────────────────────────────
# Auto-assigns the Catequista role whenever a Catequista record is saved
# with a linked User — admin just sets the user field and saves.
doc_events = {
    "Catequista": {
        "after_insert": "portal.permissions.on_catequista_update",
        "on_update": "portal.permissions.on_catequista_update",
    }
}

# ── Fixtures ───────────────────────────────────────────────────────────────────
# Exported with: bench export-fixtures --app portal
# Imported with: bench import-fixtures --app portal  (or bench migrate)
fixtures = [
    {"dt": "Role", "filters": [["role_name", "=", "Catequista"]]},
]

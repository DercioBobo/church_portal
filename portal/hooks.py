app_name = "portal"
app_title = "Portal"
app_publisher = "PNSA"
app_description = "Portal público de Catequese"
app_email = "admin@pnsa.mz"
app_license = "MIT"
app_version = "0.0.1"

# ── Fixtures ───────────────────────────────────────────────────────────────────
# Synced automatically on bench migrate.
# DocTypes da catequese (módulos Catequese e Paroquia) cujos formatos de
# impressão, relatórios e Property Setters são versionados como fixtures.
# A lógica (antigos Client/Server Scripts) está nos controladores de cada DocType.
CATEQUESE_DOCTYPES = [
    "Alocacao Pendente Item", "Alocacao Turma Item", "Alocacao em Massa", "Ano Lectivo",
    "Apuramento Item", "Apuramento Novas Turmas Table", "Apuramento Turmas Table",
    "Apuramento de Turmas", "Candidatos ao Sacramento Table", "Catecumeno", "Catequista",
    "Fase", "Inactivar Catecumeno", "Inscricao", "Lista Catecumenos", "Livro de Baptismo",
    "Preparacao do Sacramento", "Profissao de Fe", "Sacramento", "Transferencia de Catecumeno",
    "Troca de Turma", "Turma", "Turma Catecumenos", "Fiel", "Nucleo",
]

fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["Catequista", "Coordenador Catequese"]]]},
    {"dt": "Custom Field", "filters": [["dt", "=", "Catequista"]]},
    {"dt": "Property Setter", "filters": [["doc_type", "in", CATEQUESE_DOCTYPES]]},
    {"dt": "Sacramento"},
    {"dt": "Fase"},
    {"dt": "Print Format", "filters": [["doc_type", "in", CATEQUESE_DOCTYPES + ["Plano de Retiro"]]]},
    {"dt": "Report", "filters": [["ref_doctype", "in", CATEQUESE_DOCTYPES]]},
]

# ── Compatibilidade com a antiga app pnsa_app ──────────────────────────────────
# A página pública da paróquia usa estes URLs; continuam a funcionar depois de
# remover a pnsa_app.
override_whitelisted_methods = {
    # antigo Server Script do tipo API
    "mover_catecumenos_em_massa": "portal.catequese.turma.mover_catecumenos_em_massa",
    "pnsa_app.paroquia_app.catequese.scheduler.get_catecumenos_aniversariantes":
        "portal.catequese.scheduler.get_catecumenos_aniversariantes",
    "pnsa_app.paroquia_app.catequese.turma.get_turma_catecumenos":
        "portal.catequese.turma.get_turma_catecumenos",
}

# ── Boot ───────────────────────────────────────────────────────────────────────
# Ano lectivo actual e definições principais disponíveis no browser (frappe.boot.catequese)
boot_session = "portal.catequese.utils.boot_session"

# ── Scheduler ──────────────────────────────────────────────────────────────────
# (vindo da antiga app pnsa_app)
scheduler_events = {
    "daily": [
        "portal.catequese.scheduler.update_catecumeno_idade_daily",
    ],
}

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

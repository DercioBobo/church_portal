"""
Portal Público de Catequese — API
Todos os endpoints são públicos (allow_guest=True) e não expõem dados sensíveis.
"""

import frappe
from frappe import _
from frappe.utils import cint
from datetime import date, timedelta


@frappe.whitelist(allow_guest=True)
def get_turmas_publicas():
    """Lista de turmas activas com contagem de catecúmenos."""
    turmas = frappe.db.sql("""
        SELECT
            t.name,
            t.fase,
            t.ano_lectivo,
            t.local,
            t.dia,
            t.hora,
            t.catequista,
            t.catequista_adj,
            COUNT(tc.name) AS total_catecumenos
        FROM `tabTurma` t
        LEFT JOIN `tabTurma Catecumenos` tc ON tc.parent = t.name
            AND tc.parentfield = 'lista_catecumenos'
        WHERE t.status = 'Activo'
        GROUP BY t.name
        ORDER BY t.fase ASC, t.name ASC
    """, as_dict=True)
    return turmas


@frappe.whitelist(allow_guest=True)
def get_turma_detalhe(turma_nome):
    """Detalhe de uma turma: info + lista de catecúmenos (só nomes)."""
    turma = frappe.db.get_value(
        "Turma", turma_nome,
        ["name", "fase", "ano_lectivo", "local", "dia", "hora",
         "catequista", "catequista_adj", "status"],
        as_dict=True,
    )

    if not turma or turma.status != "Activo":
        frappe.throw(_("Turma não encontrada"))

    catecumenos = frappe.db.sql("""
        SELECT tc.catecumeno
        FROM `tabTurma Catecumenos` tc
        WHERE tc.parent = %s
          AND tc.parentfield = 'lista_catecumenos'
        ORDER BY tc.catecumeno ASC
    """, (turma_nome,), as_dict=True)

    turma["catecumenos"] = catecumenos
    turma["total_catecumenos"] = len(catecumenos)
    return turma


@frappe.whitelist(allow_guest=True)
def pesquisar(query):
    """Pesquisa global por nome de catecúmeno ou catequista."""
    if not query or len(query.strip()) < 2:
        return {"catecumenos": [], "catequistas": []}

    q = f"%{query.strip()}%"

    catecumenos = frappe.db.sql("""
        SELECT
            c.name,
            c.fase,
            c.turma,
            c.sexo,
            c.status,
            c.encarregado,
            t.local,
            t.dia,
            t.hora,
            t.catequista,
            t.catequista_adj,
            NULL AS found_via
        FROM `tabCatecumeno` c
        LEFT JOIN `tabTurma` t ON c.turma = t.name
        WHERE c.name LIKE %s
        ORDER BY c.name ASC
        LIMIT 20
    """, (q,), as_dict=True)

    # Search by encarregado name (field may vary — graceful fallback)
    try:
        enc = frappe.db.sql("""
            SELECT
                c.name,
                c.fase,
                c.turma,
                c.sexo,
                c.status,
                c.encarregado,
                t.local,
                t.dia,
                t.hora,
                t.catequista,
                t.catequista_adj,
                'encarregado' AS found_via
            FROM `tabCatecumeno` c
            LEFT JOIN `tabTurma` t ON c.turma = t.name
            WHERE c.encarregado LIKE %s
            ORDER BY c.name ASC
            LIMIT 10
        """, (q,), as_dict=True)
        # Avoid duplicates
        existing = {r.name for r in catecumenos}
        catecumenos += [r for r in enc if r.name not in existing]
    except Exception:
        pass

    catequistas = frappe.db.sql("""
        SELECT DISTINCT
            t.catequista,
            t.catequista_adj,
            t.name  AS turma,
            t.fase,
            t.local,
            t.dia,
            t.hora,
            t.status
        FROM `tabTurma` t
        WHERE (t.catequista LIKE %s OR t.catequista_adj LIKE %s)
        ORDER BY t.catequista ASC
        LIMIT 10
    """, (q, q), as_dict=True)

    return {"catecumenos": catecumenos, "catequistas": catequistas}


@frappe.whitelist(allow_guest=True)
def get_catecumeno_publico(catecumeno_nome):
    """Ficha pública de catecúmeno — sem dados sensíveis."""
    cat = frappe.db.get_value(
        "Catecumeno", catecumeno_nome,
        ["name", "fase", "turma", "sexo", "status", "encarregado"],
        as_dict=True,
    )

    if not cat:
        frappe.throw(_("Catecúmeno não encontrado"))

    turma_info = None
    if cat.turma:
        turma_info = frappe.db.get_value(
            "Turma", cat.turma,
            ["name", "fase", "local", "dia", "hora",
             "catequista", "catequista_adj", "ano_lectivo"],
            as_dict=True,
        )

    return {"catecumeno": cat, "turma": turma_info}


@frappe.whitelist(allow_guest=True)
def get_catecumenos_aniversariantes(tipo="hoje"):
    """Aniversariantes hoje ou esta semana. Não expõe data de nascimento exacta."""
    today = date.today()

    if tipo == "hoje":
        condition = "MONTH(c.data_de_nascimento) = %s AND DAY(c.data_de_nascimento) = %s"
        params = (today.month, today.day)
    else:
        # Week runs Sunday–Saturday; today.weekday(): Mon=0 … Sun=6
        days_since_sunday = (today.weekday() + 1) % 7
        week_start = today - timedelta(days=days_since_sunday)
        week_end = week_start + timedelta(days=6)
        if week_start.month == week_end.month:
            condition = """
                MONTH(c.data_de_nascimento) = %s
                AND DAY(c.data_de_nascimento) BETWEEN %s AND %s
            """
            params = (week_start.month, week_start.day, week_end.day)
        else:
            condition = """
                (MONTH(c.data_de_nascimento) = %s AND DAY(c.data_de_nascimento) >= %s)
                OR (MONTH(c.data_de_nascimento) = %s AND DAY(c.data_de_nascimento) <= %s)
            """
            params = (week_start.month, week_start.day, week_end.month, week_end.day)

    aniversariantes = frappe.db.sql(f"""
        SELECT
            c.name,
            c.fase,
            c.turma,
            t.local,
            t.catequista,
            YEAR(CURDATE()) - YEAR(c.data_de_nascimento) AS idade,
            YEAR(CURDATE()) - YEAR(c.data_de_nascimento) + 1 AS idade_nova,
            DATE_FORMAT(c.data_de_nascimento, '%%m-%%d') AS data_aniversario
        FROM `tabCatecumeno` c
        LEFT JOIN `tabTurma` t ON c.turma = t.name
        WHERE c.data_de_nascimento IS NOT NULL
          AND c.status = 'Activo'
          AND {condition}
        ORDER BY MONTH(c.data_de_nascimento), DAY(c.data_de_nascimento), c.name
    """, params, as_dict=True)

    return aniversariantes


@frappe.whitelist(allow_guest=True)
def get_estatisticas_publicas():
    """Estatísticas gerais para o dashboard público."""
    total_catecumenos = frappe.db.count("Catecumeno", {"status": "Activo"})
    total_turmas = frappe.db.count("Turma", {"status": "Activo"})

    try:
        total_catequistas = frappe.db.count("Catequista")
    except Exception:
        total_catequistas = 0

    fases = frappe.db.sql("""
        SELECT fase, COUNT(*) AS total
        FROM `tabCatecumeno`
        WHERE fase IS NOT NULL AND fase != ''
          AND status = 'Activo'
        GROUP BY fase
        ORDER BY fase ASC
    """, as_dict=True)

    return {
        "total_catecumenos": total_catecumenos,
        "total_turmas": total_turmas,
        "total_catequistas": total_catequistas,
        "por_fase": fases,
    }


# ─── Preparação do Sacramento ────────────────────────────────────────────────

@frappe.whitelist(allow_guest=True)
def get_preparacoes_sacramento():
    """Lista todas as Preparações do Sacramento com contagem de candidatos."""
    preparacoes = frappe.db.sql("""
        SELECT
            p.name,
            p.sacramento,
            p.ano_lectivo,
            p.data_do_sacramento,
            COUNT(c.name) AS total_candidatos
        FROM `tabPreparacao do Sacramento` p
        LEFT JOIN `tabCandidatos ao Sacramento Table` c
            ON c.parent = p.name
           AND c.parentfield = 'candidatos_sacramento_table'
        GROUP BY p.name
        ORDER BY p.data_do_sacramento DESC, p.name ASC
    """, as_dict=True)
    return preparacoes


@frappe.whitelist(allow_guest=True)
def get_preparacao_sacramento(nome):
    """Detalhe de uma Preparação do Sacramento com candidatos."""
    preparacao = frappe.db.get_value(
        "Preparacao do Sacramento",
        nome,
        ["name", "sacramento", "ano_lectivo", "data_do_sacramento",
         "documentos_exigidos", "valor_ofertorio", "valor_cracha", "observacoes"],
        as_dict=True,
    )

    if not preparacao:
        frappe.throw(_("Preparação do Sacramento não encontrada"))

    candidatos = frappe.db.sql("""
        SELECT
            c.name,
            c.catecumeno,
            c.turma,
            c.fase,
            c.sexo,
            c.idade,
            c.data_de_nascimento,
            c.date,
            c.dia,
            c.sacerdote,
            c.encarregado,
            c.contacto_encarregado,
            c.padrinhos,
            c.contacto_padrinhos,
            c.ficha,
            c.documentos_padrinhos,
            c.valor_ofertorio,
            c.valor_cracha,
            c.valor_accao_gracas,
            c.valor_fotos,
            c.obs,
            c.enc_obs
        FROM `tabCandidatos ao Sacramento Table` c
        WHERE c.parent = %s
          AND c.parentfield = 'candidatos_sacramento_table'
        ORDER BY c.catecumeno ASC
    """, (nome,), as_dict=True)

    preparacao["candidatos"] = candidatos
    return preparacao


@frappe.whitelist(allow_guest=True)
def atualizar_candidato_sacramento(
    preparacao_nome, row_name,
    encarregado=None, contacto_encarregado=None,
    padrinhos=None, contacto_padrinhos=None,
    idade=None, data_de_nascimento=None, dia=None, enc_obs=None,
):
    """
    Permite ao encarregado actualizar os campos editáveis do candidato.
    Actualiza também o Catecumeno correspondente nos campos partilhados.
    """
    # Verify the row belongs to this preparacao
    row = frappe.db.get_value(
        "Candidatos ao Sacramento Table",
        row_name,
        ["name", "catecumeno", "parent", "parentfield"],
        as_dict=True,
    )

    if not row or row.parent != preparacao_nome or row.parentfield != "candidatos_sacramento_table":
        frappe.throw(_("Candidato não encontrado nesta preparação"))

    # Build update dict for child row (all editable fields)
    child_updates = {}
    if dia is not None:
        child_updates["dia"] = dia
    if encarregado is not None:
        child_updates["encarregado"] = encarregado
    if contacto_encarregado is not None:
        child_updates["contacto_encarregado"] = contacto_encarregado
    if padrinhos is not None:
        child_updates["padrinhos"] = padrinhos
    if contacto_padrinhos is not None:
        child_updates["contacto_padrinhos"] = contacto_padrinhos
    if idade is not None:
        child_updates["idade"] = cint(idade)
    if data_de_nascimento is not None:
        child_updates["data_de_nascimento"] = data_de_nascimento
    if enc_obs is not None:
        child_updates["enc_obs"] = enc_obs

    if child_updates:
        frappe.db.set_value("Candidatos ao Sacramento Table", row_name, child_updates)

    # Mirror shared fields to Catecumeno doctype
    if row.catecumeno:
        cat_updates = {}
        if encarregado is not None:
            cat_updates["encarregado"] = encarregado
        if contacto_encarregado is not None:
            cat_updates["contacto_encarregado"] = contacto_encarregado
        if padrinhos is not None:
            cat_updates["padrinhos"] = padrinhos
        if contacto_padrinhos is not None:
            cat_updates["contacto_padrinhos"] = contacto_padrinhos
        if idade is not None:
            cat_updates["idade"] = cint(idade)
        if data_de_nascimento is not None:
            cat_updates["data_de_nascimento"] = data_de_nascimento

        if cat_updates:
            try:
                frappe.db.set_value("Catecumeno", row.catecumeno, cat_updates)
            except Exception:
                pass  # Catecumeno may not exist; non-critical

    frappe.db.commit()
    return {"success": True}


@frappe.whitelist(allow_guest=True)
def get_catecumenos_publicos():
    """Lista pública de catecúmenos activos com info da turma."""
    catecumenos = frappe.db.sql("""
        SELECT
            c.name,
            c.fase,
            c.turma,
            c.sexo,
            t.local,
            t.dia,
            t.hora,
            t.catequista,
            t.catequista_adj
        FROM `tabCatecumeno` c
        LEFT JOIN `tabTurma` t ON c.turma = t.name
        WHERE c.status = 'Activo'
        ORDER BY c.name ASC
    """, as_dict=True)
    return catecumenos


# ─── Portal do Catequista (autenticado) ───────────────────────────────────────

def _default_field_config():
    """
    Static default config used when no Catequista Portal Settings doc exists.
    Always returns the common fields so the portal works out-of-the-box.
    """
    return [
        # ── Catecumeno ────────────────────────────────────────────────────────
        {"fieldname": "name",                 "label": "Nome",                 "fieldtype": "Data",       "options": "",     "show_in_table": True,  "show_in_panel": True,  "editable": False, "column_width": "lg", "panel_section": "",                        "source": "catecumeno",        "col_span": "2"},
        {"fieldname": "sexo",                 "label": "Sexo",                 "fieldtype": "Select",     "options": "M\nF", "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "xs", "panel_section": "Dados Pessoais",          "source": "catecumeno",        "col_span": "1"},
        {"fieldname": "idade",                "label": "Idade",                "fieldtype": "Int",        "options": "",     "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "xs", "panel_section": "Dados Pessoais",          "source": "catecumeno",        "col_span": "1"},
        {"fieldname": "data_de_nascimento",   "label": "Data de Nascimento",   "fieldtype": "Date",       "options": "",     "show_in_table": False, "show_in_panel": True,  "editable": True,  "column_width": "sm", "panel_section": "Dados Pessoais",          "source": "catecumeno",        "col_span": "2"},
        {"fieldname": "encarregado",          "label": "Encarregado",          "fieldtype": "Data",       "options": "",     "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "md", "panel_section": "Encarregado de Educação", "source": "catecumeno",        "col_span": "2"},
        {"fieldname": "contacto_encarregado", "label": "Contacto Encarregado", "fieldtype": "Data",       "options": "",     "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "sm", "panel_section": "Encarregado de Educação", "source": "catecumeno",        "col_span": "2"},
        {"fieldname": "padrinhos",            "label": "Padrinhos",            "fieldtype": "Data",       "options": "",     "show_in_table": False, "show_in_panel": True,  "editable": True,  "column_width": "md", "panel_section": "Padrinhos / Madrinhas",   "source": "catecumeno",        "col_span": "2"},
        {"fieldname": "contacto_padrinhos",   "label": "Contacto Padrinhos",   "fieldtype": "Data",       "options": "",     "show_in_table": False, "show_in_panel": True,  "editable": True,  "column_width": "sm", "panel_section": "Padrinhos / Madrinhas",   "source": "catecumeno",        "col_span": "2"},
        {"fieldname": "obs",                  "label": "Observações",          "fieldtype": "Small Text", "options": "",     "show_in_table": False, "show_in_panel": True,  "editable": True,  "column_width": "lg", "panel_section": "Observações",             "source": "catecumeno",        "col_span": "2"},
        # ── Turma Catecumenos (lista_catecumenos child table) ──────────────────
        {"fieldname": "total_presencas",      "label": "Presenças",            "fieldtype": "Int",        "options": "",     "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "xs", "panel_section": "Presenças",               "source": "turma_catecumenos", "col_span": "1"},
        {"fieldname": "total_faltas",         "label": "Faltas",               "fieldtype": "Int",        "options": "",     "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "xs", "panel_section": "Presenças",               "source": "turma_catecumenos", "col_span": "1"},
        # ── Turma ─────────────────────────────────────────────────────────────
        # show_in_header = shown in TurmaHeader banner
        # show_in_panel  = shown in catecumeno side panel (read-only)
        {"fieldname": "local",          "label": "Local",              "fieldtype": "Data", "options": "", "show_in_table": False, "show_in_panel": False, "show_in_header": True,  "editable": False, "column_width": "md", "panel_section": "Turma", "source": "turma", "col_span": "2"},
        {"fieldname": "dia",            "label": "Dia",                "fieldtype": "Data", "options": "", "show_in_table": False, "show_in_panel": False, "show_in_header": True,  "editable": False, "column_width": "sm", "panel_section": "Turma", "source": "turma", "col_span": "1"},
        {"fieldname": "hora",           "label": "Hora",               "fieldtype": "Data", "options": "", "show_in_table": False, "show_in_panel": False, "show_in_header": True,  "editable": False, "column_width": "sm", "panel_section": "Turma", "source": "turma", "col_span": "1"},
        {"fieldname": "catecismo",      "label": "Catecismo",          "fieldtype": "Data", "options": "", "show_in_table": False, "show_in_panel": False, "show_in_header": True,  "editable": False, "column_width": "lg", "panel_section": "Turma", "source": "turma", "col_span": "2"},
        {"fieldname": "catequista_adj", "label": "Catequista Adjunto", "fieldtype": "Data", "options": "", "show_in_table": False, "show_in_panel": False, "show_in_header": False, "editable": False, "column_width": "md", "panel_section": "Turma", "source": "turma", "col_span": "2"},
    ]


def _load_field_config():
    """Load field config from Settings doc, falling back to defaults."""
    if frappe.db.exists("Catequista Portal Settings", "Catequista Portal Settings"):
        doc = frappe.get_doc("Catequista Portal Settings")
        if doc.field_config:
            return [
                {
                    "fieldname": row.fieldname,
                    "label": row.label,
                    "fieldtype": row.fieldtype or "Data",
                    "options": row.options or "",
                    "show_in_table": bool(row.show_in_table),
                    "show_in_panel": bool(row.show_in_panel),
                    "show_in_header": bool(row.get("show_in_header")),
                    "editable": bool(row.editable),
                    "column_width": row.column_width or "sm",
                    "panel_section": row.panel_section or "",
                    "source": row.source or "catecumeno",
                    "col_span": row.col_span or "2",
                }
                for row in doc.field_config
            ]
    return _default_field_config()


def _get_editable_cat_fields():
    """Returns the set of Catecumeno field names that are editable per config."""
    config = _load_field_config()
    _meta_fields = {f.fieldname for f in frappe.get_meta("Catecumeno").fields}
    editable = {
        entry["fieldname"]
        for entry in config
        if entry["editable"] and entry["source"] == "catecumeno"
    }
    return editable & _meta_fields


def _assert_catequista():
    """
    Verify the request comes from an authenticated catequista.
    Returns the Catequista document name (their full name identifier).
    Throws AuthenticationError / PermissionError otherwise.
    """
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)

    cat = frappe.db.get_value("Catequista", {"user": user}, "name")
    if not cat:
        frappe.throw(_("Utilizador não é catequista"), frappe.PermissionError)

    return cat


@frappe.whitelist()
def get_catecumeno_field_config():
    """Returns the field configuration for the catequista portal (used by the frontend)."""
    _assert_catequista()
    return _load_field_config()


@frappe.whitelist()
def sync_catecumeno_fields():
    """
    Scans Catecumeno and Turma Catecumenos meta and adds any fields not yet in
    Catequista Portal Settings. Existing rows are never overwritten.
    Called from the Sync button on the Settings desk form.
    """
    if frappe.session.user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)

    if frappe.db.exists("Catequista Portal Settings", "Catequista Portal Settings"):
        doc = frappe.get_doc("Catequista Portal Settings")
    else:
        doc = frappe.new_doc("Catequista Portal Settings")

    existing = {row.fieldname for row in doc.field_config}

    SKIP_TYPES = {
        "Section Break", "Column Break", "Tab Break", "HTML",
        "Heading", "Button", "Table", "Table MultiSelect", "Image",
        "Attach", "Attach Image", "Fold", "HTML Editor",
    }
    SKIP_FIELDS = {
        "name", "owner", "creation", "modified", "modified_by",
        "docstatus", "idx", "parent", "parenttype", "parentfield",
        "naming_series", "amended_from",
    }

    # Map Frappe fieldtypes that aren't in our allowed set to a safe equivalent
    ALLOWED_TYPES = {"Data", "Int", "Float", "Date", "Select", "Text", "Small Text", "Long Text", "Check", "Link"}
    FIELDTYPE_MAP = {
        "Text Editor":      "Text",
        "Markdown Editor":  "Text",
        "Code":             "Text",
        "Datetime":         "Date",
        "Time":             "Data",
        "Duration":         "Data",
        "Phone":            "Data",
        "Color":            "Data",
        "Password":         "Data",
        "Read Only":        "Data",
        "Autocomplete":     "Data",
        "Currency":         "Float",
        "Percent":          "Float",
        "Rating":           "Int",
        "Signature":        "Data",
        "Barcode":          "Data",
        "Geolocation":      "Data",
    }

    def _normalize_ft(ft):
        ft = FIELDTYPE_MAP.get(ft, ft)
        return ft if ft in ALLOWED_TYPES else "Data"

    added = 0

    # Add name pseudo-field first if missing
    if "name" not in existing:
        doc.append("field_config", {
            "fieldname": "name",
            "label": "Nome",
            "fieldtype": "Data",
            "options": "",
            "show_in_table": 1,
            "show_in_panel": 1,
            "editable": 0,
            "column_width": "lg",
            "panel_section": "",
            "source": "catecumeno",
        })
        existing.add("name")
        added += 1

    # Catecumeno fields
    cat_meta = frappe.get_meta("Catecumeno")
    for f in cat_meta.fields:
        if f.fieldname in SKIP_FIELDS or f.fieldtype in SKIP_TYPES:
            continue
        if f.fieldname in existing:
            continue
        normalized_ft = _normalize_ft(f.fieldtype or "Data")
        doc.append("field_config", {
            "fieldname": f.fieldname,
            "label": f.label or f.fieldname,
            "fieldtype": normalized_ft,
            "options": f.options or "" if normalized_ft == "Select" else "",
            "show_in_table": 0,
            "show_in_panel": 1,
            "editable": 0,
            "column_width": "sm",
            "panel_section": "",
            "source": "catecumeno",
            "col_span": "2",
        })
        existing.add(f.fieldname)
        added += 1

    # ── Turma Catecumenos (lista_catecumenos) — all fields ────────────────────
    tc_meta = frappe.get_meta("Turma Catecumenos")
    tc_fieldnames = {f.fieldname for f in tc_meta.fields}

    # Presencas/faltas get stable aliases so the frontend always sees the same key
    PRESENCA_CANDIDATES = ["total_presencas"]
    FALTA_CANDIDATES    = ["total_faltas", "nr_de_faltas"]
    handled_tc_actuals  = set()

    for group, alias, section in [
        (PRESENCA_CANDIDATES, "total_presencas", "Presenças"),
        (FALTA_CANDIDATES,    "total_faltas",    "Presenças"),
    ]:
        actual = next((c for c in group if c in tc_fieldnames), None)
        if actual is None:
            continue
        handled_tc_actuals.add(actual)
        if alias not in existing:
            fobj = next((x for x in tc_meta.fields if x.fieldname == actual), None)
            doc.append("field_config", {
                "fieldname": alias,
                "label": fobj.label if fobj else alias,
                "fieldtype": _normalize_ft((fobj.fieldtype if fobj else "Int") or "Int"),
                "options": "",
                "show_in_table": 1,
                "show_in_panel": 1,
                "editable": 1,
                "column_width": "xs",
                "panel_section": section,
                "source": "turma_catecumenos",
                "col_span": "1",
            })
            existing.add(alias)
            added += 1

    # Remaining TC fields (direct fieldnames, no alias needed)
    for f in tc_meta.fields:
        if f.fieldname in SKIP_FIELDS or f.fieldtype in SKIP_TYPES:
            continue
        if f.fieldname in handled_tc_actuals or f.fieldname in existing:
            continue
        normalized_ft = _normalize_ft(f.fieldtype or "Data")
        doc.append("field_config", {
            "fieldname": f.fieldname,
            "label": f.label or f.fieldname,
            "fieldtype": normalized_ft,
            "options": f.options or "" if normalized_ft == "Select" else "",
            "show_in_table": 0,
            "show_in_panel": 1,
            "editable": 0,
            "column_width": "sm",
            "panel_section": "Presenças",
            "source": "turma_catecumenos",
            "col_span": "2",
        })
        existing.add(f.fieldname)
        added += 1

    # ── Turma fields ───────────────────────────────────────────────────────────
    # show_in_header = shown in TurmaHeader banner
    # show_in_panel  = shown as read-only section in the catecumeno side panel
    turma_meta = frappe.get_meta("Turma")
    SKIP_TURMA_FIELDS = SKIP_FIELDS | {"name", "fase", "status", "catequista",
                                        "catequista_adj", "ano_lectivo", "total_catecumenos"}
    # Sensible defaults for known turma fields
    TURMA_DEFAULTS = {
        "local":          {"show_in_header": 1, "show_in_panel": 0, "column_width": "md"},
        "dia":            {"show_in_header": 1, "show_in_panel": 0, "column_width": "sm", "col_span": "1"},
        "hora":           {"show_in_header": 1, "show_in_panel": 0, "column_width": "sm", "col_span": "1"},
        "catecismo":      {"show_in_header": 1, "show_in_panel": 0, "column_width": "lg", "col_span": "2"},
        "catequista_adj": {"show_in_header": 0, "show_in_panel": 0, "column_width": "md"},
        "ano_lectivo":    {"show_in_header": 0, "show_in_panel": 0, "column_width": "sm"},
    }
    for f in turma_meta.fields:
        if f.fieldname in SKIP_TURMA_FIELDS or f.fieldtype in SKIP_TYPES:
            continue
        if f.fieldname in existing:
            continue
        normalized_ft = _normalize_ft(f.fieldtype or "Data")
        defaults = TURMA_DEFAULTS.get(f.fieldname, {})
        doc.append("field_config", {
            "fieldname": f.fieldname,
            "label": f.label or f.fieldname,
            "fieldtype": normalized_ft,
            "options": f.options or "" if normalized_ft == "Select" else "",
            "show_in_table": 0,
            "show_in_panel": defaults.get("show_in_panel", 0),
            "show_in_header": defaults.get("show_in_header", 0),
            "editable": 0,
            "column_width": defaults.get("column_width", "sm"),
            "panel_section": "Turma",
            "source": "turma",
            "col_span": defaults.get("col_span", "2"),
        })
        existing.add(f.fieldname)
        added += 1

    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"added": added}


@frappe.whitelist()
def get_catequista_session_info():
    """Verifica sessão e devolve informação do catequista autenticado."""
    cat = _assert_catequista()
    return {
        "catequista": cat,
        "user": frappe.session.user,
        "csrf_token": frappe.session.data.csrf_token,
    }


@frappe.whitelist()
def get_minha_turma():
    """
    Devolve todas as turmas activas do catequista autenticado (titular ou adjunto)
    com a lista completa de catecúmenos. Os campos seleccionados são determinados
    pela configuração em Catequista Portal Settings.
    """
    cat_name = _assert_catequista()
    e = frappe.db.escape(cat_name)

    # Load field config once — used for both turma and catecumeno column selection
    config = _load_field_config()

    # Always-needed turma fields
    TURMA_ALWAYS = {"name", "fase", "ano_lectivo", "local", "dia", "hora",
                    "catequista", "catequista_adj", "status"}
    # Add extra turma fields from config (source='turma')
    turma_meta_obj = frappe.get_meta("Turma")
    turma_meta_fields = {f.fieldname for f in turma_meta_obj.fields}
    extra_turma_cols = "".join(
        f",\n               `{entry['fieldname']}`"
        for entry in config
        if entry["source"] == "turma"
        and entry["fieldname"] not in TURMA_ALWAYS
        and entry["fieldname"] in turma_meta_fields
    )

    turmas = frappe.db.sql(f"""
        SELECT name, fase, ano_lectivo, local, dia, hora,
               catequista, catequista_adj, status{extra_turma_cols}
        FROM `tabTurma`
        WHERE (catequista = {e} OR catequista_adj = {e})
          AND status = 'Activo'
        ORDER BY fase ASC, name ASC
    """, as_dict=True)

    # Build SELECT cols from field config — only catecumeno source, skip 'name' (always selected)
    wanted_cat = [
        entry["fieldname"]
        for entry in config
        if entry["source"] == "catecumeno" and entry["fieldname"] != "name"
    ]
    # Always include status and fase (needed by the UI even if not in config)
    for always in ("fase", "status"):
        if always not in wanted_cat:
            wanted_cat.append(always)

    cat_meta = {f.fieldname for f in frappe.get_meta("Catecumeno").fields}
    extra_cols = "".join(
        f",\n                c.`{f}`" for f in wanted_cat if f in cat_meta
    )

    # Turma Catecumenos — presencas/faltas with stable aliases, plus other TC fields
    tc_meta_obj = frappe.get_meta("Turma Catecumenos")
    tc_meta = {f.fieldname for f in tc_meta_obj.fields}

    def _tc_col(candidates, alias):
        actual = next((c for c in candidates if c in tc_meta), None)
        return f"COALESCE(tc.`{actual}`, 0) AS {alias}" if actual else f"0 AS {alias}"

    presencas_col = _tc_col(["total_presencas"], "total_presencas")
    faltas_col    = _tc_col(["total_faltas", "nr_de_faltas"], "total_faltas")

    # Additional TC fields from config (direct select, no alias needed)
    ALIASED_TC = {"total_presencas", "total_faltas"}
    extra_tc_cols = "".join(
        f",\n                tc.`{entry['fieldname']}`"
        for entry in config
        if entry["source"] == "turma_catecumenos"
        and entry["fieldname"] not in ALIASED_TC
        and entry["fieldname"] in tc_meta
    )

    result = []
    for turma in turmas:
        catecumenos = frappe.db.sql(f"""
            SELECT
                c.name{extra_cols},
                tc.name  AS row_name,
                {presencas_col},
                {faltas_col}{extra_tc_cols}
            FROM `tabTurma Catecumenos` tc
            JOIN `tabCatecumeno` c ON c.name = tc.catecumeno
            WHERE tc.parent = %s
              AND tc.parentfield = 'lista_catecumenos'
            ORDER BY c.name ASC
        """, (turma.name,), as_dict=True)

        turma["catecumenos"] = catecumenos
        turma["total_catecumenos"] = len(catecumenos)

        # Fetch the programa da fase for this turma's fase + ano_lectivo
        programa = None
        if turma.get("fase") and turma.get("ano_lectivo"):
            programa = frappe.db.get_value(
                "Programa da Fase",
                {"fase": turma["fase"], "ano_lectivo": turma["ano_lectivo"]},
                ["titulo", "ficheiro"],
                as_dict=True,
            )
        turma["programa"] = programa or None

        result.append(turma)

    return result


@frappe.whitelist()
def atualizar_catecumeno(catecumeno_nome, row_name=None):
    """
    Actualiza campos do catecúmeno e presenças/faltas na turma.
    Os campos permitidos são determinados pela configuração em Catequista Portal Settings.
    O catequista só pode editar catecúmenos da sua própria turma.
    """
    cat_name = _assert_catequista()

    # Verify the catequista owns this catecumeno's turma
    turma_name = frappe.db.get_value("Catecumeno", catecumeno_nome, "turma")
    if not turma_name:
        frappe.throw(_("Catecúmeno não encontrado"), frappe.DoesNotExistError)

    turma = frappe.db.get_value(
        "Turma", turma_name,
        ["catequista", "catequista_adj"],
        as_dict=True,
    )
    if not turma or (turma.catequista != cat_name and turma.catequista_adj != cat_name):
        frappe.throw(_("Sem permissão para editar este catecúmeno"), frappe.PermissionError)

    # All POST params except the routing keys
    SKIP_KEYS = {"catecumeno_nome", "row_name", "cmd", "csrf_token", "type"}
    submitted = {k: v for k, v in frappe.form_dict.items() if k not in SKIP_KEYS}

    # ── Catecumeno fields ──────────────────────────────────────────────────────
    editable_cat = _get_editable_cat_fields()
    cat_updates = {}
    for field, value in submitted.items():
        if field not in editable_cat:
            continue
        # Convert Int fields
        meta_field = next(
            (f for f in frappe.get_meta("Catecumeno").fields if f.fieldname == field), None
        )
        if meta_field and meta_field.fieldtype in ("Int", "Float"):
            cat_updates[field] = cint(value) if value not in (None, "") else None
        else:
            cat_updates[field] = value if value != "" else None

    if cat_updates:
        frappe.db.set_value("Catecumeno", catecumeno_nome, cat_updates)

    # ── Turma Catecumenos fields ───────────────────────────────────────────────
    if row_name:
        tc_meta_obj = frappe.get_meta("Turma Catecumenos")
        tc_meta     = {f.fieldname for f in tc_meta_obj.fields}

        # Map alias → actual fieldname for presencas/faltas
        def _tc_actual(candidates):
            return next((c for c in candidates if c in tc_meta), None)

        pf = _tc_actual(["total_presencas"])
        ff = _tc_actual(["total_faltas", "nr_de_faltas"])
        alias_map = {}
        if pf: alias_map["total_presencas"] = pf
        if ff: alias_map["total_faltas"]    = ff

        # Editable TC fields from config (direct fieldnames, not aliases)
        config = _load_field_config()
        editable_tc_direct = {
            entry["fieldname"]
            for entry in config
            if entry["source"] == "turma_catecumenos"
            and entry["editable"]
            and entry["fieldname"] not in alias_map          # handled separately
            and entry["fieldname"] in tc_meta
        }

        row_updates = {}

        # Aliased fields (presencas / faltas)
        for alias, actual in alias_map.items():
            if alias in submitted and submitted[alias] not in (None, ""):
                row_updates[actual] = max(0, cint(submitted[alias]))

        # Direct TC fields
        for field in editable_tc_direct:
            if field not in submitted or submitted[field] in (None, ""):
                continue
            fobj = next((f for f in tc_meta_obj.fields if f.fieldname == field), None)
            if fobj and fobj.fieldtype in ("Int", "Float"):
                row_updates[field] = cint(submitted[field])
            else:
                row_updates[field] = submitted[field]

        if row_updates:
            frappe.db.set_value("Turma Catecumenos", row_name, row_updates)

    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def alterar_senha(senha_atual, senha_nova):
    """Altera a senha do catequista autenticado após verificar a senha actual."""
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)

    if not senha_nova or len(senha_nova.strip()) < 6:
        frappe.throw(_("A nova senha deve ter pelo menos 6 caracteres"))

    from frappe.utils.password import check_password, update_password
    try:
        check_password(user, senha_atual)
    except frappe.AuthenticationError:
        frappe.throw(_("Senha actual incorrecta"))

    update_password(user, senha_nova.strip())
    return {"success": True}


@frappe.whitelist()
def get_avisos_ativos():
    """Devolve os avisos activos que o catequista ainda deve ver."""
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)

    # Resolve o nome do catequista ligado a este user
    catequista_name = frappe.db.get_value("Catequista", {"user": user}, "name")
    if not catequista_name:
        return []

    today = date.today().isoformat()

    # Pre-fetch catequista's active turmas (needed for fase/turma targeting)
    cat_turmas = frappe.db.sql("""
        SELECT name, fase FROM `tabTurma`
        WHERE (catequista = %s OR catequista_adj = %s) AND status = 'Activo'
    """, (catequista_name, catequista_name), as_dict=True)
    cat_fases       = {t.fase for t in cat_turmas}
    cat_turma_names = {t.name for t in cat_turmas}

    avisos = frappe.db.sql("""
        SELECT name, titulo, mensagem, prioridade, modo_exibicao, nr_exibicoes,
               tipo_destinatario, fase_destino, turma_destino,
               anexo, anexo_label, creation, data_fim
        FROM `tabCatequista Aviso`
        WHERE ativo = 1
          AND (data_fim IS NULL OR data_fim >= %s)
        ORDER BY
            CASE prioridade WHEN 'Urgente' THEN 0 ELSE 1 END ASC,
            modified DESC
    """, (today,), as_dict=True)

    resultado = []
    for aviso in avisos:
        # ── Targeting filter ──────────────────────────────────────────────────
        tipo = aviso.get("tipo_destinatario") or "Todos"

        if tipo == "Por Fase":
            if aviso.fase_destino not in cat_fases:
                continue

        elif tipo == "Por Turma":
            if aviso.turma_destino not in cat_turma_names:
                continue

        elif tipo == "Individuais":
            is_target = frappe.db.exists(
                "Catequista Aviso Destinatario",
                {"parent": aviso.name, "catequista": catequista_name},
            )
            if not is_target:
                continue

        # ── View-count filter ─────────────────────────────────────────────────
        log = frappe.db.get_value(
            "Catequista Aviso Log",
            {"aviso": aviso.name, "catequista": catequista_name},
            ["name", "visualizacoes"],
            as_dict=True,
        )
        views = log.visualizacoes if log else 0
        modo = aviso.modo_exibicao

        if modo == "Uma vez" and views >= 1:
            continue
        if modo == "N vezes" and views >= cint(aviso.nr_exibicoes or 1):
            continue

        # "Cada login" — apply hard cap when data_fim is not set
        if modo == "Cada login" and not aviso.get("data_fim"):
            creation_date = (
                aviso.creation.date()
                if hasattr(aviso.creation, "date")
                else date.fromisoformat(str(aviso.creation)[:10])
            )
            if date.today() > creation_date + timedelta(days=30):
                continue
        # Else "Cada login" — frontend filters per-session via sessionStorage

        resultado.append({
            "name":          aviso.name,
            "titulo":        aviso.titulo,
            "mensagem":      aviso.mensagem,
            "prioridade":    aviso.prioridade,
            "modo_exibicao": modo,
            "anexo":         aviso.get("anexo") or None,
            "anexo_label":   aviso.get("anexo_label") or None,
        })

    return resultado


@frappe.whitelist()
def marcar_aviso_visto(aviso_name):
    """Regista que o catequista autenticado viu e dispensou o aviso."""
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)

    catequista_name = frappe.db.get_value("Catequista", {"user": user}, "name")
    if not catequista_name:
        frappe.throw(_("Catequista não encontrado"))

    # Verifica que o aviso existe
    if not frappe.db.exists("Catequista Aviso", aviso_name):
        frappe.throw(_("Aviso não encontrado"))

    log_name = frappe.db.get_value(
        "Catequista Aviso Log",
        {"aviso": aviso_name, "catequista": catequista_name},
        "name",
    )

    now = frappe.utils.now()
    if log_name:
        frappe.db.set_value(
            "Catequista Aviso Log",
            log_name,
            {
                "visualizacoes": frappe.db.get_value("Catequista Aviso Log", log_name, "visualizacoes") + 1,
                "ultima_visualizacao": now,
            },
        )
    else:
        doc = frappe.get_doc({
            "doctype": "Catequista Aviso Log",
            "aviso": aviso_name,
            "catequista": catequista_name,
            "visualizacoes": 1,
            "ultima_visualizacao": now,
        })
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def get_aviso_stats(aviso_name):
    """
    Devolve, para um dado aviso, quem já viu e quem ainda não viu.
    Usado pelo painel de estatísticas no formulário de Catequista Aviso.
    """
    aviso = frappe.get_doc("Catequista Aviso", aviso_name)

    # ── Quem já viu ──────────────────────────────────────────────────────────
    leram = frappe.db.sql("""
        SELECT catequista, visualizacoes, ultima_visualizacao
        FROM `tabCatequista Aviso Log`
        WHERE aviso = %s
        ORDER BY ultima_visualizacao DESC
    """, aviso_name, as_dict=True)

    leram_set = {row.catequista for row in leram}

    # ── Audiência alvo ───────────────────────────────────────────────────────
    tipo = aviso.tipo_destinatario or "Todos"

    if tipo == "Todos":
        rows = frappe.db.sql(
            "SELECT name FROM `tabCatequista` WHERE status = 'Activo' ORDER BY name",
            as_dict=True,
        )
        audiencia = {r.name for r in rows}

    elif tipo == "Por Fase":
        rows = frappe.db.sql(
            "SELECT catequista, catequista_adj FROM `tabTurma` WHERE fase = %s AND status = 'Activo'",
            aviso.fase_destino,
            as_dict=True,
        )
        audiencia = set()
        for t in rows:
            if t.catequista:     audiencia.add(t.catequista)
            if t.catequista_adj: audiencia.add(t.catequista_adj)

    elif tipo == "Por Turma":
        t = frappe.db.get_value(
            "Turma", aviso.turma_destino, ["catequista", "catequista_adj"], as_dict=True
        )
        audiencia = set()
        if t:
            if t.catequista:     audiencia.add(t.catequista)
            if t.catequista_adj: audiencia.add(t.catequista_adj)

    elif tipo == "Individuais":
        audiencia = {row.catequista for row in aviso.get("destinatarios", [])}

    else:
        audiencia = set()

    nao_leram = sorted(audiencia - leram_set)

    return {
        "leram":           [dict(r) for r in leram],
        "nao_leram":       nao_leram,
        "total_audiencia": len(audiencia),
    }


# ── Quotas ─────────────────────────────────────────────────────────────────────

_MESES = {
    "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
    "05": "Maio",    "06": "Junho",     "07": "Julho",  "08": "Agosto",
    "09": "Setembro","10": "Outubro",   "11": "Novembro","12": "Dezembro",
}


def _assert_system_manager():
    """Verifica que o utilizador autenticado tem perfil de System Manager."""
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    if "System Manager" not in frappe.get_roles(user):
        frappe.throw(_("Sem permissão. Apenas gestores podem editar quotas."), frappe.PermissionError)


@frappe.whitelist()
def get_quotas_grid(ano):
    """
    Admin — devolve grelha de quotas: todos os catequistas × 12 meses para o ano dado.
    Requer perfil System Manager.
    """
    _assert_system_manager()

    catequistas = frappe.db.sql(
        "SELECT name FROM `tabCatequista` WHERE status = 'Activo' ORDER BY name ASC", as_dict=True
    )

    quotas = frappe.db.sql("""
        SELECT name, catequista, mes, valor, data_pagamento, notas
        FROM `tabQuota Catequista`
        WHERE ano = %s
        ORDER BY catequista ASC, mes ASC
    """, (ano,), as_dict=True)

    quota_map = {}
    for q in quotas:
        quota_map[(q.catequista, q.mes)] = {
            "name":           q.name,
            "valor":          float(q.valor or 0),
            "data_pagamento": q.data_pagamento,
            "notas":          q.notas or "",
        }

    result = []
    for c in catequistas:
        meses = {}
        total = 0.0
        for mes in [f"{i:02d}" for i in range(1, 13)]:
            entry = quota_map.get((c.name, mes))
            if entry:
                meses[mes] = entry
                total += entry["valor"]
        result.append({"catequista": c.name, "meses": meses, "total": total})

    return result


@frappe.whitelist()
def upsert_quota(catequista, ano, mes, valor, data_pagamento="", notas=""):
    """
    Admin — cria ou actualiza um registo de quota.
    Requer perfil System Manager.
    """
    _assert_system_manager()

    try:
        valor_f = float(valor or 0)
    except (ValueError, TypeError):
        frappe.throw(_("Valor inválido"))

    if valor_f <= 0:
        frappe.throw(_("O valor deve ser maior que zero"))

    existing = frappe.db.get_value(
        "Quota Catequista",
        {"catequista": catequista, "ano": ano, "mes": mes},
        "name",
    )

    if existing:
        doc = frappe.get_doc("Quota Catequista", existing)
        doc.valor          = valor_f
        doc.data_pagamento = data_pagamento or None
        doc.notas          = notas or ""
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.new_doc("Quota Catequista")
        doc.catequista     = catequista
        doc.ano            = ano
        doc.mes            = mes
        doc.valor          = valor_f
        doc.data_pagamento = data_pagamento or None
        doc.notas          = notas or ""
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist()
def delete_quota(quota_name):
    """
    Admin — elimina um registo de quota.
    Requer perfil System Manager.
    """
    _assert_system_manager()

    if not frappe.db.exists("Quota Catequista", quota_name):
        frappe.throw(_("Quota não encontrada"))

    frappe.delete_doc("Quota Catequista", quota_name, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def get_quotas_resumo(ano=""):
    """
    Portal Catequista — devolve resumo de quotas de todos os catequistas.
    Requer sessão de catequista.
    """
    _assert_catequista()

    if not ano:
        ano = str(frappe.utils.now_datetime().year)

    catequistas = frappe.db.sql(
        "SELECT name FROM `tabCatequista` WHERE status = 'Activo' ORDER BY name ASC", as_dict=True
    )

    quotas = frappe.db.sql("""
        SELECT catequista, mes, valor, data_pagamento
        FROM `tabQuota Catequista`
        WHERE ano = %s
        ORDER BY catequista ASC, mes ASC
    """, (ano,), as_dict=True)

    quota_map = {}
    for q in quotas:
        quota_map.setdefault(q.catequista, {})[q.mes] = {
            "valor":          float(q.valor or 0),
            "data_pagamento": q.data_pagamento,
        }

    total_geral = 0.0
    result = []
    for c in catequistas:
        meses  = quota_map.get(c.name, {})
        total  = sum(m["valor"] for m in meses.values())
        total_geral += total
        result.append({
            "catequista":  c.name,
            "meses":       meses,
            "total":       total,
            "meses_pagos": len(meses),
        })

    return {
        "catequistas":       result,
        "ano":               ano,
        "total_geral":       total_geral,
        "total_catequistas": len(catequistas),
    }

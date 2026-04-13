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
        {"fieldname": "name",                  "label": "Nome",                  "fieldtype": "Data",       "options": "", "show_in_table": True,  "show_in_panel": True,  "editable": False, "column_width": "lg", "panel_section": "",                       "source": "catecumeno"},
        {"fieldname": "sexo",                  "label": "Sexo",                  "fieldtype": "Select",     "options": "M\nF", "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "xs", "panel_section": "Dados Pessoais",         "source": "catecumeno"},
        {"fieldname": "idade",                 "label": "Idade",                 "fieldtype": "Int",        "options": "", "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "xs", "panel_section": "Dados Pessoais",         "source": "catecumeno"},
        {"fieldname": "data_de_nascimento",    "label": "Data de Nascimento",    "fieldtype": "Date",       "options": "", "show_in_table": False, "show_in_panel": True,  "editable": True,  "column_width": "sm", "panel_section": "Dados Pessoais",         "source": "catecumeno"},
        {"fieldname": "encarregado",           "label": "Encarregado",           "fieldtype": "Data",       "options": "", "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "md", "panel_section": "Encarregado de Educação", "source": "catecumeno"},
        {"fieldname": "contacto_encarregado",  "label": "Contacto Encarregado",  "fieldtype": "Data",       "options": "", "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "sm", "panel_section": "Encarregado de Educação", "source": "catecumeno"},
        {"fieldname": "padrinhos",             "label": "Padrinhos",             "fieldtype": "Data",       "options": "", "show_in_table": False, "show_in_panel": True,  "editable": True,  "column_width": "md", "panel_section": "Padrinhos / Madrinhas",   "source": "catecumeno"},
        {"fieldname": "contacto_padrinhos",    "label": "Contacto Padrinhos",    "fieldtype": "Data",       "options": "", "show_in_table": False, "show_in_panel": True,  "editable": True,  "column_width": "sm", "panel_section": "Padrinhos / Madrinhas",   "source": "catecumeno"},
        {"fieldname": "total_presencas",       "label": "Presenças",             "fieldtype": "Int",        "options": "", "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "xs", "panel_section": "Presenças",               "source": "turma_catecumenos"},
        {"fieldname": "total_faltas",          "label": "Faltas",                "fieldtype": "Int",        "options": "", "show_in_table": True,  "show_in_panel": True,  "editable": True,  "column_width": "xs", "panel_section": "Presenças",               "source": "turma_catecumenos"},
        {"fieldname": "obs",                   "label": "Observações",           "fieldtype": "Small Text", "options": "", "show_in_table": False, "show_in_panel": True,  "editable": True,  "column_width": "lg", "panel_section": "Observações",             "source": "catecumeno"},
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
                    "editable": bool(row.editable),
                    "column_width": row.column_width or "sm",
                    "panel_section": row.panel_section or "",
                    "source": row.source or "catecumeno",
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
        })
        existing.add(f.fieldname)
        added += 1

    # Turma Catecumenos — only presencas / faltas
    tc_meta = frappe.get_meta("Turma Catecumenos")
    tc_fieldnames = {f.fieldname for f in tc_meta.fields}

    presenca_candidates = ["total_presencas"]
    falta_candidates = ["total_faltas", "nr_de_faltas"]

    for group, alias, section in [
        (presenca_candidates, "total_presencas", "Presenças"),
        (falta_candidates, "total_faltas", "Presenças"),
    ]:
        actual = next((c for c in group if c in tc_fieldnames), None)
        if actual is None:
            continue
        # Use alias as fieldname so frontend always sees total_presencas / total_faltas
        if alias not in existing:
            f = next((x for x in tc_meta.fields if x.fieldname == actual), None)
            doc.append("field_config", {
                "fieldname": alias,
                "label": (f.label if f else alias),
                "fieldtype": _normalize_ft((f.fieldtype if f else "Int") or "Int"),
                "options": "",
                "show_in_table": 1,
                "show_in_panel": 1,
                "editable": 1,
                "column_width": "xs",
                "panel_section": section,
                "source": "turma_catecumenos",
            })
            existing.add(alias)
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

    turmas = frappe.db.sql(f"""
        SELECT name, fase, ano_lectivo, local, dia, hora,
               catequista, catequista_adj, status
        FROM `tabTurma`
        WHERE (catequista = {e} OR catequista_adj = {e})
          AND status = 'Activo'
        ORDER BY fase ASC, name ASC
    """, as_dict=True)

    # Build SELECT cols from field config — only catecumeno source, skip 'name' (always selected)
    config = _load_field_config()
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

    # Turma Catecumenos presencas / faltas — always included
    tc_meta = {f.fieldname for f in frappe.get_meta("Turma Catecumenos").fields}

    def _tc_col(candidates, alias):
        actual = next((c for c in candidates if c in tc_meta), None)
        return f"COALESCE(tc.`{actual}`, 0) AS {alias}" if actual else f"0 AS {alias}"

    presencas_col = _tc_col(["total_presencas"], "total_presencas")
    faltas_col    = _tc_col(["total_faltas", "nr_de_faltas"], "total_faltas")

    result = []
    for turma in turmas:
        catecumenos = frappe.db.sql(f"""
            SELECT
                c.name{extra_cols},
                tc.name  AS row_name,
                {presencas_col},
                {faltas_col}
            FROM `tabTurma Catecumenos` tc
            JOIN `tabCatecumeno` c ON c.name = tc.catecumeno
            WHERE tc.parent = %s
              AND tc.parentfield = 'lista_catecumenos'
            ORDER BY c.name ASC
        """, (turma.name,), as_dict=True)

        turma["catecumenos"] = catecumenos
        turma["total_catecumenos"] = len(catecumenos)
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

    # ── Turma Catecumenos fields (presencas / faltas) ──────────────────────────
    if row_name:
        tc_meta = {f.fieldname for f in frappe.get_meta("Turma Catecumenos").fields}

        def _tc_actual(candidates):
            return next((c for c in candidates if c in tc_meta), None)

        pf = _tc_actual(["total_presencas"])
        ff = _tc_actual(["total_faltas", "nr_de_faltas"])

        row_updates = {}
        if "total_presencas" in submitted and pf and submitted["total_presencas"] not in (None, ""):
            row_updates[pf] = max(0, cint(submitted["total_presencas"]))
        if "total_faltas" in submitted and ff and submitted["total_faltas"] not in (None, ""):
            row_updates[ff] = max(0, cint(submitted["total_faltas"]))

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

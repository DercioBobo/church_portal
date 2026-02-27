"""
Portal Público de Catequese — API
Todos os endpoints são públicos (allow_guest=True) e não expõem dados sensíveis.
"""

import json
import frappe
from frappe import _
from datetime import date, timedelta


DEFAULT_NAV_ITEMS = [
    {"key": "turmas",       "label": "Turmas",       "descricao": "Ver todas as turmas",     "icon": "BookOpen",     "url": "/turmas/",       "visible": True, "ordem": 1},
    {"key": "pesquisa",     "label": "Pesquisa",     "descricao": "Busca por nome completo", "icon": "Search",       "url": "/pesquisa/",     "visible": True, "ordem": 2},
    {"key": "aniversarios", "label": "Aniversários", "descricao": "Hoje e esta semana",      "icon": "Cake",         "url": "/aniversarios/", "visible": True, "ordem": 3},
]


@frappe.whitelist(allow_guest=True)
def get_portal_config():
    """Retorna a configuração do portal (itens de navegação)."""
    raw = frappe.db.get_single_value("Portal Config", "nav_items_json")
    nav_items = json.loads(raw) if raw else DEFAULT_NAV_ITEMS
    return {"nav_items": nav_items}


@frappe.whitelist(allow_guest=True)
def save_portal_config(nav_items_json):
    """Grava a configuração do portal (itens de navegação)."""
    # Validate JSON before saving
    json.loads(nav_items_json)
    frappe.db.set_single_value("Portal Config", "nav_items_json", nav_items_json)
    frappe.db.commit()
    return {"status": "ok"}


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
        week_end = today + timedelta(days=7)
        if week_end.month == today.month:
            condition = """
                MONTH(c.data_de_nascimento) = %s
                AND DAY(c.data_de_nascimento) BETWEEN %s AND %s
            """
            params = (today.month, today.day, week_end.day)
        else:
            condition = """
                (MONTH(c.data_de_nascimento) = %s AND DAY(c.data_de_nascimento) >= %s)
                OR (MONTH(c.data_de_nascimento) = %s AND DAY(c.data_de_nascimento) <= %s)
            """
            params = (today.month, today.day, week_end.month, week_end.day)

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

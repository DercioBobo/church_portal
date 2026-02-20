"""
Portal Público de Catequese — API
Todos os endpoints são públicos (allow_guest=True) e não expõem dados sensíveis.
"""

import frappe
from frappe import _
from datetime import date, timedelta


@frappe.whitelist(allow_guest=True)
def get_turmas_publicas():
    """Lista de turmas activas com dados não sensíveis."""
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
            COUNT(CASE WHEN tc.status = 'Activo' THEN 1 END) AS total_catecumenos
        FROM `tabTurma` t
        LEFT JOIN `tabTurma Catecumenos` tc ON tc.parent = t.name
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
        SELECT
            tc.catecumeno,
            tc.status,
            tc.total_presencas,
            tc.total_faltas
        FROM `tabTurma Catecumenos` tc
        WHERE tc.parent = %s
          AND tc.status = 'Activo'
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
            t.local,
            t.dia,
            t.hora,
            t.catequista,
            t.catequista_adj
        FROM `tabCatecumeno` c
        LEFT JOIN `tabTurma` t ON c.turma = t.name
        WHERE c.name LIKE %s
          AND (c.status = 'Activo' OR c.status IS NULL)
        ORDER BY c.name ASC
        LIMIT 20
    """, (q,), as_dict=True)

    catequistas = frappe.db.sql("""
        SELECT DISTINCT
            t.catequista,
            t.catequista_adj,
            t.name  AS turma,
            t.fase,
            t.local,
            t.dia,
            t.hora
        FROM `tabTurma` t
        WHERE (t.catequista LIKE %s OR t.catequista_adj LIKE %s)
          AND t.status = 'Activo'
        ORDER BY t.catequista ASC
        LIMIT 10
    """, (q, q), as_dict=True)

    return {"catecumenos": catecumenos, "catequistas": catequistas}


@frappe.whitelist(allow_guest=True)
def get_catecumeno_publico(catecumeno_nome):
    """Ficha pública de catecúmeno — sem dados sensíveis."""
    cat = frappe.db.get_value(
        "Catecumeno", catecumeno_nome,
        ["name", "fase", "turma", "sexo", "status"],
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
        condition = "MONTH(data_de_nascimento) = %s AND DAY(data_de_nascimento) = %s"
        params = (today.month, today.day)
    else:
        week_end = today + timedelta(days=7)
        # Handle month wrap-around properly
        if week_end.month == today.month:
            condition = """
                MONTH(data_de_nascimento) = %s
                AND DAY(data_de_nascimento) BETWEEN %s AND %s
            """
            params = (today.month, today.day, week_end.day)
        else:
            condition = """
                (MONTH(data_de_nascimento) = %s AND DAY(data_de_nascimento) >= %s)
                OR (MONTH(data_de_nascimento) = %s AND DAY(data_de_nascimento) <= %s)
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
    total_catequistas = frappe.db.count("Catequista")

    fases = frappe.db.sql("""
        SELECT fase, COUNT(*) AS total
        FROM `tabCatecumeno`
        WHERE status = 'Activo'
          AND fase IS NOT NULL
          AND fase != ''
        GROUP BY fase
        ORDER BY fase ASC
    """, as_dict=True)

    return {
        "total_catecumenos": total_catecumenos,
        "total_turmas": total_turmas,
        "total_catequistas": total_catequistas,
        "por_fase": fases,
    }

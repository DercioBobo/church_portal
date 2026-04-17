import frappe
from frappe import _
import json


def _assert_coordenador():
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    roles = frappe.get_roles(user)
    if "System Manager" not in roles and "Coordenador Catequese" not in roles:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


# ── Year helpers ───────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_anos_lectivos():
    _assert_coordenador()
    try:
        anos = frappe.db.sql(
            "SELECT name FROM `tabAno Lectivo` ORDER BY name DESC LIMIT 10",
            as_dict=True,
        )
        return [a.name for a in anos]
    except Exception:
        return []


@frappe.whitelist()
def get_ano_lectivo_atual():
    _assert_coordenador()
    try:
        ano = frappe.db.get_value("Ano Lectivo", {"is_current": 1}, "name")
        if not ano:
            rows = frappe.db.sql(
                "SELECT name FROM `tabAno Lectivo` ORDER BY name DESC LIMIT 1",
                as_dict=True,
            )
            ano = rows[0].name if rows else None
        return ano
    except Exception:
        return None


# ── Activities list (for autocomplete in form) ─────────────────────────────────

@frappe.whitelist()
def get_actividades_nomes(ano_lectivo):
    _assert_coordenador()
    rows = frappe.db.sql(
        "SELECT name, actividade FROM `tabActividade do Plano` WHERE ano_lectivo = %s ORDER BY actividade ASC",
        (ano_lectivo,),
        as_dict=True,
    )
    return [{"name": r.name, "actividade": r.actividade} for r in rows]


# ── Expense CRUD ───────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_despesas(ano_lectivo):
    _assert_coordenador()
    rows = frappe.db.sql("""
        SELECT name, descricao, fonte, data, valor, categoria, actividade, notas, ano_lectivo
        FROM `tabDespesa Catequese`
        WHERE ano_lectivo = %s
        ORDER BY data DESC, name DESC
    """, (ano_lectivo,), as_dict=True)
    return rows


@frappe.whitelist()
def create_despesa(data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json
    if not (data.get("descricao") or "").strip():
        frappe.throw(_("A descrição é obrigatória"))
    if not data.get("valor"):
        frappe.throw(_("O valor é obrigatório"))
    doc = frappe.new_doc("Despesa Catequese")
    _fill_doc(doc, data)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return _doc_to_dict(doc)


@frappe.whitelist()
def update_despesa(name, data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json
    if not frappe.db.exists("Despesa Catequese", name):
        frappe.throw(_("Despesa não encontrada"))
    doc = frappe.get_doc("Despesa Catequese", name)
    _fill_doc(doc, data)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return _doc_to_dict(doc)


@frappe.whitelist()
def delete_despesa(name):
    _assert_coordenador()
    if not frappe.db.exists("Despesa Catequese", name):
        frappe.throw(_("Despesa não encontrada"))
    frappe.delete_doc("Despesa Catequese", name, ignore_permissions=True)
    frappe.db.commit()


# ── Income CRUD ────────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_receitas(ano_lectivo):
    _assert_coordenador()
    rows = frappe.db.sql("""
        SELECT name, descricao, fonte, data, valor, notas, ano_lectivo
        FROM `tabReceita Catequese`
        WHERE ano_lectivo = %s
        ORDER BY data DESC, name DESC
    """, (ano_lectivo,), as_dict=True)
    return rows


@frappe.whitelist()
def create_receita(data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json
    if not (data.get("descricao") or "").strip():
        frappe.throw(_("A descrição é obrigatória"))
    if not data.get("valor"):
        frappe.throw(_("O valor é obrigatório"))
    doc = frappe.new_doc("Receita Catequese")
    _fill_receita_doc(doc, data)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return _receita_doc_to_dict(doc)


@frappe.whitelist()
def update_receita(name, data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json
    if not frappe.db.exists("Receita Catequese", name):
        frappe.throw(_("Receita não encontrada"))
    doc = frappe.get_doc("Receita Catequese", name)
    _fill_receita_doc(doc, data)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return _receita_doc_to_dict(doc)


@frappe.whitelist()
def delete_receita(name):
    _assert_coordenador()
    if not frappe.db.exists("Receita Catequese", name):
        frappe.throw(_("Receita não encontrada"))
    frappe.delete_doc("Receita Catequese", name, ignore_permissions=True)
    frappe.db.commit()


# ── Financial summary ──────────────────────────────────────────────────────────

@frappe.whitelist()
def get_resumo_financeiro(ano_lectivo):
    _assert_coordenador()

    # Total quotas collected
    row = frappe.db.sql(
        "SELECT COALESCE(SUM(valor), 0) AS total FROM `tabQuota Catequista` WHERE ano = %s",
        (ano_lectivo,), as_dict=True,
    )
    total_quotas = float(row[0].total or 0)

    # Other income (Receita Catequese)
    row2 = frappe.db.sql(
        "SELECT COALESCE(SUM(valor), 0) AS total FROM `tabReceita Catequese` WHERE ano_lectivo = %s",
        (ano_lectivo,), as_dict=True,
    )
    total_outras_receitas = float(row2[0].total or 0)

    # Income grouped by fonte
    rec_fonte_rows = frappe.db.sql("""
        SELECT COALESCE(NULLIF(fonte, ''), 'Outro') AS fonte,
               COALESCE(SUM(valor), 0) AS total
        FROM `tabReceita Catequese`
        WHERE ano_lectivo = %s
        GROUP BY fonte
        ORDER BY total DESC
    """, (ano_lectivo,), as_dict=True)
    por_fonte_receitas = {r.fonte: float(r.total or 0) for r in rec_fonte_rows}

    total_fundos = total_quotas + total_outras_receitas

    # Expenses grouped by fonte
    fonte_rows = frappe.db.sql("""
        SELECT fonte, COALESCE(SUM(valor), 0) AS total
        FROM `tabDespesa Catequese`
        WHERE ano_lectivo = %s
        GROUP BY fonte
    """, (ano_lectivo,), as_dict=True)

    por_fonte_despesas = {}
    total_despesas = 0.0
    for r in fonte_rows:
        v = float(r.total or 0)
        por_fonte_despesas[r.fonte] = v
        total_despesas += v

    # Expenses grouped by categoria
    cat_rows = frappe.db.sql("""
        SELECT COALESCE(NULLIF(categoria, ''), 'Sem categoria') AS categoria,
               COALESCE(SUM(valor), 0) AS total
        FROM `tabDespesa Catequese`
        WHERE ano_lectivo = %s
        GROUP BY categoria
        ORDER BY total DESC
    """, (ano_lectivo,), as_dict=True)
    por_categoria = {r.categoria: float(r.total or 0) for r in cat_rows}

    return {
        "total_quotas":          total_quotas,
        "total_outras_receitas": total_outras_receitas,
        "por_fonte_receitas":    por_fonte_receitas,
        "total_fundos":          total_fundos,
        "total_despesas":        total_despesas,
        "saldo":                 total_fundos - total_despesas,
        "por_fonte_despesas":    por_fonte_despesas,
        "por_categoria":         por_categoria,
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fill_doc(doc, data):
    doc.descricao   = (data.get("descricao") or "").strip()
    doc.fonte       = data.get("fonte") or "Quotas"
    doc.ano_lectivo = data.get("ano_lectivo") or None
    doc.data        = data.get("data") or None
    doc.valor       = float(data.get("valor") or 0)
    doc.categoria   = data.get("categoria") or None
    doc.actividade  = data.get("actividade") or None
    doc.notas       = (data.get("notas") or "").strip() or None


def _doc_to_dict(doc):
    return {
        "name":        doc.name,
        "descricao":   doc.descricao,
        "fonte":       doc.fonte,
        "ano_lectivo": doc.ano_lectivo,
        "data":        str(doc.data) if doc.data else None,
        "valor":       float(doc.valor or 0),
        "categoria":   doc.categoria,
        "actividade":  doc.actividade,
        "notas":       doc.notas,
    }


def _fill_receita_doc(doc, data):
    doc.descricao   = (data.get("descricao") or "").strip()
    doc.fonte       = data.get("fonte") or "Fichas"
    doc.ano_lectivo = data.get("ano_lectivo") or None
    doc.data        = data.get("data") or None
    doc.valor       = float(data.get("valor") or 0)
    doc.notas       = (data.get("notas") or "").strip() or None


def _receita_doc_to_dict(doc):
    return {
        "name":        doc.name,
        "descricao":   doc.descricao,
        "fonte":       doc.fonte,
        "ano_lectivo": doc.ano_lectivo,
        "data":        str(doc.data) if doc.data else None,
        "valor":       float(doc.valor or 0),
        "notas":       doc.notas,
    }

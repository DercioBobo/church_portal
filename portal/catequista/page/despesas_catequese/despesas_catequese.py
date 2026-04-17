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

    # Other income (Receita Catequese) — total and per-fonte
    row2 = frappe.db.sql(
        "SELECT COALESCE(SUM(valor), 0) AS total FROM `tabReceita Catequese` WHERE ano_lectivo = %s",
        (ano_lectivo,), as_dict=True,
    )
    total_outras_receitas = float(row2[0].total or 0)

    rec_fonte_rows = frappe.db.sql("""
        SELECT COALESCE(NULLIF(fonte, ''), 'Outro') AS fonte,
               COALESCE(SUM(valor), 0) AS total
        FROM `tabReceita Catequese`
        WHERE ano_lectivo = %s
        GROUP BY fonte
    """, (ano_lectivo,), as_dict=True)
    receita_by_fonte = {r.fonte: float(r.total or 0) for r in rec_fonte_rows}
    receita_by_fonte['Quotas'] = total_quotas  # quotas are tracked separately

    # Expenses — total, per-fonte and per-categoria
    desp_fonte_rows = frappe.db.sql("""
        SELECT COALESCE(NULLIF(fonte, ''), 'Outro') AS fonte,
               COALESCE(SUM(valor), 0) AS total
        FROM `tabDespesa Catequese`
        WHERE ano_lectivo = %s
        GROUP BY fonte
    """, (ano_lectivo,), as_dict=True)
    despesa_by_fonte = {}
    total_despesas = 0.0
    for r in desp_fonte_rows:
        v = float(r.total or 0)
        despesa_by_fonte[r.fonte] = v
        total_despesas += v

    cat_rows = frappe.db.sql("""
        SELECT COALESCE(NULLIF(categoria, ''), 'Sem categoria') AS categoria,
               COALESCE(SUM(valor), 0) AS total
        FROM `tabDespesa Catequese`
        WHERE ano_lectivo = %s
        GROUP BY categoria
        ORDER BY total DESC
    """, (ano_lectivo,), as_dict=True)
    por_categoria = {r.categoria: float(r.total or 0) for r in cat_rows}

    # Per-fund breakdown — only fontes with any activity
    all_fontes = set(list(receita_by_fonte.keys()) + list(despesa_by_fonte.keys()))
    FONTES_ORDER = ['Quotas', 'Fichas', 'Inscrição', 'Donativo', 'Subsídio Paroquial', 'Outro']
    ordered = [f for f in FONTES_ORDER if f in all_fontes] + \
              sorted([f for f in all_fontes if f not in FONTES_ORDER])
    por_fundo = []
    for fonte in ordered:
        entrada = receita_by_fonte.get(fonte, 0.0)
        saida   = despesa_by_fonte.get(fonte, 0.0)
        if entrada > 0 or saida > 0:
            por_fundo.append({
                "fonte":   fonte,
                "entrada": entrada,
                "saida":   saida,
                "liquido": entrada - saida,
            })

    return {
        "total_quotas":          total_quotas,
        "total_outras_receitas": total_outras_receitas,
        "total_despesas":        total_despesas,
        "por_categoria":         por_categoria,
        "por_fundo":             por_fundo,
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

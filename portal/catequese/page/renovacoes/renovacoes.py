"""
Página Renovações: quem renovou, quanto, e o que cada catequista já entregou, por ano lectivo.

O ano é o da turma (renovar em 2027 numa turma de 2026 conta para 2026).
- Esperados: linhas da turma activas (não "Inativo"), não Desistentes, de catecúmenos que não
  saíram (Inactivo/Transferido) nem terminaram (Crismado) — a não ser que tenham renovado.
- Renovados: Sim ou Isento (Isento conta como renovado, valor 0).
- Entregue: Receitas com fonte "Renovação" ligadas à turma (botão "Recebido do catequista").
"""

import frappe
from frappe import _
from frappe.utils import flt, today

from portal.catequese.renovacao import RENOVADO, valor_padrao
from portal.catequese.utils import ano_actual

FORA = ("Inactivo", "Inativo", "Transferido", "Crismado")


@frappe.whitelist()
def get_dados(ano=None):
    frappe.has_permission("Turma", "read", throw=True)
    ano = ano or ano_actual()

    turmas = frappe.get_all("Turma", filters={"ano_lectivo": ano},
                            fields=["name", "fase", "catequista", "catequista_adj", "status"],
                            order_by="fase asc, name asc", limit_page_length=0)
    linhas = frappe.db.sql("""
        SELECT tc.name AS linha, tc.parent AS turma, tc.catecumeno, tc.estado, tc.pre_avaliacao,
               tc.renovacao, tc.valor_renovacao, tc.data_renovacao,
               c.status, c.encarregado, c.contacto
        FROM `tabTurma Catecumenos` tc
        JOIN `tabTurma` t ON t.name = tc.parent AND t.ano_lectivo = %s
        LEFT JOIN `tabCatecumeno` c ON c.name = tc.catecumeno
        WHERE tc.parenttype = 'Turma' AND tc.parentfield = 'lista_catecumenos' AND tc.catecumeno IS NOT NULL
        ORDER BY tc.catecumeno
    """, ano, as_dict=True)
    entregue = {r.turma: flt(r.total) for r in frappe.db.sql("""
        SELECT turma, SUM(valor) AS total FROM `tabReceita Catequese`
        WHERE fonte = 'Renovação' AND ano_lectivo = %s AND IFNULL(turma, '') != ''
        GROUP BY turma
    """, ano, as_dict=True)}

    por_turma = {t.name: dict(t, esperados=0, renovados=0, isentos=0, valor=0.0, sem_valor=0) for t in turmas}
    renovados, por_renovar = [], []
    for l in linhas:
        t = por_turma.get(l.turma)
        if not t:
            continue
        renovou = l.renovacao in RENOVADO
        conta = renovou or (l.estado != "Inativo" and l.pre_avaliacao != "Desistente" and (l.status or "") not in FORA)
        if not conta:
            continue
        l.catequista = t["catequista"]
        t["esperados"] += 1
        if renovou:
            t["renovados"] += 1
            if l.renovacao == "Isento":
                t["isentos"] += 1
            elif not flt(l.valor_renovacao):
                t["sem_valor"] += 1   # renovações antigas, de antes de haver valor
            t["valor"] += flt(l.valor_renovacao)
            renovados.append(l)
        else:
            por_renovar.append(l)

    lista = []
    for t in por_turma.values():
        if not t["esperados"]:
            continue
        t["entregue"] = entregue.get(t["name"], 0.0)
        t["por_entregar"] = max(0.0, t["valor"] - t["entregue"])
        lista.append(t)

    soma = lambda k: sum(t[k] for t in lista)  # noqa: E731
    return {
        "ano": ano,
        "anos": frappe.get_all("Ano Lectivo", pluck="name", order_by="name desc"),
        "valor_padrao": valor_padrao(),
        "totais": {
            "esperados": soma("esperados"), "renovados": soma("renovados"), "isentos": soma("isentos"),
            "valor": soma("valor"), "entregue": soma("entregue"), "por_entregar": soma("por_entregar"),
            "esperado_valor": (soma("esperados") - soma("isentos")) * valor_padrao(),
        },
        "turmas": lista,
        "renovados": renovados,
        "por_renovar": por_renovar,
    }


@frappe.whitelist()
def registar_entrega(turma, valor=None, data=None, notas=None):
    """O catequista entregou o dinheiro das renovações: cria uma Receita (fonte Renovação) no ano da turma."""
    frappe.has_permission("Receita Catequese", "create", throw=True)
    t = frappe.db.get_value("Turma", turma, ["name", "ano_lectivo", "catequista"], as_dict=True)
    if not t:
        frappe.throw(_("Turma não encontrada."))
    dados = get_dados(t.ano_lectivo)
    linha = next((x for x in dados["turmas"] if x["name"] == turma), None)
    por_entregar = linha["por_entregar"] if linha else 0
    valor = flt(valor) if valor not in (None, "") else por_entregar
    if valor <= 0:
        frappe.throw(_("Não há valor por entregar nesta turma."))

    r = frappe.get_doc({
        "doctype": "Receita Catequese",
        "descricao": _("Renovações — {0}").format(turma) + (f" ({t.catequista})" if t.catequista else ""),
        "fonte": "Renovação",
        "ano_lectivo": t.ano_lectivo,
        "turma": turma,
        "data": data or today(),
        "valor": valor,
        "notas": notas,
    }).insert()
    return {"receita": r.name, "valor": valor}

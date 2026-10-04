"""
Página Renovações: quem renovou, quanto, e o que cada catequista já entregou, por ano lectivo.

O ano é o da turma (renovar em 2027 numa turma de 2026 conta para 2026).
- Esperados: linhas da turma activas (não "Inativo"), não Desistentes, de catecúmenos que não
  saíram (Inactivo/Transferido) nem terminaram (Crismado) — a não ser que tenham renovado.
- Renovados: Sim ou Isento (Isento conta como renovado, valor 0).
- Não renovam: as turmas da fase do Crisma (última fase: Fase com sacramento Crisma) e os
  catecúmenos Crismados — ficam fora da página, mesmo que alguém tenha marcado a renovação.
- Entregue: Receitas com fonte "Renovação" ligadas à turma (botão "Recebido do catequista").
- Recebido pela coordenação: renovações marcadas na página ("Marcar renovado"); a Receita é criada
  logo, sem turma, e não entra no "por entregar" do catequista.
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

    fases_sem_renovacao = frappe.get_all("Fase", filters={"fase_de_sacramento": 1, "sacramento": "Crisma"}, pluck="name")
    turmas = frappe.get_all("Turma", filters={"ano_lectivo": ano, "fase": ["not in", fases_sem_renovacao or [""]]},
                            fields=["name", "fase", "catequista", "catequista_adj", "status"],
                            order_by="fase asc, name asc", limit_page_length=0)
    linhas = frappe.db.sql("""
        SELECT tc.name AS linha, tc.parent AS turma, tc.catecumeno, tc.estado, tc.pre_avaliacao,
               tc.renovacao, tc.valor_renovacao, tc.data_renovacao, tc.renovacao_coordenacao,
               tc.modified AS alterado_em, tc.modified_by AS alterado_por,
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

    por_turma = {t.name: dict(t, esperados=0, renovados=0, isentos=0, valor=0.0, valor_coord=0.0, sem_valor=0)
                 for t in turmas}
    renovados, por_renovar = [], []
    for l in linhas:
        t = por_turma.get(l.turma)
        if not t:
            continue
        if l.status == "Crismado":
            continue   # terminou a catequese: não renova
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
            # "valor" = recebido pelo catequista (o que tem de entregar); o da coordenação fica à parte
            t["valor_coord" if l.renovacao_coordenacao else "valor"] += flt(l.valor_renovacao)
            renovados.append(l)
        else:
            por_renovar.append(l)

    # Renovações sem valor (de antes de haver valor): pista de quando/quem pela última alteração da linha
    sem_valor = [l for l in renovados if l.renovacao == "Sim" and not flt(l.valor_renovacao)]
    utilizadores = {l.alterado_por for l in sem_valor if l.alterado_por}
    nomes = {}
    if utilizadores:
        nomes.update({u.user: u.name for u in frappe.get_all(
            "Catequista", filters={"user": ["in", list(utilizadores)]}, fields=["name", "user"])})
        for u in utilizadores - set(nomes):
            nomes[u] = frappe.db.get_value("User", u, "full_name") or u
    for l in sem_valor:
        l.sem_valor = 1
        l.alterado_por_nome = nomes.get(l.alterado_por, l.alterado_por)

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
            "valor": soma("valor"), "coordenacao": soma("valor_coord"), "recebido": soma("valor") + soma("valor_coord"),
            "entregue": soma("entregue"), "por_entregar": soma("por_entregar"),
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


@frappe.whitelist()
def completar(linhas, valor=None, data=None, usar_data_alteracao=1):
    """Completa renovações "Sim" sem valor/data (marcadas antes de haver valor).
    Data: a indicada, ou a da última alteração da linha (pista de quando o catequista marcou)."""
    frappe.has_permission("Turma", "write", throw=True)
    linhas = frappe.parse_json(linhas) if isinstance(linhas, str) else (linhas or [])
    valor = flt(valor) if valor not in (None, "") else valor_padrao()
    feitas = 0
    for nome in linhas:
        l = frappe.db.get_value("Turma Catecumenos", nome, ["renovacao", "valor_renovacao", "data_renovacao", "modified"],
                                as_dict=True)
        if not l or l.renovacao != "Sim":
            continue
        dia = data or (str(l.modified)[:10] if frappe.utils.cint(usar_data_alteracao) else None) or today()
        frappe.db.set_value("Turma Catecumenos", nome, {
            "valor_renovacao": flt(l.valor_renovacao) or valor,
            "data_renovacao": l.data_renovacao or dia,
        }, update_modified=False)   # mantém a pista de quem/quando marcou
        feitas += 1
    return {"completadas": feitas}


@frappe.whitelist()
def marcar_renovado(linhas, renovacao="Sim", valor=None, data=None, registar_receita=1, notas=None):
    """A coordenação recebeu a renovação directamente (não o catequista): marca Sim/Isento na linha
    da turma com valor e data, assinala "Recebido pela coordenação" e, se pedido, regista a Receita
    (sem turma, para não mexer no "por entregar" do catequista)."""
    frappe.has_permission("Turma", "write", throw=True)
    linhas = frappe.parse_json(linhas) if isinstance(linhas, str) else (linhas or [])
    if renovacao not in RENOVADO:
        frappe.throw(_("Escolha Sim ou Isento."))
    valor = 0 if renovacao == "Isento" else (flt(valor) if valor not in (None, "") else valor_padrao())
    data = data or today()

    feitas, nomes, turmas, anos = 0, [], set(), set()
    for nome in linhas:
        l = frappe.db.get_value("Turma Catecumenos", nome, ["parent", "parenttype", "catecumeno", "renovacao"], as_dict=True)
        if not l or l.parenttype != "Turma" or l.renovacao in RENOVADO:
            continue
        frappe.db.set_value("Turma Catecumenos", nome, {
            "renovacao": renovacao, "valor_renovacao": valor, "data_renovacao": data, "renovacao_coordenacao": 1,
        })
        feitas += 1
        nomes.append(l.catecumeno)
        turmas.add(l.parent)
        anos.add(frappe.db.get_value("Turma", l.parent, "ano_lectivo"))
    for t in turmas:
        frappe.db.set_value("Turma", t, "modified", frappe.utils.now(), update_modified=False)

    receita = None
    total = valor * feitas
    if frappe.utils.cint(registar_receita) and total > 0:
        frappe.has_permission("Receita Catequese", "create", throw=True)
        receita = frappe.get_doc({
            "doctype": "Receita Catequese",
            "descricao": _("Renovações recebidas pela coordenação ({0})").format(feitas),
            "fonte": "Renovação",
            "ano_lectivo": sorted(a for a in anos if a)[0] if any(anos) else ano_actual(),
            "data": data,
            "valor": total,
            "notas": ((notas + "\n") if notas else "") + ", ".join(nomes),
        }).insert().name
    return {"marcadas": feitas, "receita": receita, "valor": total}

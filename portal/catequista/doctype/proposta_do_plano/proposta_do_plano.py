"""
Proposta do Plano — rascunho do plano anual de um ano, gerado por rollover a
partir do ano anterior, discutido em reunião e depois finalizado (submetido).

  Rascunho  → em discussão: edita-se na página Rollover do Plano
  Submetido → as actividades são criadas no Plano Anual, ligadas à proposta
  Cancelado → as actividades criadas são apagadas (só se nenhuma começou)

Só pode existir uma proposta (não cancelada) por ano de destino.
"""

import calendar
from datetime import date, timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, getdate, now_datetime

CAMPOS_ITEM = ("data", "data_fim", "actividade", "tipologia", "local", "orador", "orcamento", "notas")


class PropostadoPlano(Document):
    def validate(self):
        outra = frappe.db.get_value(
            "Proposta do Plano",
            {"ano_destino": self.ano_destino, "docstatus": ["<", 2], "name": ["!=", self.name]},
            "name",
        )
        if outra:
            frappe.throw(_("Já existe a {0} para {1}. Abra essa proposta em vez de criar outra.").format(
                frappe.bold(outra), self.ano_destino))
        for i, item in enumerate(self.itens, 1):
            if not (item.actividade or "").strip():
                frappe.throw(_("Linha {0}: a actividade não tem nome.").format(i))
            if item.data and item.data_fim and getdate(item.data_fim) < getdate(item.data):
                frappe.throw(_("Linha {0} ({1}): a data de fim é anterior à data de início.").format(i, item.actividade))
        self.itens.sort(key=lambda r: (r.data is None, getdate(r.data) if r.data else date.max, r.actividade or ""))
        for i, item in enumerate(self.itens, 1):
            item.idx = i
        self.total_actividades = len(self.itens)

    def on_submit(self):
        """Cria as actividades no Plano Anual, cada uma ligada à proposta e à sua linha."""
        for item in self.itens:
            act = frappe.get_doc({
                "doctype": "Actividade do Plano",
                "actividade": item.actividade.strip(),
                "tipologia": item.tipologia or None,
                "estado": "Pendente",
                "ano_lectivo": self.ano_destino,
                "data": item.data,
                "data_fim": item.data_fim,
                "orador": item.orador,
                "local": item.local,
                "orcamento": item.orcamento,
                "proposta": self.name,
            }).insert(ignore_permissions=True)
            item.db_set("actividade_criada", act.name, update_modified=False)
        self.db_set("finalizada_em", now_datetime(), update_modified=False)
        frappe.msgprint(_("{0} actividades criadas no Plano Anual de {1}.").format(len(self.itens), self.ano_destino),
                        indicator="green", alert=True)

    def on_cancel(self):
        """Desfaz a finalização: apaga as actividades criadas, se nenhuma já começou."""
        criadas = frappe.get_all("Actividade do Plano", filters={"proposta": self.name},
                                 fields=["name", "actividade", "estado", "notas_execucao"])
        em_uso = [a for a in criadas if a.estado != "Pendente" or a.notas_execucao]
        if em_uso:
            frappe.throw(_("Não é possível cancelar: {0} actividade(s) já têm execução registada (ex.: {1}). "
                           "Altere-as directamente no Plano Anual.").format(len(em_uso), em_uso[0].actividade))
        for a in criadas:
            frappe.delete_doc("Actividade do Plano", a.name, ignore_permissions=True, force=True)
        for item in self.itens:
            item.db_set("actividade_criada", None, update_modified=False)


# ── Rollover ──────────────────────────────────────────────────────────────────

def _um_ano_depois(d, manter_fim_de_semana=True):
    """Mesmo dia/mês no ano seguinte; se era sábado/domingo, mantém o dia da semana (±3 dias)."""
    if not d:
        return None
    d = getdate(d)
    ultimo = calendar.monthrange(d.year + 1, d.month)[1]
    novo = date(d.year + 1, d.month, min(d.day, ultimo))
    if manter_fim_de_semana and d.weekday() in (5, 6) and novo.weekday() != d.weekday():
        delta = (d.weekday() - novo.weekday()) % 7
        if delta > 3:
            delta -= 7
        novo += timedelta(days=delta)
    return novo


def _assert_coordenador():
    if frappe.session.user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    if not set(frappe.get_roles()) & {"System Manager", "Coordenador Catequese"}:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


def proposta_do_ano(ano_destino):
    return frappe.db.get_value("Proposta do Plano", {"ano_destino": ano_destino, "docstatus": ["<", 2]}, "name")


@frappe.whitelist()
def gerar_proposta(ano_origem, ano_destino, manter_orador=1, manter_fim_de_semana=1):
    """Cria a proposta do ano de destino a partir do plano do ano de origem."""
    _assert_coordenador()
    if ano_origem == ano_destino:
        frappe.throw(_("O ano de origem e o ano de destino não podem ser iguais."))
    existente = proposta_do_ano(ano_destino)
    if existente:
        frappe.throw(_("Já existe a {0} para {1}.").format(frappe.bold(existente), ano_destino))

    origem = frappe.get_all("Actividade do Plano", filters={"ano_lectivo": ano_origem},
                            fields=["actividade", "tipologia", "data", "data_fim", "orador", "local", "orcamento"],
                            order_by="data asc, name asc")
    if not origem:
        frappe.throw(_("O ano {0} não tem actividades para copiar.").format(ano_origem))

    # Actividades que já existem no ano de destino (pelo nome) não são repetidas
    ja_existem = set(frappe.get_all("Actividade do Plano", filters={"ano_lectivo": ano_destino}, pluck="actividade"))
    fds = cint(manter_fim_de_semana)
    doc = frappe.new_doc("Proposta do Plano")
    doc.update({"ano_destino": ano_destino, "ano_origem": ano_origem,
                "manter_orador": cint(manter_orador), "manter_fim_de_semana": fds})
    for a in origem:
        if a.actividade in ja_existem:
            continue
        doc.append("itens", {
            "actividade": a.actividade, "tipologia": a.tipologia,
            "data": _um_ano_depois(a.data, fds), "data_fim": _um_ano_depois(a.data_fim, fds),
            "orador": a.orador if cint(manter_orador) else None,
            "local": a.local, "orcamento": a.orcamento,
            "origem": "Rollover", "data_origem": a.data,
        })
    doc.insert(ignore_permissions=True)
    return doc.name


@frappe.whitelist()
def get_estado(ano_destino):
    """O que a página precisa para um ano: proposta (se existir), tipologias, actividades já no plano."""
    _assert_coordenador()
    nome = proposta_do_ano(ano_destino)
    proposta = None
    if nome:
        doc = frappe.get_doc("Proposta do Plano", nome)
        proposta = doc.as_dict()
        proposta["comentarios"] = frappe.db.count("Comment", {
            "reference_doctype": "Proposta do Plano", "reference_name": nome, "comment_type": "Comment"})
    return {
        "proposta": proposta,
        "tipologias": frappe.get_all("Tipologia Actividade", fields=["name", "cor", "icone"], order_by="name"),
        "no_plano": frappe.db.count("Actividade do Plano", {"ano_lectivo": ano_destino}),
        "origem_sugerida": str(int(ano_destino) - 1),
        "origem_tem": frappe.db.count("Actividade do Plano", {"ano_lectivo": str(int(ano_destino) - 1)}),
    }


@frappe.whitelist()
def guardar_itens(nome, itens, notas=None):
    """Grava as linhas editadas na página (só em rascunho)."""
    _assert_coordenador()
    doc = frappe.get_doc("Proposta do Plano", nome)
    if doc.docstatus != 0:
        frappe.throw(_("A proposta já foi finalizada e não pode ser alterada."))
    linhas = frappe.parse_json(itens) or []
    antigas = {r.name: r for r in doc.itens}
    doc.set("itens", [])
    for l in linhas:
        valores = {k: (l.get(k) or None) for k in CAMPOS_ITEM}
        anterior = antigas.get(l.get("name"))
        valores["origem"] = anterior.origem if anterior else "Nova"
        valores["data_origem"] = anterior.data_origem if anterior else None
        doc.append("itens", valores)
    if notas is not None:
        doc.notas = notas
    doc.save()
    return doc.as_dict()


@frappe.whitelist()
def finalizar(nome):
    """Submete a proposta: cria as actividades no Plano Anual."""
    _assert_coordenador()
    doc = frappe.get_doc("Proposta do Plano", nome)
    if doc.docstatus != 0:
        frappe.throw(_("A proposta já foi finalizada."))
    if not doc.itens:
        frappe.throw(_("A proposta não tem actividades."))
    doc.submit()
    return doc.name


@frappe.whitelist()
def get_anos():
    """Anos lectivos e o ano sugerido para o plano (o seguinte ao actual, se existir)."""
    _assert_coordenador()
    from portal.catequese.utils import ano_actual

    anos = frappe.get_all("Ano Lectivo", pluck="name", order_by="name desc")
    actual = ano_actual()
    seguinte = str(int(actual) + 1) if actual else None
    return {"anos": anos, "sugerido": seguinte if seguinte in anos else (actual or (anos[0] if anos else None))}

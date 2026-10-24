"""
Página Receber Fichas: o encarregado entrega a ficha, escreve-se o nome, Enter, e fica marcado.

Marca "Ficha de Catecumeno" no Catecúmeno (sem validar o documento inteiro) e propaga para a
linha da turma actual e candidaturas em rascunho — ver catequese/sincronizacao.py.
Só catecúmenos que ainda andam na catequese (Activo/Pendente).

Corrigir: o nome ou a data de nascimento na ficha às vezes difere do registo.
- Nome: o nome do Catecúmeno é o nome completo, por isso muda-se com rename_doc (as ligações
  nas turmas, preparações, livros, etc. acompanham). Os textos já escritos nos livros ficam.
- Data de nascimento: recalcula a idade e propaga para a turma e candidaturas.
"""

import re
import unicodedata
from datetime import date

import frappe
from frappe import _
from frappe.utils import cint, getdate

from portal.catequese.sincronizacao import gravar_no_catecumeno

ESTADOS = ("Activo", "Pendente")


def _norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def _idade(nasc, hoje=None):
    nasc, hoje = getdate(nasc), hoje or date.today()
    return hoje.year - nasc.year - ((hoje.month, hoje.day) < (nasc.month, nasc.day))


@frappe.whitelist()
def get_dados():
    frappe.has_permission("Catecumeno", "read", throw=True)
    catecumenos = frappe.get_all(
        "Catecumeno", filters={"status": ["in", ESTADOS]},
        fields=["name", "turma", "fase", "encarregado", "idade", "data_de_nascimento", "ficha_de_catecumeno as ficha"],
        order_by="name asc", limit_page_length=0,
    )
    # Catequistas da turma (ajuda a confirmar que é a pessoa certa)
    nomes_turmas = list({c.turma for c in catecumenos if c.turma})
    turmas = {t.name: t for t in frappe.get_all(
        "Turma", filters={"name": ["in", nomes_turmas or [""]]},
        fields=["name", "catequista", "catequista_adj"], limit_page_length=0,
    )}
    for c in catecumenos:
        t = turmas.get(c.turma)
        c.catequistas = " / ".join(x for x in (t.catequista, t.catequista_adj) if x) if t else ""
    return {"catecumenos": catecumenos}


@frappe.whitelist()
def marcar(nome, ficha=1):
    frappe.has_permission("Catecumeno", "write", doc=nome, throw=True)
    ficha = 1 if cint(ficha) else 0
    gravar_no_catecumeno(nome, {"ficha_de_catecumeno": ficha})
    return {"nome": nome, "ficha": ficha}


def _renomear(nome, novo):
    if _norm(novo) == _norm(nome):
        # Só maiúsculas/acentos: para a base de dados é o "mesmo" nome — passa por um nome temporário
        tmp = f"{novo} ~{frappe.generate_hash(length=6)}"
        frappe.rename_doc("Catecumeno", nome, tmp, show_alert=False)
        nome = tmp
    elif frappe.db.exists("Catecumeno", novo):
        frappe.throw(_("Já existe um catecúmeno chamado {0}.").format(frappe.bold(novo)))
    frappe.rename_doc("Catecumeno", nome, novo, show_alert=False)
    frappe.db.set_value("Catecumeno", novo, "nome_completo", novo)
    # Candidaturas em rascunho que guardam o nome em texto
    frappe.db.sql("""
        UPDATE `tabCandidatos ao Sacramento Table` cs
        JOIN `tabPreparacao do Sacramento` p ON p.name = cs.parent AND p.docstatus = 0
        SET cs.nome_completo = %s
        WHERE cs.catecumeno = %s AND IFNULL(cs.nome_completo, '') != ''
    """, (novo, novo))


@frappe.whitelist()
def corrigir(nome, novo_nome=None, data_de_nascimento=None, ficha=None):
    """Corrige o nome e/ou a data de nascimento (e, se pedido, marca a ficha no mesmo passo)."""
    frappe.has_permission("Catecumeno", "write", doc=nome, throw=True)
    novo = re.sub(r"\s+", " ", novo_nome or "").strip()
    if novo and novo != nome:
        _renomear(nome, novo)
        nome = novo

    valores = {}
    if data_de_nascimento:
        nasc = getdate(data_de_nascimento)
        if nasc > date.today():
            frappe.throw(_("A data de nascimento não pode ser no futuro."))
        valores.update(data_de_nascimento=nasc, idade=_idade(nasc))
    if ficha is not None:
        valores["ficha_de_catecumeno"] = 1 if cint(ficha) else 0
    if valores:
        gravar_no_catecumeno(nome, valores)

    c = frappe.db.get_value("Catecumeno", nome, ["name", "idade", "data_de_nascimento", "ficha_de_catecumeno as ficha"],
                            as_dict=True)
    return c

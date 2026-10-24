"""
Página Receber Fichas: o encarregado entrega a ficha, escreve-se o nome, Enter, e fica marcado.

Marca "Ficha de Catecumeno" no Catecúmeno (sem validar o documento inteiro) e propaga para a
linha da turma actual e candidaturas em rascunho — ver catequese/sincronizacao.py.
Só catecúmenos que ainda andam na catequese (Activo/Pendente).
"""

import frappe
from frappe.utils import cint

from portal.catequese.sincronizacao import gravar_no_catecumeno

ESTADOS = ("Activo", "Pendente")


@frappe.whitelist()
def get_dados():
    frappe.has_permission("Catecumeno", "read", throw=True)
    catecumenos = frappe.get_all(
        "Catecumeno", filters={"status": ["in", ESTADOS]},
        fields=["name", "turma", "fase", "encarregado", "idade", "ficha_de_catecumeno as ficha"],
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

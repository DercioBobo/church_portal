import frappe
from frappe import _
from frappe.model.document import Document

from portal.catequese.utils import nome_com_serie


class SacramentoNaoRecebido(Document):
    def autoname(self):
        # NR-Baptismo-26-01
        self.name = nome_com_serie(f"NR-{self.sacramento}", self.ano_lectivo)

    def validate(self):
        # Um registo por catecúmeno, sacramento e ano
        outro = frappe.db.exists("Sacramento Nao Recebido", {
            "catecumeno": self.catecumeno, "sacramento": self.sacramento,
            "ano_lectivo": self.ano_lectivo, "name": ["!=", self.name or ""],
        })
        if outro:
            frappe.throw(_("Já existe um registo para {0} ({1}, {2}): {3}").format(
                self.catecumeno, self.sacramento, self.ano_lectivo, outro))

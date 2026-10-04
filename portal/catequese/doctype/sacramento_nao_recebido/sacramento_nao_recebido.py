import frappe
from frappe import _
from frappe.model.document import Document


class SacramentoNaoRecebido(Document):
    def validate(self):
        # Um registo por catecúmeno, sacramento e ano
        outro = frappe.db.exists("Sacramento Nao Recebido", {
            "catecumeno": self.catecumeno, "sacramento": self.sacramento,
            "ano_lectivo": self.ano_lectivo, "name": ["!=", self.name or ""],
        })
        if outro:
            frappe.throw(_("Já existe um registo para {0} ({1}, {2}): {3}").format(
                self.catecumeno, self.sacramento, self.ano_lectivo, outro))

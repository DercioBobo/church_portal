import frappe
from frappe.model.document import Document


class CatequeseSettings(Document):
    def validate(self):
        minimo, ideal, maximo = self.tamanho_minimo or 0, self.tamanho_ideal or 0, self.tamanho_maximo or 0
        if minimo and ideal and maximo and not (minimo <= ideal <= maximo):
            frappe.throw("Os tamanhos das turmas devem respeitar: mínimo ≤ ideal ≤ máximo.")

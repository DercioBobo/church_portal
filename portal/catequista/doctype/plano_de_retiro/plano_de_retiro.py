import frappe
from frappe.utils import getdate

ROMAN = ["I", "II", "III", "IV"]


class PlanodeRetiro(frappe.model.document.Document):
    def autoname(self):
        ano = getdate(self.data).year if self.data else "N/A"
        if self.fase_1 and self.fase_2:
            base = f"Retiro-{self.fase_1} e {self.fase_2}-{ano}"
        elif self.fase_1:
            base = f"Retiro-{self.fase_1}-{ano}"
        else:
            base = f"Retiro-{ano}"

        if not frappe.db.exists("Plano de Retiro", base):
            self.name = base
            self.titulo = f"{base} {ROMAN[0]}"
            return

        counter = 2
        while counter <= 4 and frappe.db.exists("Plano de Retiro", f"{base}-{counter}"):
            counter += 1
        self.name = f"{base}-{counter}"
        self.titulo = f"{base} {ROMAN[counter - 1]}"

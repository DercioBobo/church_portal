import frappe
from frappe.utils import getdate


class PlanodeRetiro(frappe.model.document.Document):
    def autoname(self):
        ano = getdate(self.data).year if self.data else "N/A"
        if self.fase_1 and self.fase_2:
            self.name = f"Retiro-{self.fase_1} e {self.fase_2}-{ano}"
        elif self.fase_1:
            self.name = f"Retiro-{self.fase_1}-{ano}"
        else:
            self.name = f"Retiro-{ano}"

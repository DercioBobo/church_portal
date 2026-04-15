import frappe
from frappe import _
from frappe.model.document import Document


class ProgramadaFase(Document):
    def validate(self):
        # Enforce unique (fase, ano_lectivo) — one program per phase per year
        duplicate = frappe.db.get_value(
            "Programa da Fase",
            {"fase": self.fase, "ano_lectivo": self.ano_lectivo, "name": ("!=", self.name)},
            "name",
        )
        if duplicate:
            frappe.throw(
                _(
                    "Já existe um programa para a fase {0} no ano lectivo {1}: {2}"
                ).format(self.fase, self.ano_lectivo, duplicate)
            )

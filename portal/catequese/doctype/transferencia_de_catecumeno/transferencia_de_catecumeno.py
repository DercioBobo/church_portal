import frappe
from frappe.model.document import Document


class TransferenciadeCatecumeno(Document):
    def before_submit(self):
        # (era o Server Script "Transferencia")
        if self.catecumeno and self.turma:
            turma = frappe.get_doc("Turma", self.turma)
            turma.set("lista_catecumenos", [
                row for row in turma.lista_catecumenos if row.catecumeno != self.catecumeno
            ])
            turma.save()
            frappe.msgprint(f"Catecúmeno {self.catecumeno} removido da Turma {self.turma}.")

        frappe.db.set_value("Catecumeno", self.catecumeno, "status", "Transferido")

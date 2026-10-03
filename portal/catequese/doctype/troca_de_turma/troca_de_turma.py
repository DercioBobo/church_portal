import frappe
from frappe.model.document import Document

from portal.catequese.turma import adicionar_a_turma, remover_da_turma


class TrocadeTurma(Document):
    def before_submit(self):
        # (era o Server Script "Troca de Turma")
        if not self.catecumeno or not self.nova_turma:
            frappe.throw("Por favor, seleccione o catecúmeno e a nova turma.")

        catec = frappe.get_doc("Catecumeno", self.catecumeno)
        if not catec.turma:
            frappe.throw("O catecúmeno não tem turma actual definida.")

        remover_da_turma(catec.turma, [catec.name])
        nova_turma = adicionar_a_turma(self.nova_turma, [catec])

        catec.turma = self.nova_turma
        catec.fase = nova_turma.fase
        catec.save(ignore_permissions=True)

        frappe.msgprint(
            f"Catecúmeno {catec.name} movido com sucesso para a turma {nova_turma.name} e fase {nova_turma.fase}."
        )

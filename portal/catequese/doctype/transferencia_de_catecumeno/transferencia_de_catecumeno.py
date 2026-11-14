import frappe
from frappe.model.document import Document

from portal.catequese.catecumeno_reactivar import colocar_em_turma


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

    def on_cancel(self):
        """Anular uma transferência feita por engano: o catecúmeno volta à turma de onde saiu.
        Se entretanto já foi readmitido (ou mudou de estado), não se mexe em nada."""
        if not self.catecumeno or not frappe.db.exists("Catecumeno", self.catecumeno):
            return
        cat = frappe.get_doc("Catecumeno", self.catecumeno)
        if cat.status != "Transferido":
            frappe.msgprint(
                f"Transferência cancelada. O catecúmeno {cat.name} já não está Transferido "
                f"(status: {cat.status}), por isso não foi alterado.")
            return

        turma_activa = self.turma and frappe.db.get_value("Turma", self.turma, "status") == "Activo"
        if turma_activa:
            colocar_em_turma(cat, frappe.get_doc("Turma", self.turma), nota="Transferência anulada")
            destino = f"voltou à turma {self.turma}"
        else:
            # A turma de origem já não existe ou foi encerrada: fica a aguardar alocação.
            cat.status = "Pendente"
            cat.turma = ""
            cat.save(ignore_permissions=True)
            destino = "ficou Pendente (a turma de origem já não está activa) — use «Alocar Turma»"

        cat.add_comment("Info", f"Transferência anulada ({self.name}): {destino}.")
        frappe.msgprint(f"Transferência anulada. {cat.name} {destino}.")

import frappe
from frappe.model.document import Document

from portal.catequese.sincronizacao import sincronizar_catecumeno


class Catecumeno(Document):
    def on_update(self):
        # Linha na turma actual (se activa) e candidaturas em rascunho — ver catequese/sincronizacao.py
        try:
            sincronizar_catecumeno(self.name)
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"Sincronização do catecúmeno {self.name}")


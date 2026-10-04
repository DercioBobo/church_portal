import frappe
from frappe.model.document import Document


class Catecumeno(Document):
    def on_update(self):
        # (era o Server Script "Update child Table on save catecumeno")
        self._actualizar_turma()
        self._actualizar_candidaturas()

    def _actualizar_turma(self):
        """Copia os dados do catecúmeno para a sua linha na turma (se activa)."""
        try:
            if not self.turma:
                return
            if frappe.db.get_value("Turma", self.turma, "status") != "Activo":
                return
            linha = frappe.db.get_value(
                "Turma Catecumenos", {"parent": self.turma, "catecumeno": self.name}, "name"
            )
            if linha:
                frappe.db.set_value("Turma Catecumenos", linha, {
                    "catecumeno": self.name,
                    "ficha_de_catecumeno": self.get("ficha_de_catecumeno"),
                    "encarregado": self.get("encarregado"),
                    "contacto": self.get("contacto"),
                    "padrinhos": self.get("padrinhos"),
                    "contacto_padrinhos": self.get("contacto_padrinhos"),
                    "data_de_nascimento": self.get("data_de_nascimento"),
                    "idade": self.get("idade"),
                })
        except Exception as e:
            frappe.log_error(str(e), "sync_to_turma error")

    def _actualizar_candidaturas(self):
        """Copia os dados para as candidaturas a sacramentos não canceladas."""
        try:
            linhas = frappe.db.get_all(
                "Candidatos ao Sacramento Table",
                filters={"catecumeno": self.name},
                fields=["name", "parent"],
                limit=50,
            )
            for row in linhas:
                # só preparações em rascunho: as submetidas são o registo do que aconteceu
                if frappe.db.get_value("Preparacao do Sacramento", row.parent, "docstatus") != 0:
                    continue
                frappe.db.set_value("Candidatos ao Sacramento Table", row.name, {
                    "catecumeno": self.name,
                    "encarregado": self.get("encarregado"),
                    "contacto_encarregado": self.get("contacto"),
                    "padrinhos": self.get("padrinhos"),
                    "contacto_padrinhos": self.get("contacto_padrinhos"),
                    "idade": self.get("idade"),
                    "sexo": self.get("sexo"),
                })
        except Exception as e:
            frappe.log_error(str(e), "sync_to_sacramento error")

import frappe
from frappe.model.document import Document


class Inscricao(Document):
    def before_submit(self):
        # (era o Server Script "New Inscricao")
        self._criar_catecumeno()

    def _criar_catecumeno(self):
        nome = self.nome_completo
        if frappe.db.exists("Catecumeno", nome):
            frappe.throw(f"O catecúmeno '{nome}' já existe. Não é possível criar duplicado.")

        c = frappe.new_doc("Catecumeno")
        c.nome_completo = nome
        c.sexo = self.get("sexo")
        c.data_de_nascimento = self.get("data_de_nascimento")
        c.idade = self.get("idade")
        c.encarregado = self.get("encarregado")
        c.contacto = self.get("contacto")
        c.fase = self.get("fase")
        c.observacoes = self.get("observacoes")
        c.ficha_de_catecumenato = self.get("ficha_de_catecumenato")
        c.residencia = self.get("residencia")
        c.nucleo = self.get("nucleo")

        if self.get("turma"):
            c.turma = self.turma
            c.status = "Activo"
        else:
            c.turma = ""
            c.status = "Pendente"

        if self.get("baptismo"):
            c.baptismo = 1
        if self.get("eucaristia"):
            c.eucaristia = 1
        if self.get("crisma"):
            c.crisma = 1

        if self.get("transferencia"):
            obs = (f"Transferência de: {self.get('paroquia_que_frequentava') or '-'} "
                   f"(Fase: {self.get('fase_que_frequentava') or '-'})")
            c.observacoes = f"{obs}\n\n{c.observacoes}" if c.observacoes else obs

        c.insert()

        if self.get("turma"):
            turma = frappe.get_doc("Turma", self.turma)
            turma.append("lista_catecumenos", {
                "catecumeno": nome,
                "idade": self.get("idade"),
                "encarregado": self.get("encarregado"),
                "contacto": self.get("contacto"),
                "fase": self.get("fase"),
                "turma": self.turma,
                "data_de_nascimento": self.get("data_de_nascimento"),
                "sexo": self.get("sexo"),
                "estado": "Activo",
            })
            turma.save()
            frappe.msgprint(f"Catecúmeno '{nome}' criado e adicionado à turma '{self.turma}'.")
        else:
            frappe.msgprint(
                f"Pré-inscrição: Catecúmeno '{nome}' criado com status 'Pendente'. Aguarda alocação de turma."
            )

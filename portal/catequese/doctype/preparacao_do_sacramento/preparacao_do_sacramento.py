from urllib.parse import quote

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, get_datetime, get_url, now_datetime

FASE_APOS_BAPTISMO = "1º Ano de Aprofundamento"


class PreparacaodoSacramento(Document):
    # ── Link para encarregados ────────────────────────────────────────────────

    @frappe.whitelist()
    def gerar_link_encarregados(self, expira_em=None, dias=7, permite_editar=1):
        """Gera um link novo (o anterior deixa de funcionar) válido até `expira_em`."""
        self.check_permission("write")
        expira = get_datetime(expira_em) if expira_em else add_to_date(now_datetime(), days=int(dias))
        if expira <= now_datetime():
            frappe.throw(_("A data de validade tem de ser no futuro."))

        token = frappe.generate_hash(length=32)
        url = get_url(f"/portal/sacramento/?nome={quote(self.name)}&t={token}")
        self.db_set({
            "link_token": token,
            "link_expira_em": expira,
            "link_permite_editar": 1 if int(permite_editar) else 0,
            "link_url": url,
        }, update_modified=False)
        self.add_comment("Info", _("Link para encarregados gerado, válido até {0}.").format(
            frappe.format(expira, {"fieldtype": "Datetime"})))
        return url

    @frappe.whitelist()
    def revogar_link_encarregados(self):
        self.check_permission("write")
        self.db_set({"link_token": None, "link_expira_em": None, "link_url": None}, update_modified=False)
        self.add_comment("Info", _("Link para encarregados revogado."))
    def on_submit(self):
        # (eram os Server Scripts "PS Baptismo Script", "PS Eucaristia Script" e "Finalize Crisma")
        if self.sacramento == "Baptismo":
            self._finalizar_baptismo()
        elif self.sacramento == "Eucaristia":
            self._finalizar_eucaristia()
        elif self.sacramento == "Crisma":
            self._finalizar_crisma()

    # ── Baptismo ──────────────────────────────────────────────────────────────

    def _finalizar_baptismo(self):
        """Move os baptizados (e os já baptizados da mesma turma) para novas turmas
        da fase seguinte e regista cada um no Livro de Baptismo."""
        nova_fase = FASE_APOS_BAPTISMO

        por_turma = {}
        for row in self.candidatos_sacramento_table:
            if row.catecumeno and row.turma:
                por_turma.setdefault(row.turma, []).append(row)

        for turma_antiga_nome, candidatos in por_turma.items():
            turma_antiga = frappe.get_doc("Turma", turma_antiga_nome)
            ids = [r.catecumeno for r in candidatos]

            # Já baptizados na turma antiga mas não listados na preparação
            adicionais = frappe.get_all(
                "Catecumeno",
                filters={"turma": turma_antiga_nome, "baptismo": 1, "name": ["not in", ids]},
                fields=["name", "idade", "contacto", "encarregado", "sexo"],
            )

            nova_turma = frappe.new_doc("Turma")
            nova_turma.ano_lectivo = self.ano_lectivo
            nova_turma.fase = nova_fase
            nova_turma.catequista = turma_antiga.catequista
            nova_turma.catequista_adj = turma_antiga.catequista_adj
            nova_turma.catequistas = turma_antiga.catequistas
            nova_turma.local = turma_antiga.local
            nova_turma.dia = turma_antiga.dia
            nova_turma.hora = turma_antiga.hora
            nova_turma.status = "Activo"
            nova_turma.insert()

            for row in candidatos:
                nova_turma.append("lista_catecumenos", {
                    "catecumeno": row.catecumeno,
                    "idade": row.idade,
                    "contacto": row.contacto_encarregado,
                    "encarregado": row.encarregado,
                    "sexo": row.sexo,
                    "fase": nova_fase,
                    "turma": nova_turma.name,
                })
                frappe.db.set_value("Catecumeno", row.catecumeno, {
                    "fase": nova_fase,
                    "turma": nova_turma.name,
                    "baptismo": 1,
                    "data_do_baptismo": self.data_do_sacramento,
                    "encarregado": row.encarregado,
                    "contacto": row.contacto_encarregado,
                    "sexo": row.sexo,
                    "padrinhos": row.padrinhos,
                    "contacto_padrinhos": row.contacto_padrinhos,
                })

                livro = frappe.new_doc("Livro de Baptismo")
                livro.nome_completo = row.catecumeno
                livro.data_de_nascimento = frappe.db.get_value("Catecumeno", row.catecumeno, "data_de_nascimento")
                livro.data_do_baptismo = self.data_do_sacramento
                livro.encarregado = row.encarregado
                livro.contacto = row.contacto_encarregado
                livro.padrinhos = row.padrinhos
                livro.contacto_padrinhos = row.contacto_padrinhos
                livro.ano = self.ano_lectivo
                livro.sacerdote = row.sacerdote
                livro.insert()

            for c in adicionais:
                nova_turma.append("lista_catecumenos", {
                    "catecumeno": c.name,
                    "idade": c.idade,
                    "contacto": c.contacto,
                    "fase": nova_fase,
                    "turma": nova_turma.name,
                })
                frappe.db.set_value("Catecumeno", c.name, {"fase": nova_fase, "turma": nova_turma.name})

            nova_turma.save()

            movidos = ids + [c.name for c in adicionais]
            turma_antiga.lista_catecumenos = [
                r for r in turma_antiga.lista_catecumenos if r.catecumeno not in movidos
            ]
            turma_antiga.db_set("status", "Inactivo" if not turma_antiga.lista_catecumenos else "Activo")
            turma_antiga.save()

        frappe.msgprint(f"Transição concluída: catecúmenos movidos para novas turmas ({nova_fase}).")

    # ── Eucaristia ────────────────────────────────────────────────────────────

    def _finalizar_eucaristia(self):
        rows = [r for r in self.candidatos_sacramento_table if r.catecumeno]
        for row in rows:
            frappe.db.set_value("Catecumeno", row.catecumeno, {
                "eucaristia": 1,
                "data_da_eucaristia": self.data_do_sacramento,
            })
        frappe.msgprint(
            f"Concluído: {len(rows)} catecúmeno(s) receberam a Eucaristia em {self.data_do_sacramento}."
        )

    # ── Crisma ────────────────────────────────────────────────────────────────

    def _finalizar_crisma(self):
        """Marca os crismados como finalizados e cria-lhes um registo de Fiel."""
        rows = [r for r in self.candidatos_sacramento_table if r.catecumeno]
        criados = ja_existiam = 0

        for row in rows:
            # Quem chega ao Crisma tem Baptismo e Eucaristia (sem mexer nas datas)
            frappe.db.set_value("Catecumeno", row.catecumeno, {
                "status": "Crismado",
                "fase": "",
                "turma": "",
                "baptismo": 1,
                "eucaristia": 1,
                "crisma": 1,
                "data_do_crisma": self.data_do_sacramento,
            })

            c = frappe.get_doc("Catecumeno", row.catecumeno)
            if frappe.db.exists("Fiel", {"nome_completo": c.nome_completo}):
                ja_existiam += 1
                continue

            f = frappe.new_doc("Fiel")
            f.nome_completo = c.nome_completo
            f.data_de_nascimento = c.data_de_nascimento
            f.idade = c.idade
            f.sexo = c.sexo
            f.comunidade = c.comunidade
            f.residencia = c.residencia
            f.baptismo = c.baptismo
            f.data_do_baptismo = c.data_do_baptismo
            f.eucaristia = c.eucaristia
            f.data_da_eucaristia = c.data_da_eucaristia
            f.crisma = c.crisma
            f.data_do_crisma = c.data_do_crisma
            f.insert(ignore_permissions=True)
            criados += 1

        frappe.msgprint(
            "Crisma concluído:\n"
            f"- Catecúmenos actualizados: {len(rows)}\n"
            f"- Fiéis criados: {criados}\n"
            f"- Fiéis já existentes (ignorado): {ja_existiam}"
        )

import unicodedata
from urllib.parse import quote

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, get_datetime, get_url, now_datetime

from portal.catequese import livros, sincronizacao
from portal.catequese.utils import definicao, nome_com_serie, valores_sacramento

NAO_RECEBE = "Não vai receber"
EXTRAORDINARIO = "Extraordinário"


def nao_recebe(row):
    return (row.get("situacao") or "") == NAO_RECEBE


def nome_candidato(row):
    """Nome a mostrar: o catecúmeno ou, nas preparações extraordinárias, o nome escrito."""
    return row.get("catecumeno") or row.get("nome_completo") or ""


def _sem_acentos(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()


class PreparacaodoSacramento(Document):
    def autoname(self):
        # Baptismo-26-01, Baptismo-26-02 (2ª oportunidade)… — as antigas mantêm o nome que tinham.
        # Extraordinárias levam o tipo no nome, para se encontrarem: Baptismo-Casamento-26-01
        prefixo = self.sacramento
        if self.e_extraordinaria():
            prefixo += "-" + _sem_acentos(self.tipo_extraordinario or "Extra")
        self.name = nome_com_serie(prefixo, self.ano_lectivo)

    def e_extraordinaria(self):
        return self.tipo == EXTRAORDINARIO

    def vao_receber(self):
        """Candidatos que recebem o sacramento (quem não vai receber fica na lista, com o motivo).
        Nas extraordinárias, as pessoas podem não ser catecúmenos (só nome)."""
        extra = self.e_extraordinaria()
        return [r for r in self.candidatos_sacramento_table
                if (r.catecumeno or (extra and r.nome_completo)) and not nao_recebe(r)]

    def validate(self):
        extra = self.e_extraordinaria()
        if extra:
            if not self.tipo_extraordinario:
                frappe.throw(_("Indique os candidatos da preparação extraordinária (bebé, casamento, adulto ou outro)."))
            self.turma_destino = None
        else:
            self.tipo_extraordinario = None
        for r in self.candidatos_sacramento_table:
            if r.catecumeno:
                r.nome_completo = r.catecumeno
            elif extra and not (r.nome_completo or "").strip():
                frappe.throw(_("Linha {0}: indique o nome da pessoa.").format(r.idx))
            if not r.situacao:
                r.situacao = "Vai receber"
            if nao_recebe(r):
                if not r.motivo_nao_recebe:
                    frappe.throw(_("Linha {0} ({1}): indique o motivo por que não vai receber.").format(
                        r.idx, nome_candidato(r)))
            else:
                r.motivo_nao_recebe = None
                r.detalhe_situacao = None
        # Dados dos candidatos ↔ Catecúmeno (e daí turma e outras preparações) — ver catequese/sincronizacao.py
        sincronizacao.preparacao_validate(self)

    def on_update(self):
        sincronizacao.preparacao_on_update(self)

    def before_insert(self):
        # Valores por omissão do sacramento (só os que não foram preenchidos)
        for campo, valor in valores_sacramento(self.sacramento).items():
            if not self.get(campo):
                self.set(campo, valor)

    # ── Link para encarregados ────────────────────────────────────────────────

    @frappe.whitelist()
    def gerar_link_encarregados(self, expira_em=None, dias=None, permite_editar=None):
        """Gera um link novo (o anterior deixa de funcionar) válido até `expira_em`."""
        self.check_permission("write")
        if permite_editar is None:
            permite_editar = definicao("link_permite_editar")
        dias = int(dias or definicao("link_validade_dias"))
        expira = get_datetime(expira_em) if expira_em else add_to_date(now_datetime(), days=dias)
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

    def before_submit(self):
        # A data do sacramento é a de cada candidato (coluna Data) ou, se vazia, a da Preparação
        sem_data = [nome_candidato(r) for r in self.vao_receber() if not self._data(r)]
        if sem_data:
            frappe.throw(_("Defina a Data do Sacramento (ou a data de cada candidato). Sem data: {0}").format(
                ", ".join(sem_data[:10]) + ("…" if len(sem_data) > 10 else "")))

    def on_submit(self):
        # (eram os Server Scripts "PS Baptismo Script", "PS Eucaristia Script" e "Finalize Crisma")
        # Só quem "Vai receber"; os outros ficam na lista e aparecem na página Sacramentos.
        if self.e_extraordinaria():
            self._finalizar_extraordinaria()
        elif self.sacramento == "Baptismo":
            self._finalizar_baptismo()
        elif self.sacramento == "Eucaristia":
            self._finalizar_eucaristia()
        elif self.sacramento == "Crisma":
            self._finalizar_crisma()

        falharam = [r for r in self.candidatos_sacramento_table if nome_candidato(r) and nao_recebe(r)]
        if falharam:
            self.add_comment("Info", _("Não receberam o sacramento ({0}): {1}").format(
                len(falharam), ", ".join(f"{nome_candidato(r)} ({r.motivo_nao_recebe})" for r in falharam)))

    def _data(self, row):
        return row.date or self.data_do_sacramento

    def _receptores(self):
        """(linha, catecúmeno actual) de quem vai receber e existe."""
        out = []
        for row in self.vao_receber():
            c = frappe.db.get_value("Catecumeno", row.catecumeno,
                                    ["name", "turma", "fase", "baptismo", "status"], as_dict=True)
            if c:
                out.append((row, c))
        return out

    # ── Baptismo ──────────────────────────────────────────────────────────────

    def _finalizar_baptismo(self):
        """Marca os baptizados, regista-os no Livro de Baptismo e passa-os para a fase seguinte:
        quem tem turma vai, com os colegas já baptizados, para uma turma nova da fase seguinte;
        quem não tem turma (ex.: Santa Ana) só muda de fase.
        Quem já está na fase seguinte (ex.: preparação emendada) não é movido outra vez."""
        if self.tipo == "2ª oportunidade":
            return self._baptismo_segunda_oportunidade()

        nova_fase = definicao("fase_apos_baptismo")

        por_turma = {}
        for row, c in self._receptores():
            frappe.db.set_value("Catecumeno", row.catecumeno, {
                "baptismo": 1,
                "data_do_baptismo": self._data(row),
                "encarregado": row.encarregado,
                "contacto": row.contacto_encarregado,
                "sexo": row.sexo,
                "padrinhos": row.padrinhos,
                "contacto_padrinhos": row.contacto_padrinhos,
            })
            self._registar_livro(row)

            if c.fase == nova_fase:
                continue
            if c.turma and frappe.db.exists("Turma", c.turma):
                por_turma.setdefault(c.turma, []).append(row)
            else:
                frappe.db.set_value("Catecumeno", row.catecumeno, "fase", nova_fase)

        for turma_antiga_nome, candidatos in por_turma.items():
            turma_antiga = frappe.get_doc("Turma", turma_antiga_nome)
            ids = [r.catecumeno for r in candidatos]

            # Colegas já baptizados (e activos) na turma antiga que não estavam na preparação
            adicionais = frappe.get_all(
                "Catecumeno",
                filters={"turma": turma_antiga_nome, "baptismo": 1, "name": ["not in", ids],
                         "status": ["in", ["Activo", "Pendente"]]},
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
            for c in adicionais:
                nova_turma.append("lista_catecumenos", {
                    "catecumeno": c.name,
                    "idade": c.idade,
                    "contacto": c.contacto,
                    "encarregado": c.encarregado,
                    "sexo": c.sexo,
                    "fase": nova_fase,
                    "turma": nova_turma.name,
                })
            nova_turma.save()

            movidos = ids + [c.name for c in adicionais]
            for nome in movidos:
                frappe.db.set_value("Catecumeno", nome, {"fase": nova_fase, "turma": nova_turma.name})

            turma_antiga.lista_catecumenos = [
                r for r in turma_antiga.lista_catecumenos if r.catecumeno not in movidos
            ]
            turma_antiga.status = "Activo" if turma_antiga.lista_catecumenos else "Inactivo"
            turma_antiga.save()

        frappe.msgprint(f"Transição concluída: baptizados registados no Livro e passados para {nova_fase}.")

    def _baptismo_segunda_oportunidade(self):
        """2ª oportunidade: baptiza e regista no Livro, sem criar turmas novas. Se houver Turma de
        destino, passam para lá (sai da turma antiga); senão ficam onde estão."""
        destino = frappe.get_doc("Turma", self.turma_destino) if self.turma_destino else None
        movidos = []
        for row, c in self._receptores():
            frappe.db.set_value("Catecumeno", row.catecumeno, {
                "baptismo": 1,
                "data_do_baptismo": self._data(row),
                "padrinhos": row.padrinhos,
                "contacto_padrinhos": row.contacto_padrinhos,
            })
            self._registar_livro(row)
            if not destino or c.turma == destino.name:
                continue
            if c.turma and frappe.db.exists("Turma", c.turma):
                antiga = frappe.get_doc("Turma", c.turma)
                antiga.lista_catecumenos = [r for r in antiga.lista_catecumenos if r.catecumeno != row.catecumeno]
                if not antiga.lista_catecumenos:
                    antiga.status = "Inactivo"
                antiga.save()
            if not any(r.catecumeno == row.catecumeno for r in destino.lista_catecumenos):
                destino.append("lista_catecumenos", {"catecumeno": row.catecumeno, "estado": "Activo",
                                                     "fase": destino.fase, "turma": destino.name})
            frappe.db.set_value("Catecumeno", row.catecumeno, {"turma": destino.name, "fase": destino.fase})
            movidos.append(row.catecumeno)
        if movidos:
            destino.save()
        frappe.msgprint(
            f"2ª oportunidade concluída: baptizados registados no Livro."
            + (f" {len(movidos)} passaram para a turma {destino.name}." if movidos else
               " Continuam nas turmas actuais (sem Turma de destino)." if not destino else ""))

    def _registar_livro(self, row):
        # Um registo por pessoa em cada livro: se já existe (registo manual ou emenda), não duplica
        if self.e_extraordinaria():
            origem = livros.ORIGEM_EXTRA
        elif self.tipo == "2ª oportunidade":
            origem = livros.ORIGEM_SEGUNDA
        else:
            origem = livros.ORIGEM_CATEQUESE
        livros.registar(
            self.sacramento, row.catecumeno, data=self._data(row), origem=origem,
            tipo_extraordinario=self.tipo_extraordinario, nome_completo=row.nome_completo,
            ano=self.ano_lectivo, preparacao=self.name, sacerdote=row.sacerdote, comunidade=row.comunidade,
            data_de_nascimento=row.data_de_nascimento, sexo=row.sexo, encarregado=row.encarregado,
            contacto=row.contacto_encarregado, padrinhos=row.padrinhos, contacto_padrinhos=row.contacto_padrinhos,
        )

    # ── Extraordinária (bebés, casamento colectivo, adultos) ──────────────────

    def _finalizar_extraordinaria(self):
        """Só regista no livro: não há turmas nem fases. Se alguém for catecúmeno, o registo
        no livro marca-lhe o sacramento."""
        cfg = livros.livro(self.sacramento)
        receptores = self.vao_receber()
        for row in receptores:
            self._registar_livro(row)
        frappe.msgprint(_("Concluído: {0} pessoa(s) registada(s) no {1}.").format(
            len(receptores), _(cfg.doctype)) if cfg else _("Concluído (este sacramento não tem livro)."))

    # ── Eucaristia ────────────────────────────────────────────────────────────

    def _finalizar_eucaristia(self):
        receptores = self._receptores()
        for row, c in receptores:
            valores = {"eucaristia": 1, "data_da_eucaristia": self._data(row)}
            if not c.baptismo:
                valores["baptismo"] = 1   # quem comunga é baptizado (a data fica por preencher)
            frappe.db.set_value("Catecumeno", row.catecumeno, valores)
            self._registar_livro(row)
        frappe.msgprint(f"Concluído: {len(receptores)} catecúmeno(s) receberam a Eucaristia (registados no Livro de Primeira Comunhão).")

    # ── Crisma ────────────────────────────────────────────────────────────────

    def _finalizar_crisma(self):
        """Marca os crismados como finalizados (saem da turma, que fica no histórico como Inativo),
        regista-os no Livro de Crisma e cria-lhes um registo de Fiel."""
        receptores = self._receptores()
        criados = ja_existiam = 0
        turmas = {}

        for row, c in receptores:
            if c.turma:
                turmas.setdefault(c.turma, set()).add(row.catecumeno)
            # Quem chega ao Crisma tem Baptismo e Eucaristia (sem mexer nas datas)
            frappe.db.set_value("Catecumeno", row.catecumeno, {
                "status": "Crismado",
                "fase": "",
                "turma": "",
                "baptismo": 1,
                "eucaristia": 1,
                "crisma": 1,
                "data_do_crisma": self._data(row),
            })
            self._registar_livro(row)

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

        # Na lista da turma, os crismados ficam como "Inativo"; a turma fecha quando não resta ninguém activo
        for nome_turma, crismados in turmas.items():
            if not frappe.db.exists("Turma", nome_turma):
                continue
            t = frappe.get_doc("Turma", nome_turma)
            for r in t.lista_catecumenos:
                if r.catecumeno in crismados:
                    r.estado = "Inativo"
            if not any(r.estado in ("Activo", "Pendente") for r in t.lista_catecumenos):
                t.status = "Inactivo"
            t.save()

        frappe.msgprint(
            "Crisma concluído:\n"
            f"- Catecúmenos actualizados: {len(receptores)}\n"
            f"- Fiéis criados: {criados}\n"
            f"- Fiéis já existentes (ignorado): {ja_existiam}"
        )

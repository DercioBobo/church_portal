import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, now_datetime

from portal.catequese.utils import definicao
from portal.catequista.relatorio_anual import dados, gerar

# (chave, indicador) — linhas fixas da tabela de estatística
INDICADORES = [
    ("catequizandos", "Catequizandos"),
    ("baptismo", "Baptismos (catecúmenos)"),
    ("baptismo_criancas", "Baptismos (crianças)"),   # manual — não há registo no sistema
    ("eucaristia", "Eucaristia"),
    ("crisma", "Crisma"),
    ("profissao_fe", "Profissão de Fé"),
    ("reconciliacao", "Reconciliação"),
]


class RelatorioAnual(Document):
    def before_insert(self):
        for campo in ("paroquia", "comunidades", "ministerio", "local"):
            if not self.get(campo):
                self.set(campo, definicao(campo))
        self._actualizar()

    def validate(self):
        for r in self.estatistica:
            r.total = (r.sede or 0) + (r.santa_ana or 0)

    # ── Acções do formulário ──────────────────────────────────────────────────

    @frappe.whitelist()
    def actualizar_dados(self):
        self._actualizar()
        self.save()
        return self.data_actualizacao

    @frappe.whitelist()
    def gerar_documento(self):
        return gerar.gerar(self)

    @frappe.whitelist()
    def importar_propostas(self):
        anterior = str(dados.ano_int(self.ano_lectivo) - 1)
        nome = frappe.db.get_value("Relatorio Anual", {"ano_lectivo": anterior}, "name")
        if not nome:
            frappe.throw(_("Não existe Relatório Anual de {0}.").format(anterior))
        propostas = frappe.db.get_value("Relatorio Anual", nome, "propostas") or ""
        existentes = set(gerar.linhas(self.propostas))
        novas = [l for l in gerar.linhas(propostas) if l not in existentes]
        if novas:
            self.propostas = "\n".join(gerar.linhas(self.propostas) + novas)
            self.save()
        return len(novas)

    # ── Recolha de dados ──────────────────────────────────────────────────────

    def _actualizar(self):
        ano = self.ano_lectivo

        acts = dados.resumo_actividades(ano)
        self.taxa_realizacao = acts["taxa"]
        self.resumo_actividades = acts["resumo"]
        self.nao_realizadas = acts["nao_realizadas"]
        self.resumo_retiros = dados.resumo_retiros(ano)
        self._juntar_meses(acts["itens"] + dados.itens_sacramentos(ano))

        cq = dados.catequistas(ano)
        self.catequistas_activos = cq["activos"]
        self.catequistas_desistencias = cq["desistencias"]
        self.catequistas_sem_data = cq["inactivos_sem_data"]

        cz = dados.catequizandos(ano)
        self.catequizandos_inscritos = cz["inscritos"]
        self.catequizandos_turmas = cz["turmas"]
        self.catequizandos_desistencias = cz["desistencias"]
        self.catequizandos_transferencias = cz["transferencias"]
        self.catequizandos_trocas = cz["trocas"]
        self.catequizandos_media_faltas = cz["media_faltas"]

        self._actualizar_estatistica(cz)
        self.data_actualizacao = now_datetime()

    def _juntar_meses(self, itens):
        """
        Junta as linhas automáticas às existentes:
          - linhas já presentes (mesma referência) mantêm o texto e "Incluir" editados;
          - linhas novas são acrescentadas;
          - linhas automáticas que deixaram de existir são removidas;
          - linhas manuais nunca são tocadas.
        """
        existentes = {r.referencia: r for r in self.meses if r.origem != "Manual" and r.referencia}
        linhas = [r.as_dict() for r in self.meses if r.origem == "Manual" or not r.referencia]
        for it in itens:
            antiga = existentes.get(it["referencia"])
            if antiga:
                linha = antiga.as_dict()
                linha.update({"mes": it["mes"], "data": it["data"]})
            else:
                linha = dict(it, incluir=1)
            linhas.append(linha)

        def ordem(l):
            mes = dados.MESES.index(l.get("mes")) if l.get("mes") in dados.MESES else 99
            return (mes, getdate(l["data"]) if l.get("data") else getdate("2999-12-31"))

        self.set("meses", [])
        for l in sorted(linhas, key=ordem):
            for k in ("name", "idx", "parent", "parentfield", "parenttype", "doctype"):
                l.pop(k, None)
            self.append("meses", l)

    def _actualizar_estatistica(self, cz):
        ano = self.ano_lectivo
        anterior = str(dados.ano_int(ano) - 1)

        auto = {
            "catequizandos": {"sede": cz["inscritos"], "santa_ana": 0, "detalhe": ""},
            "baptismo": dados.baptismos(ano),
            "eucaristia": dados.sacramento_simples(ano, "Eucaristia"),
            "crisma": dados.sacramento_simples(ano, "Crisma"),
        }
        ant = self._valores_ano_anterior(anterior)

        linhas = {r.chave: r for r in self.estatistica if r.chave}
        for chave, indicador in INDICADORES:
            if chave not in linhas:
                linhas[chave] = self.append("estatistica", {"chave": chave, "indicador": indicador})

        # Ordem fixa dos indicadores; linhas acrescentadas à mão ficam no fim
        ordem = [c for c, _ in INDICADORES]
        self.estatistica.sort(key=lambda r: ordem.index(r.chave) if r.chave in ordem else len(ordem))
        for i, r in enumerate(self.estatistica, 1):
            r.idx = i

        for chave, r in linhas.items():
            r.ano_anterior = ant.get(chave) or 0
            a = auto.get(chave)
            if not a or r.manual:
                continue
            r.sede = a["sede"]
            if a["santa_ana"]:
                r.santa_ana = a["santa_ana"]
            if a["detalhe"]:
                r.detalhe = a["detalhe"]
            r.total = (r.sede or 0) + (r.santa_ana or 0)

    def _valores_ano_anterior(self, anterior):
        """Sede do ano anterior: do relatório desse ano, se existir; senão calculado."""
        nome = frappe.db.get_value("Relatorio Anual", {"ano_lectivo": anterior}, "name")
        if nome:
            return dict(frappe.get_all(
                "Relatorio Anual Estatistica",
                filters={"parent": nome, "parenttype": "Relatorio Anual"},
                fields=["chave", "sede"], as_list=True,
            ))
        if not frappe.db.exists("Ano Lectivo", anterior):
            return {}
        return {
            "catequizandos": dados.catequizandos(anterior)["inscritos"],
            "baptismo": dados.baptismos(anterior)["sede"],
            "eucaristia": dados.sacramento_simples(anterior, "Eucaristia")["sede"],
            "crisma": dados.sacramento_simples(anterior, "Crisma")["sede"],
        }

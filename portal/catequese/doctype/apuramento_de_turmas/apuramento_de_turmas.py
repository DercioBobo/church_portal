"""
Apuramento de Turmas: fecha as turmas de uma fase e cria as do ano seguinte.

Há um só caminho que altera dados: SUBMETER o documento (o botão "Criar Novas Turmas" submete).
As regras são as mesmas da pré-visualização (apuramento_turmas.preview_distribuicao):
- Transitam → turmas novas na Fase Seguinte (Redistribuir equilibrado ou Manter Estrutura).
- Permanecem → na fase "Permanece" (ou a actual): "Adicionar às Turmas Existentes" do ano seguinte
  (a mais pequena primeiro) ou, se não houver nenhuma / se escolhido, turmas novas.
- Desistentes → Catecúmeno Inactivo, linha "Inativo" na turma antiga, sem turma nova.
- As turmas apuradas passam a Inactivo.
CANCELAR desfaz tudo (ver on_cancel).
"""

import frappe
from frappe.model.document import Document

from portal.catequese.utils import tamanhos_turma

TABELA_TURMA = "lista_catecumenos"
ESTADOS_FORA = ("inactivo", "inativo", "desistente")
RESULTADOS = ("Transita", "Permanece", "Desistente")
ADICIONAR_EXISTENTES = "Adicionar às Turmas Existentes"


class ApuramentodeTurmas(Document):
    def before_validate(self):
        minimo, ideal, maximo = tamanhos_turma()
        self.tamanho_minimo = self.tamanho_minimo or minimo
        self.tamanho_ideal = self.tamanho_ideal or ideal
        self.tamanho_maximo = self.tamanho_maximo or maximo

    def before_submit(self):
        # (era o Server Script "Apuramento Script")
        self._validar()
        self._processar()

    def on_cancel(self):
        self._desfazer()

    # ── Validações ────────────────────────────────────────────────────────────

    def _validar(self):
        if not self.ano_lectivo_seguinte:
            frappe.throw("Preencha o Ano Lectivo Seguinte.")
        if not self.fase_actual:
            frappe.throw("Preencha a Fase Actual.")
        if not self.fase_seguinte:
            # fase_seguinte é preenchida a partir da Fase (campo "Fase Seguinte")
            frappe.throw(
                f"A fase {self.fase_actual} não tem \"Fase Seguinte\" configurada. "
                "Abra a Fase e preencha o campo \"Fase Seguinte\" antes de submeter o apuramento."
            )
        if not self.ano_lectivo_actual:
            frappe.throw("Preencha o Ano Lectivo Actual.")

        try:
            if int(self.ano_lectivo_seguinte) <= int(self.ano_lectivo_actual):
                frappe.throw(
                    f"O Ano Lectivo Seguinte ({self.ano_lectivo_seguinte}) deve ser maior que "
                    f"o Ano Lectivo Actual ({self.ano_lectivo_actual})."
                )
        except ValueError:
            pass
        if not frappe.db.exists("Ano Lectivo", self.ano_lectivo_seguinte):
            frappe.throw(f"O Ano Lectivo {self.ano_lectivo_seguinte} ainda não existe. "
                         "Crie-o (página Abrir/Encerrar Ano) antes de submeter o apuramento.")

        itens = self.get("apuramento_item") or []
        if not itens:
            frappe.throw("Adicione catecúmenos à tabela de apuramento.")

        turmas = self._turmas_incluidas()
        if not turmas:
            frappe.throw("Selecione pelo menos uma turma para processar.")

        inactivas = [t for t in turmas if frappe.db.get_value("Turma", t, "status") != "Activo"]
        if inactivas:
            frappe.throw("As seguintes turmas já não estão activas e não podem ser apuradas: " + ", ".join(inactivas))

        ja_apuradas = frappe.db.sql("""
            SELECT DISTINCT apt.turma, ap.name
            FROM `tabApuramento Turmas Table` apt
            INNER JOIN `tabApuramento de Turmas` ap ON apt.parent = ap.name
            WHERE ap.docstatus = 1 AND ap.name != %s AND apt.turma IN %s AND apt.incluir = 1
        """, (self.name, turmas), as_dict=True)
        if ja_apuradas:
            frappe.throw("As seguintes turmas já foram apuradas noutro documento: "
                         + ", ".join(f"{a.turma} (em {a.name})" for a in ja_apuradas))

        sem_resultado = [i.get("catecumeno") for i in itens
                         if (i.get("resultado") or "").strip() not in RESULTADOS]
        if sem_resultado:
            if len(sem_resultado) <= 5:
                frappe.throw("Os seguintes catecúmenos não têm resultado definido: " + ", ".join(sem_resultado))
            frappe.throw(f"Existem {len(sem_resultado)} catecúmenos sem resultado definido. "
                         "Defina Transita, Permanece ou Desistente para todos.")

        lista = [i.get("catecumeno") for i in itens if i.get("catecumeno")]
        vistos, duplicados = set(), []
        for c in lista:
            if c in vistos and c not in duplicados:
                duplicados.append(c)
            vistos.add(c)
        if duplicados:
            frappe.throw("Os seguintes catecúmenos aparecem mais de uma vez na lista: " + ", ".join(duplicados[:5]))

        ja_apurados = frappe.db.sql("""
            SELECT DISTINCT ai.catecumeno, ap.name
            FROM `tabApuramento Item` ai
            INNER JOIN `tabApuramento de Turmas` ap ON ai.parent = ap.name
            WHERE ap.docstatus = 1 AND ap.name != %s AND ap.ano_lectivo_actual = %s AND ai.catecumeno IN %s
        """, (self.name, self.ano_lectivo_actual, lista), as_dict=True)
        if ja_apurados:
            msg = ("Os seguintes catecúmenos já foram apurados noutro documento deste ano lectivo: "
                   + ", ".join(f"{a.catecumeno} (em {a.name})" for a in ja_apurados[:5]))
            if len(ja_apurados) > 5:
                msg += f" e mais {len(ja_apurados) - 5} outros."
            frappe.throw(msg)

        # Catecúmenos que entretanto saíram (transferidos, inactivados, crismados) não vão para turma nova
        saidos = frappe.get_all("Catecumeno", filters={
            "name": ["in", lista], "status": ["in", ["Transferido", "Inactivo", "Inativo", "Crismado"]],
        }, fields=["name", "status"])
        saidos = [s for s in saidos
                  if next((i.resultado for i in itens if i.catecumeno == s.name), "") != "Desistente"]
        if saidos:
            frappe.throw("Estes catecúmenos já não estão activos e não podem transitar/permanecer "
                         "(marque-os Desistente ou retire-os da lista): "
                         + ", ".join(f"{s.name} ({s.status})" for s in saidos[:10]))

    def _turmas_incluidas(self):
        return [t.get("turma") for t in (self.get("apuramento_turmas") or []) if t.get("incluir") and t.get("turma")]

    # ── Processamento ─────────────────────────────────────────────────────────

    def _processar(self):
        padrao = tamanhos_turma()
        tam = (self.tamanho_minimo or padrao[0], self.tamanho_ideal or padrao[1], self.tamanho_maximo or padrao[2])
        fase_permanece = self.fase_seguinte_permanece or self.fase_actual
        manter = self.get("tipo_distribuicao") == "Manter Estrutura"

        transitam, permanecem, desistentes = [], [], []
        for item in self.get("apuramento_item") or []:
            if (item.get("status") or "").lower() in ESTADOS_FORA:
                continue
            resultado = (item.get("resultado") or "").strip()
            if resultado == "Desistente":
                desistentes.append(item)
                continue
            dados = {
                "catecumeno": item.get("catecumeno"),
                "encarregado": item.get("encarregado"),
                "contacto": item.get("contacto"),
                "data_de_nascimento": item.get("data_de_nascimento"),
                "idade": item.get("idade"),
                "sexo": item.get("sexo"),
                "estado": item.get("status") or "Activo",
                "turma_origem": item.get("turma_nome"),
            }
            (transitam if resultado == "Transita" else permanecem).append(dados)

        novas = []

        # Transitam: sempre turmas novas na fase seguinte
        for grupo in _agrupar(transitam, manter, tam):
            novas.append(self._criar_turma(grupo, self.fase_seguinte, forcar_activo=True))

        # Permanecem: turmas existentes do ano seguinte (se escolhido e houver) ou turmas novas
        existentes = []
        if permanecem and self.get("destino_repetentes") == ADICIONAR_EXISTENTES:
            existentes = frappe.get_all("Turma", filters={
                "ano_lectivo": self.ano_lectivo_seguinte, "fase": fase_permanece, "status": "Activo",
            }, pluck="name", order_by="name asc")
        if existentes:
            novas.extend(self._adicionar_a_existentes(permanecem, existentes, fase_permanece))
        else:
            for grupo in _agrupar(permanecem, manter, tam):
                novas.append(self._criar_turma(grupo, fase_permanece, forcar_activo=False))

        for tc in novas:
            self.append("apuramento_novas_turmas", tc)

        # Desistentes: ficam Inactivos (e "Inativo" na lista da turma antiga); não vão para turma nova
        for item in desistentes:
            frappe.db.set_value("Catecumeno", item.get("catecumeno"), "status", "Inactivo")
            if item.get("turma_nome"):
                _estado_na_turma(item.get("turma_nome"), item.get("catecumeno"), "Inativo")

        for t in self._turmas_incluidas():
            frappe.db.set_value("Turma", t, "status", "Inactivo")

        msg = f"Apuramento concluído! {len(novas)} turma(s) criada(s)/actualizada(s)."
        if desistentes:
            msg += f" {len(desistentes)} desistente(s) ficaram inactivos."
        frappe.msgprint(msg)

    def _criar_turma(self, grupo, fase, forcar_activo):
        turma = frappe.new_doc("Turma")
        turma.ano_lectivo = self.ano_lectivo_seguinte
        turma.fase = fase
        turma.status = "Activo"
        turma.insert(ignore_permissions=True)

        for cat in sorted(grupo["catecumenos"], key=lambda x: x.get("catecumeno") or ""):
            self._colocar(turma, cat, fase, "Activo" if forcar_activo else cat["estado"])
        turma.save(ignore_permissions=True)

        return {
            "turma": turma.name,
            "total_catecumenos": len(grupo["catecumenos"]),
            "turmas_origem": ", ".join(sorted(grupo["origens"])),
            "incluir": 1,   # 1 = criada por este apuramento (o cancelamento apaga-a)
        }

    def _adicionar_a_existentes(self, permanecem, turmas, fase):
        """Repetentes nas turmas existentes do ano seguinte, sempre na que tiver menos catecúmenos."""
        docs = {n: frappe.get_doc("Turma", n) for n in turmas}
        totais = {n: sum(1 for r in d.get(TABELA_TURMA) if (r.estado or "").lower() not in ESTADOS_FORA)
                  for n, d in docs.items()}
        novos = {n: [] for n in turmas}
        for cat in sorted(permanecem, key=lambda x: x.get("catecumeno") or ""):
            alvo = min(turmas, key=lambda n: (totais[n] + len(novos[n]), n))
            novos[alvo].append(cat)

        resultado = []
        for nome, cats in novos.items():
            if not cats:
                continue
            for cat in cats:
                self._colocar(docs[nome], cat, fase, cat["estado"], observacoes="Repetente")
            docs[nome].save(ignore_permissions=True)
            resultado.append({
                "turma": nome,
                "total_catecumenos": len(cats),
                "turmas_origem": f"Repetentes: +{len(cats)} adicionados ("
                                 + ", ".join(sorted({c['turma_origem'] for c in cats if c.get('turma_origem')})) + ")",
                "incluir": 0,   # 0 = turma que já existia (o cancelamento só retira os repetentes)
            })
        return resultado

    @staticmethod
    def _colocar(turma, cat, fase, estado, observacoes=None):
        linha = {
            "catecumeno": cat.get("catecumeno"),
            "estado": estado,
            "encarregado": cat.get("encarregado"),
            "contacto": cat.get("contacto"),
            "data_de_nascimento": cat.get("data_de_nascimento"),
            "idade": cat.get("idade"),
            "sexo": cat.get("sexo"),
        }
        if observacoes:
            linha["observacoes"] = observacoes
        turma.append(TABELA_TURMA, linha)
        frappe.db.set_value("Catecumeno", cat.get("catecumeno"), {
            "status": estado, "turma": turma.name, "fase": fase,
        })

    # ── Cancelar = desfazer ──────────────────────────────────────────────────

    def _desfazer(self):
        """Volta tudo ao estado de antes do apuramento:
        turmas apuradas reactivadas, catecúmenos de volta à turma/fase de origem (e Activos),
        desistentes reactivados, turmas criadas apagadas, repetentes retirados das turmas existentes."""
        itens = [i for i in (self.get("apuramento_item") or []) if i.get("catecumeno")]
        meus = {i.catecumeno for i in itens}

        # 1. Catecúmenos de volta à turma/fase de origem (antes de apagar turmas: deixam de apontar para elas)
        for i in itens:
            if (i.get("status") or "").lower() in ESTADOS_FORA:
                continue
            frappe.db.set_value("Catecumeno", i.catecumeno, {
                "status": "Activo", "turma": i.turma_nome, "fase": self.fase_actual,
            })
            if i.get("resultado") == "Desistente" and i.turma_nome:
                _estado_na_turma(i.turma_nome, i.catecumeno, i.get("status") or "Activo")

        # 2. Turmas apuradas voltam a estar activas
        for t in self._turmas_incluidas():
            if frappe.db.exists("Turma", t):
                frappe.db.set_value("Turma", t, "status", "Activo")

        # 3. Turmas do ano seguinte: retirar os catecúmenos deste apuramento; apagar as que ele criou
        nao_apagadas = []
        for nt in self.get("apuramento_novas_turmas") or []:
            if not nt.turma or not frappe.db.exists("Turma", nt.turma):
                continue
            turma = frappe.get_doc("Turma", nt.turma)
            outros = [r for r in turma.get(TABELA_TURMA) if r.catecumeno not in meus]
            turma.set(TABELA_TURMA, outros)
            turma.save(ignore_permissions=True)
            if nt.incluir and not outros:
                if not _apagar_turma_criada(nt):
                    frappe.db.set_value("Turma", turma.name, "status", "Inactivo")
                    nao_apagadas.append(turma.name)

        msg = "Apuramento cancelado: as turmas e os catecúmenos voltaram ao que eram antes."
        if nao_apagadas:
            msg += (" Estas turmas não puderam ser apagadas (estão ligadas a outros registos) e ficaram "
                    "vazias e Inactivas: " + ", ".join(nao_apagadas))
        frappe.msgprint(msg)


def _apagar_turma_criada(nt):
    """Apaga uma turma criada pelo apuramento (linha `nt` de apuramento_novas_turmas), se nada mais
    a usar (presenças, permissão de catequista, outros documentos...). A ligação do próprio apuramento
    é retirada primeiro (fica o nome no texto); se o Frappe recusar apagar, tudo volta atrás.
    Devolve True se apagou."""
    frappe.db.savepoint("cq_apagar_turma")
    try:
        frappe.db.set_value(nt.doctype, nt.name, {
            "turma": None,
            "turmas_origem": f"{nt.turmas_origem or ''} — turma {nt.turma} apagada ao cancelar".strip(" —"),
        }, update_modified=False)
        frappe.delete_doc("Turma", nt.turma, ignore_permissions=True)
        return True
    except frappe.LinkExistsError:
        frappe.db.rollback(save_point="cq_apagar_turma")
        frappe.clear_messages()
        return False


def _estado_na_turma(turma, catecumeno, estado):
    frappe.db.sql("""UPDATE `tabTurma Catecumenos` SET estado = %s
                     WHERE parent = %s AND parenttype = 'Turma' AND catecumeno = %s""",
                  (estado, turma, catecumeno))


def _agrupar(catecumenos, manter_estrutura, tam):
    """Manter Estrutura: uma turma nova por turma de origem. Redistribuir: turmas equilibradas."""
    if not catecumenos:
        return []
    if not manter_estrutura:
        return _distribuir_em_turmas(catecumenos, *tam)
    por_origem = {}
    for c in catecumenos:
        por_origem.setdefault(c.get("turma_origem") or "Sem turma", []).append(c)
    return [{"numero": n, "catecumenos": por_origem[o], "origens": [o]}
            for n, o in enumerate(sorted(por_origem), start=1)]


def _distribuir_em_turmas(catecumenos, tam_min, tam_ideal, tam_max):
    if not catecumenos:
        return []
    catecumenos = sorted(catecumenos, key=lambda x: x.get("catecumeno") or "")
    total = len(catecumenos)
    if total <= tam_max:
        n = 1
    else:
        n = (total + tam_ideal - 1) // tam_ideal
        while n > 1 and total // n < tam_min:
            n -= 1

    grupos = [{"numero": i + 1, "catecumenos": [], "origens": []} for i in range(n)]
    for idx, cat in enumerate(catecumenos):
        g = grupos[idx % n]
        g["catecumenos"].append(cat)
        origem = cat.get("turma_origem")
        if origem and origem not in g["origens"]:
            g["origens"].append(origem)
    return grupos

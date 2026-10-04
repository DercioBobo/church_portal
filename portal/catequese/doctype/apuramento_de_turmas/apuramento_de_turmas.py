import frappe
from frappe.model.document import Document

from portal.catequese.utils import tamanhos_turma

TABELA_TURMA = "lista_catecumenos"
ESTADOS_FORA = ("inactivo", "inativo", "desistente")
RESULTADOS = ("Transita", "Permanece", "Desistente")


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

    def _turmas_incluidas(self):
        return [t.get("turma") for t in (self.get("apuramento_turmas") or []) if t.get("incluir") and t.get("turma")]

    # ── Processamento ─────────────────────────────────────────────────────────

    def _processar(self):
        padrao = tamanhos_turma()
        tam_min = self.tamanho_minimo or padrao[0]
        tam_ideal = self.tamanho_ideal or padrao[1]
        tam_max = self.tamanho_maximo or padrao[2]
        fase_permanece = self.fase_seguinte_permanece or self.fase_actual

        try:
            opcoes = frappe.parse_json(self.get("opcoes_juntar") or "{}") or {}
        except Exception:
            opcoes = {}

        transitam, permanecem, desistentes = [], [], []
        for item in self.get("apuramento_item") or []:
            if (item.get("status") or "").lower() in ESTADOS_FORA:
                continue
            if (item.get("resultado") or "").strip() == "Desistente":
                desistentes.append(item)
                continue
            dados = {
                "catecumeno": item.get("catecumeno"),
                "encarregado": item.get("encarregado"),
                "contacto": item.get("contacto"),
                "data_de_nascimento": item.get("data_de_nascimento"),
                "idade": item.get("idade"),
                "sexo": item.get("sexo"),
                "status": item.get("status") or "Activo",
                "turma_origem": item.get("turma_nome"),
            }
            resultado = (item.get("resultado") or "").strip()
            if resultado == "Transita":
                transitam.append(dados)
            elif resultado == "Permanece":
                permanecem.append(dados)

        a_inactivar, criadas = [], []
        grupos = (
            ("transitam", transitam, self.fase_seguinte, "T", True),
            ("permanecem", permanecem, fase_permanece, "P", False),
        )
        accoes = {}
        for chave, lista, fase, _sufixo, forcar_activo in grupos:
            opcao = opcoes.get(chave) or {}
            accoes[chave] = opcao.get("accao") or "criar"
            if not lista:
                continue
            distribuir = lista[:]
            if accoes[chave] == "juntar" and opcao.get("turmas"):
                distribuir.extend(_catecumenos_das_turmas(opcao["turmas"]))
                a_inactivar.extend(opcao["turmas"])
            for grupo in _distribuir_em_turmas(distribuir, tam_min, tam_ideal, tam_max):
                if grupo["catecumenos"]:
                    criadas.append(self._criar_turma(grupo, fase, forcar_activo))

        for tc in criadas:
            self.append("apuramento_novas_turmas", tc)

        # Desistentes: ficam Inactivos (e "Inativo" na lista da turma antiga); não vão para turma nova
        for item in desistentes:
            frappe.db.set_value("Catecumeno", item.get("catecumeno"), "status", "Inactivo")
            if item.get("turma_nome"):
                frappe.db.sql("""UPDATE `tabTurma Catecumenos` SET estado = 'Inativo'
                                 WHERE parent = %s AND parenttype = 'Turma' AND catecumeno = %s""",
                              (item.get("turma_nome"), item.get("catecumeno")))

        for t in self._turmas_incluidas():
            if t not in a_inactivar:
                a_inactivar.append(t)
        for t in a_inactivar:
            # O script original gravava "Inativo", que não é uma opção válida do campo
            frappe.db.set_value("Turma", t, "status", "Inactivo")

        msg = f"Apuramento concluído! Criadas {len(criadas)} turma(s)."
        if desistentes:
            msg += f" {len(desistentes)} desistente(s) ficaram inactivos."
        if "juntar" in accoes.values():
            msg += " Turmas existentes foram combinadas."
        frappe.msgprint(msg)

    def _criar_turma(self, grupo, fase, forcar_activo):
        turma = frappe.new_doc("Turma")
        turma.ano_lectivo = self.ano_lectivo_seguinte
        turma.fase = fase
        turma.status = "Activo"
        turma.insert(ignore_permissions=True)

        for cat in sorted(grupo["catecumenos"], key=lambda x: x.get("catecumeno") or ""):
            estado = "Activo" if forcar_activo else (cat.get("status") or "Activo")
            turma.append(TABELA_TURMA, {
                "catecumeno": cat.get("catecumeno"),
                "encarregado": cat.get("encarregado"),
                "status": estado,
                "contacto": cat.get("contacto"),
                "data_de_nascimento": cat.get("data_de_nascimento"),
                "idade": cat.get("idade"),
                "sexo": cat.get("sexo"),
            })
            frappe.db.set_value("Catecumeno", cat.get("catecumeno"), {
                "status": estado, "turma": turma.name, "fase": fase,
            })
        turma.save(ignore_permissions=True)

        return {
            "turma": turma.name,
            "total_catecumenos": len(grupo["catecumenos"]),
            "turmas_origem": ", ".join(sorted(grupo["origens"])),
        }


def _catecumenos_das_turmas(turmas):
    todos = []
    for nome in turmas:
        for cat in frappe.get_doc("Turma", nome).get(TABELA_TURMA) or []:
            if not cat.get("catecumeno"):
                continue
            estado = cat.get("status") or "Activo"
            if estado.lower() in ESTADOS_FORA:
                continue
            todos.append({
                "catecumeno": cat.get("catecumeno"),
                "encarregado": cat.get("encarregado"),
                "contacto": cat.get("contacto"),
                "data_de_nascimento": cat.get("data_de_nascimento"),
                "idade": cat.get("idade"),
                "sexo": cat.get("sexo"),
                "status": estado,
                "turma_origem": nome,
            })
    return todos


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

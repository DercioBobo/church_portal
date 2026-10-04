"""
Página Sacramentos: acompanhamento de quem não recebeu um sacramento.

- "Não receberam": candidatos marcados "Não vai receber" numa Preparação e que ainda
  não têm o sacramento (com o motivo e a Preparação).
- "Fora da preparação": catecúmenos na fase do sacramento, este ano, sem o sacramento e que
  não estão em nenhuma Preparação deste ano (só aparece quando já há uma Preparação).
- "Em fase posterior, sem o sacramento": activos numa fase depois da do sacramento
  (Fase.ordem) que não o têm e não aparecem como "Não vai receber".
- "Já receberam depois": falharam mas entretanto receberam (2ª oportunidade).
- "Arquivados": quem tem um registo Sacramento Nao Recebido (decisão tomada: sem 2ª
  oportunidade, inactivo, repete com outro grupo…). Saem das listas acima mas o registo fica.
  Um arquivo de um ano não esconde uma falha de um ano seguinte.
A fase de cada sacramento vem da Fase (Com Sacramento + Sacramento).
"""

import frappe
from frappe import _
from frappe.utils import cint, today

from portal.catequese.utils import ano_actual

NAO_RECEBE = "Não vai receber"
REGISTO = "Sacramento Nao Recebido"
ACOMPANHAMENTO = "Em acompanhamento"   # registo feito à mão: aparece em "Não receberam", não arquiva
NAO_LISTADO = "Não listado na preparação"

# (Sacramento, rótulo, campo no Catecúmeno, campo da data)
SACRAMENTOS = [
    ("Baptismo", "Baptismo", "baptismo", "data_do_baptismo"),
    ("Eucaristia", "1ª Comunhão", "eucaristia", "data_da_eucaristia"),
    ("Crisma", "Crisma", "crisma", "data_do_crisma"),
]
ESTADOS_ACTIVOS = ("Activo", "Pendente")


@frappe.whitelist()
def get_dados():
    frappe.has_permission("Catecumeno", "read", throw=True)
    ano = ano_actual()
    fases = frappe.get_all("Fase", fields=["name", "ordem", "fase_de_sacramento", "sacramento"])
    ordem = {f.name: cint(f.ordem) for f in fases}
    meta = frappe.get_meta(REGISTO)
    opcoes = lambda campo: [o for o in (meta.get_field(campo).options or "").split("\n") if o]  # noqa: E731

    return {
        "ano": ano,
        "decisoes": [o for o in opcoes("decisao") if o != ACOMPANHAMENTO],
        "motivos": opcoes("motivo"),
        "sacramentos": [_sacramento(s, rotulo, campo, campo_data, fases, ordem, ano)
                        for s, rotulo, campo, campo_data in SACRAMENTOS],
    }


def _sacramento(sac, rotulo, campo, campo_data, fases, ordem, ano):
    fases_sac = [f.name for f in fases if f.fase_de_sacramento and f.sacramento == sac]
    ordem_sac = min((ordem[f] for f in fases_sac if ordem[f]), default=0)

    arquivados = _arquivados(sac, campo)
    # catecúmeno → ano mais recente arquivado
    ano_arquivo = {}
    for a in arquivados:
        ano_arquivo[a.catecumeno] = max(ano_arquivo.get(a.catecumeno, ""), str(a.ano_lectivo))

    pendentes, resolvidos = _falharam(sac, campo, campo_data)
    pendentes = [r for r in pendentes if str(r.ano_lectivo) > ano_arquivo.get(r.catecumeno, "")]
    # Acrescentados à mão (registo "Em acompanhamento")
    ja = {r.catecumeno for r in pendentes} | {r.catecumeno for r in resolvidos}
    for r in _em_acompanhamento(sac, campo, campo_data):
        if r.catecumeno in ja:
            continue
        (resolvidos if r.recebeu else pendentes).append(r)
    preparacoes = _preparacoes(sac, ano)

    ja_listados = {r.catecumeno for r in pendentes}
    fora = _fora_da_preparacao(sac, campo, fases_sac, ano, preparacoes) if fases_sac else []
    fora = [r for r in fora if r.catecumeno not in ja_listados and ano_arquivo.get(r.catecumeno, "") < str(ano)]
    ja_listados |= {r.catecumeno for r in fora}
    sem_motivo = _sem_motivo(campo, ordem, ordem_sac, ja_listados) if ordem_sac else []
    sem_motivo = [r for r in sem_motivo if r.catecumeno not in ano_arquivo]

    # Já estão numa preparação em rascunho para receber (ex.: 2ª oportunidade marcada)
    agendados = dict(frappe.db.sql("""
        SELECT c.catecumeno, p.name FROM `tabCandidatos ao Sacramento Table` c
        JOIN `tabPreparacao do Sacramento` p ON p.name = c.parent AND p.docstatus = 0 AND p.sacramento = %s
        WHERE c.parenttype = 'Preparacao do Sacramento' AND IFNULL(c.situacao, '') != %s
    """, (sac, NAO_RECEBE)))
    for r in pendentes + fora + sem_motivo:
        r.agendado = agendados.get(r.catecumeno)

    return {
        "sacramento": sac,
        "rotulo": rotulo,
        "fases": fases_sac,
        "pendentes": pendentes,
        "fora": fora,
        "sem_motivo": sem_motivo,
        "resolvidos": resolvidos,
        "arquivados": arquivados,
        "preparacoes": preparacoes,
        # preparações em rascunho (qualquer ano) onde se pode juntar quem tem 2ª oportunidade
        "rascunhos": frappe.get_all("Preparacao do Sacramento",
                                    filters={"sacramento": sac, "docstatus": 0},
                                    fields=["name", "ano_lectivo", "data_do_sacramento", "tipo"],
                                    order_by="ano_lectivo desc, creation desc"),
    }


def _falharam(sac, campo, campo_data):
    """Uma linha por catecúmeno (a Preparação mais recente em que não recebeu)."""
    linhas = frappe.db.sql(f"""
        SELECT c.catecumeno, c.motivo_nao_recebe AS motivo, c.detalhe_situacao AS detalhe,
               p.name AS preparacao, p.ano_lectivo, p.data_do_sacramento AS data, p.docstatus,
               k.status, k.fase, k.turma, k.comunidade, k.encarregado, k.contacto,
               k.`{campo}` AS recebeu, k.`{campo_data}` AS data_recebeu
        FROM `tabCandidatos ao Sacramento Table` c
        JOIN `tabPreparacao do Sacramento` p
          ON p.name = c.parent AND c.parenttype = 'Preparacao do Sacramento' AND p.docstatus < 2
        JOIN `tabCatecumeno` k ON k.name = c.catecumeno
        WHERE p.sacramento = %s AND c.situacao = %s
        ORDER BY p.data_do_sacramento DESC, p.creation DESC
    """, (sac, NAO_RECEBE), as_dict=True)

    por_catecumeno = {}
    for r in linhas:
        if r.catecumeno in por_catecumeno:
            por_catecumeno[r.catecumeno].vezes += 1
            continue
        r.vezes = 1
        r.recebeu = cint(r.recebeu)
        por_catecumeno[r.catecumeno] = r

    pendentes = [r for r in por_catecumeno.values() if not r.recebeu]
    resolvidos = [r for r in por_catecumeno.values() if r.recebeu]
    return pendentes, resolvidos


def _fora_da_preparacao(sac, campo, fases_sac, ano, preparacoes):
    """Na fase do sacramento este ano, sem o sacramento, e em nenhuma Preparação deste ano.
    Activos/pendentes, e também inactivos cuja turma é deste ano (saíram durante o ano)."""
    if not preparacoes:
        return []
    return frappe.db.sql(f"""
        SELECT k.name AS catecumeno, k.status, k.fase, k.turma, k.comunidade, k.encarregado, k.contacto
        FROM `tabCatecumeno` k
        LEFT JOIN `tabTurma` t ON t.name = k.turma
        WHERE k.fase IN %(fases)s AND IFNULL(k.`{campo}`, 0) = 0
          AND (k.status IN %(activos)s OR (k.status = 'Inactivo' AND t.ano_lectivo = %(ano)s))
          AND k.name NOT IN (
              SELECT c.catecumeno FROM `tabCandidatos ao Sacramento Table` c
              JOIN `tabPreparacao do Sacramento` p ON p.name = c.parent AND p.docstatus < 2
              WHERE c.parenttype = 'Preparacao do Sacramento' AND p.sacramento = %(sac)s
                AND p.ano_lectivo = %(ano)s AND c.catecumeno IS NOT NULL
          )
        ORDER BY k.fase, k.turma, k.name
    """, {"fases": tuple(fases_sac), "activos": ESTADOS_ACTIVOS, "ano": ano, "sac": sac}, as_dict=True)


def _sem_motivo(campo, ordem, ordem_sac, ja_listados):
    fases_depois = [f for f, o in ordem.items() if o > ordem_sac]
    if not fases_depois:
        return []
    rows = frappe.get_all(
        "Catecumeno",
        filters={"status": ["in", ESTADOS_ACTIVOS], campo: 0, "fase": ["in", fases_depois]},
        fields=["name as catecumeno", "status", "fase", "turma", "comunidade", "encarregado", "contacto"],
        order_by="fase asc, turma asc, name asc",
        limit_page_length=0,
    )
    return [r for r in rows if r.catecumeno not in ja_listados]


def _arquivados(sac, campo):
    return frappe.db.sql(f"""
        SELECT r.name, r.catecumeno, r.ano_lectivo, r.preparacao, r.motivo, r.decisao, r.nota, r.data_decisao,
               k.status, k.fase, k.turma, IFNULL(k.`{campo}`, 0) AS recebeu
        FROM `tab{REGISTO}` r
        LEFT JOIN `tabCatecumeno` k ON k.name = r.catecumeno
        WHERE r.sacramento = %s AND r.decisao != %s
        ORDER BY r.ano_lectivo DESC, r.data_decisao DESC, r.catecumeno
    """, (sac, ACOMPANHAMENTO), as_dict=True)


def _em_acompanhamento(sac, campo, campo_data):
    """Registos "Em acompanhamento" (acrescentados à mão), no mesmo formato de "Não receberam"."""
    linhas = frappe.db.sql(f"""
        SELECT r.name AS registo, r.catecumeno, r.motivo, r.nota AS detalhe, r.preparacao, r.ano_lectivo,
               COALESCE(p.data_do_sacramento, r.data_decisao) AS data, p.docstatus,
               k.status, k.fase, k.turma, k.comunidade, k.encarregado, k.contacto,
               IFNULL(k.`{campo}`, 0) AS recebeu, k.`{campo_data}` AS data_recebeu
        FROM `tab{REGISTO}` r
        JOIN `tabCatecumeno` k ON k.name = r.catecumeno
        LEFT JOIN `tabPreparacao do Sacramento` p ON p.name = r.preparacao
        WHERE r.sacramento = %s AND r.decisao = %s
        ORDER BY r.data_decisao DESC
    """, (sac, ACOMPANHAMENTO), as_dict=True)
    for r in linhas:
        r.vezes, r.manual = 1, 1
        r.recebeu = cint(r.recebeu)
    return linhas


def _preparacoes(sac, ano):
    return frappe.db.sql("""
        SELECT p.name, p.data_do_sacramento AS data, p.docstatus, p.tipo,
               COALESCE(SUM(c.name IS NOT NULL AND IFNULL(c.situacao, '') != %(nao)s), 0) AS vao,
               COALESCE(SUM(c.situacao = %(nao)s), 0) AS nao
        FROM `tabPreparacao do Sacramento` p
        LEFT JOIN `tabCandidatos ao Sacramento Table` c
          ON c.parent = p.name AND c.parenttype = 'Preparacao do Sacramento'
        WHERE p.sacramento = %(sac)s AND p.ano_lectivo = %(ano)s AND p.docstatus < 2
        GROUP BY p.name
        ORDER BY p.data_do_sacramento
    """, {"sac": sac, "ano": ano, "nao": NAO_RECEBE}, as_dict=True)


# ── Arquivar / reabrir ───────────────────────────────────────────────────────

@frappe.whitelist()
def arquivar(catecumenos, sacramento, decisao, motivo=None, nota=None, preparacoes=None):
    """Regista a decisão (um registo por catecúmeno, sacramento e ano) — sai das listas, fica o registo.
    `catecumenos` e `preparacoes` são listas (JSON) com a mesma ordem; o ano é o da Preparação
    em que falhou, ou o ano actual."""
    frappe.has_permission(REGISTO, "create", throw=True)
    catecumenos = frappe.parse_json(catecumenos) if isinstance(catecumenos, str) else catecumenos
    preparacoes = (frappe.parse_json(preparacoes) if isinstance(preparacoes, str) else preparacoes) or []
    if not catecumenos:
        frappe.throw(_("Nenhum catecúmeno seleccionado."))

    feitos = 0
    for i, cat in enumerate(catecumenos):
        prep = preparacoes[i] if i < len(preparacoes) else None
        ano = (prep and frappe.db.get_value("Preparacao do Sacramento", prep, "ano_lectivo")) or ano_actual()
        if not motivo and prep:
            motivo_cat = frappe.db.get_value("Candidatos ao Sacramento Table",
                                             {"parent": prep, "catecumeno": cat}, "motivo_nao_recebe")
        else:
            motivo_cat = motivo or (None if prep else NAO_LISTADO)
        # quem foi acrescentado à mão ("Em acompanhamento") é arquivado no mesmo registo
        existente = (frappe.db.get_value(REGISTO, {"catecumeno": cat, "sacramento": sacramento, "decisao": ACOMPANHAMENTO})
                     or frappe.db.get_value(REGISTO, {"catecumeno": cat, "sacramento": sacramento, "ano_lectivo": ano}))
        doc = frappe.get_doc(REGISTO, existente) if existente else frappe.new_doc(REGISTO)
        doc.update({
            "catecumeno": cat, "sacramento": sacramento, "decisao": decisao, "data_decisao": today(),
            "ano_lectivo": doc.ano_lectivo or ano, "preparacao": doc.preparacao or prep,
            "motivo": motivo_cat or doc.motivo, "nota": nota or doc.nota,
        })
        doc.save()
        feitos += 1
    return {"arquivados": feitos}


@frappe.whitelist()
def reabrir(nome):
    """Apaga o registo: a pessoa volta às listas de acompanhamento."""
    frappe.delete_doc(REGISTO, nome)


# ── 2ª oportunidade ──────────────────────────────────────────────────────────

@frappe.whitelist()
def segunda_oportunidade(catecumenos, sacramento, preparacao=None, ano=None, data=None,
                         turma_destino=None, falhou_em=None):
    """Põe os catecúmenos escolhidos numa preparação para receberem o sacramento:
    numa preparação em rascunho já existente (`preparacao`) ou numa nova do tipo
    "2ª oportunidade" (`ano`, `data`, `turma_destino` para o Baptismo).
    `falhou_em` (lista, mesma ordem) é a Preparação onde cada um não recebeu, para a observação.
    Devolve o nome da preparação."""
    catecumenos = frappe.parse_json(catecumenos) if isinstance(catecumenos, str) else (catecumenos or [])
    falhou_em = (frappe.parse_json(falhou_em) if isinstance(falhou_em, str) else falhou_em) or []
    if not catecumenos:
        frappe.throw(_("Nenhum catecúmeno seleccionado."))

    if preparacao:
        doc = frappe.get_doc("Preparacao do Sacramento", preparacao)
        doc.check_permission("write")
        if doc.docstatus != 0:
            frappe.throw(_("A preparação {0} já foi submetida; escolha uma em rascunho ou crie uma nova.").format(preparacao))
        if doc.sacramento != sacramento:
            frappe.throw(_("A preparação {0} é de {1}, não de {2}.").format(preparacao, doc.sacramento, sacramento))
    else:
        frappe.has_permission("Preparacao do Sacramento", "create", throw=True)
        doc = frappe.new_doc("Preparacao do Sacramento")
        doc.update({
            "sacramento": sacramento, "ano_lectivo": ano or ano_actual(), "data_do_sacramento": data or None,
            "tipo": "2ª oportunidade", "turma_destino": turma_destino if sacramento == "Baptismo" else None,
        })

    existentes = {r.catecumeno: r for r in doc.get("candidatos_sacramento_table")}
    adicionados = repostos = 0
    for i, cat in enumerate(catecumenos):
        origem = falhou_em[i] if i < len(falhou_em) else None
        nota = _("2ª oportunidade (não recebeu em {0})").format(origem) if origem else _("2ª oportunidade")
        if cat in existentes:
            r = existentes[cat]
            if r.situacao == NAO_RECEBE:
                r.situacao, r.motivo_nao_recebe, r.detalhe_situacao = "Vai receber", None, None
                repostos += 1
            continue
        c = frappe.db.get_value("Catecumeno", cat, ["name", "turma", "fase", "comunidade"], as_dict=True)
        if not c:
            continue
        doc.append("candidatos_sacramento_table", {
            "catecumeno": cat, "turma": c.turma, "fase": c.fase, "comunidade": c.comunidade,
            "situacao": "Vai receber", "ficha": 0, "documentos_padrinhos": 0, "obs": nota,
        })
        adicionados += 1
    doc.save()
    return {"preparacao": doc.name, "adicionados": adicionados, "repostos": repostos}


# ── Acrescentar à mão ────────────────────────────────────────────────────────

@frappe.whitelist()
def adicionar(catecumeno, sacramento, motivo=None, nota=None, preparacao=None):
    """Para quem não aparece nas listas (ex.: foi apagado da preparação): fica "Em acompanhamento"
    em "Não receberam", e daí pode ter 2ª oportunidade ou ser arquivado."""
    frappe.has_permission(REGISTO, "create", throw=True)
    campo = next((c for s, _r, c, _d in SACRAMENTOS if s == sacramento), None)
    if campo and cint(frappe.db.get_value("Catecumeno", catecumeno, campo)):
        frappe.throw(_("{0} já tem o sacramento marcado ({1}). Se é um erro, desmarque-o no catecúmeno.").format(
            catecumeno, sacramento))
    if preparacao and frappe.db.get_value("Preparacao do Sacramento", preparacao, "sacramento") != sacramento:
        frappe.throw(_("A preparação {0} não é de {1}.").format(preparacao, sacramento))
    ano = (preparacao and frappe.db.get_value("Preparacao do Sacramento", preparacao, "ano_lectivo")) or ano_actual()
    if frappe.db.exists(REGISTO, {"catecumeno": catecumeno, "sacramento": sacramento, "ano_lectivo": ano}):
        frappe.throw(_("{0} já tem um registo de {1} em {2} (ver Arquivados).").format(catecumeno, sacramento, ano))
    doc = frappe.get_doc({
        "doctype": REGISTO, "catecumeno": catecumeno, "sacramento": sacramento, "ano_lectivo": ano,
        "preparacao": preparacao, "motivo": motivo or (None if preparacao else NAO_LISTADO),
        "decisao": ACOMPANHAMENTO, "nota": nota, "data_decisao": today(),
    }).insert()
    return doc.name

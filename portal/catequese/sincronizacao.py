"""
Sincronização entre o Catecúmeno e a sua linha na Turma (Turma Catecumenos).

Regras (o Catecúmeno é a referência):
- Os campos em CAMPOS_PARTILHADOS são os mesmos dados nos dois sítios.
- Catecúmeno gravado (formulário, portal, código) → actualiza a linha na sua turma actual,
  se a turma estiver activa (turmas encerradas ficam como histórico), e as candidaturas
  a sacramentos em rascunho.
- Linha alterada na Turma (formulário da turma, portal) → actualiza o Catecúmeno, mas só
  se essa turma for a turma actual dele (editar uma turma antiga não muda os dados actuais).
- Linha nova numa turma → junta os dois sem apagar nada: o que o Catecúmeno tem vai para a
  linha; o que só a linha tem vai para o Catecúmeno.
- Candidatos numa Preparação do Sacramento (formulário, página Gerir Preparação, link dos
  encarregados) → as mesmas regras: o que se altera vai para o Catecúmeno (e daí para a turma
  e para as outras preparações em rascunho); candidato novo junta-se sem apagar nada.
  Preparações canceladas não enviam nada.
- Todos os dias (e uma vez na migração) reconcilia todas as turmas activas, para apanhar o
  que tenha sido escrito directamente na base de dados (ex.: idade diária).
Nunca há ciclos: as escritas nas linhas e no Catecúmeno feitas aqui não voltam a disparar a sincronização.
"""

import frappe
from frappe.utils import cstr, now

CAMPOS_PARTILHADOS = (
    "encarregado", "contacto", "padrinhos", "contacto_padrinhos",
    "data_de_nascimento", "idade", "sexo", "ficha_de_catecumeno",
)

# Campos copiados para as candidaturas (Candidatos ao Sacramento Table): campo da candidatura → do catecúmeno
CAMPOS_CANDIDATURA = {
    "encarregado": "encarregado", "contacto_encarregado": "contacto",
    "padrinhos": "padrinhos", "contacto_padrinhos": "contacto_padrinhos",
    "idade": "idade", "sexo": "sexo", "data_de_nascimento": "data_de_nascimento",
}
CAMPOS_TURMA = {f: f for f in CAMPOS_PARTILHADOS}


def _n(v):
    """Valor normalizado para comparar (None, "" e 0 contam como vazio)."""
    return "" if v in (None, "", 0) else cstr(v)


def vazio(v):
    return _n(v) == ""


def _tocar_turma(turma):
    # Muda o "modified" da turma: quem tiver o formulário da turma aberto com dados antigos
    # recebe o aviso normal do Frappe em vez de gravar por cima dos novos.
    frappe.db.set_value("Turma", turma, "modified", now(), update_modified=False)


# ── Catecúmeno → Turma e candidaturas ─────────────────────────────────────────

def catecumeno_para_turma(nome):
    c = frappe.db.get_value("Catecumeno", nome, ["name", "turma", *CAMPOS_PARTILHADOS], as_dict=True)
    if not c or not c.turma or frappe.db.get_value("Turma", c.turma, "status") != "Activo":
        return
    linha = frappe.db.get_value(
        "Turma Catecumenos",
        {"parent": c.turma, "parenttype": "Turma", "parentfield": "lista_catecumenos", "catecumeno": nome},
        ["name", *CAMPOS_PARTILHADOS], as_dict=True,
    )
    if not linha:
        return
    diferentes = {f: c.get(f) for f in CAMPOS_PARTILHADOS if _n(c.get(f)) != _n(linha.get(f))}
    if diferentes:
        frappe.db.set_value("Turma Catecumenos", linha.name, diferentes, update_modified=False)
        _tocar_turma(c.turma)


def catecumeno_para_candidaturas(nome):
    """Candidaturas em preparações ainda em rascunho (as submetidas são histórico)."""
    c = frappe.db.get_value("Catecumeno", nome, list(set(CAMPOS_CANDIDATURA.values())), as_dict=True)
    if not c:
        return
    for linha in frappe.db.sql("""
        SELECT cs.name FROM `tabCandidatos ao Sacramento Table` cs
        JOIN `tabPreparacao do Sacramento` p ON p.name = cs.parent AND p.docstatus = 0
        WHERE cs.catecumeno = %s AND cs.parenttype = 'Preparacao do Sacramento'
    """, nome, as_dict=True):
        frappe.db.set_value("Candidatos ao Sacramento Table", linha.name,
                            {campo: c.get(origem) for campo, origem in CAMPOS_CANDIDATURA.items()},
                            update_modified=False)


def sincronizar_catecumeno(nome):
    """Depois de qualquer gravação do Catecúmeno (incluindo frappe.db.set_value)."""
    catecumeno_para_turma(nome)
    catecumeno_para_candidaturas(nome)


def gravar_no_catecumeno(nome, valores):
    """Escreve no Catecúmeno sem validar o documento inteiro (um campo em falta noutro sítio
    não pode impedir a sincronização) e propaga para a turma e candidaturas."""
    valores = {f: v for f, v in valores.items() if f in CAMPOS_PARTILHADOS or frappe.get_meta("Catecumeno").has_field(f)}
    if not valores or not frappe.db.exists("Catecumeno", nome):
        return
    frappe.db.set_value("Catecumeno", nome, valores)
    sincronizar_catecumeno(nome)


# ── Linhas (Turma, Preparação) → Catecúmeno ──────────────────────────────────

def _preparar_linhas(doc, tabela, mapa, pode_enviar):
    """Compara as linhas com as de antes da gravação.
    Linha nova: junta sem apagar (o Catecúmeno preenche a linha; o que só a linha tem vai para ele).
    Linha alterada: os campos alterados vão para o Catecúmeno, se `pode_enviar(catecumeno)`.
    Devolve {catecumeno: {campo_do_catecumeno: valor}} para gravar depois (no on_update)."""
    antes = doc.get_doc_before_save()
    antes_por_cat = {r.catecumeno: r for r in (antes.get(tabela) if antes else []) if r.catecumeno}
    nomes = [r.catecumeno for r in doc.get(tabela) if r.catecumeno]
    cats = {c.name: c for c in frappe.get_all(
        "Catecumeno", filters={"name": ["in", nomes or [""]]},
        fields=["name", "turma", *set(mapa.values())], limit_page_length=0)}

    pendentes = {}
    for r in doc.get(tabela):
        c = cats.get(r.catecumeno)
        if not c:
            continue
        anterior = antes_por_cat.get(r.catecumeno)
        para_cat = {}
        for campo_linha, campo_cat in mapa.items():
            if anterior is None:
                if not vazio(c.get(campo_cat)):
                    r.set(campo_linha, c.get(campo_cat))
                elif not vazio(r.get(campo_linha)):
                    para_cat[campo_cat] = r.get(campo_linha)
            elif _n(r.get(campo_linha)) != _n(anterior.get(campo_linha)) and pode_enviar(c):
                para_cat[campo_cat] = r.get(campo_linha)
        if para_cat:
            pendentes.setdefault(r.catecumeno, {}).update(para_cat)
    return pendentes


def _gravar_pendentes(doc):
    for nome, valores in (doc.flags.pop("cq_para_catecumenos", None) or {}).items():
        frappe.db.set_value("Catecumeno", nome, valores)
        sincronizar_catecumeno(nome)


def turma_validate(turma):
    """Chamado no validate da Turma. Só a turma actual de cada catecúmeno lhe altera os dados."""
    for r in turma.get("lista_catecumenos"):
        if r.catecumeno and not r.turma and not turma.is_new():
            r.turma = turma.name
        if r.catecumeno and not r.fase and turma.fase:
            r.fase = turma.fase
    turma.flags.cq_para_catecumenos = _preparar_linhas(
        turma, "lista_catecumenos", CAMPOS_TURMA, lambda c: c.turma == turma.name)


def turma_on_update(turma):
    _gravar_pendentes(turma)


def preparacao_validate(prep):
    """Chamado no validate da Preparação do Sacramento (não corre em preparações canceladas)."""
    prep.flags.cq_para_catecumenos = _preparar_linhas(
        prep, "candidatos_sacramento_table", CAMPOS_CANDIDATURA, lambda c: prep.docstatus < 2)


def preparacao_on_update(prep):
    _gravar_pendentes(prep)


# ── Reconciliação (diária e na migração) ──────────────────────────────────────

def reconciliar_turmas_activas():
    """Alinha todas as linhas das turmas activas com o Catecúmeno (o Catecúmeno ganha;
    o que só a linha tem passa para o Catecúmeno). Devolve quantas linhas mudaram."""
    cols = ", ".join(f"tc.`{f}` AS `l_{f}`, c.`{f}` AS `c_{f}`" for f in CAMPOS_PARTILHADOS)
    linhas = frappe.db.sql(f"""
        SELECT tc.name, tc.parent, c.name AS catecumeno, {cols}
        FROM `tabTurma Catecumenos` tc
        JOIN `tabTurma` t ON t.name = tc.parent AND t.status = 'Activo'
        JOIN `tabCatecumeno` c ON c.name = tc.catecumeno AND c.turma = tc.parent
        WHERE tc.parenttype = 'Turma' AND tc.parentfield = 'lista_catecumenos'
    """, as_dict=True)

    mudadas, turmas = 0, set()
    for l in linhas:
        para_linha, para_cat = {}, {}
        for f in CAMPOS_PARTILHADOS:
            vc, vl = l[f"c_{f}"], l[f"l_{f}"]
            if _n(vc) == _n(vl):
                continue
            if not vazio(vc):
                para_linha[f] = vc
            else:
                para_cat[f] = vl
        if para_linha:
            frappe.db.set_value("Turma Catecumenos", l.name, para_linha, update_modified=False)
            turmas.add(l.parent)
        if para_cat:
            frappe.db.set_value("Catecumeno", l.catecumeno, para_cat, update_modified=False)
        if para_linha or para_cat:
            mudadas += 1
    for t in turmas:
        _tocar_turma(t)
    return mudadas


def reconciliar_diario():
    n = reconciliar_turmas_activas()
    frappe.db.commit()
    frappe.logger().info(f"[Catequese] Sincronização turma ↔ catecúmeno: {n} linha(s) alinhada(s).")

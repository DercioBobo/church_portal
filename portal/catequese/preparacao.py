"""
Operações sobre uma Preparação do Sacramento, usadas pela página "Gerir Preparação"
e pelos botões do formulário (antes corriam no browser; agora há uma só versão).

Tudo trabalha sobre o próprio documento: a página não guarda nada à parte.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt

from portal.catequese.doctype.preparacao_do_sacramento.preparacao_do_sacramento import NAO_RECEBE, nao_recebe

DOCTYPE = "Preparacao do Sacramento"
TABELA = "candidatos_sacramento_table"
CAMPO_SACRAMENTO = {"Baptismo": "baptismo", "Eucaristia": "eucaristia", "Crisma": "crisma"}

# Valores pagos por candidato ↔ valor esperado definido na Preparação
PAGAMENTOS = [
    ("valor_ofertorio", "Ofertório"),
    ("valor_cracha", "Crachá"),
    ("valor_accao_gracas", "Acção de graças"),
    ("valor_fotos", "Fotos"),
]

# Campos da linha que a página pode editar directamente (Situação tem chamada própria: exige motivo)
EDITAVEIS = {
    "date", "dia", "sacerdote", "ficha", "documentos_padrinhos", "banco", "comunidade",
    "valor_tenda", "valor_ofertorio", "valor_cracha", "valor_accao_gracas", "valor_fotos",
    "obs", "enc_obs", "detalhe_situacao", "encarregado", "contacto_encarregado",
    "padrinhos", "contacto_padrinhos", "sexo", "idade", "data_de_nascimento",
}
CAMPOS_LINHA = sorted(EDITAVEIS | {"name", "idx", "catecumeno", "turma", "fase", "situacao", "motivo_nao_recebe"})


def _doc(nome, perm="read"):
    doc = frappe.get_doc(DOCTYPE, nome)
    doc.check_permission(perm)
    return doc


def _rascunho(doc):
    if doc.docstatus != 0:
        frappe.throw(_("Esta preparação já foi submetida; não pode ser alterada aqui."))


def _linha(doc, row_name):
    for r in doc.get(TABELA):
        if r.name == row_name:
            return r
    frappe.throw(_("Candidato não encontrado nesta preparação."))


def _carregar(v):
    return json.loads(v) if isinstance(v, str) else (v or [])


# ── Leitura ──────────────────────────────────────────────────────────────────

@frappe.whitelist()
def listar_preparacoes():
    """Preparações (mais recentes primeiro) para o selector da página."""
    frappe.has_permission(DOCTYPE, "read", throw=True)
    return frappe.db.sql(f"""
        SELECT p.name, p.sacramento, p.ano_lectivo, p.data_do_sacramento AS data, p.docstatus,
               COALESCE(SUM(c.name IS NOT NULL AND IFNULL(c.situacao, '') != %(nao)s), 0) AS vao,
               COALESCE(SUM(c.situacao = %(nao)s), 0) AS nao
        FROM `tab{DOCTYPE}` p
        LEFT JOIN `tabCandidatos ao Sacramento Table` c ON c.parent = p.name AND c.parenttype = %(dt)s
        WHERE p.docstatus < 2
        GROUP BY p.name
        ORDER BY p.ano_lectivo DESC, p.data_do_sacramento DESC, p.name
        LIMIT 60
    """, {"nao": NAO_RECEBE, "dt": DOCTYPE}, as_dict=True)


@frappe.whitelist()
def get_preparacao(nome):
    doc = _doc(nome)
    meta = frappe.get_meta("Candidatos ao Sacramento Table")
    opcoes = lambda campo: [o for o in (meta.get_field(campo).options or "").split("\n") if o]  # noqa: E731
    linhas = [{c: r.get(c) for c in CAMPOS_LINHA} for r in doc.get(TABELA)]
    return {
        "name": doc.name,
        "sacramento": doc.sacramento,
        "ano_lectivo": doc.ano_lectivo,
        "data_do_sacramento": doc.data_do_sacramento,
        "docstatus": doc.docstatus,
        "modified": str(doc.modified),
        "observacoes": doc.observacoes,
        "documentos_exigidos": doc.documentos_exigidos,
        "esperado": {c: flt(doc.get(c)) for c, _r in PAGAMENTOS},
        "pagamentos": [{"campo": c, "rotulo": r} for c, r in PAGAMENTOS],
        "link": {
            "url": doc.link_url if doc.link_token else None,
            "expira_em": doc.link_expira_em,
            "permite_editar": cint(doc.link_permite_editar),
        },
        "pode_editar": doc.docstatus == 0 and doc.has_permission("write"),
        "pode_submeter": doc.docstatus == 0 and doc.has_permission("submit"),
        "opcoes": {"dia": opcoes("dia"), "comunidade": opcoes("comunidade"), "sexo": opcoes("sexo"),
                   "motivo": opcoes("motivo_nao_recebe")},
        "formatos": frappe.get_all("Print Format", filters={"doc_type": DOCTYPE, "disabled": 0},
                                   pluck="name", order_by="name"),
        "candidatos": linhas,
    }


# ── Edição ───────────────────────────────────────────────────────────────────

def _valor(campo, valor):
    df = frappe.get_meta("Candidatos ao Sacramento Table").get_field(campo)
    if df.fieldtype == "Check":
        return 1 if cint(valor) else 0
    if df.fieldtype in ("Currency", "Float"):
        return flt(valor)
    if df.fieldtype == "Int":
        return cint(valor)
    return valor or None


@frappe.whitelist()
def guardar(nome, linhas, valores):
    """Aplica `valores` ({campo: valor}) às `linhas` (nomes das linhas). Uma ou várias de uma vez."""
    doc = _doc(nome, "write")
    _rascunho(doc)
    linhas = _carregar(linhas)
    valores = json.loads(valores) if isinstance(valores, str) else (valores or {})
    proibidos = set(valores) - EDITAVEIS
    if proibidos:
        frappe.throw(_("Campo não editável: {0}").format(", ".join(sorted(proibidos))))
    for nome_linha in linhas:
        r = _linha(doc, nome_linha)
        for campo, valor in valores.items():
            r.set(campo, _valor(campo, valor))
    doc.save()
    return _resposta(doc, linhas)


@frappe.whitelist()
def marcar_situacao(nome, linhas, situacao, motivo=None, detalhe=None):
    doc = _doc(nome, "write")
    _rascunho(doc)
    linhas = _carregar(linhas)
    if situacao not in ("Vai receber", NAO_RECEBE):
        frappe.throw(_("Situação inválida."))
    if situacao == NAO_RECEBE and not motivo:
        frappe.throw(_("Indique o motivo por que não vai receber."))
    for nome_linha in linhas:
        r = _linha(doc, nome_linha)
        r.situacao = situacao
        r.motivo_nao_recebe = motivo if situacao == NAO_RECEBE else None
        r.detalhe_situacao = detalhe if situacao == NAO_RECEBE else None
    doc.save()
    return _resposta(doc, linhas)


@frappe.whitelist()
def remover(nome, linhas):
    """Remove linhas por engano (para quem não vai receber, usar a Situação)."""
    doc = _doc(nome, "write")
    _rascunho(doc)
    fora = set(_carregar(linhas))
    doc.set(TABELA, [r for r in doc.get(TABELA) if r.name not in fora])
    doc.save()
    return {"modified": str(doc.modified), "removidos": len(fora)}


def _resposta(doc, linhas):
    alvo = set(linhas)
    return {
        "modified": str(doc.modified),
        "linhas": [{c: r.get(c) for c in CAMPOS_LINHA} for r in doc.get(TABELA) if r.name in alvo],
    }


# ── Listar / Sincronizar / Actualizar (antes no browser) ────────────────────

def _fases(sacramento):
    fases = frappe.get_all("Fase", filters={"fase_de_sacramento": 1, "sacramento": sacramento}, pluck="name")
    if not fases:
        frappe.throw(_("Nenhuma Fase está marcada para o sacramento {0} (Fase → Com Sacramento).").format(sacramento))
    return fases


@frappe.whitelist()
def listar_candidatos(nome):
    """Acrescenta os catecúmenos activos, de turmas activas, nas fases do sacramento e ainda sem ele.
    Os que já estão na lista ficam com os dados do catecúmeno actualizados."""
    doc = _doc(nome, "write")
    _rascunho(doc)
    if not doc.sacramento:
        frappe.throw(_("Seleccione o Sacramento primeiro."))

    turmas = frappe.get_all("Turma", filters={"status": "Activo"}, pluck="name")
    if not turmas:
        frappe.throw(_("Nenhuma Turma Activa encontrada."))
    filtros = {"fase": ["in", _fases(doc.sacramento)], "status": "Activo", "turma": ["in", turmas]}
    campo = CAMPO_SACRAMENTO.get(doc.sacramento)
    if campo:
        filtros[campo] = 0

    existentes = {r.catecumeno: r for r in doc.get(TABELA)}
    adicionados = actualizados = 0
    for c in frappe.get_all("Catecumeno", filters=filtros, order_by="name asc", limit_page_length=0,
                            fields=["name", "fase", "turma", "sexo", "idade", "comunidade",
                                    "encarregado", "contacto", "padrinhos", "contacto_padrinhos"]):
        dados = {
            "turma": c.turma, "fase": c.fase, "sexo": c.sexo, "idade": c.idade,
            "encarregado": c.encarregado, "contacto_encarregado": c.contacto,
            "padrinhos": c.padrinhos, "contacto_padrinhos": c.contacto_padrinhos,
        }
        if c.name in existentes:
            existentes[c.name].update(dados)
            actualizados += 1
        else:
            doc.append(TABELA, dict(dados, catecumeno=c.name, comunidade=c.comunidade,
                                    situacao="Vai receber", ficha=0, documentos_padrinhos=0))
            adicionados += 1
    doc.save()
    return {"adicionados": adicionados, "actualizados": actualizados}


@frappe.whitelist()
def sincronizar(nome, aplicar=0):
    """Quem já não cumpre os critérios (inactivo, sem turma activa, outra fase, já recebeu).
    Com aplicar=1 remove-os. Quem "Não vai receber" nunca é removido (fica o registo)."""
    doc = _doc(nome, "write")
    _rascunho(doc)
    if not doc.sacramento:
        frappe.throw(_("Seleccione o Sacramento primeiro."))

    fases = set(_fases(doc.sacramento))
    turmas = set(frappe.get_all("Turma", filters={"status": "Activo"}, pluck="name"))
    campo = CAMPO_SACRAMENTO.get(doc.sacramento)
    nomes = [r.catecumeno for r in doc.get(TABELA) if r.catecumeno]
    cats = {c.name: c for c in frappe.get_all(
        "Catecumeno", filters={"name": ["in", nomes or [""]]}, limit_page_length=0,
        fields=["name", "fase", "turma", "status", "comunidade"] + ([campo] if campo else []))}

    removidos, manter = [], []
    for r in doc.get(TABELA):
        if nao_recebe(r):
            manter.append(r)
            continue
        c = cats.get(r.catecumeno)
        santa_ana = c and c.comunidade == "Santa Ana"
        if not c:
            motivo = _("Catecúmeno não encontrado")
        elif c.status != "Activo":
            motivo = _("Estado: {0}").format(c.status)
        elif not santa_ana and not c.turma:
            motivo = _("Sem turma atribuída")
        elif not santa_ana and c.turma not in turmas:
            motivo = _('Turma "{0}" não está activa').format(c.turma)
        elif not santa_ana and c.fase not in fases:
            motivo = _('Fase "{0}" não é do sacramento').format(c.fase or "—")
        elif campo and cint(c.get(campo)):
            motivo = _("Já recebeu o sacramento")
        else:
            motivo = None
        if motivo:
            removidos.append({"catecumeno": r.catecumeno, "motivo": motivo})
        else:
            manter.append(r)

    if cint(aplicar) and removidos:
        doc.set(TABELA, manter)
        doc.save()
    return {"removidos": removidos, "aplicado": bool(cint(aplicar) and removidos)}


@frappe.whitelist()
def actualizar_catecumenos(nome):
    """Copia encarregado, padrinhos, contactos, sexo e idade da lista para os Catecúmenos."""
    doc = _doc(nome, "write")
    feitos, falhas = 0, []
    for r in doc.get(TABELA):
        if not r.catecumeno or not frappe.db.exists("Catecumeno", r.catecumeno):
            continue
        c = frappe.get_doc("Catecumeno", r.catecumeno)
        c.update({
            "encarregado": r.encarregado, "contacto": r.contacto_encarregado,
            "padrinhos": r.padrinhos, "contacto_padrinhos": r.contacto_padrinhos,
            "sexo": r.sexo, "idade": r.idade,
        })
        frappe.db.savepoint("actualizar_catecumeno")
        try:
            c.save()
            feitos += 1
        except frappe.ValidationError as e:
            frappe.db.rollback(save_point="actualizar_catecumeno")
            # um registo com problemas não impede os outros
            falhas.append({"catecumeno": r.catecumeno, "erro": frappe.utils.strip_html(str(e))})
    frappe.clear_messages()
    return {"actualizados": feitos, "falhas": falhas}


# ── Link e submissão ─────────────────────────────────────────────────────────

@frappe.whitelist()
def gerar_link(nome, expira_em=None, permite_editar=None):
    return _doc(nome, "write").gerar_link_encarregados(expira_em=expira_em, permite_editar=permite_editar)


@frappe.whitelist()
def revogar_link(nome):
    _doc(nome, "write").revogar_link_encarregados()


@frappe.whitelist()
def submeter(nome):
    doc = _doc(nome, "submit")
    _rascunho(doc)
    if not doc.vao_receber():
        frappe.throw(_("Não há candidatos marcados como \"Vai receber\"."))
    doc.submit()
    return {"recebem": len(doc.vao_receber()),
            "nao_recebem": sum(1 for r in doc.get(TABELA) if r.catecumeno and nao_recebe(r))}

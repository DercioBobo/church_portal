"""
Relatório Anual — geração do documento Word (docxtpl).

O modelo por omissão está em modelo_relatorio_anual.docx (gerado por
build_modelo.py a partir do relatório de 2025). Cada Relatório Anual pode
anexar o seu próprio modelo em `modelo_docx`.
"""

import html
import io
import os
import re
import zipfile

import frappe
from frappe import _
from frappe.utils import getdate, nowdate

from portal.catequese.utils import definicao
from portal.catequista.relatorio_anual import dados

MODELO_PADRAO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelo_relatorio_anual.docx")


def linhas(texto):
    """Texto livre → lista de pontos (um por linha, sem marcadores manuais)."""
    out = []
    for l in (texto or "").splitlines():
        l = l.strip().lstrip("-•*·").strip()
        if l:
            out.append(l)
    return out


def _num(v, vazio="-"):
    return str(v) if v else vazio


def contexto(doc):
    ano = dados.ano_int(doc.ano_lectivo)

    # Meses: só linhas incluídas, ordenadas por mês → data → posição
    por_mes = {}
    for row in sorted(doc.meses, key=lambda r: (
        dados.MESES.index(r.mes) if r.mes in dados.MESES else 99,
        getdate(r.data) if r.data else getdate(f"{ano}-12-31"),
        r.idx,
    )):
        if row.incluir and (row.texto or "").strip():
            # notas com várias linhas → um só parágrafo (cada linha do mês é um ponto)
            por_mes.setdefault(row.mes, []).append(" ".join(row.texto.split()))
    meses = [{"nome": m, "itens": por_mes[m]} for m in dados.MESES if m in por_mes]

    ao_longo = ([doc.resumo_retiros] if doc.incluir_resumo_retiros and doc.resumo_retiros else []) \
        + linhas(doc.ao_longo_do_ano)

    desafios = linhas(doc.desafios)
    if doc.incluir_nao_realizadas and doc.nao_realizadas:
        desafios.append(doc.nao_realizadas)

    # Estatística
    est_par = linhas(doc.texto_catequistas) or [_texto_catequistas(doc, ano)]
    est_par += linhas(doc.texto_catequizandos) or [_texto_catequizandos(doc, ano)]

    estatistica = [
        {
            "indicador": r.indicador,
            "santa_ana": _num(r.santa_ana),
            "sede": _num(r.sede, "0"),
            "total": _num((r.sede or 0) + (r.santa_ana or 0), "0"),
            "ano_anterior": _num(r.ano_anterior),
        }
        for r in doc.estatistica
    ]
    notas = [f"{r.indicador}: {r.detalhe.strip()}" for r in doc.estatistica if (r.detalhe or "").strip()]

    fases = dados.catequizandos(doc.ano_lectivo)["fases"] if doc.incluir_fases else []

    fin = None
    if doc.incluir_financas:
        receitas, despesas = dados.financas(doc.ano_lectivo)
        tot_r = sum(x.valor or 0 for x in receitas)
        tot_d = sum(x.valor or 0 for x in despesas)
        fin = {
            "texto": (
                f"Durante o ano o ministério registou receitas de {dados.fmt_mt(tot_r)} MT "
                f"e despesas de {dados.fmt_mt(tot_d)} MT, com um saldo de {dados.fmt_mt(tot_r - tot_d)} MT."
            ),
            "linhas": (
                [{"rubrica": x.rubrica, "receita": dados.fmt_mt(x.valor), "despesa": "-"} for x in receitas]
                + [{"rubrica": x.rubrica, "receita": "-", "despesa": dados.fmt_mt(x.valor)} for x in despesas]
                + [{"rubrica": "Total", "receita": dados.fmt_mt(tot_r), "despesa": dados.fmt_mt(tot_d)}]
            ),
        }

    assin = getdate(doc.data_assinatura or nowdate())
    return {
        "cab": {
            "paroquia": doc.paroquia or definicao("paroquia"),
            "comunidades": doc.comunidades or definicao("comunidades"),
            "ministerio": doc.ministerio or definicao("ministerio"),
        },
        "ano": ano,
        "ano_anterior": ano - 1,
        "lema": (doc.lema or "").strip().strip('"“”'),
        "introducao": linhas(doc.introducao) or [dados.introducao_automatica(ano, {
            "taxa": doc.taxa_realizacao or 0,
            "ano_terminado": getdate(nowdate()).year > ano,
        })],
        "meses": meses,
        "ao_longo_do_ano": ao_longo,
        "extraordinarias": linhas(doc.extraordinarias),
        "desafios": desafios,
        "propostas": linhas(doc.propostas),
        "estatistica_paragrafos": est_par,
        "estatistica": estatistica,
        "notas_estatistica": notas,
        "fases": fases,
        "financas": fin,
        "local_data": f"{doc.local or definicao('local')}, {dados.mes_nome(assin)} de {assin.year}",
    }


def _texto_catequistas(doc, ano):
    activos = doc.catequistas_activos or 0
    if doc.catequistas_enviados:
        t = (f"Dos {doc.catequistas_enviados} catequistas enviados, contamos com o apoio permanente de "
             f"{activos} catequistas na comunidade sede para o ano de {ano}.")
    else:
        t = f"Contamos com o apoio permanente de {activos} catequistas na comunidade sede para o ano de {ano}."
    if doc.catequistas_desistencias:
        t += (f" Verificou-se a desistência de {doc.catequistas_desistencias} catequistas ao longo do ano, "
              "relacionadas com motivos académicos, profissionais, entre outros.")
    return t


def _texto_catequizandos(doc, ano):
    t = (f"Para este ano a catequese conta com {doc.catequizandos_inscritos or 0} catequizandos inscritos "
         f"na comunidade sede, distribuídos por {doc.catequizandos_turmas or 0} turmas, desde crianças, "
         "adolescentes, jovens e adultos.")
    partes = []
    if doc.catequizandos_desistencias:
        partes.append(f"{doc.catequizandos_desistencias} desistências")
    if doc.catequizandos_transferencias:
        partes.append(f"{doc.catequizandos_transferencias} transferências para outras paróquias")
    if doc.catequizandos_trocas:
        partes.append(f"{doc.catequizandos_trocas} trocas de turma")
    if partes:
        t += " Ao longo do ano registaram-se " + ", ".join(partes[:-1]) + \
             (" e " if len(partes) > 1 else "") + partes[-1] + "."
    return t


def _caminho_modelo(doc):
    if doc.modelo_docx:
        f = frappe.get_doc("File", {"file_url": doc.modelo_docx})
        return f.get_full_path()
    if not os.path.exists(MODELO_PADRAO):
        frappe.throw(_(
            "O modelo Word padrão não foi encontrado no servidor ({0}). "
            "Confirme que o ficheiro modelo_relatorio_anual.docx foi incluído no commit, "
            "ou anexe um modelo personalizado no campo \"Modelo Word personalizado\"."
        ).format(MODELO_PADRAO))
    return MODELO_PADRAO


def render(doc):
    caminho, ctx = _caminho_modelo(doc), contexto(doc)
    try:
        from docxtpl import DocxTemplate
    except ImportError:
        return render_simples(caminho, ctx)

    tpl = DocxTemplate(caminho)
    tpl.render(ctx, autoescape=True)
    buf = io.BytesIO()
    tpl.save(buf)
    return buf.getvalue()


# Parágrafo / linha de tabela que contém {%p ... %} / {%tr ... %} → só a etiqueta Jinja
_RE_P = re.compile(r"<w:p\b[^>]*>(?:(?!</w:p>).)*?\{%p\s+(.*?)\s*%\}(?:(?!</w:p>).)*?</w:p>", re.S)
_RE_TR = re.compile(r"<w:tr\b[^>]*>(?:(?!</w:tr>).)*?\{%tr\s+(.*?)\s*%\}(?:(?!</w:tr>).)*?</w:tr>", re.S)


def render_simples(caminho, ctx):
    """
    Renderizador sem dependências (usa o Jinja do Frappe) para quando o docxtpl
    não está instalado. Suporta o que o modelo padrão usa: {{ }}, {%p %} e {%tr %}
    com cada etiqueta num único run — modelos editados no Word que partam as
    etiquetas precisam do docxtpl.
    """
    import jinja2

    env = jinja2.Environment(autoescape=True, undefined=jinja2.ChainableUndefined)
    src = io.BytesIO()
    with zipfile.ZipFile(caminho) as zin, zipfile.ZipFile(src, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "word/document.xml":
                xml = data.decode("utf-8")
                xml = _RE_TR.sub(lambda m: "{% " + html.unescape(m.group(1)) + " %}", xml)
                xml = _RE_P.sub(lambda m: "{% " + html.unescape(m.group(1)) + " %}", xml)
                data = env.from_string(xml).render(ctx).encode("utf-8")
            zout.writestr(item, data)
    return src.getvalue()


def gerar(doc):
    """Gera o .docx, substitui o anexo anterior e devolve o file_url."""
    conteudo = render(doc)
    nome = f"Relatório {doc.ano_lectivo} - Ministério da Catequese.docx"

    for old in frappe.get_all("File", filters={
        "attached_to_doctype": doc.doctype, "attached_to_name": doc.name, "file_name": nome,
    }, pluck="name"):
        frappe.delete_doc("File", old, ignore_permissions=True)

    f = frappe.get_doc({
        "doctype": "File",
        "file_name": nome,
        "attached_to_doctype": doc.doctype,
        "attached_to_name": doc.name,
        "is_private": 1,
        "content": conteudo,
    }).insert(ignore_permissions=True)
    return f.file_url


@frappe.whitelist()
def descarregar_modelo():
    """Descarrega o modelo Word por omissão para o coordenador personalizar."""
    roles = frappe.get_roles()
    if "System Manager" not in roles and "Coordenador Catequese" not in roles:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)
    with open(MODELO_PADRAO, "rb") as fh:
        frappe.local.response.filename = "Modelo - Relatório Anual.docx"
        frappe.local.response.filecontent = fh.read()
        frappe.local.response.type = "download"

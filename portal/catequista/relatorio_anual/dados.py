"""
Relatório Anual — recolha de dados do sistema.

Tudo aqui é apenas leitura e refere-se à comunidade sede (Assunção).
Os números de Santa Ana só entram quando o próprio registo os identifica
(ex.: candidatos da Preparação do Sacramento com comunidade = Santa Ana).
"""

import json
from datetime import date

import frappe
from frappe.utils import getdate, nowdate

from portal.catequese.utils import e_externa

MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

SANTA_ANA = "Santa Ana"

# Artigo usado em "o Sacramento do/da ..."
SACRAMENTO_ARTIGO = {"Baptismo": "do", "Eucaristia": "da", "Crisma": "do"}


def ano_int(ano_lectivo):
    return int(str(ano_lectivo).strip()[:4])


def mes_nome(d):
    return MESES[d.month - 1]


def _dia_mes(d):
    return f"{d.day:02d} de {mes_nome(d).lower()}"


def _e_santa_ana(comunidade):
    return SANTA_ANA.lower() in (comunidade or "").lower()


def _limite(ano):
    """Último dia considerado: 31/12 ou hoje, se o ano ainda decorre."""
    return min(date(ano, 12, 31), getdate(nowdate()))


# ── Plano anual ────────────────────────────────────────────────────────────────

def _actividades(ano_lectivo):
    return frappe.db.sql("""
        SELECT name, actividade, estado, data, data_fim, data_original,
               orador, local, notas_execucao, organizador, so_este_ano
        FROM `tabActividade do Plano`
        WHERE ano_lectivo = %s
        ORDER BY data IS NULL, data, name
    """, (ano_lectivo,), as_dict=True)


def _frase_actividade(a):
    d, d2 = a.data, a.data_fim
    if d2 and d2 != d:
        if d2.month == d.month:
            quando = f"Dos dias {d.day:02d} a {d2.day:02d} de {mes_nome(d).lower()}"
        else:
            quando = f"De {_dia_mes(d)} a {_dia_mes(d2)}"
    else:
        quando = f"No dia {_dia_mes(d)}"

    texto = f"{quando}: {(a.actividade or '').strip().rstrip('.')}"
    if a.local:
        texto += f", em {a.local.strip()}"
    if a.orador:
        texto += f", com {a.orador.strip()}"
    texto += "."
    if a.notas_execucao:
        texto += " " + a.notas_execucao.strip()
    return texto


def resumo_actividades(ano_lectivo):
    ano = ano_int(ano_lectivo)
    limite = _limite(ano)
    acts = _actividades(ano_lectivo)

    datadas = [a for a in acts if a.data and getdate(a.data) <= limite]
    # Canceladas por outros organizadores (zona, vigararia, arquidiocese) não contam para a percentagem
    canceladas_ext = [a for a in datadas if a.estado == "Cancelada" and e_externa(a.organizador)]
    previstas = [a for a in datadas if a not in canceladas_ext]
    realizadas = [a for a in previstas if a.estado == "Realizada"]
    nao_realizadas = [a for a in previstas if a.estado in ("Cancelada", "Adiada", "Pendente")]
    extraordinarias = [a for a in realizadas if a.so_este_ano]

    taxa = round(100.0 * len(realizadas) / len(previstas)) if previstas else 0

    partes = []
    for a in nao_realizadas:
        if a.estado == "Adiada":
            partes.append(f"{a.actividade} (adiada)")
        elif a.estado == "Cancelada":
            partes.append(f"{a.actividade} (cancelada)")
        else:
            partes.append(a.actividade)
    texto_nao = (
        "Não foi possível realizar as seguintes actividades previstas no plano: "
        + "; ".join(partes) + "."
    ) if partes else ""

    texto_ext = (
        "Actividades de outros organizadores que foram canceladas (não contam para a percentagem): "
        + "; ".join(f"{a.actividade} ({a.organizador})" for a in canceladas_ext) + "."
    ) if canceladas_ext else ""

    return {
        "taxa": taxa,
        "canceladas_externas": texto_ext,
        "extraordinarias": [_frase_actividade(a) for a in extraordinarias],
        "previstas": len(previstas),
        "realizadas": len(realizadas),
        "total_plano": len(acts),
        "ano_terminado": limite == date(ano, 12, 31),
        "nao_realizadas": texto_nao,
        "resumo": (
            f"{len(realizadas)} realizadas de {len(previstas)} previstas até "
            f"{limite.strftime('%d/%m/%Y')} ({len(acts)} no plano). "
            f"Canceladas: {sum(a.estado == 'Cancelada' for a in previstas)}; "
            f"adiadas: {sum(a.estado == 'Adiada' for a in previstas)}; "
            f"pendentes: {sum(a.estado == 'Pendente' for a in previstas)}."
            + (f" Canceladas pela zona/vigararia/arquidiocese (não contam): {len(canceladas_ext)}."
               if canceladas_ext else "")
        ),
        "itens": [
            {
                "mes": mes_nome(a.data), "data": a.data, "texto": _frase_actividade(a),
                "origem": "Plano Anual", "referencia": f"ACT:{a.name}",
            }
            for a in realizadas
        ],
    }


def introducao_automatica(ano, r):
    ate = "" if r["ano_terminado"] else " até à data"
    return (
        "O presente relatório apresenta o percurso do Ministério da Catequese e Formação "
        "Permanente da nossa Paróquia ao longo do ano de "
        f"{ano}, no qual foram realizadas{ate} {r['taxa']}% das actividades previstas "
        "para o ano em referência ao nível da arquidiocese, zona e paróquia."
    )


# ── Retiros ────────────────────────────────────────────────────────────────────

def resumo_retiros(ano_lectivo):
    rows = frappe.db.sql("""
        SELECT r.name, r.fase_1, r.fase_2
        FROM `tabPlano de Retiro` r
        WHERE r.ano_lectivo = %s AND r.estado = 'Realizado'
    """, (ano_lectivo,), as_dict=True)
    if not rows:
        return ""
    fases = []
    for r in rows:
        for f in (r.fase_1, r.fase_2):
            if f and f not in fases:
                fases.append(f)
    plural = "retiro" if len(rows) == 1 else "retiros"
    texto = f"Ao longo do ano foram realizados {len(rows)} {plural}"
    if fases:
        texto += f", abrangendo as seguintes fases: {', '.join(fases)}"
    return texto + ", o que constitui um ganho para a catequese, pois esta exposição estimula o crescimento espiritual."


# ── Sacramentos ────────────────────────────────────────────────────────────────

def _candidatos(ano_lectivo, sacramento=None):
    cond = "AND p.sacramento = %(sac)s" if sacramento else ""
    return frappe.db.sql(f"""
        SELECT p.name AS preparacao, p.sacramento,
               COALESCE(c.date, p.data_do_sacramento) AS data,
               c.catecumeno, c.comunidade
        FROM `tabPreparacao do Sacramento` p
        JOIN `tabCandidatos ao Sacramento Table` c
          ON c.parent = p.name AND c.parenttype = 'Preparacao do Sacramento'
        WHERE p.ano_lectivo = %(ano)s AND p.docstatus < 2 {cond}
          AND IFNULL(c.situacao, '') != 'Não vai receber'
    """, {"ano": ano_lectivo, "sac": sacramento}, as_dict=True)


def itens_sacramentos(ano_lectivo):
    """Uma linha por celebração (sacramento + data), com contagem por comunidade."""
    grupos = {}
    for c in _candidatos(ano_lectivo):
        if not c.data:
            continue
        g = grupos.setdefault((c.sacramento, getdate(c.data)), {"sede": set(), "sa": set()})
        g["sa" if _e_santa_ana(c.comunidade) else "sede"].add(c.catecumeno)

    itens = []
    for (sac, d), g in sorted(grupos.items(), key=lambda x: x[0][1]):
        sede, sa = len(g["sede"]), len(g["sa"])
        art = SACRAMENTO_ARTIGO.get(sac, "do")
        partes = []
        if sede:
            partes.append(f"{sede} na comunidade sede")
        if sa:
            partes.append(f"{sa} na comunidade Santa Ana")
        texto = (
            f"No dia {_dia_mes(d)}, {sede + sa} catecúmenos receberam o Sacramento {art} {sac}"
            + (f" ({' e '.join(partes)})" if partes else "") + "."
        )
        itens.append({
            "mes": mes_nome(d), "data": d, "texto": texto,
            "origem": "Sacramento", "referencia": f"SAC:{sac}:{d.isoformat()}",
        })
    return itens


def baptismos(ano_lectivo):
    """
    Baptismos de catecúmenos do Livro de Baptismo (programados + esporádicos).
    Os baptismos de crianças não estão no livro — têm linha própria, manual.
    Se o livro não tiver registos para o ano, usa os candidatos da preparação.
    """
    livro = frappe.db.sql("""
        SELECT nome_completo, comunidade
        FROM `tabLivro de Baptismo`
        WHERE ano = %s
    """, (ano_lectivo,), as_dict=True)

    if not livro:
        cands = _candidatos(ano_lectivo, "Baptismo")
        return {
            "sede": len({c.catecumeno for c in cands if not _e_santa_ana(c.comunidade)}),
            "santa_ana": len({c.catecumeno for c in cands if _e_santa_ana(c.comunidade)}),
            "detalhe": "",
        }

    programados = {c.catecumeno for c in _candidatos(ano_lectivo, "Baptismo")}
    sede = [r for r in livro if not _e_santa_ana(r.comunidade)]
    esporadicos = sum(1 for r in sede if r.nome_completo not in programados)
    return {
        "sede": len(sede),
        "santa_ana": len(livro) - len(sede),
        "detalhe": (
            f"inclui {esporadicos} {'baptismo' if esporadicos == 1 else 'baptismos'} "
            "fora das celebrações programadas (comunidade sede)"
            if esporadicos else ""
        ),
    }


def sacramento_simples(ano_lectivo, sacramento):
    cands = _candidatos(ano_lectivo, sacramento)
    return {
        "sede": len({c.catecumeno for c in cands if not _e_santa_ana(c.comunidade)}),
        "santa_ana": len({c.catecumeno for c in cands if _e_santa_ana(c.comunidade)}),
        "detalhe": "",
    }


# ── Catequizandos ──────────────────────────────────────────────────────────────

def catequizandos(ano_lectivo):
    """Catequizandos inscritos nas turmas do ano (exclui os marcados como Santa Ana)."""
    rows = frappe.db.sql("""
        SELECT tc.catecumeno, tc.estado, tc.nr_de_faltas, t.name AS turma, t.fase,
               f.ordem
        FROM `tabTurma` t
        JOIN `tabTurma Catecumenos` tc
          ON tc.parent = t.name AND tc.parenttype = 'Turma'
        LEFT JOIN `tabCatecumeno` c ON c.name = tc.catecumeno
        LEFT JOIN `tabFase` f ON f.name = t.fase
        WHERE t.ano_lectivo = %s
          AND COALESCE(c.comunidade, '') != %s
    """, (ano_lectivo, SANTA_ANA), as_dict=True)

    ano = ano_int(ano_lectivo)
    inicio, fim = date(ano, 1, 1), date(ano, 12, 31)

    transferencias = frappe.db.count("Transferencia de Catecumeno", {
        "docstatus": ["<", 2], "data": ["between", [inicio, fim]],
    })
    trocas = frappe.db.count("Troca de Turma", {
        "docstatus": ["<", 2], "data_da_troca": ["between", [inicio, fim]],
    })

    fases = {}
    inscritos, desistentes = set(), set()
    faltas = []
    for r in rows:
        inscritos.add(r.catecumeno)
        f = fases.setdefault(r.fase or "Sem fase", {
            "ordem": r.ordem if r.ordem is not None else 999,
            "turmas": set(), "cat": set(), "des": set(),
        })
        f["turmas"].add(r.turma)
        f["cat"].add(r.catecumeno)
        if r.estado == "Inativo":
            desistentes.add(r.catecumeno)
            f["des"].add(r.catecumeno)
        elif r.nr_de_faltas is not None:
            faltas.append(r.nr_de_faltas)

    return {
        "inscritos": len(inscritos),
        "turmas": len({r.turma for r in rows}),
        "desistencias": len(desistentes),
        "transferencias": transferencias,
        "trocas": trocas,
        "media_faltas": round(sum(faltas) / len(faltas), 1) if faltas else 0,
        "fases": [
            {"fase": nome, "turmas": len(v["turmas"]), "catequizandos": len(v["cat"]),
             "desistencias": len(v["des"])}
            for nome, v in sorted(fases.items(), key=lambda x: (x[1]["ordem"], x[0]))
        ],
    }


# ── Catequistas ────────────────────────────────────────────────────────────────

def _datas_inactivacao():
    """
    Data em que cada catequista passou a Inactivo, lida do histórico (Version).
    Se voltou a Activo depois, deixa de contar.
    """
    datas = {}
    versions = frappe.db.sql("""
        SELECT docname, creation, data
        FROM `tabVersion`
        WHERE ref_doctype = 'Catequista' AND data LIKE '%%"status"%%'
        ORDER BY creation
    """, as_dict=True)
    for v in versions:
        try:
            changed = json.loads(v.data or "{}").get("changed") or []
        except ValueError:
            continue
        for campo, _antes, depois in changed:
            if campo != "status":
                continue
            if depois == "Inactivo":
                datas[v.docname] = getdate(v.creation)
            else:
                datas.pop(v.docname, None)
    return datas


def catequistas(ano_lectivo):
    ano = ano_int(ano_lectivo)
    inicio, fim = date(ano, 1, 1), date(ano, 12, 31)
    datas = _datas_inactivacao()

    activos = desistencias = sem_data = 0
    for c in frappe.get_all("Catequista", fields=["name", "status", "creation"]):
        if getdate(c.creation) > fim:
            continue
        if c.status != "Inactivo":
            activos += 1
            continue
        d = datas.get(c.name)
        if d is None:
            sem_data += 1          # inactivo sem histórico: assume-se anterior ao ano
        elif d > fim:
            activos += 1           # ainda estava activo no fim do ano
        elif d >= inicio:
            desistencias += 1
    return {"activos": activos, "desistencias": desistencias, "inactivos_sem_data": sem_data}


# ── Finanças ───────────────────────────────────────────────────────────────────

def financas(ano_lectivo):
    receitas = frappe.db.sql("""
        SELECT COALESCE(NULLIF(fonte, ''), 'Outro') AS rubrica, SUM(valor) AS valor
        FROM `tabReceita Catequese` WHERE ano_lectivo = %s GROUP BY 1 ORDER BY 2 DESC
    """, (ano_lectivo,), as_dict=True)
    despesas = frappe.db.sql("""
        SELECT COALESCE(NULLIF(categoria, ''), 'Outro') AS rubrica, SUM(valor) AS valor
        FROM `tabDespesa Catequese` WHERE ano_lectivo = %s GROUP BY 1 ORDER BY 2 DESC
    """, (ano_lectivo,), as_dict=True)
    return receitas, despesas


def fmt_mt(v):
    if not v:
        return "-"
    s = f"{v:,.2f}"                               # 12,345.67
    return s.replace(",", " ").replace(".", ",")  # 12 345,67

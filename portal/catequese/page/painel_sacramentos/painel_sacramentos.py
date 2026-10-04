"""
Página Sacramentos: acompanhamento de quem falhou um sacramento.

- "Não receberam": candidatos marcados "Não vai receber" numa Preparação e que ainda
  não têm o sacramento (com o motivo e a Preparação).
- "Sem motivo registado": catecúmenos activos numa fase posterior à fase do sacramento
  (Fase.ordem) que não o têm e não aparecem como "Não vai receber".
- "Já receberam depois": falharam mas entretanto receberam (2ª oportunidade).
A fase de cada sacramento vem da Fase (Com Sacramento + Sacramento).
"""

import frappe
from frappe.utils import cint

from portal.catequese.utils import ano_actual

NAO_RECEBE = "Não vai receber"

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

    return {
        "ano": ano,
        "sacramentos": [_sacramento(s, rotulo, campo, campo_data, fases, ordem, ano)
                        for s, rotulo, campo, campo_data in SACRAMENTOS],
    }


def _sacramento(sac, rotulo, campo, campo_data, fases, ordem, ano):
    fases_sac = [f.name for f in fases if f.fase_de_sacramento and f.sacramento == sac]
    ordem_sac = min((ordem[f] for f in fases_sac if ordem[f]), default=0)

    pendentes, resolvidos = _falharam(sac, campo, campo_data)
    ja_listados = {r.catecumeno for r in pendentes}
    return {
        "sacramento": sac,
        "rotulo": rotulo,
        "fases": fases_sac,
        "pendentes": pendentes,
        "resolvidos": resolvidos,
        "sem_motivo": _sem_motivo(campo, ordem, ordem_sac, ja_listados) if ordem_sac else [],
        "preparacoes": _preparacoes(sac, ano),
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


def _preparacoes(sac, ano):
    return frappe.db.sql("""
        SELECT p.name, p.data_do_sacramento AS data, p.docstatus,
               COALESCE(SUM(c.name IS NOT NULL AND IFNULL(c.situacao, '') != %(nao)s), 0) AS vao,
               COALESCE(SUM(c.situacao = %(nao)s), 0) AS nao
        FROM `tabPreparacao do Sacramento` p
        LEFT JOIN `tabCandidatos ao Sacramento Table` c
          ON c.parent = p.name AND c.parenttype = 'Preparacao do Sacramento'
        WHERE p.sacramento = %(sac)s AND p.ano_lectivo = %(ano)s AND p.docstatus < 2
        GROUP BY p.name
        ORDER BY p.data_do_sacramento
    """, {"sac": sac, "ano": ano, "nao": NAO_RECEBE}, as_dict=True)

"""
Painel da Catequese — página inicial com todas as páginas da app.

A lista é automática: todas as Pages dos módulos da app `portal` a que o
utilizador tem acesso. O registo PAGINAS só acrescenta ícone, grupo e
descrição; uma página nova sem registo aparece em "Outras".
"""

import frappe

from portal.catequese.utils import ano_actual, definicao

PAINEL = "painel-catequese"

GRUPOS = ["Consulta", "Ano lectivo", "Planeamento", "Finanças", "Outras"]

PAGINAS = {
    "consulta-rapida": {
        "icone": "🔎", "grupo": "Consulta", "ordem": 1,
        "descricao": "Fases, turmas, catequistas e contactos dos encarregados num só sítio.",
    },
    "qualidade-dados": {
        "icone": "🩺", "grupo": "Consulta", "ordem": 2,
        "descricao": "Registos incompletos ou incoerentes, com correcções rápidas.",
    },
    "aniversariantes-hoje": {
        "icone": "🎂", "grupo": "Consulta", "ordem": 3,
        "descricao": "Catecúmenos que fazem anos hoje.",
    },
    "abrir-encerrar-ano": {
        "icone": "📅", "grupo": "Ano lectivo", "ordem": 1,
        "descricao": "Lista de verificação para encerrar o ano e preparar o seguinte.",
    },
    "plano-anual": {
        "icone": "🗓️", "grupo": "Planeamento", "ordem": 1,
        "descricao": "Actividades do ano: datas, responsáveis, estado e orçamento.",
    },
    "rollover-plano": {
        "icone": "🔁", "grupo": "Planeamento", "ordem": 2,
        "descricao": "Proposta do plano do ano seguinte: copiar, discutir em reunião, imprimir e finalizar.",
    },
    "plano-retiro": {
        "icone": "⛪", "grupo": "Planeamento", "ordem": 3,
        "descricao": "Retiros por fase: datas, locais, oradores e programa.",
    },
    "despesas-catequese": {
        "icone": "💰", "grupo": "Finanças", "ordem": 1,
        "descricao": "Receitas, despesas e quotas do ministério.",
    },
}

# Atalhos para os registos mais usados (DocTypes)
REGISTOS = [
    ("Catecumeno", "Catecúmenos", "👦"),
    ("Turma", "Turmas", "👥"),
    ("Inscricao", "Inscrições", "📝"),
    ("Catequista", "Catequistas", "🙋"),
    ("Preparacao do Sacramento", "Preparações do Sacramento", "✝️"),
    ("Livro de Baptismo", "Livro de Baptismo", "📖"),
    ("Relatorio Anual", "Relatório Anual", "📄"),
    ("Catequese Settings", "Catequese Settings", "⚙️"),
]


def _modulos():
    return frappe.get_module_list("portal")


@frappe.whitelist()
def get_painel():
    paginas = []
    for p in frappe.get_all("Page", filters={"module": ["in", _modulos()]},
                            fields=["name", "title", "module"]):
        if p.name == PAINEL or not frappe.get_doc("Page", p.name).is_permitted():
            continue
        meta = PAGINAS.get(p.name, {})
        paginas.append({
            "name": p.name,
            "titulo": p.title or p.name,
            "icone": meta.get("icone", "📄"),
            "grupo": meta.get("grupo", "Outras"),
            "ordem": meta.get("ordem", 99),
            "descricao": meta.get("descricao", ""),
        })

    grupos = []
    for g in GRUPOS:
        itens = sorted([p for p in paginas if p["grupo"] == g], key=lambda x: (x["ordem"], x["titulo"]))
        if itens:
            grupos.append({"nome": g, "paginas": itens})

    registos = [
        {"doctype": dt, "rotulo": rotulo, "icone": icone, "rota": "/app/" + frappe.scrub(dt).replace("_", "-")}
        for dt, rotulo, icone in REGISTOS
        if frappe.has_permission(dt, "read")
    ]
    return {
        "grupos": grupos,
        "registos": registos,
        "resumo": _resumo(),
        "paroquia": definicao("paroquia"),
        "ano": ano_actual(),
        "utilizador": frappe.utils.get_fullname(frappe.session.user).split(" ")[0],
    }


def _resumo():
    def contar(dt, filtros):
        try:
            return frappe.db.count(dt, filtros) if frappe.has_permission(dt, "read") else None
        except Exception:
            return None

    ano = ano_actual()
    tiles = [
        ("Catecúmenos activos", contar("Catecumeno", {"status": "Activo"}), "/app/catecumeno?status=Activo"),
        ("Turmas activas", contar("Turma", {"status": "Activo", **({"ano_lectivo": ano} if ano else {})}),
         "/app/turma?status=Activo"),
        ("Catequistas activos", contar("Catequista", {"status": "Activo"}), "/app/catequista?status=Activo"),
        ("Pré-inscrições pendentes", contar("Catecumeno", {"status": "Pendente"}), "/app/catecumeno?status=Pendente"),
    ]
    return [{"rotulo": r, "valor": v, "rota": rota} for r, v, rota in tiles if v is not None]

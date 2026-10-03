"""
Qualidade dos Dados — verificações de registos incompletos ou incoerentes
e correcções em massa para os casos simples.
"""

import frappe
from frappe import _

LIMITE = 1000


def _assert_coordenador():
    if frappe.session.user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    if not set(frappe.get_roles()) & {"System Manager", "Coordenador Catequese"}:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


# Cada verificação: título, descrição, colunas mostradas, correcção (ou None)
VERIFICACOES = {
    "cat_sem_comunidade": {
        "titulo": "Catecúmenos sem comunidade",
        "descricao": "Activos ou pendentes sem comunidade (Assunção / Santa Ana) definida.",
        "doctype": "Catecumeno",
        "colunas": ["turma", "fase", "status"],
        "correccao": {"campo": "comunidade", "valores": ["Assunção", "Santa Ana"]},
    },
    "cat_sem_sexo": {
        "titulo": "Catecúmenos sem sexo",
        "descricao": "Activos ou pendentes sem sexo indicado.",
        "doctype": "Catecumeno",
        "colunas": ["turma", "fase", "idade"],
        "correccao": {"campo": "sexo", "valores": ["Feminino", "Masculino"], "por_linha": True},
    },
    "cat_activo_sem_turma": {
        "titulo": "Activos sem turma",
        "descricao": "Estado Activo mas sem turma. Normalmente deviam estar Pendentes (à espera de turma).",
        "doctype": "Catecumeno",
        "colunas": ["fase", "comunidade"],
        "correccao": {"campo": "status", "valores": ["Pendente", "Inactivo"]},
    },
    "cat_turma_divergente": {
        "titulo": "Turma do registo diferente da turma real",
        "descricao": "O catecúmeno está na lista de uma turma activa, mas o registo aponta para outra turma.",
        "doctype": "Catecumeno",
        "colunas": ["turma", "turma_real"],
        "correccao": {"accao": "alinhar_turma", "rotulo": "Alinhar registo com a turma real"},
    },
    "cat_varias_turmas": {
        "titulo": "Em várias turmas activas",
        "descricao": "O mesmo catecúmeno aparece na lista de mais de uma turma activa.",
        "doctype": "Catecumeno",
        "colunas": ["turmas"],
        "correccao": None,
    },
    "cat_turma_inactiva": {
        "titulo": "Activos numa turma inactiva",
        "descricao": "Catecúmeno activo cujo registo aponta para uma turma já inactiva.",
        "doctype": "Catecumeno",
        "colunas": ["turma", "fase"],
        "correccao": None,
    },
    "cat_sem_nascimento": {
        "titulo": "Sem data de nascimento",
        "descricao": "Activos ou pendentes sem data de nascimento (a idade não é calculada).",
        "doctype": "Catecumeno",
        "colunas": ["turma", "encarregado", "contacto"],
        "correccao": None,
    },
    "catequista_sem_estado": {
        "titulo": "Catequistas sem estado",
        "descricao": "Catequistas sem estado Activo/Inactivo.",
        "doctype": "Catequista",
        "colunas": ["contacto_1", "nucleo"],
        "correccao": {"campo": "status", "valores": ["Activo", "Inactivo"]},
    },
    "catequista_sem_contacto": {
        "titulo": "Catequistas activos sem contacto",
        "descricao": "Sem nenhum número de telefone registado.",
        "doctype": "Catequista",
        "colunas": ["nucleo", "email"],
        "correccao": None,
    },
    "turma_sem_catequista": {
        "titulo": "Turmas activas sem catequista",
        "descricao": "Turmas activas sem catequista responsável atribuído.",
        "doctype": "Turma",
        "colunas": ["fase", "ano_lectivo", "catequistas"],
        "correccao": None,
    },
}


def _vivos():
    return "c.status IN ('Activo', 'Pendente')"


def _consultas():
    return {
        "cat_sem_comunidade": f"""
            SELECT c.name, c.turma, c.fase, c.status FROM `tabCatecumeno` c
            WHERE {_vivos()} AND IFNULL(c.comunidade, '') = '' ORDER BY c.name""",
        "cat_sem_sexo": f"""
            SELECT c.name, c.turma, c.fase, c.idade FROM `tabCatecumeno` c
            WHERE {_vivos()} AND IFNULL(c.sexo, '') = '' ORDER BY c.turma, c.name""",
        "cat_activo_sem_turma": """
            SELECT c.name, c.fase, c.comunidade FROM `tabCatecumeno` c
            WHERE c.status = 'Activo' AND IFNULL(c.turma, '') = '' ORDER BY c.name""",
        "cat_turma_divergente": """
            SELECT c.name, c.turma, MIN(t.name) AS turma_real FROM `tabCatecumeno` c
            JOIN `tabTurma Catecumenos` tc ON tc.catecumeno = c.name AND tc.parenttype = 'Turma'
            JOIN `tabTurma` t ON t.name = tc.parent AND t.status = 'Activo'
            GROUP BY c.name, c.turma
            HAVING COUNT(DISTINCT t.name) = 1 AND IFNULL(c.turma, '') != MIN(t.name)
            ORDER BY c.name""",
        "cat_varias_turmas": """
            SELECT c.name, GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ', ') AS turmas
            FROM `tabCatecumeno` c
            JOIN `tabTurma Catecumenos` tc ON tc.catecumeno = c.name AND tc.parenttype = 'Turma'
            JOIN `tabTurma` t ON t.name = tc.parent AND t.status = 'Activo'
            GROUP BY c.name HAVING COUNT(DISTINCT t.name) > 1 ORDER BY c.name""",
        "cat_turma_inactiva": """
            SELECT c.name, c.turma, c.fase FROM `tabCatecumeno` c
            JOIN `tabTurma` t ON t.name = c.turma
            WHERE c.status = 'Activo' AND t.status != 'Activo' ORDER BY c.turma, c.name""",
        "cat_sem_nascimento": f"""
            SELECT c.name, c.turma, c.encarregado, c.contacto FROM `tabCatecumeno` c
            WHERE {_vivos()} AND c.data_de_nascimento IS NULL ORDER BY c.turma, c.name""",
        "catequista_sem_estado": """
            SELECT name, contacto_1, nucleo FROM `tabCatequista`
            WHERE IFNULL(status, '') = '' ORDER BY name""",
        "catequista_sem_contacto": """
            SELECT name, nucleo, email FROM `tabCatequista`
            WHERE status = 'Activo' AND IFNULL(contacto_1, '') = '' AND IFNULL(contacto_2, '') = ''
            ORDER BY name""",
        "turma_sem_catequista": """
            SELECT name, fase, ano_lectivo, catequistas FROM `tabTurma`
            WHERE status = 'Activo' AND IFNULL(catequista, '') = '' ORDER BY name""",
    }


@frappe.whitelist()
def get_verificacoes():
    """Resumo: contagem por verificação."""
    _assert_coordenador()
    out = []
    for chave, q in _consultas().items():
        n = len(frappe.db.sql(q))
        meta = VERIFICACOES[chave]
        out.append({
            "chave": chave, "titulo": meta["titulo"], "descricao": meta["descricao"],
            "doctype": meta["doctype"], "colunas": meta["colunas"],
            "correccao": meta["correccao"], "total": n,
        })
    return out


@frappe.whitelist()
def get_registos(chave):
    _assert_coordenador()
    if chave not in VERIFICACOES:
        frappe.throw(_("Verificação desconhecida"))
    return frappe.db.sql(_consultas()[chave] + f" LIMIT {LIMITE}", as_dict=True)


@frappe.whitelist()
def corrigir(chave, nomes, valor=None):
    """Aplica a correcção da verificação aos registos indicados."""
    _assert_coordenador()
    meta = VERIFICACOES.get(chave)
    if not meta or not meta["correccao"]:
        frappe.throw(_("Esta verificação não tem correcção automática."))
    nomes = frappe.parse_json(nomes) or []
    corr = meta["correccao"]

    if corr.get("accao") == "alinhar_turma":
        reais = {r.name: r.turma_real for r in frappe.db.sql(_consultas()[chave], as_dict=True)}
        n = 0
        for nome in nomes:
            turma = reais.get(nome)
            if not turma:
                continue
            fase = frappe.db.get_value("Turma", turma, "fase")
            frappe.db.set_value("Catecumeno", nome, {"turma": turma, "fase": fase})
            n += 1
        return n

    if valor not in corr["valores"]:
        frappe.throw(_("Valor inválido: {0}").format(valor))

    if meta["doctype"] == "Catequista":
        # Gravar o documento: fica no histórico (data de inactivação para o relatório)
        for nome in nomes:
            doc = frappe.get_doc("Catequista", nome)
            doc.set(corr["campo"], valor)
            doc.save(ignore_permissions=True)
        return len(nomes)

    for nome in nomes:
        frappe.db.set_value("Catecumeno", nome, corr["campo"], valor)
    if corr["campo"] == "sexo" and nomes:
        # manter as listas das turmas e das candidaturas coerentes
        frappe.db.sql(
            "UPDATE `tabTurma Catecumenos` SET sexo = %s WHERE catecumeno IN %s",
            (valor, tuple(nomes)),
        )
        frappe.db.sql(
            "UPDATE `tabCandidatos ao Sacramento Table` SET sexo = %s WHERE catecumeno IN %s",
            (valor, tuple(nomes)),
        )
    return len(nomes)

"""
Consulta Rápida — fases, turmas, catequistas e catecúmenos de um ano lectivo
num único pedido, para a página filtrar no browser sem novas chamadas.
"""

import frappe
from frappe import _


def _assert_coordenador():
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    roles = frappe.get_roles(user)
    if "System Manager" not in roles and "Coordenador Catequese" not in roles:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


@frappe.whitelist()
def get_anos_lectivos():
    _assert_coordenador()
    return frappe.db.sql_list("SELECT name FROM `tabAno Lectivo` ORDER BY name DESC LIMIT 10")


@frappe.whitelist()
def get_ano_actual():
    _assert_coordenador()
    from portal.catequese.utils import ano_actual

    return ano_actual()


@frappe.whitelist()
def get_dados(ano_lectivo):
    _assert_coordenador()

    fases = frappe.db.sql("""
        SELECT name, ordem, sacramento, rito, coordenador_de_fase
        FROM `tabFase`
        ORDER BY ordem IS NULL, ordem, name
    """, as_dict=True)

    turmas = frappe.db.sql("""
        SELECT name, fase, status, dia, hora, local, catecismo,
               catequista, catequista_adj, catequistas, contacto, contacto_adj, observacoes
        FROM `tabTurma`
        WHERE ano_lectivo = %s
        ORDER BY fase, name
    """, (ano_lectivo,), as_dict=True)

    catecumenos = frappe.db.sql("""
        SELECT tc.parent AS turma, tc.catecumeno,
               COALESCE(NULLIF(c.nome_completo, ''), tc.catecumeno) AS nome,
               tc.estado, COALESCE(tc.idade, c.idade) AS idade,
               COALESCE(NULLIF(tc.sexo, ''), c.sexo) AS sexo,
               tc.encarregado, tc.contacto, tc.padrinhos, tc.contacto_padrinhos,
               tc.nr_de_faltas, tc.ficha_de_catecumeno, tc.pre_avaliacao,
               c.comunidade, c.baptismo, c.eucaristia, c.crisma
        FROM `tabTurma Catecumenos` tc
        JOIN `tabTurma` t ON t.name = tc.parent AND tc.parenttype = 'Turma'
        LEFT JOIN `tabCatecumeno` c ON c.name = tc.catecumeno
        WHERE t.ano_lectivo = %s
        ORDER BY nome
    """, (ano_lectivo,), as_dict=True)

    nomes = {t.catequista for t in turmas if t.catequista} | {t.catequista_adj for t in turmas if t.catequista_adj}
    catequistas = frappe.get_all(
        "Catequista",
        filters={"name": ["in", list(nomes)]},
        fields=["name", "nome_completo", "status", "contacto_1", "contacto_2", "email", "nucleo"],
    ) if nomes else []

    return {
        "fases": fases,
        "turmas": turmas,
        "catecumenos": catecumenos,
        "catequistas": catequistas,
    }

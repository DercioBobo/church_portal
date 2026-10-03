"""
Definições da catequese e ano lectivo actual — ponto único para todo o código.
"""

from datetime import date

import frappe

# Valores usados quando as Catequese Settings ainda não foram preenchidas
PADROES = {
    "paroquia": "PARÓQUIA NOSSA SENHORA DA ASSUNÇÃO - LIBERDADE",
    "comunidades": "COMUNIDADE SEDE E SANTA ANA – MASTRONG",
    "ministerio": "MINISTÉRIO DA CATEQUESE E FORMAÇÃO PERMANENTE",
    "comunidade_sede": "Assunção",
    "local": "Matola",
    "tamanho_minimo": 20,
    "tamanho_ideal": 25,
    "tamanho_maximo": 30,
    "fase_apos_baptismo": "1º Ano de Aprofundamento",
    "link_validade_dias": 7,
    "link_permite_editar": 1,
    "palavras_zona": "ZV, Zona V, Zona 5",
    "palavras_vigararia": "Vigararia, Vigararias",
    "palavras_arquidiocese": "Arquidiocese, Arquidiocesano, Arquidiocesana",
    "rollover_copiar_extraordinarias": 0,
}


# Campos numéricos em que 0 significa "não preenchido" (o Frappe grava Int vazio como 0)
ZERO_E_VAZIO = {"tamanho_minimo", "tamanho_ideal", "tamanho_maximo", "link_validade_dias"}


def definicao(campo):
    """Valor de uma definição, com o padrão quando está vazia."""
    try:
        valor = frappe.get_cached_doc("Catequese Settings").get(campo)
    except frappe.DoesNotExistError:
        valor = None
    if valor in (None, "") or (campo in ZERO_E_VAZIO and not valor):
        return PADROES.get(campo)
    return valor


# ── Organizador das actividades do plano ──────────────────────────────────────

PAROQUIA = "Paróquia"
# Ordem de verificação: o mais abrangente primeiro
ORGANIZADORES_EXTERNOS = (
    ("Arquidiocese", "palavras_arquidiocese"),
    ("Vigararia", "palavras_vigararia"),
    ("Zona V", "palavras_zona"),
)


def _sem_acentos(texto):
    import unicodedata
    return unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode().lower()


def classificar_organizador(*textos):
    """
    Organizador sugerido pelas palavras das Catequese Settings (separador Plano Anual),
    procuradas como palavras inteiras em actividade / tipologia / responsável.
    Devolve "Paróquia" quando nada corresponde.
    """
    import re

    alvo = " " + re.sub(r"[^a-z0-9]+", " ", _sem_acentos(" ".join(t or "" for t in textos))) + " "
    for organizador, campo in ORGANIZADORES_EXTERNOS:
        for palavra in str(definicao(campo) or "").split(","):
            p = re.sub(r"[^a-z0-9]+", " ", _sem_acentos(palavra)).strip()
            if p and f" {p} " in alvo:
                return organizador
    return PAROQUIA


def e_externa(organizador):
    return bool(organizador) and organizador != PAROQUIA


def tamanhos_turma():
    return definicao("tamanho_minimo"), definicao("tamanho_ideal"), definicao("tamanho_maximo")


def ano_actual():
    """
    Ano lectivo actual: o definido nas Catequese Settings; senão o ano civil
    (se existir como Ano Lectivo); senão o mais recente que exista.
    """
    ano = definicao("ano_lectivo_actual")
    if ano:
        return ano
    civil = str(date.today().year)
    if frappe.db.exists("Ano Lectivo", civil):
        return civil
    anos = frappe.db.sql_list("SELECT name FROM `tabAno Lectivo` WHERE name <= %s ORDER BY name DESC LIMIT 1", civil)
    return anos[0] if anos else None


CAMPOS_VALOR_SACRAMENTO = ("valor_ofertorio", "valor_cracha", "valor_fotos", "valor_accao_gracas")


@frappe.whitelist()
def valores_sacramento(sacramento):
    """Valores por omissão de um sacramento (Catequese Settings › Sacramentos)."""
    for row in frappe.get_cached_doc("Catequese Settings").get("valores_sacramento") or []:
        if row.sacramento == sacramento:
            return {campo: row.get(campo) or 0 for campo in CAMPOS_VALOR_SACRAMENTO}
    return {}


@frappe.whitelist()
def get_ano_actual():
    return ano_actual()


def boot_session(bootinfo):
    """Disponibiliza as definições principais no browser (frappe.boot.catequese)."""
    if frappe.session.user == "Guest":
        return
    bootinfo.catequese = {
        "ano_actual": ano_actual(),
        "tamanho_minimo": definicao("tamanho_minimo"),
        "tamanho_ideal": definicao("tamanho_ideal"),
        "tamanho_maximo": definicao("tamanho_maximo"),
        "link_validade_dias": definicao("link_validade_dias"),
        "link_permite_editar": definicao("link_permite_editar"),
        # páginas da app: recebem o link "← Painel" (public/js/catequese_nav.js)
        "paginas": nomes_paginas(),
    }


def nomes_paginas():
    return frappe.get_all("Page", filters={"module": ["in", frappe.get_module_list("portal")]}, pluck="name")

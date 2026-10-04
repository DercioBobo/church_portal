"""
Renovação da inscrição (marcada na linha do catecúmeno na turma, normalmente pelo catequista no portal).

- Sim     → grava o valor das Catequese Settings (se a linha ainda não tem valor) e a data de hoje.
- Isento  → conta como renovado, valor 0.
- Não / vazio → limpa valor e data.
O ano da renovação é o ano lectivo da turma (renovar em 2027 numa turma de 2026 conta para 2026).
"""

from frappe.utils import flt, today

from portal.catequese.utils import definicao

RENOVADO = ("Sim", "Isento")


def valor_padrao():
    return flt(definicao("valor_renovacao"))


def _set(linha, campo, valor):
    if isinstance(linha, dict):
        linha[campo] = valor
    else:
        linha.set(campo, valor)


def preencher(linha):
    """Acerta valor_renovacao e data_renovacao conforme a renovação. `linha` é um Document ou um dict."""
    r = linha.get("renovacao") or ""
    if r == "Sim":
        if not flt(linha.get("valor_renovacao")):
            _set(linha, "valor_renovacao", valor_padrao())
        if not linha.get("data_renovacao"):
            _set(linha, "data_renovacao", today())
    elif r == "Isento":
        _set(linha, "valor_renovacao", 0)
        if not linha.get("data_renovacao"):
            _set(linha, "data_renovacao", today())
    else:
        _set(linha, "valor_renovacao", 0)
        _set(linha, "data_renovacao", None)
        _set(linha, "renovacao_coordenacao", 0)
    return linha

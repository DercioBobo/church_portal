"""
Preenche as Catequese Settings com os valores usados até agora e marca o
estado de cada Ano Lectivo (passados: Encerrado, actual: Em curso, futuros: Planeado).
"""

from datetime import date

import frappe

from portal.catequese.utils import CAMPOS_VALOR_SACRAMENTO, PADROES


def execute():
    s = frappe.get_single("Catequese Settings")
    for campo, valor in PADROES.items():
        if s.get(campo) in (None, "", 0) and campo != "link_permite_editar":
            s.set(campo, valor)
    if not s.get("link_permite_editar") and s.get("link_permite_editar") != 0:
        s.link_permite_editar = 1

    civil = str(date.today().year)
    if not s.ano_lectivo_actual and frappe.db.exists("Ano Lectivo", civil):
        s.ano_lectivo_actual = civil

    # Valores por sacramento: parte dos valores da Preparação mais recente de cada um
    if not s.get("valores_sacramento"):
        for sac in frappe.get_all("Sacramento", pluck="name", order_by="name"):
            ultima = frappe.get_all(
                "Preparacao do Sacramento", filters={"sacramento": sac},
                fields=list(CAMPOS_VALOR_SACRAMENTO), order_by="creation desc", limit=1,
            )
            s.append("valores_sacramento", dict({"sacramento": sac}, **(ultima[0] if ultima else {})))
    s.flags.ignore_validate = True
    s.save(ignore_permissions=True)

    actual = s.ano_lectivo_actual or civil
    for ano in frappe.get_all("Ano Lectivo", pluck="name"):
        estado = "Em curso" if ano == actual else ("Encerrado" if ano < actual else "Planeado")
        frappe.db.set_value("Ano Lectivo", ano, "estado", estado, update_modified=False)

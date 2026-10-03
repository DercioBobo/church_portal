"""
Passa os DocTypes da catequese (criados no browser, custom=1) para a app portal.

Corre ANTES da sincronização dos modelos (pre_model_sync): marca os módulos e
DocTypes como pertencentes à app, para que o migrate aplique os ficheiros JSON
de portal/catequese/doctype e portal/paroquia/doctype em vez de os ignorar.
As tabelas e os dados não são alterados.
"""

import frappe

from portal.hooks import CATEQUESE_DOCTYPES

PAROQUIA = {"Fiel", "Nucleo"}


def execute():
    for module in ("Catequese", "Paroquia"):
        _module_def(module)

    for dt in CATEQUESE_DOCTYPES:
        if not frappe.db.exists("DocType", dt):
            continue
        module = "Paroquia" if dt in PAROQUIA else "Catequese"
        frappe.db.set_value("DocType", dt, {"custom": 0, "module": module}, update_modified=False)

    frappe.clear_cache()


def _module_def(module):
    if frappe.db.exists("Module Def", module):
        frappe.db.set_value("Module Def", module, {"app_name": "portal", "custom": 0}, update_modified=False)
    else:
        frappe.get_doc({
            "doctype": "Module Def",
            "module_name": module,
            "app_name": "portal",
            "custom": 0,
        }).insert(ignore_permissions=True)

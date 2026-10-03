"""
A página "Abrir e Encerrar Ano" chamava-se "ano-lectivo", o mesmo endereço
(/app/ano-lectivo) da lista do DocType Ano Lectivo. Passou a "abrir-encerrar-ano";
apaga o registo antigo para a lista dos anos voltar a abrir normalmente.
"""

import frappe


def execute():
    if frappe.db.exists("Page", "ano-lectivo"):
        frappe.delete_doc("Page", "ano-lectivo", force=True, ignore_permissions=True)

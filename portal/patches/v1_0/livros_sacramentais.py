import frappe


def execute():
    """Livro de Baptismo passa a livro sacramental (ver portal/catequese/livros.py):
    - o nome do catecúmeno (antigo Link em nome_completo, que era também o nome do registo)
      vai para o novo campo `catecumeno`; os registos existentes mantêm o nome;
    - origem por omissão: Catequese;
    - comunidade passa a Assunção / Santa Ana (como no Catecúmeno);
    - nome_completo deixa de ser único (bebés e adultos podem ter o mesmo nome)."""
    tabela = "tabLivro de Baptismo"
    if not frappe.db.has_column("Livro de Baptismo", "catecumeno"):
        return

    for idx in frappe.db.sql(f"SHOW INDEX FROM `{tabela}` WHERE Column_name = 'nome_completo' AND Non_unique = 0",
                             as_dict=True):
        frappe.db.sql_ddl(f"ALTER TABLE `{tabela}` DROP INDEX `{idx.Key_name}`")

    frappe.db.sql(f"""
        UPDATE `{tabela}` l JOIN `tabCatecumeno` c ON c.name = l.nome_completo
        SET l.catecumeno = c.name
        WHERE IFNULL(l.catecumeno, '') = ''""")
    frappe.db.sql(f"UPDATE `{tabela}` SET origem = 'Catequese' WHERE IFNULL(origem, '') = ''")
    frappe.db.sql(f"""
        UPDATE `{tabela}` SET comunidade = 'Santa Ana'
        WHERE LOWER(comunidade) LIKE '%%santa ana%%' AND comunidade != 'Santa Ana'""")
    frappe.db.sql(f"""
        UPDATE `{tabela}` SET comunidade = 'Assunção'
        WHERE IFNULL(comunidade, '') != '' AND comunidade NOT IN ('Santa Ana', 'Assunção')""")

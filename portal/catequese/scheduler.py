import frappe
from datetime import date

def update_catecumeno_idade_daily():
    today = date.today()
    updated = 0

    catecumenos = frappe.get_all("Catecumeno", fields=["name", "data_de_nascimento", "idade"])

    for c in catecumenos:
        if not c.data_de_nascimento:
            continue

        birth = c.data_de_nascimento
        idade = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))

        if c.idade != idade:
            frappe.db.set_value("Catecumeno", c.name, "idade", idade)
            updated += 1

    frappe.db.commit()
    frappe.logger().info(f"[Catequese Scheduler] Atualização concluída: {updated} catecúmenos atualizados.")


import frappe
from datetime import datetime, timedelta

@frappe.whitelist(allow_guest=True)  # usado pela página pública da paróquia
def get_catecumenos_aniversariantes(tipo="hoje"):
    hoje = datetime.today()
    ano_atual = hoje.year

    if tipo == "hoje":
        # Aniversariantes apenas de hoje (dia e mês iguais)
        data_filter = f"DAY(data_de_nascimento) = {hoje.day} AND MONTH(data_de_nascimento) = {hoje.month}"

    elif tipo == "semana":
        # Aniversariantes da semana ISO (segunda a domingo)
        # Pega o primeiro dia da semana (segunda-feira)
        inicio_semana = hoje - timedelta(days=hoje.weekday())
        fim_semana = inicio_semana + timedelta(days=6)

        # Vamos filtrar pelos dias e meses correspondentes
        # Atenção que o ano original é ignorado
        data_filter = f"""
            DATE(CONCAT({ano_atual}, '-', LPAD(MONTH(data_de_nascimento), 2, '0'), '-', LPAD(DAY(data_de_nascimento), 2, '0')))
            BETWEEN '{inicio_semana.strftime('%Y-%m-%d')}' AND '{fim_semana.strftime('%Y-%m-%d')}'
        """
    else:
        frappe.throw("Tipo inválido. Escolha 'hoje' ou 'semana'.")

    # Agora buscar os dados
    data = frappe.db.sql(f"""
        SELECT
            c.name,
            c.data_de_nascimento,
            c.idade,
            c.contacto,
            t.name AS turma,
            t.local,
            t.catequista,
            c.fase
        FROM
            `tabCatecumeno` c
        LEFT JOIN
            `tabTurma` t ON c.turma = t.name
        WHERE
            {data_filter}
        ORDER BY
            c.data_de_nascimento ASC, c.name ASC
    """, as_dict=True)

    # Agora preparar a lista com idade nova (idade + 1)
    for c in data:
        c["idade_nova"] = (c["idade"] or 0) + 1

    return data

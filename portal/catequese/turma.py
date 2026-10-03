import frappe

@frappe.whitelist()
def suggest_turma(fase):
    

    turmas = frappe.get_all("Turma",
        filters={
            "fase": fase,
            "status": "Activo"
        },
        fields=["name"],
        order_by="creation asc"
    )

    if not turmas:
        return None

    min_count = None
    suggested_turma = None

    for turma in turmas:
        count = frappe.db.count("Turma Catecumenos", {"parent": turma.name})
        frappe.logger().info(f"[DEBUG] {turma.name} tem {count} catecumenos")

        if min_count is None or count < min_count:
            min_count = count
            suggested_turma = turma.name

    return suggested_turma


import frappe

@frappe.whitelist(allow_guest=True)  # usado pela página pública da paróquia
def get_turma_catecumenos():
    turmas = frappe.db.sql("""
        SELECT 
            name, 
            local, 
            dia, 
            hora, 
            fase,
            catequista,
            catequista_adj
        FROM `tabTurma`
        WHERE status = 'Activo'
        ORDER BY local ASC, catequista ASC
    """, as_dict=True)

    turma_dict = {}
    for turma in turmas:
        # Corrigido: agora com JOIN para buscar nome do catecumeno
        catecumenos = frappe.db.sql("""
            SELECT 
                tc.catecumeno,
                c.name AS catecumeno_nome
            FROM `tabTurma Catecumenos` tc
            LEFT JOIN `tabCatecumeno` c ON tc.catecumeno = c.name
            WHERE tc.parent = %s
            ORDER BY c.name ASC
        """, (turma.name,), as_dict=True)

        turma_dict[turma.name] = {
            "local": turma.local,
            "dia": turma.dia,
            "hora": turma.hora,
            "fase": turma.fase,
            "catequista": turma.catequista,
            "catequista_adj": turma.catequista_adj,
            "catecumenos": catecumenos
        }

    return turma_dict



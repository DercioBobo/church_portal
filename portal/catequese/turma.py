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




# ── Mover catecúmenos entre turmas ─────────────────────────────────────────────
# (usado pela Troca de Turma e por "Mover em massa"; era Server Script)

def remover_da_turma(turma, catecumenos):
    """Retira os catecúmenos da lista da turma (um único save)."""
    doc = frappe.get_doc("Turma", turma)
    doc.lista_catecumenos = [r for r in doc.lista_catecumenos if r.catecumeno not in catecumenos]
    doc.save(ignore_permissions=True)
    return doc


def adicionar_a_turma(turma, catecumenos):
    """Acrescenta os catecúmenos (documentos Catecumeno) à lista da turma."""
    doc = frappe.get_doc("Turma", turma)
    for catec in catecumenos:
        row = doc.append("lista_catecumenos", {})
        row.catecumeno = catec.name
        row.idade = catec.get("idade")
        row.contacto = catec.get("contacto")
        row.data_de_nascimento = catec.get("data_de_nascimento")
        row.encarregado = catec.get("encarregado")
        row.sexo = catec.get("sexo")
        row.contacto_encarregado = catec.get("contacto_encarregado")
        row.renovacao = ""  # evita o default 0 que quebra o Select

    # Sanear também as linhas já existentes
    for row in doc.lista_catecumenos:
        if row.renovacao not in ("Sim", "Não", "Isento"):
            row.renovacao = ""
    doc.save(ignore_permissions=True)
    return doc


@frappe.whitelist()
def mover_catecumenos_em_massa(catecumenos, turma_antiga, nova_turma):
    """Move vários catecúmenos de uma turma para outra (botão na Turma)."""
    catecumenos = frappe.parse_json(catecumenos)
    if not catecumenos:
        frappe.throw("Nenhum catecúmeno seleccionado.")
    if turma_antiga == nova_turma:
        frappe.throw("A turma de destino tem de ser diferente da turma actual.")

    frappe.get_doc("Turma", turma_antiga)  # valida que existe
    remover_da_turma(turma_antiga, catecumenos)
    docs = [frappe.get_doc("Catecumeno", c) for c in catecumenos]
    nova = adicionar_a_turma(nova_turma, docs)

    for c in docs:
        frappe.db.set_value("Catecumeno", c.name, {"turma": nova.name, "fase": nova.fase})

    return {"total": len(docs), "nova_turma": nova.name, "fase": nova.fase}

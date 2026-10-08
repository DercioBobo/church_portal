import frappe
from frappe import _
import json


def _assert_coordenador():
    user = frappe.session.user
    if user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    roles = frappe.get_roles(user)
    if "System Manager" not in roles and "Coordenador Catequese" not in roles:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


@frappe.whitelist()
def get_actividades(ano_lectivo):
    _assert_coordenador()

    rows = frappe.db.sql("""
        SELECT
            a.name, a.actividade, a.data, a.data_fim, a.data_original,
            a.orador, a.local, a.orcamento,
            a.tipologia, a.estado, a.notas_execucao, a.organizador, a.a_confirmar, a.so_este_ano,
            a.ano_lectivo,
            t.cor AS tipologia_cor,
            t.icone AS tipologia_icone
        FROM `tabActividade do Plano` a
        LEFT JOIN `tabTipologia Actividade` t ON t.name = a.tipologia
        WHERE a.ano_lectivo = %s
        ORDER BY a.data IS NULL ASC, a.data ASC, a.name ASC
    """, (ano_lectivo,), as_dict=True)

    return rows


@frappe.whitelist()
def get_tipologias():
    _assert_coordenador()
    return frappe.db.sql(
        "SELECT name, cor, icone FROM `tabTipologia Actividade` ORDER BY name ASC",
        as_dict=True,
    )


@frappe.whitelist()
def get_letter_heads():
    _assert_coordenador()
    try:
        rows = frappe.db.sql(
            "SELECT name, content, footer FROM `tabLetter Head` WHERE disabled = 0 ORDER BY is_default DESC, name ASC",
            as_dict=True,
        )
        return rows
    except Exception:
        return []


@frappe.whitelist()
def create_tipologia(nome, cor="", icone=""):
    _assert_coordenador()
    nome = (nome or "").strip()
    if not nome:
        frappe.throw(_("O nome da tipologia é obrigatório"))
    if frappe.db.exists("Tipologia Actividade", nome):
        frappe.throw(_("Já existe uma tipologia com esse nome"))
    doc = frappe.new_doc("Tipologia Actividade")
    doc.nome  = nome
    doc.cor   = cor.strip()  if cor   else ""
    doc.icone = icone.strip() if icone else ""
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name, "cor": doc.cor, "icone": doc.icone}


@frappe.whitelist()
def get_anos_lectivos():
    _assert_coordenador()
    try:
        anos = frappe.db.sql(
            "SELECT name FROM `tabAno Lectivo` ORDER BY name DESC LIMIT 10",
            as_dict=True,
        )
        return [a.name for a in anos]
    except Exception:
        return []


@frappe.whitelist()
def get_ano_lectivo_atual():
    _assert_coordenador()
    from portal.catequese.utils import ano_actual

    return ano_actual()


@frappe.whitelist()
def create_actividade(data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json

    doc = frappe.new_doc("Actividade do Plano")
    doc.actividade    = data.get("actividade")
    doc.tipologia     = data.get("tipologia") or None
    doc.estado        = data.get("estado") or "Pendente"
    doc.ano_lectivo   = data.get("ano_lectivo")
    doc.data          = data.get("data") or None
    doc.data_fim      = data.get("data_fim") or None
    doc.orador        = data.get("orador") or None
    doc.local         = data.get("local") or None
    doc.orcamento     = data.get("orcamento") or None
    doc.notas_execucao = data.get("notas_execucao") or None
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    # Return full row with tipologia details
    row = frappe.db.sql("""
        SELECT a.name, a.actividade, a.data, a.data_fim, a.data_original,
               a.orador, a.local, a.orcamento,
               a.tipologia, a.estado, a.notas_execucao, a.organizador, a.a_confirmar, a.so_este_ano, a.ano_lectivo,
               t.cor AS tipologia_cor, t.icone AS tipologia_icone
        FROM `tabActividade do Plano` a
        LEFT JOIN `tabTipologia Actividade` t ON t.name = a.tipologia
        WHERE a.name = %s
    """, (doc.name,), as_dict=True)
    return row[0] if row else {"name": doc.name}


@frappe.whitelist()
def update_actividade(name, data_json):
    _assert_coordenador()
    data = json.loads(data_json) if isinstance(data_json, str) else data_json

    doc = frappe.get_doc("Actividade do Plano", name)

    # Preserve original date if date changes
    new_data = data.get("data") or None
    if new_data and doc.data and str(doc.data) != str(new_data) and not doc.data_original:
        doc.data_original = doc.data

    doc.actividade     = data.get("actividade", doc.actividade)
    doc.tipologia      = data.get("tipologia") or None
    doc.estado         = data.get("estado", doc.estado)
    doc.data           = new_data
    doc.data_fim       = data.get("data_fim") or None
    doc.orador         = data.get("orador") or None
    doc.local          = data.get("local") or None
    doc.orcamento      = data.get("orcamento") or None
    doc.notas_execucao = data.get("notas_execucao") or None
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    row = frappe.db.sql("""
        SELECT a.name, a.actividade, a.data, a.data_fim, a.data_original,
               a.orador, a.local, a.orcamento,
               a.tipologia, a.estado, a.notas_execucao, a.organizador, a.a_confirmar, a.so_este_ano, a.ano_lectivo,
               t.cor AS tipologia_cor, t.icone AS tipologia_icone
        FROM `tabActividade do Plano` a
        LEFT JOIN `tabTipologia Actividade` t ON t.name = a.tipologia
        WHERE a.name = %s
    """, (name,), as_dict=True)
    return row[0] if row else {"name": name}


@frappe.whitelist()
def delete_actividade(name):
    _assert_coordenador()
    if not frappe.db.exists("Actividade do Plano", name):
        frappe.throw(_("Actividade não encontrada"))
    frappe.delete_doc("Actividade do Plano", name, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def update_estado(name, estado):
    _assert_coordenador()
    allowed = {"Pendente", "Em Progresso", "Realizada", "Cancelada", "Adiada"}
    if estado not in allowed:
        frappe.throw(_("Estado inválido"))
    frappe.db.set_value("Actividade do Plano", name, "estado", estado)
    frappe.db.commit()
    return {"success": True, "estado": estado}


@frappe.whitelist()
def export_actividades(ano_lectivo, estado="", tipologias_json="", month="", search="", show_retiros="1", fields_json=""):
    """
    Exports the activities plan to a styled .xlsx file.
    Respects the same filters the UI has active.
    """
    _assert_coordenador()

    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        import io
        from collections import OrderedDict
        from datetime import date as _date
    except ImportError:
        frappe.throw(_("openpyxl não está instalado. Execute: pip install openpyxl"))

    # ── Build query filters ────────────────────────────────────────────────
    conditions = ["a.ano_lectivo = %s"]
    params     = [ano_lectivo]

    if estado:
        conditions.append("a.estado = %s")
        params.append(estado)

    tip_list = json.loads(tipologias_json) if tipologias_json else []
    if tip_list:
        placeholders = ",".join(["%s"] * len(tip_list))
        conditions.append(f"a.tipologia IN ({placeholders})")
        params.extend(tip_list)

    if month:
        conditions.append("DATE_FORMAT(a.data, '%%Y-%%m') = %s")
        params.append(month)

    search = (search or "").strip()
    if search:
        sq = f"%{search}%"
        conditions.append(
            "(a.actividade LIKE %s OR a.orador LIKE %s OR a.local LIKE %s OR a.tipologia LIKE %s)"
        )
        params.extend([sq, sq, sq, sq])

    where = " AND ".join(conditions)

    rows = frappe.db.sql(f"""
        SELECT
            a.name, a.actividade, a.data, a.data_original,
            a.orador, a.local, a.orcamento,
            a.tipologia, a.estado, a.notas_execucao, a.organizador, a.a_confirmar, a.so_este_ano
        FROM `tabActividade do Plano` a
        WHERE {where}
        ORDER BY a.data IS NULL ASC, a.data ASC, a.name ASC
    """, params, as_dict=True)

    # ── Merge retiros ──────────────────────────────────────────────────────
    if show_retiros == "1":
        _estado_map = {"Planeado": "Pendente", "Realizado": "Realizada", "Cancelado": "Cancelada"}
        retiro_rows = frappe.db.sql("""
            SELECT name, titulo, data, local, orador, estado, valor_de_contribuicao, notas
            FROM `tabPlano de Retiro`
            WHERE ano_lectivo = %s
        """, (ano_lectivo,), as_dict=True)

        for r in retiro_rows:
            mapped_estado = _estado_map.get(r.estado, "Pendente")
            if estado and mapped_estado != estado:
                continue
            if tip_list and "Retiro" not in tip_list:
                continue
            r_month = str(r.data)[:7] if r.data else None
            if month and r_month != month:
                continue
            if search:
                haystack = " ".join(filter(None, [r.titulo, r.orador, r.local, "Retiro"])).lower()
                if search.lower() not in haystack:
                    continue
            rows.append(frappe._dict({
                "name":          r.name,
                "actividade":    r.titulo,
                "data":          str(r.data)[:10] if r.data else None,
                "data_original": None,
                "orador":        r.orador or None,
                "local":         r.local  or None,
                "orcamento":     str(r.valor_de_contribuicao) if r.valor_de_contribuicao else None,
                "tipologia":     "Retiro",
                "estado":        mapped_estado,
                "notas_execucao": r.notas or None,
            }))

        rows.sort(key=lambda x: (x.data is None, x.data or "", x.name or ""))

    # ── Month grouping ─────────────────────────────────────────────────────
    MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
             "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
    TODAY_KEY = _date.today().strftime("%Y-%m")

    def month_label(key):
        if key == "__nodate__":
            return "Sem Data Definida"
        y, m = key.split("-")
        return f"{MESES[int(m)-1]} {y}"

    groups = OrderedDict()
    for row in rows:
        key = str(row.data)[:7] if row.data else "__nodate__"
        groups.setdefault(key, []).append(row)

    sorted_keys = sorted(groups.keys(),
                         key=lambda k: ("\xff" if k == "__nodate__" else k))

    # ── Styles ─────────────────────────────────────────────────────────────
    def _fill(hex_color):
        return PatternFill("solid", fgColor=hex_color)

    def _side(style="thin", color="D1D5DB"):
        return Side(style=style, color=color)

    def _border(all="thin"):
        s = _side(all)
        return Border(left=s, right=s, top=s, bottom=s)

    def _border_bottom(color="E5E7EB"):
        return Border(bottom=_side("thin", color))

    TITLE_FONT   = Font(name="Calibri", bold=True, size=14, color="FFFFFF")
    BODY_FONT    = Font(name="Calibri", size=9,    color="1F2937")
    MUTED_FONT   = Font(name="Calibri", size=8,    color="9CA3AF", italic=True)
    NOTE_FONT    = Font(name="Calibri", size=8,    color="6B7280", italic=True)

    TITLE_FILL   = _fill("9A7020")
    META_FILL    = _fill("FEF9EC")
    HEADER_FILL  = _fill("F5DFA0")
    MONTH_FILL   = _fill("F5DFA0")
    MONTH_CURR   = _fill("E8C464")
    ROW_ALT_FILL = _fill("FFFDF5")

    STATUS_FILLS = {
        "Pendente":     (_fill("F3F4F6"), Font(name="Calibri", size=9, color="6B7280")),
        "Em Progresso": (_fill("DBEAFE"), Font(name="Calibri", size=9, color="1D4ED8")),
        "Realizada":    (_fill("DCFCE7"), Font(name="Calibri", size=9, color="166534")),
        "Cancelada":    (_fill("FEE2E2"), Font(name="Calibri", size=9, color="991B1B")),
        "Adiada":       (_fill("FEF3C7"), Font(name="Calibri", size=9, color="92400E")),
    }

    center   = Alignment(horizontal="center", vertical="center", wrap_text=False)
    left_mid = Alignment(horizontal="left",   vertical="center", wrap_text=False)

    # ── Parse selected fields ──────────────────────────────────────────────
    try:
        fields = json.loads(fields_json) if fields_json else {}
    except Exception:
        fields = {}

    FIELD_META = [
        ("actividade",    "Actividade",          42, "text"),
        ("tipologia",     "Tipologia",           18, "text"),
        ("data",          "Data",                12, "date"),
        ("data_original", "Data Original",       14, "date_orig"),
        ("orador",        "Orador / Responsável", 24, "text"),
        ("local",         "Local",               26, "wrap"),
        ("orcamento",     "Orçamento (MZN)",     14, "currency"),
        ("estado",        "Estado",              14, "status"),
        ("notas_execucao","Notas de Execução",   38, "notes"),
    ]
    active_cols = [(k, h, w, ct) for k, h, w, ct in FIELD_META if fields.get(k, True)]
    nc = 1 + len(active_cols)   # +1 for N column

    # ── Workbook ───────────────────────────────────────────────────────────
    wb = Workbook()
    ws = wb.active
    ws.title = "Plano Anual"
    ws.sheet_view.showGridLines = False

    ws.column_dimensions["A"].width = 4
    for ci, (_, _, w, _) in enumerate(active_cols, 2):
        ws.column_dimensions[get_column_letter(ci)].width = w

    last_col = get_column_letter(nc)

    # ── Title row ──────────────────────────────────────────────────────────
    ws.row_dimensions[1].height = 32
    ws.merge_cells(f"A1:{last_col}1")
    tc = ws["A1"]
    tc.value     = f"Plano Anual da Catequese — {ano_lectivo}"
    tc.font      = TITLE_FONT
    tc.fill      = TITLE_FILL
    tc.alignment = Alignment(horizontal="left", vertical="center", indent=1)

    # ── Meta row ──────────────────────────────────────────────────────────
    ws.row_dimensions[2].height = 16
    ws.merge_cells(f"A2:{last_col}2")
    meta_parts = [f"Exportado em {_date.today().strftime('%d/%m/%Y')}"]
    if estado:   meta_parts.append(f"Estado: {estado}")
    if tip_list: meta_parts.append(f"Tipologia: {', '.join(tip_list)}")
    if month:    meta_parts.append(f"Mês: {month_label(month)}")
    mc = ws["A2"]
    mc.value     = "   ".join(meta_parts)
    mc.font      = Font(name="Calibri", size=8, color="7A5A18", italic=True)
    mc.fill      = META_FILL
    mc.alignment = Alignment(horizontal="left", vertical="center", indent=1)

    # ── Column headers ─────────────────────────────────────────────────────
    ws.row_dimensions[3].height = 20
    header_font = Font(name="Calibri", bold=True, size=9, color="7A5A18")
    headers = ["#"] + [h for _, h, _, _ in active_cols]
    for col, h in enumerate(headers, 1):
        c = ws.cell(row=3, column=col, value=h)
        c.font      = header_font
        c.fill      = HEADER_FILL
        c.alignment = center if col == 1 else left_mid
        c.border    = Border(bottom=_side("medium", "D4A843"),
                             top=_side("thin",   "E8C464"))

    # ── Data rows ──────────────────────────────────────────────────────────
    current_row = 4

    for key in sorted_keys:
        group_rows = groups[key]
        is_curr    = (key == TODAY_KEY)
        label      = month_label(key)

        # Month separator
        ws.row_dimensions[current_row].height = 18
        ws.merge_cells(f"A{current_row}:{last_col}{current_row}")
        mc = ws[f"A{current_row}"]
        mc.value     = f"  {label}  ·  {len(group_rows)} actividade{'s' if len(group_rows) != 1 else ''}"
        mc.font      = Font(name="Calibri", bold=True, size=9,
                            color="7A5A18" if is_curr else "7A5A18")
        mc.fill      = MONTH_CURR if is_curr else MONTH_FILL
        mc.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        for col in range(1, nc + 1):
            ws.cell(current_row, col).border = Border(
                top=_side("medium", "D4A843"),
                bottom=_side("thin", "E8C464"),
            )
        current_row += 1

        # Activity rows
        for idx, row in enumerate(group_rows):
            ws.row_dimensions[current_row].height = 15
            fill = ROW_ALT_FILL if idx % 2 else None

            def _cell(col, value, font=BODY_FONT, align=left_mid, num_fmt=None):
                c = ws.cell(row=current_row, column=col, value=value)
                c.font = font
                c.alignment = align
                if fill: c.fill = fill
                c.border = _border_bottom()
                if num_fmt: c.number_format = num_fmt
                return c

            _cell(1, idx + 1, font=MUTED_FONT, align=center)

            for ci, (key2, _, _, ctype) in enumerate(active_cols, 2):
                if ctype == "text":
                    _cell(ci, getattr(row, key2) or "")
                elif ctype == "wrap":
                    _cell(ci, getattr(row, key2) or "",
                          align=Alignment(horizontal="left", vertical="top", wrap_text=True))
                elif ctype == "date":
                    _cell(ci, str(row.data)[:10] if row.data else "",
                          align=Alignment(horizontal="center", vertical="center"))
                elif ctype == "date_orig":
                    _cell(ci, str(row.data_original)[:10] if row.data_original else "",
                          align=Alignment(horizontal="center", vertical="center"))
                elif ctype == "currency":
                    if row.orcamento:
                        c = _cell(ci, float(row.orcamento),
                                  align=Alignment(horizontal="right", vertical="center"))
                        c.number_format = '#,##0.00 "MZN"'
                    else:
                        _cell(ci, "")
                elif ctype == "status":
                    st_fill, st_font = STATUS_FILLS.get(row.estado or "Pendente",
                                                        STATUS_FILLS["Pendente"])
                    sc = ws.cell(row=current_row, column=ci, value=row.estado or "Pendente")
                    sc.font = st_font; sc.fill = st_fill
                    sc.alignment = center; sc.border = _border_bottom()
                elif ctype == "notes":
                    _cell(ci, row.notas_execucao or "", font=NOTE_FONT,
                          align=Alignment(horizontal="left", vertical="top", wrap_text=True))

            current_row += 1

    # Freeze panes
    ws.freeze_panes = "B4"

    # ── Totals footer ──────────────────────────────────────────────────────
    current_row += 1
    ws.row_dimensions[current_row].height = 15
    ws.merge_cells(f"A{current_row}:{last_col}{current_row}")
    fc = ws[f"A{current_row}"]
    fc.value     = f"Total: {len(rows)} actividade{'s' if len(rows) != 1 else ''}"
    fc.font      = Font(name="Calibri", bold=True, size=9, color="7A5A18")
    fc.alignment = Alignment(horizontal="right", vertical="center")
    fc.border    = Border(top=_side("medium", "D4A843"))
    for col in range(2, nc + 1):
        ws.cell(current_row, col).border = Border(top=_side("medium", "D4A843"))

    # ── Serialize ──────────────────────────────────────────────────────────
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    safe_ano = ano_lectivo.replace("/", "-")
    frappe.response["filename"]    = f"Plano_Anual_{safe_ano}.xlsx"
    frappe.response["filecontent"] = buf.read()
    frappe.response["type"]        = "download"


@frappe.whitelist()
def get_copy_preview(target_ano_lectivo):
    """Returns info about what would be copied — used to populate the confirmation modal."""
    _assert_coordenador()
    years = _sorted_anos()
    if target_ano_lectivo not in years:
        frappe.throw(_("Ano lectivo não encontrado"))
    idx = years.index(target_ano_lectivo)
    if idx == 0:
        frappe.throw(_("Não existe ano lectivo anterior"))
    prev_year = years[idx - 1]
    source_count = frappe.db.count("Actividade do Plano", {"ano_lectivo": prev_year})
    target_count = frappe.db.count("Actividade do Plano", {"ano_lectivo": target_ano_lectivo})
    return {"prev_year": prev_year, "source_count": source_count, "target_count": target_count}


@frappe.whitelist()
def copy_from_previous_year(target_ano_lectivo):
    """
    Copies all activities from the previous Ano Lectivo into target_ano_lectivo.
    - Shifts all dates forward by exactly 1 year (Feb 29 → Feb 28 in non-leap years)
    - Resets estado → Pendente
    - Clears notas_execucao and data_original
    - Preserves actividade, tipologia, orador, local, orcamento
    Returns the newly created rows (with tipologia details) for immediate UI update.
    """
    _assert_coordenador()
    import calendar as _cal
    from datetime import date as _date

    years = _sorted_anos()
    if target_ano_lectivo not in years:
        frappe.throw(_("Ano lectivo não encontrado"))
    idx = years.index(target_ano_lectivo)
    if idx == 0:
        frappe.throw(_("Não existe ano lectivo anterior para copiar"))
    prev_year = years[idx - 1]

    src_rows = frappe.db.sql("""
        SELECT actividade, tipologia, data, data_fim, orador, local, orcamento
        FROM `tabActividade do Plano`
        WHERE ano_lectivo = %s
        ORDER BY data IS NULL ASC, data ASC, name ASC
    """, (prev_year,), as_dict=True)

    if not src_rows:
        frappe.throw(_("O ano anterior ({0}) não tem actividades para copiar").format(prev_year))

    def _shift(d):
        if not d:
            return None
        # d may come back as a datetime.date or string
        if not hasattr(d, "year"):
            try:
                from datetime import datetime
                d = datetime.strptime(str(d)[:10], "%Y-%m-%d").date()
            except Exception:
                return None
        new_year = d.year + 1
        last_day = _cal.monthrange(new_year, d.month)[1]
        return str(_date(new_year, d.month, min(d.day, last_day)))

    created_names = []
    for row in src_rows:
        doc = frappe.new_doc("Actividade do Plano")
        doc.actividade     = row.actividade
        doc.tipologia      = row.tipologia or None
        doc.estado         = "Pendente"
        doc.ano_lectivo    = target_ano_lectivo
        doc.data           = _shift(row.data)
        doc.data_fim       = _shift(row.data_fim)
        doc.orador         = row.orador or None
        doc.local          = row.local or None
        doc.orcamento      = row.orcamento or None
        doc.notas_execucao = None
        doc.insert(ignore_permissions=True)
        created_names.append(doc.name)

    frappe.db.commit()

    if not created_names:
        return {"copied": 0, "prev_year": prev_year, "rows": []}

    placeholders = ",".join(["%s"] * len(created_names))
    rows = frappe.db.sql(f"""
        SELECT a.name, a.actividade, a.data, a.data_fim, a.data_original,
               a.orador, a.local, a.orcamento,
               a.tipologia, a.estado, a.notas_execucao, a.organizador, a.a_confirmar, a.so_este_ano, a.ano_lectivo,
               t.cor AS tipologia_cor, t.icone AS tipologia_icone
        FROM `tabActividade do Plano` a
        LEFT JOIN `tabTipologia Actividade` t ON t.name = a.tipologia
        WHERE a.name IN ({placeholders})
        ORDER BY a.data IS NULL ASC, a.data ASC, a.name ASC
    """, created_names, as_dict=True)

    return {"copied": len(created_names), "prev_year": prev_year, "rows": rows}


def _sorted_anos():
    """Return all Ano Lectivo names sorted ascending."""
    rows = frappe.db.sql(
        "SELECT name FROM `tabAno Lectivo` ORDER BY name ASC", as_dict=True
    )
    return [r.name for r in rows]


@frappe.whitelist()
def get_retiros_as_actividades(ano_lectivo):
    """Return Plano de Retiro records shaped like Actividade do Plano rows."""
    _assert_coordenador()

    tip = frappe.db.get_value(
        "Tipologia Actividade", "Retiro",
        ["cor", "icone"], as_dict=True,
    ) or {}

    rows = frappe.db.sql("""
        SELECT name, titulo, data, local, orador, estado, valor_de_contribuicao, notas
        FROM `tabPlano de Retiro`
        WHERE ano_lectivo = %s
        ORDER BY data IS NULL ASC, data ASC
    """, (ano_lectivo,), as_dict=True)

    estado_map = {"Planeado": "Pendente", "Realizado": "Realizada", "Cancelado": "Cancelada"}

    return [{
        "name":            row.name,
        "actividade":      row.titulo,
        "data":            str(row.data)[:10] if row.data else None,
        "data_fim":        None,
        "data_original":   None,
        "local":           row.local  or None,
        "orador":          row.orador or None,
        "estado":          estado_map.get(row.estado, "Pendente"),
        "orcamento":       str(row.valor_de_contribuicao) if row.valor_de_contribuicao else None,
        "ano_lectivo":     ano_lectivo,
        "tipologia":       "Retiro",
        "tipologia_cor":   tip.get("cor")   or "#8b5cf6",
        "tipologia_icone": tip.get("icone") or "⛺",
        "notas_execucao":  row.notas or None,
        "_is_retiro":      True,
        "_retiro_name":    row.name,
    } for row in rows]


@frappe.whitelist()
def get_field_suggestions(fieldname, query):
    _assert_coordenador()
    allowed = {"orador", "local"}
    if fieldname not in allowed:
        frappe.throw(_("Campo inválido"))
    q = f"%{(query or '').strip()}%"
    rows = frappe.db.sql(
        f"SELECT DISTINCT `{fieldname}` FROM `tabActividade do Plano`"
        f" WHERE `{fieldname}` LIKE %s AND `{fieldname}` IS NOT NULL AND `{fieldname}` != ''"
        f" ORDER BY `{fieldname}` ASC LIMIT 12",
        (q,), as_dict=False,
    )
    return [r[0] for r in rows if r[0]]


@frappe.whitelist()
def bulk_update_estado(names_json, estado):
    _assert_coordenador()
    allowed = {"Pendente", "Em Progresso", "Realizada", "Cancelada", "Adiada"}
    if estado not in allowed:
        frappe.throw(_("Estado inválido"))
    names = json.loads(names_json) if isinstance(names_json, str) else names_json
    if not names:
        frappe.throw(_("Nenhuma actividade seleccionada"))
    for name in names:
        if frappe.db.exists("Actividade do Plano", name):
            frappe.db.set_value("Actividade do Plano", name, "estado", estado)
    frappe.db.commit()
    return {"updated": len(names)}


@frappe.whitelist()
def bulk_delete(names_json):
    _assert_coordenador()
    names = json.loads(names_json) if isinstance(names_json, str) else names_json
    if not names:
        frappe.throw(_("Nenhuma actividade seleccionada"))
    deleted = 0
    for name in names:
        if frappe.db.exists("Actividade do Plano", name):
            frappe.delete_doc("Actividade do Plano", name, ignore_permissions=True)
            deleted += 1
    frappe.db.commit()
    return {"deleted": deleted}


@frappe.whitelist()
def bulk_move_month(names_json, new_month):
    """
    Move activities to a new month (YYYY-MM), preserving the day where possible.
    Saves data_original if this is the first date change.
    """
    _assert_coordenador()
    import re, calendar
    from datetime import date as _date
    if not re.match(r'^\d{4}-\d{2}$', new_month):
        frappe.throw(_("Formato de mês inválido"))
    names = json.loads(names_json) if isinstance(names_json, str) else names_json
    if not names:
        frappe.throw(_("Nenhuma actividade seleccionada"))

    ny, nm = map(int, new_month.split('-'))
    last_day = calendar.monthrange(ny, nm)[1]
    updated_rows = []

    for name in names:
        row = frappe.db.get_value(
            "Actividade do Plano", name,
            ["data", "data_fim", "data_original"], as_dict=True
        )
        if not row:
            continue
        if row.data:
            old_day = row.data.day if hasattr(row.data, 'day') else int(str(row.data)[8:10])
            new_day  = min(old_day, last_day)
            new_date = _date(ny, nm, new_day)
        else:
            new_date = _date(ny, nm, 1)

        update_vals = {"data": str(new_date)}

        # Shift data_fim by the same month change, preserving the duration
        new_data_fim = None
        if row.data_fim:
            fim_day = row.data_fim.day if hasattr(row.data_fim, 'day') else int(str(row.data_fim)[8:10])
            new_data_fim = str(_date(ny, nm, min(fim_day, last_day)))
            update_vals["data_fim"] = new_data_fim

        new_data_original = None
        if row.data and not row.data_original:
            update_vals["data_original"] = str(row.data)
            new_data_original = str(row.data)

        frappe.db.set_value("Actividade do Plano", name, update_vals)
        updated_rows.append({
            "name": name,
            "data": str(new_date),
            "data_fim": new_data_fim,
            "data_original": new_data_original or (str(row.data_original) if row.data_original else None),
        })

    frappe.db.commit()
    return {"updated": len(updated_rows), "rows": updated_rows}


# ── Rollover ──────────────────────────────────────────────────────────────────
# Passou para a Proposta do Plano (portal/catequista/doctype/proposta_do_plano), usada pela página Rollover do Plano.


@frappe.whitelist()
def reorder_actividades(ano_lectivo, ordered_names):
    """
    Persist drag-and-drop order within a month by updating a sort_order field.
    ordered_names is a JSON list of document names in the new order.
    """
    _assert_coordenador()
    names = json.loads(ordered_names) if isinstance(ordered_names, str) else ordered_names
    for idx, name in enumerate(names):
        frappe.db.set_value("Actividade do Plano", name, "idx", idx)
    frappe.db.commit()
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────────────
# Subscrição de calendário (iCal) — Google Calendar, Outlook, Apple…
# Cada coordenador tem um token secreto próprio. O URL do feed é público
# (o Google acede sem sessão), por isso o token é a única protecção:
# gerar um novo token invalida o link anterior.
# ─────────────────────────────────────────────────────────────────────────────
ICAL_TOKEN_KEY = "plano_anual_ical_token"
ICAL_DIAS_PASSADOS = 365  # actividades já passadas que continuam no calendário


def _ical_feed_url(token):
    return frappe.utils.get_url(
        "/api/method/portal.catequista.page.plano_anual.plano_anual.ical_feed?token=" + token
    )


@frappe.whitelist()
def get_ical_feed_url(regenerar=0):
    _assert_coordenador()
    user = frappe.session.user
    token = frappe.db.get_value("DefaultValue", {"parent": user, "defkey": ICAL_TOKEN_KEY}, "defvalue")
    if not token or frappe.utils.cint(regenerar):
        token = frappe.generate_hash(length=32)
        frappe.defaults.set_user_default(ICAL_TOKEN_KEY, token, user)
        frappe.db.commit()
    return _ical_feed_url(token)


def _ical_user_from_token(token):
    if not token or len(token) < 20:
        return None
    user = frappe.db.get_value("DefaultValue", {"defkey": ICAL_TOKEN_KEY, "defvalue": token}, "parent")
    if not user or not frappe.db.get_value("User", user, "enabled"):
        return None
    roles = frappe.get_roles(user)
    if "System Manager" not in roles and "Coordenador Catequese" not in roles:
        return None
    return user


def _ical_escape(s):
    return (str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\\n").replace("\n", "\\n"))


def _ical_fold(line):
    # RFC 5545: linhas com mais de 75 octetos são dobradas com CRLF + espaço
    out, size = [], 0
    for ch in line:
        n = len(ch.encode("utf-8"))
        if size + n > 74:
            out.append("\r\n ")
            size = 1
        out.append(ch)
        size += n
    return "".join(out)


def _ical_eventos():
    """Actividades e retiros com data, não cancelados, do último ano em diante."""
    desde = frappe.utils.add_days(frappe.utils.today(), -ICAL_DIAS_PASSADOS)
    eventos = frappe.db.sql("""
        SELECT CONCAT('plano-anual-', name) AS uid, actividade AS titulo, data, data_fim,
               local, orador, tipologia, organizador, a_confirmar
        FROM `tabActividade do Plano`
        WHERE data IS NOT NULL AND IFNULL(estado, '') != 'Cancelada'
          AND COALESCE(data_fim, data) >= %s
    """, (desde,), as_dict=True)
    eventos += frappe.db.sql("""
        SELECT CONCAT('plano-retiro-', name) AS uid, titulo, data, NULL AS data_fim,
               local, orador, 'Retiro' AS tipologia, NULL AS organizador, 0 AS a_confirmar
        FROM `tabPlano de Retiro`
        WHERE data IS NOT NULL AND IFNULL(estado, '') != 'Cancelado' AND data >= %s
    """, (desde,), as_dict=True)
    return eventos


def _ical_build(eventos):
    from datetime import datetime, timedelta, timezone

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    host = frappe.local.site
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Portal Catequese//Plano Anual//PT",
        "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Plano Anual da Catequese",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
    ]
    for ev in eventos:
        inicio = frappe.utils.getdate(ev.data)
        fim = frappe.utils.getdate(ev.data_fim) if ev.data_fim else inicio
        if fim < inicio:
            fim = inicio
        descricao = "\n".join(filter(None, [
            ev.tipologia and f"Tipologia: {ev.tipologia}",
            ev.orador and f"Orador: {ev.orador}",
            ev.organizador and ev.organizador != "Paróquia" and f"Organizado por: {ev.organizador}",
            ev.a_confirmar and "Data a confirmar",
        ]))
        lines += [
            "BEGIN:VEVENT",
            f"UID:{ev.uid}@{host}",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{inicio.strftime('%Y%m%d')}",
            # Eventos de dia inteiro: a data de fim é exclusiva
            f"DTEND;VALUE=DATE:{(fim + timedelta(days=1)).strftime('%Y%m%d')}",
            f"SUMMARY:{_ical_escape(ev.titulo or 'Actividade')}",
        ]
        if descricao:
            lines.append(f"DESCRIPTION:{_ical_escape(descricao)}")
        if ev.local:
            lines.append(f"LOCATION:{_ical_escape(ev.local)}")
        if ev.a_confirmar:
            lines.append("STATUS:TENTATIVE")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_ical_fold(l) for l in lines) + "\r\n"


@frappe.whitelist(allow_guest=True)
def ical_feed(token=None):
    from werkzeug.wrappers import Response

    if not _ical_user_from_token(token):
        return Response("Not found", status=404, mimetype="text/plain")

    resp = Response(_ical_build(_ical_eventos()).encode("utf-8"))
    resp.headers["Content-Type"] = "text/calendar; charset=utf-8"
    resp.headers["Content-Disposition"] = 'inline; filename="plano-anual.ics"'
    resp.headers["Cache-Control"] = "no-cache"
    return resp

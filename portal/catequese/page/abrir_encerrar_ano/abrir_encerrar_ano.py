"""
Abrir e Encerrar Ano — lista de verificação do fim de um ano lectivo e da
preparação do seguinte. O estado de cada passo é calculado a partir dos dados.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime

from portal.catequese.utils import ano_actual


def _assert_coordenador():
    if frappe.session.user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    if not set(frappe.get_roles()) & {"System Manager", "Coordenador Catequese"}:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


def _passo(chave, titulo, estado, detalhe, accoes=None, itens=None):
    # estado: ok | aviso | pendente | info
    return {"chave": chave, "titulo": titulo, "estado": estado, "detalhe": detalhe,
            "accoes": accoes or [], "itens": itens or []}


def _rota(rotulo, rota):
    return {"tipo": "rota", "rotulo": rotulo, "rota": rota}


def _novo(rotulo, doctype, valores):
    return {"tipo": "novo", "rotulo": rotulo, "doctype": doctype, "valores": valores}


def _metodo(rotulo, metodo, args, confirmar=None, primario=True):
    return {"tipo": "metodo", "rotulo": rotulo, "metodo": metodo, "args": args,
            "confirmar": confirmar, "primario": primario}


@frappe.whitelist()
def get_anos():
    _assert_coordenador()
    return {
        "anos": frappe.get_all("Ano Lectivo", fields=["name", "estado"], order_by="name desc"),
        "actual": ano_actual(),
    }


@frappe.whitelist()
def get_estado(ano=None):
    _assert_coordenador()
    ano = str(ano or ano_actual())
    seguinte = str(int(ano) + 1)
    return {
        "ano": ano,
        "seguinte": seguinte,
        "actual": ano_actual(),
        "estado_ano": frappe.db.get_value("Ano Lectivo", ano, "estado"),
        "encerrar": _passos_encerrar(ano, seguinte),
        "abrir": _passos_abrir(ano, seguinte),
    }


# ── Encerrar o ano ────────────────────────────────────────────────────────────

def _passos_encerrar(ano, seguinte):
    passos = []

    # 1. Sacramentos
    preps = frappe.get_all("Preparacao do Sacramento", filters={"ano_lectivo": ano},
                           fields=["name", "sacramento", "docstatus", "data_do_sacramento"],
                           order_by="data_do_sacramento")
    rascunho = [p for p in preps if p.docstatus == 0]
    itens = [{"texto": p.name, "estado": "ok" if p.docstatus == 1 else ("info" if p.docstatus == 2 else "aviso"),
              "nota": {0: "rascunho — falta submeter", 1: "submetida", 2: "cancelada"}[p.docstatus],
              "rota": f"/app/preparacao-do-sacramento/{p.name}"} for p in preps]
    if not preps:
        passos.append(_passo("sacramentos", "Sacramentos do ano", "aviso",
                             "Não há Preparações do Sacramento registadas neste ano.",
                             [_rota("Ver preparações", "/app/preparacao-do-sacramento")]))
    else:
        passos.append(_passo(
            "sacramentos", "Sacramentos do ano", "aviso" if rascunho else "ok",
            f"{len(rascunho)} preparação(ões) por submeter. Ao submeter, os catecúmenos são actualizados "
            "(baptismo, eucaristia, crisma)." if rascunho else "Todas as preparações estão submetidas.",
            itens=itens))

    # 2. Apuramento por fase
    turmas = frappe.get_all("Turma", filters={"ano_lectivo": ano}, fields=["name", "fase", "status"])
    apuradas = set(frappe.db.sql_list("""
        SELECT apt.turma FROM `tabApuramento Turmas Table` apt
        JOIN `tabApuramento de Turmas` ap ON ap.name = apt.parent
        WHERE ap.docstatus = 1 AND apt.incluir = 1 AND ap.ano_lectivo_actual = %s
    """, ano))
    seguinte_de = dict(frappe.get_all("Fase", fields=["name", "fase_seguinte_transita"], as_list=True))
    ordem = dict(frappe.get_all("Fase", fields=["name", "ordem"], as_list=True))
    por_fase = {}
    for t in turmas:
        por_fase.setdefault(t.fase or "Sem fase", []).append(t)

    itens, faltam = [], 0
    for f in sorted(por_fase, key=lambda x: (ordem.get(x) or 999, x)):
        ts = por_fase[f]
        activas = [t for t in ts if t.status == "Activo"]
        n_apuradas = sum(1 for t in ts if t.name in apuradas)
        if not activas:
            estado, nota = "ok", f"{n_apuradas} de {len(ts)} turma(s) apuradas; nenhuma activa"
        else:
            faltam += 1
            estado = "pendente"
            nota = f"{len(activas)} turma(s) activa(s) por apurar"
            if not seguinte_de.get(f):
                nota += " — a fase não tem \"Fase Seguinte\" configurada"
        item = {"texto": f, "estado": estado, "nota": nota}
        if activas:
            item["accao"] = _novo("Novo apuramento", "Apuramento de Turmas", {
                "ano_lectivo_actual": ano, "ano_lectivo_seguinte": seguinte, "fase_actual": f,
            })
            if not seguinte_de.get(f) and f != "Sem fase":
                item["accao_extra"] = _rota("Configurar fase", f"/app/fase/{f}")
        itens.append(item)
    passos.append(_passo(
        "apuramento", "Apuramento por fase", "pendente" if faltam else ("ok" if turmas else "info"),
        f"{faltam} fase(s) com turmas por apurar. O apuramento cria as turmas de {seguinte} "
        "e encerra as deste ano." if faltam else
        ("Todas as fases foram apuradas." if turmas else "Não há turmas neste ano."),
        [_rota("Ver apuramentos", "/app/apuramento-de-turmas")], itens))

    # 3. Turmas que ficaram activas
    activas = [t.name for t in turmas if t.status == "Activo"]
    passos.append(_passo(
        "turmas", "Encerrar turmas restantes", "aviso" if activas else "ok",
        f"{len(activas)} turma(s) de {ano} continuam activas (ex.: turmas do Crisma, já concluídas). "
        "Encerre-as quando os apuramentos estiverem feitos." if activas else "Não há turmas activas deste ano.",
        [_metodo("Encerrar as turmas activas", "encerrar_turmas", {"ano": ano},
                 confirmar=f"Marcar as {len(activas)} turmas activas de {ano} como Inactivo?")] if activas else [],
        [{"texto": t, "estado": "aviso", "rota": f"/app/turma/{t}"} for t in activas[:30]]))

    # 4. Pré-inscrições pendentes
    pendentes = frappe.db.count("Catecumeno", {"status": "Pendente"})
    passos.append(_passo(
        "pendentes", "Pré-inscrições sem turma", "aviso" if pendentes else "ok",
        f"{pendentes} catecúmeno(s) pendentes à espera de turma." if pendentes else "Nenhum catecúmeno pendente.",
        [_rota("Ver pendentes", "/app/catecumeno?status=Pendente"),
         _rota("Alocação em massa", "/app/alocacao-em-massa/new")] if pendentes else []))

    # 5. Relatório anual
    rel = frappe.db.get_value("Relatorio Anual", {"ano_lectivo": ano}, ["name", "estado"], as_dict=True)
    if not rel:
        passos.append(_passo("relatorio", f"Relatório anual {ano}", "pendente", "Ainda não foi criado.",
                             [_novo("Criar relatório", "Relatorio Anual", {"ano_lectivo": ano})]))
    else:
        passos.append(_passo(
            "relatorio", f"Relatório anual {ano}", "ok" if rel.estado == "Final" else "aviso",
            "Concluído (estado Final)." if rel.estado == "Final" else "Em rascunho — reveja, gere o Word e marque como Final.",
            [_rota("Abrir relatório", f"/app/relatorio-anual/{rel.name}")]))
    return passos


# ── Preparar o ano seguinte ───────────────────────────────────────────────────

def _passos_abrir(ano, seguinte):
    passos = []
    existe = frappe.db.exists("Ano Lectivo", seguinte)

    passos.append(_passo(
        "ano", f"Criar o ano lectivo {seguinte}", "ok" if existe else "pendente",
        "Criado." if existe else "Necessário para o plano anual, turmas e apuramentos.",
        [] if existe else [_metodo(f"Criar {seguinte}", "criar_ano", {"ano": seguinte})]))

    n_plano = frappe.db.count("Actividade do Plano", {"ano_lectivo": seguinte}) if existe else 0
    passos.append(_passo(
        "plano", f"Plano anual {seguinte}", "ok" if n_plano else "pendente",
        f"{n_plano} actividade(s) planeadas." if n_plano else
        f"Ainda sem actividades. Use o Rollover para copiar o plano de {ano} e ajustar as datas.",
        [_rota("Rollover do plano", "/app/rollover-plano"), _rota("Plano anual", "/app/plano-anual")]))

    turmas = frappe.get_all("Turma", filters={"ano_lectivo": seguinte},
                            fields=["name", "catequista", "status"]) if existe else []
    sem_cat = [t.name for t in turmas if not t.catequista]
    if not turmas:
        estado, detalhe = "pendente", "Ainda não há turmas. São criadas pelos apuramentos (e pela alocação de novos inscritos)."
    elif sem_cat:
        estado, detalhe = "aviso", f"{len(turmas)} turma(s); {len(sem_cat)} sem catequista atribuído."
    else:
        estado, detalhe = "ok", f"{len(turmas)} turma(s), todas com catequista."
    passos.append(_passo(
        "turmas", f"Turmas de {seguinte}", estado, detalhe,
        [_rota("Ver turmas", f"/app/turma?ano_lectivo={seguinte}")] if turmas else [],
        [{"texto": t, "estado": "aviso", "nota": "sem catequista", "rota": f"/app/turma/{t}"} for t in sem_cat[:30]]))

    n_retiros = frappe.db.count("Plano de Retiro", {"ano_lectivo": seguinte}) if existe else 0
    passos.append(_passo(
        "retiros", f"Retiros de {seguinte}", "ok" if n_retiros else "info",
        f"{n_retiros} retiro(s) planeados." if n_retiros else "Ainda sem retiros planeados (opcional nesta fase).",
        [_rota("Plano de retiros", "/app/plano-retiro")]))

    actual = ano_actual()
    passos.append(_passo(
        "actual", f"Começar o ano {seguinte}", "ok" if actual == seguinte else "pendente",
        f"{seguinte} é o ano actual em todo o sistema." if actual == seguinte else
        f"O ano actual ainda é {actual}. Ao começar {seguinte}, todas as páginas e relatórios passam a usá-lo "
        f"por omissão e {ano} fica marcado como Encerrado.",
        [] if actual == seguinte or not existe else [_metodo(
            f"Começar {seguinte}", "definir_ano_actual", {"ano": seguinte},
            confirmar=f"Passar a usar {seguinte} como ano actual e marcar {ano} como Encerrado?")]))
    return passos


# ── Acções ────────────────────────────────────────────────────────────────────

@frappe.whitelist()
def criar_ano(ano):
    _assert_coordenador()
    ano = str(int(ano))
    if not frappe.db.exists("Ano Lectivo", ano):
        frappe.get_doc({"doctype": "Ano Lectivo", "ano_lectivo": int(ano), "estado": "Planeado"}).insert(
            ignore_permissions=True)
    return ano


@frappe.whitelist()
def encerrar_turmas(ano):
    _assert_coordenador()
    activas = frappe.get_all("Turma", filters={"ano_lectivo": ano, "status": "Activo"}, pluck="name")
    for t in activas:
        frappe.db.set_value("Turma", t, "status", "Inactivo")
    return len(activas)


@frappe.whitelist()
def definir_ano_actual(ano):
    _assert_coordenador()
    if not frappe.db.exists("Ano Lectivo", ano):
        frappe.throw(_("O ano lectivo {0} não existe.").format(ano))
    anterior = ano_actual()

    s = frappe.get_single("Catequese Settings")
    s.ano_lectivo_actual = ano
    s.save(ignore_permissions=True)

    frappe.db.set_value("Ano Lectivo", ano, "estado", "Em curso")
    if anterior and anterior != ano and anterior < ano:
        frappe.db.set_value("Ano Lectivo", anterior, {"estado": "Encerrado", "data_encerramento": now_datetime()})
    frappe.clear_cache()  # o boot (frappe.boot.catequese) passa a ter o novo ano
    return ano

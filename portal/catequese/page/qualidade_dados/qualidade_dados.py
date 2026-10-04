"""
Qualidade dos Dados — verificações de registos incompletos ou incoerentes
e correcções em massa para os casos simples.

Cada verificação é uma função registada com @verificacao: devolve as linhas
com problema (cada linha tem `name`, usado na selecção e na correcção).
Para acrescentar uma verificação basta escrever mais uma função.
"""

import re
import unicodedata
from datetime import date, timedelta
from statistics import median

import frappe
from frappe import _
from frappe.utils import getdate

from portal.catequese.utils import PAROQUIA, ano_actual, classificar_organizador, definicao, e_externa

LIMITE = 1000
AREAS = ["Catecúmenos", "Sacramentos", "Turmas", "Catequistas", "Plano"]
VIVOS = "c.status IN ('Activo', 'Pendente')"

VERIFICACOES = {}


def _assert_coordenador():
    if frappe.session.user == "Guest":
        frappe.throw(_("Não autenticado"), frappe.AuthenticationError)
    if not set(frappe.get_roles()) & {"System Manager", "Coordenador Catequese"}:
        frappe.throw(_("Sem permissão"), frappe.PermissionError)


def verificacao(chave, area, titulo, descricao, doctype, colunas, correccao=None, link=None, nome=None):
    """
    Regista uma verificação.
      correccao: {"campo": ..., "valores": [...]}  — escolher um valor
                 {"accao": ..., "rotulo": ...}      — acção fixa (ver ACCOES)
      link:      {"doctype": ..., "campo": ...}     — abrir outro registo que não o `name`
      nome:      campo mostrado na coluna "Nome" quando `name` é uma linha de tabela
    """
    def registar(fn):
        VERIFICACOES[chave] = {
            "area": area, "titulo": titulo, "descricao": descricao, "doctype": doctype,
            "colunas": colunas, "correccao": correccao, "link": link, "nome": nome, "fn": fn,
        }
        return fn
    return registar


def _sql(q, *args):
    # Sem parâmetros não se passa nada: o Frappe transforma None em (None,) e a query falha
    if args:
        return frappe.db.sql(q, args, as_dict=True)
    return frappe.db.sql(q, as_dict=True)


def _norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def _idade(nasc, hoje=None):
    nasc, hoje = getdate(nasc), hoje or date.today()
    return hoje.year - nasc.year - ((hoje.month, hoje.day) < (nasc.month, nasc.day))


def _turmas_activas():
    return {t.name: t for t in _sql("SELECT name, fase, ano_lectivo FROM `tabTurma` WHERE status = 'Activo'")}


# ═════════════════════════════════════════════════════════════════════════════
# Catecúmenos
# ═════════════════════════════════════════════════════════════════════════════

@verificacao("cat_sem_comunidade", "Catecúmenos", "Sem comunidade",
             "Activos ou pendentes sem comunidade (Assunção / Santa Ana) definida.",
             "Catecumeno", ["turma", "fase", "status"],
             {"campo": "comunidade", "valores": ["Assunção", "Santa Ana"]})
def _cat_sem_comunidade():
    return _sql(f"SELECT c.name, c.turma, c.fase, c.status FROM `tabCatecumeno` c "
                f"WHERE {VIVOS} AND IFNULL(c.comunidade, '') = '' ORDER BY c.name")


@verificacao("cat_sem_sexo", "Catecúmenos", "Sem sexo", "Activos ou pendentes sem sexo indicado.",
             "Catecumeno", ["turma", "fase", "idade"],
             {"campo": "sexo", "valores": ["Feminino", "Masculino"], "por_linha": True})
def _cat_sem_sexo():
    return _sql(f"SELECT c.name, c.turma, c.fase, c.idade FROM `tabCatecumeno` c "
                f"WHERE {VIVOS} AND IFNULL(c.sexo, '') = '' ORDER BY c.turma, c.name")


@verificacao("cat_sem_nascimento", "Catecúmenos", "Sem data de nascimento",
             "Activos ou pendentes sem data de nascimento (a idade não é calculada).",
             "Catecumeno", ["turma", "encarregado", "contacto"])
def _cat_sem_nascimento():
    return _sql(f"SELECT c.name, c.turma, c.encarregado, c.contacto FROM `tabCatecumeno` c "
                f"WHERE {VIVOS} AND c.data_de_nascimento IS NULL ORDER BY c.turma, c.name")


@verificacao("cat_idade_errada", "Catecúmenos", "Idade não bate com a data de nascimento",
             "A idade guardada é diferente da calculada pela data de nascimento.",
             "Catecumeno", ["data_de_nascimento", "idade", "idade_certa"],
             {"accao": "recalcular_idade", "rotulo": "Recalcular a idade"})
def _cat_idade_errada():
    out = []
    for c in _sql(f"SELECT c.name, c.data_de_nascimento, c.idade FROM `tabCatecumeno` c "
                  f"WHERE {VIVOS} AND c.data_de_nascimento IS NOT NULL ORDER BY c.name"):
        certa = _idade(c.data_de_nascimento)
        if c.idade != certa:
            c.idade_certa = certa
            out.append(c)
    return out


@verificacao("cat_idade_invulgar", "Catecúmenos", "Idade invulgar para a fase",
             "Idade a 4 ou mais anos da idade típica (mediana) da fase. Fases de adultos não são verificadas.",
             "Catecumeno", ["turma", "fase", "idade", "idade_tipica"])
def _cat_idade_invulgar():
    turmas = _turmas_activas()
    linhas = [c for c in _sql("SELECT c.name, c.turma, c.fase, c.idade FROM `tabCatecumeno` c "
                              "WHERE c.status = 'Activo' AND c.idade > 0") if c.turma in turmas]
    por_fase = {}
    for c in linhas:
        por_fase.setdefault(c.fase, []).append(c.idade)
    out = []
    for c in linhas:
        if not c.fase or "adult" in _norm(c.fase) or len(por_fase[c.fase]) < 5:
            continue
        tipica = median(por_fase[c.fase])
        if abs(c.idade - tipica) >= 4:
            c.idade_tipica = int(tipica)
            out.append(c)
    return sorted(out, key=lambda c: (c.fase, c.name))


@verificacao("cat_activo_sem_turma", "Catecúmenos", "Activos sem turma",
             "Estado Activo mas sem turma. Normalmente deviam estar Pendentes (à espera de turma).",
             "Catecumeno", ["fase", "comunidade"],
             {"campo": "status", "valores": ["Pendente", "Inactivo"]})
def _cat_activo_sem_turma():
    return _sql("SELECT c.name, c.fase, c.comunidade FROM `tabCatecumeno` c "
                "WHERE c.status = 'Activo' AND IFNULL(c.turma, '') = '' ORDER BY c.name")


@verificacao("cat_turma_divergente", "Catecúmenos", "Turma do registo diferente da turma real",
             "Está na lista de uma turma activa, mas o registo aponta para outra turma.",
             "Catecumeno", ["turma", "turma_real"],
             {"accao": "alinhar_turma", "rotulo": "Alinhar registo com a turma real"})
def _cat_turma_divergente():
    return _sql("""
        SELECT c.name, c.turma, MIN(t.name) AS turma_real FROM `tabCatecumeno` c
        JOIN `tabTurma Catecumenos` tc ON tc.catecumeno = c.name AND tc.parenttype = 'Turma'
        JOIN `tabTurma` t ON t.name = tc.parent AND t.status = 'Activo'
        GROUP BY c.name, c.turma
        HAVING COUNT(DISTINCT t.name) = 1 AND IFNULL(c.turma, '') != MIN(t.name)
        ORDER BY c.name""")


@verificacao("cat_fase_divergente", "Catecúmenos", "Fase diferente da fase da turma",
             "O catecúmeno está numa turma de outra fase.",
             "Catecumeno", ["turma", "fase", "fase_da_turma"],
             {"accao": "alinhar_fase", "rotulo": "Usar a fase da turma"})
def _cat_fase_divergente():
    return _sql("""
        SELECT c.name, c.turma, c.fase, t.fase AS fase_da_turma FROM `tabCatecumeno` c
        JOIN `tabTurma` t ON t.name = c.turma AND t.status = 'Activo'
        WHERE c.status = 'Activo' AND IFNULL(c.fase, '') != IFNULL(t.fase, '')
        ORDER BY c.turma, c.name""")


@verificacao("cat_varias_turmas", "Catecúmenos", "Em várias turmas activas",
             "O mesmo catecúmeno aparece na lista de mais de uma turma activa.",
             "Catecumeno", ["turmas"])
def _cat_varias_turmas():
    return _sql("""
        SELECT c.name, GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ', ') AS turmas
        FROM `tabCatecumeno` c
        JOIN `tabTurma Catecumenos` tc ON tc.catecumeno = c.name AND tc.parenttype = 'Turma'
        JOIN `tabTurma` t ON t.name = tc.parent AND t.status = 'Activo'
        GROUP BY c.name HAVING COUNT(DISTINCT t.name) > 1 ORDER BY c.name""")


@verificacao("cat_turma_inactiva", "Catecúmenos", "Activos numa turma inactiva",
             "Catecúmeno activo cujo registo aponta para uma turma já inactiva.",
             "Catecumeno", ["turma", "fase"])
def _cat_turma_inactiva():
    return _sql("""
        SELECT c.name, c.turma, c.fase FROM `tabCatecumeno` c
        JOIN `tabTurma` t ON t.name = c.turma
        WHERE c.status = 'Activo' AND t.status != 'Activo' ORDER BY c.turma, c.name""")


@verificacao("cat_saiu_mas_na_turma", "Catecúmenos", "Saíram, mas continuam na lista da turma",
             "Estado Inactivo, Transferido ou Crismado mas ainda listados como activos numa turma activa.",
             "Catecumeno", ["estado_catecumeno", "turma"],
             {"accao": "inativar_na_turma", "rotulo": "Marcar como Inativo na turma"},
             link={"doctype": "Catecumeno", "campo": "catecumeno"}, nome="catecumeno")
def _cat_saiu_mas_na_turma():
    # `name` é a linha da turma (a correcção actua sobre ela)
    return _sql("""
        SELECT tc.name, tc.catecumeno, c.status AS estado_catecumeno, t.name AS turma
        FROM `tabTurma Catecumenos` tc
        JOIN `tabTurma` t ON t.name = tc.parent AND tc.parenttype = 'Turma' AND t.status = 'Activo'
        JOIN `tabCatecumeno` c ON c.name = tc.catecumeno
        WHERE c.status IN ('Inactivo', 'Transferido', 'Crismado') AND IFNULL(tc.estado, '') != 'Inativo'
        ORDER BY t.name, tc.catecumeno""")


@verificacao("cat_sem_encarregado", "Catecúmenos", "Sem encarregado ou sem contacto",
             "Activos sem nome do encarregado ou sem número de contacto.",
             "Catecumeno", ["turma", "encarregado", "contacto"])
def _cat_sem_encarregado():
    return _sql("SELECT c.name, c.turma, c.encarregado, c.contacto FROM `tabCatecumeno` c "
                "WHERE c.status = 'Activo' AND (IFNULL(c.encarregado, '') = '' OR IFNULL(c.contacto, '') = '') "
                "ORDER BY c.turma, c.name")


def _contacto_invalido(numero):
    """Válido: um número móvel de Moçambique (8x xxx xxxx), com ou sem +258."""
    for parte in re.split(r"[/,;|]| e ", str(numero or "")):
        d = re.sub(r"\D", "", parte)
        if d.startswith("258"):
            d = d[3:]
        if d and not re.fullmatch(r"8[2-7]\d{7}", d):
            return True
    return False


@verificacao("cat_contacto_invalido", "Catecúmenos", "Contacto com formato estranho",
             "O número não parece um telemóvel de Moçambique (9 dígitos começados por 82–87).",
             "Catecumeno", ["turma", "encarregado", "contacto"])
def _cat_contacto_invalido():
    return [c for c in _sql("SELECT c.name, c.turma, c.encarregado, c.contacto FROM `tabCatecumeno` c "
                            "WHERE c.status = 'Activo' AND IFNULL(c.contacto, '') != '' ORDER BY c.turma, c.name")
            if _contacto_invalido(c.contacto)]


@verificacao("cat_nomes_parecidos", "Catecúmenos", "Nomes muito parecidos (possíveis duplicados)",
             "Nomes iguais quando se ignoram acentos, maiúsculas e espaços a mais.",
             "Catecumeno", ["parecido_com", "status", "turma"])
def _cat_nomes_parecidos():
    grupos = {}
    for c in _sql("SELECT c.name, c.status, c.turma FROM `tabCatecumeno` c"):
        grupos.setdefault(_norm(c.name), []).append(c)
    out = []
    for lista in grupos.values():
        if len(lista) > 1:
            for c in lista:
                c.parecido_com = ", ".join(x.name for x in lista if x.name != c.name)
                out.append(c)
    return sorted(out, key=lambda c: _norm(c.name))


@verificacao("cat_pendente_antigo", "Catecúmenos", "Pendentes há mais de 60 dias",
             "Pré-inscrições ainda sem turma, criadas há mais de 60 dias.",
             "Catecumeno", ["fase", "criado_em", "contacto"])
def _cat_pendente_antigo():
    limite = date.today() - timedelta(days=60)
    return _sql("SELECT c.name, c.fase, DATE(c.creation) AS criado_em, c.contacto FROM `tabCatecumeno` c "
                "WHERE c.status = 'Pendente' AND DATE(c.creation) < %s ORDER BY c.creation", limite)


# ═════════════════════════════════════════════════════════════════════════════
# Sacramentos
# ═════════════════════════════════════════════════════════════════════════════

@verificacao("sac_ordem", "Sacramentos", "Sacramentos fora de ordem",
             "Eucaristia sem Baptismo, ou Crisma sem Baptismo/Eucaristia.",
             "Catecumeno", ["baptismo", "eucaristia", "crisma"],
             {"accao": "marcar_anteriores", "rotulo": "Marcar os sacramentos anteriores"})
def _sac_ordem():
    return _sql("SELECT c.name, c.baptismo, c.eucaristia, c.crisma FROM `tabCatecumeno` c "
                "WHERE (c.eucaristia = 1 AND c.baptismo = 0) "
                "OR (c.crisma = 1 AND (c.baptismo = 0 OR c.eucaristia = 0)) ORDER BY c.name")


@verificacao("sac_crismado_sem_crisma", "Sacramentos", "Estado Crismado sem Crisma marcado",
             "O estado diz Crismado mas o Crisma não está assinalado.",
             "Catecumeno", ["data_do_crisma"],
             {"accao": "marcar_crisma", "rotulo": "Marcar o Crisma"})
def _sac_crismado_sem_crisma():
    return _sql("SELECT c.name, c.data_do_crisma FROM `tabCatecumeno` c "
                "WHERE c.status = 'Crismado' AND IFNULL(c.crisma, 0) = 0 ORDER BY c.name")


@verificacao("sac_livro_sem_baptismo", "Sacramentos", "No Livro de Baptismo mas não marcados como baptizados",
             "Têm registo no Livro de Baptismo, mas o catecúmeno não tem o Baptismo assinalado.",
             "Catecumeno", ["data_do_livro", "ano"],
             {"accao": "baptismo_do_livro", "rotulo": "Marcar baptizado (data do Livro)"})
def _sac_livro_sem_baptismo():
    return _sql("""
        SELECT c.name, l.data_do_baptismo AS data_do_livro, l.ano FROM `tabCatecumeno` c
        JOIN `tabLivro de Baptismo` l ON l.catecumeno = c.name
        WHERE IFNULL(c.baptismo, 0) = 0 ORDER BY c.name""")


@verificacao("sac_livro_sem_eucaristia", "Sacramentos", "No Livro de 1ª Comunhão mas sem a Eucaristia marcada",
             "Têm registo no Livro de Primeira Comunhão, mas o catecúmeno não tem a Eucaristia assinalada.",
             "Catecumeno", ["data_do_livro", "ano"],
             {"accao": "eucaristia_do_livro", "rotulo": "Marcar Eucaristia (data do Livro)"})
def _sac_livro_sem_eucaristia():
    return _sql("""
        SELECT c.name, l.data_da_comunhao AS data_do_livro, l.ano FROM `tabCatecumeno` c
        JOIN `tabLivro de Primeira Comunhao` l ON l.catecumeno = c.name
        WHERE IFNULL(c.eucaristia, 0) = 0 ORDER BY c.name""")


@verificacao("sac_livro_sem_crisma", "Sacramentos", "No Livro de Crisma mas sem o Crisma marcado",
             "Têm registo no Livro de Crisma, mas o catecúmeno não tem o Crisma assinalado.",
             "Catecumeno", ["data_do_livro", "ano"],
             {"accao": "crisma_do_livro", "rotulo": "Marcar Crisma (data do Livro)"})
def _sac_livro_sem_crisma():
    return _sql("""
        SELECT c.name, l.data_do_crisma AS data_do_livro, l.ano FROM `tabCatecumeno` c
        JOIN `tabLivro de Crisma` l ON l.catecumeno = c.name
        WHERE IFNULL(c.crisma, 0) = 0 ORDER BY c.name""")


@verificacao("sac_sem_data", "Sacramentos", "Sacramento marcado sem data",
             "O sacramento está assinalado mas a data está vazia.",
             "Catecumeno", ["sem_data"])
def _sac_sem_data():
    out = []
    for c in _sql("SELECT c.name, c.baptismo, c.data_do_baptismo, c.eucaristia, c.data_da_eucaristia, "
                  "c.crisma, c.data_do_crisma FROM `tabCatecumeno` c "
                  "WHERE (c.baptismo = 1 AND c.data_do_baptismo IS NULL) "
                  "OR (c.eucaristia = 1 AND c.data_da_eucaristia IS NULL) "
                  "OR (c.crisma = 1 AND c.data_do_crisma IS NULL) ORDER BY c.name"):
        falta = [s for s, ok, d in (("Baptismo", c.baptismo, c.data_do_baptismo),
                                    ("Eucaristia", c.eucaristia, c.data_da_eucaristia),
                                    ("Crisma", c.crisma, c.data_do_crisma)) if ok and not d]
        out.append(frappe._dict(name=c.name, sem_data=", ".join(falta)))
    return out


@verificacao("sac_documentos_em_falta", "Sacramentos", "Candidatos sem documentos (ano actual)",
             "Candidatos de Preparações do ano actual sem a ficha ou sem os documentos dos padrinhos.",
             "Catecumeno", ["preparacao", "falta"],
             link={"doctype": "Preparacao do Sacramento", "campo": "preparacao"}, nome="catecumeno")
def _sac_documentos_em_falta():
    out = []
    for r in _sql("""
        SELECT cs.name, IFNULL(cs.catecumeno, cs.nome_completo) AS catecumeno, p.name AS preparacao,
               cs.ficha, cs.documentos_padrinhos
        FROM `tabCandidatos ao Sacramento Table` cs
        JOIN `tabPreparacao do Sacramento` p ON p.name = cs.parent AND p.docstatus < 2
        WHERE p.ano_lectivo = %s AND (IFNULL(cs.ficha, 0) = 0 OR IFNULL(cs.documentos_padrinhos, 0) = 0)
          AND IFNULL(cs.situacao, '') != 'Não vai receber'
        ORDER BY p.name, cs.catecumeno""", ano_actual()):
        r.falta = ", ".join(x for x, ok in (("ficha", r.ficha), ("docs. padrinhos", r.documentos_padrinhos)) if not ok)
        out.append(r)
    return out


# ═════════════════════════════════════════════════════════════════════════════
# Turmas
# ═════════════════════════════════════════════════════════════════════════════

@verificacao("turma_ano_anterior", "Turmas", "Activas de anos anteriores",
             "Turmas ainda activas cujo ano lectivo já não é o actual.",
             "Turma", ["fase", "ano_lectivo", "catecumenos"],
             {"accao": "inactivar_turma", "rotulo": "Tornar inactivas"})
def _turma_ano_anterior():
    ano = ano_actual()
    if not ano:
        return []
    return _sql("""
        SELECT t.name, t.fase, t.ano_lectivo,
               (SELECT COUNT(*) FROM `tabTurma Catecumenos` tc WHERE tc.parent = t.name) AS catecumenos
        FROM `tabTurma` t WHERE t.status = 'Activo' AND t.ano_lectivo < %s ORDER BY t.name""", ano)


@verificacao("turma_vazia", "Turmas", "Activas sem catecúmenos",
             "Turmas activas sem nenhum catecúmeno activo na lista.",
             "Turma", ["fase", "ano_lectivo"],
             {"accao": "inactivar_turma", "rotulo": "Tornar inactivas"})
def _turma_vazia():
    return _sql("""
        SELECT t.name, t.fase, t.ano_lectivo FROM `tabTurma` t
        WHERE t.status = 'Activo' AND NOT EXISTS (
            SELECT 1 FROM `tabTurma Catecumenos` tc
            WHERE tc.parent = t.name AND IFNULL(tc.estado, '') != 'Inativo')
        ORDER BY t.name""")


@verificacao("turma_sobrelotada", "Turmas", "Acima do tamanho máximo",
             "Turmas activas com mais catecúmenos activos do que o máximo das Catequese Settings.",
             "Turma", ["fase", "catecumenos", "maximo"])
def _turma_sobrelotada():
    maximo = int(definicao("tamanho_maximo"))
    return _sql("""
        SELECT t.name, t.fase, COUNT(tc.name) AS catecumenos, %s AS maximo FROM `tabTurma` t
        JOIN `tabTurma Catecumenos` tc ON tc.parent = t.name AND IFNULL(tc.estado, '') != 'Inativo'
        WHERE t.status = 'Activo' GROUP BY t.name, t.fase HAVING COUNT(tc.name) > %s
        ORDER BY catecumenos DESC""", maximo, maximo)


@verificacao("turma_sem_horario", "Turmas", "Sem dia, hora ou local",
             "Turmas activas sem dia, hora ou local definidos.",
             "Turma", ["fase", "dia", "hora", "local"])
def _turma_sem_horario():
    return _sql("SELECT t.name, t.fase, t.dia, t.hora, t.local FROM `tabTurma` t WHERE t.status = 'Activo' "
                "AND (IFNULL(t.dia, '') = '' OR IFNULL(t.hora, '') = '' OR IFNULL(t.local, '') = '') ORDER BY t.name")


@verificacao("turma_sem_catequista", "Turmas", "Sem catequista",
             "Turmas activas sem catequista responsável atribuído.",
             "Turma", ["fase", "ano_lectivo", "catequistas"])
def _turma_sem_catequista():
    return _sql("SELECT t.name, t.fase, t.ano_lectivo, t.catequistas FROM `tabTurma` t "
                "WHERE t.status = 'Activo' AND IFNULL(t.catequista, '') = '' ORDER BY t.name")


@verificacao("turma_catequista_inactivo", "Turmas", "Catequista inactivo",
             "O catequista responsável ou o adjunto está marcado como Inactivo.",
             "Turma", ["fase", "catequista_inactivo"])
def _turma_catequista_inactivo():
    return _sql("""
        SELECT t.name, t.fase, q.name AS catequista_inactivo FROM `tabTurma` t
        JOIN `tabCatequista` q ON q.name IN (t.catequista, t.catequista_adj) AND q.status = 'Inactivo'
        WHERE t.status = 'Activo' ORDER BY t.name""")


# ═════════════════════════════════════════════════════════════════════════════
# Catequistas
# ═════════════════════════════════════════════════════════════════════════════

@verificacao("catequista_sem_estado", "Catequistas", "Sem estado", "Catequistas sem estado Activo/Inactivo.",
             "Catequista", ["contacto_1", "nucleo"],
             {"campo": "status", "valores": ["Activo", "Inactivo"]})
def _catequista_sem_estado():
    return _sql("SELECT name, contacto_1, nucleo FROM `tabCatequista` WHERE IFNULL(status, '') = '' ORDER BY name")


@verificacao("catequista_sem_contacto", "Catequistas", "Activos sem contacto",
             "Sem nenhum número de telefone registado.", "Catequista", ["nucleo", "email"])
def _catequista_sem_contacto():
    return _sql("SELECT name, nucleo, email FROM `tabCatequista` WHERE status = 'Activo' "
                "AND IFNULL(contacto_1, '') = '' AND IFNULL(contacto_2, '') = '' ORDER BY name")


@verificacao("catequista_sem_turma", "Catequistas", "Activos sem turma no ano actual",
             "Catequistas activos que não são responsáveis nem adjuntos de nenhuma turma activa do ano actual.",
             "Catequista", ["contacto_1", "nucleo"])
def _catequista_sem_turma():
    return _sql("""
        SELECT q.name, q.contacto_1, q.nucleo FROM `tabCatequista` q
        WHERE q.status = 'Activo' AND NOT EXISTS (
            SELECT 1 FROM `tabTurma` t WHERE t.status = 'Activo' AND t.ano_lectivo = %s
            AND q.name IN (t.catequista, t.catequista_adj))
        ORDER BY q.name""", ano_actual())


@verificacao("catequista_sem_acesso", "Catequistas", "Activos sem acesso ao portal",
             "Sem utilizador ligado: não conseguem entrar no Portal do Catequista.",
             "Catequista", ["contacto_1", "email"])
def _catequista_sem_acesso():
    return _sql("SELECT name, contacto_1, email FROM `tabCatequista` "
                "WHERE status = 'Activo' AND IFNULL(user, '') = '' ORDER BY name")


# ═════════════════════════════════════════════════════════════════════════════
# Plano anual
# ═════════════════════════════════════════════════════════════════════════════

@verificacao("plano_externas_por_classificar", "Plano", "Parecem de outro organizador, mas estão como da paróquia",
             "Pelas palavras das Catequese Settings (separador Plano Anual) estas actividades são da zona, "
             "vigararia ou arquidiocese. A correcção define o organizador e marca \"a confirmar\" as datas futuras.",
             "Actividade do Plano", ["ano_lectivo", "data", "organizador_sugerido"],
             {"accao": "classificar_organizador", "rotulo": "Definir o organizador sugerido"}, nome="actividade")
def _plano_externas_por_classificar():
    out = []
    for a in _sql("SELECT name, actividade, tipologia, orador, ano_lectivo, data FROM `tabActividade do Plano` "
                  "WHERE IFNULL(organizador, '') IN ('', %s) ORDER BY ano_lectivo DESC, data", PAROQUIA):
        sugerido = classificar_organizador(a.actividade, a.tipologia, a.orador)
        if e_externa(sugerido):
            a.organizador_sugerido = sugerido
            out.append(a)
    return out


@verificacao("plano_a_confirmar_proximas", "Plano", "Datas por confirmar nos próximos 30 dias",
             "Actividades com a data \"a confirmar\" que se aproximam. Confirme com o organizador e corrija a data "
             "no Plano Anual; depois marque-as como confirmadas.",
             "Actividade do Plano", ["data", "organizador", "local"],
             {"accao": "confirmar_data", "rotulo": "Marcar a data como confirmada"}, nome="actividade")
def _plano_a_confirmar_proximas():
    hoje = date.today()
    return _sql("SELECT name, actividade, data, organizador, local FROM `tabActividade do Plano` "
                "WHERE a_confirmar = 1 AND estado = 'Pendente' AND data BETWEEN %s AND %s ORDER BY data",
                hoje, hoje + timedelta(days=30))


# ═════════════════════════════════════════════════════════════════════════════
# Correcções (acções fixas)
# ═════════════════════════════════════════════════════════════════════════════

def _linhas(chave):
    return {r.name: r for r in VERIFICACOES[chave]["fn"]()}


def _alinhar_turma(nomes, chave):
    reais = _linhas(chave)
    n = 0
    for nome in nomes:
        if nome in reais:
            turma = reais[nome].turma_real
            frappe.db.set_value("Catecumeno", nome, {"turma": turma, "fase": frappe.db.get_value("Turma", turma, "fase")})
            n += 1
    return n


def _alinhar_fase(nomes, chave):
    linhas = _linhas(chave)
    for nome in nomes:
        if nome in linhas:
            frappe.db.set_value("Catecumeno", nome, "fase", linhas[nome].fase_da_turma)
    return len([n for n in nomes if n in linhas])


def _recalcular_idade(nomes, chave):
    n = 0
    for nome in nomes:
        nasc = frappe.db.get_value("Catecumeno", nome, "data_de_nascimento")
        if nasc:
            idade = _idade(nasc)
            frappe.db.set_value("Catecumeno", nome, "idade", idade)
            frappe.db.sql("UPDATE `tabTurma Catecumenos` SET idade = %s WHERE catecumeno = %s", (idade, nome))
            n += 1
    return n


def _inativar_na_turma(nomes, chave):
    for nome in nomes:
        frappe.db.set_value("Turma Catecumenos", nome, "estado", "Inativo")
    return len(nomes)


def _marcar_anteriores(nomes, chave):
    for nome in nomes:
        c = frappe.db.get_value("Catecumeno", nome, ["eucaristia", "crisma"], as_dict=True)
        valores = {"baptismo": 1}
        if c.crisma:
            valores["eucaristia"] = 1
        frappe.db.set_value("Catecumeno", nome, valores)
    return len(nomes)


def _marcar_crisma(nomes, chave):
    for nome in nomes:
        frappe.db.set_value("Catecumeno", nome, {"crisma": 1, "baptismo": 1, "eucaristia": 1})
    return len(nomes)


def _do_livro(sacramento):
    """Acção "marcar o sacramento com a data do Livro" (e os sacramentos anteriores)."""
    def accao(nomes, chave):
        from portal.catequese.livros import marcar_catecumeno
        linhas = _linhas(chave)
        for nome in nomes:
            if nome in linhas:
                marcar_catecumeno(sacramento, nome, linhas[nome].data_do_livro)
        return len([n for n in nomes if n in linhas])
    return accao


def _inactivar_turma(nomes, chave):
    for nome in nomes:
        frappe.db.set_value("Turma", nome, "status", "Inactivo")
    return len(nomes)


def _classificar_organizador(nomes, chave):
    linhas = _linhas(chave)
    hoje = date.today()
    for nome in nomes:
        if nome in linhas:
            a = linhas[nome]
            valores = {"organizador": a.organizador_sugerido}
            if a.data and getdate(a.data) >= hoje:
                valores["a_confirmar"] = 1
            frappe.db.set_value("Actividade do Plano", nome, valores)
    return len([n for n in nomes if n in linhas])


def _confirmar_data(nomes, chave):
    for nome in nomes:
        frappe.db.set_value("Actividade do Plano", nome, "a_confirmar", 0)
    return len(nomes)


ACCOES = {
    "alinhar_turma": _alinhar_turma,
    "alinhar_fase": _alinhar_fase,
    "recalcular_idade": _recalcular_idade,
    "inativar_na_turma": _inativar_na_turma,
    "marcar_anteriores": _marcar_anteriores,
    "marcar_crisma": _marcar_crisma,
    "baptismo_do_livro": _do_livro("Baptismo"),
    "eucaristia_do_livro": _do_livro("Eucaristia"),
    "crisma_do_livro": _do_livro("Crisma"),
    "inactivar_turma": _inactivar_turma,
    "classificar_organizador": _classificar_organizador,
    "confirmar_data": _confirmar_data,
}


# ═════════════════════════════════════════════════════════════════════════════
# API da página
# ═════════════════════════════════════════════════════════════════════════════

def _meta(chave, total):
    v = VERIFICACOES[chave]
    return {"chave": chave, "area": v["area"], "titulo": v["titulo"], "descricao": v["descricao"],
            "doctype": v["doctype"], "colunas": v["colunas"], "correccao": v["correccao"],
            "link": v["link"], "nome": v["nome"], "total": total}


@frappe.whitelist()
def get_verificacoes():
    """Resumo: contagem por verificação, pela ordem das áreas."""
    _assert_coordenador()
    out = []
    for area in AREAS:
        for chave, v in VERIFICACOES.items():
            if v["area"] == area:
                out.append(_meta(chave, len(v["fn"]())))
    return out


@frappe.whitelist()
def get_registos(chave):
    _assert_coordenador()
    if chave not in VERIFICACOES:
        frappe.throw(_("Verificação desconhecida"))
    return VERIFICACOES[chave]["fn"]()[:LIMITE]


@frappe.whitelist()
def corrigir(chave, nomes, valor=None):
    """Aplica a correcção da verificação aos registos indicados."""
    _assert_coordenador()
    meta = VERIFICACOES.get(chave)
    if not meta or not meta["correccao"]:
        frappe.throw(_("Esta verificação não tem correcção automática."))
    nomes = frappe.parse_json(nomes) or []
    corr = meta["correccao"]

    if corr.get("accao"):
        return ACCOES[corr["accao"]](nomes, chave)

    if valor not in corr["valores"]:
        frappe.throw(_("Valor inválido: {0}").format(valor))

    if meta["doctype"] == "Catequista":
        # Gravar o documento: fica no histórico (data de inactivação para o relatório)
        for nome in nomes:
            doc = frappe.get_doc("Catequista", nome)
            doc.set(corr["campo"], valor)
            doc.save(ignore_permissions=True)
        return len(nomes)

    for nome in nomes:
        frappe.db.set_value("Catecumeno", nome, corr["campo"], valor)
    if corr["campo"] == "sexo" and nomes:
        # manter as listas das turmas e das candidaturas coerentes
        frappe.db.sql("UPDATE `tabTurma Catecumenos` SET sexo = %s WHERE catecumeno IN %s", (valor, tuple(nomes)))
        frappe.db.sql("UPDATE `tabCandidatos ao Sacramento Table` SET sexo = %s WHERE catecumeno IN %s",
                      (valor, tuple(nomes)))
    return len(nomes)

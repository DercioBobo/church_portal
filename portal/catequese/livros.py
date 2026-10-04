"""
Livros sacramentais: Livro de Baptismo, Livro de Primeira Comunhao e Livro de Crisma.

São livros físicos diferentes, com campos comuns. Cada registo pode ser de um catecúmeno
(origem Catequese / 2ª oportunidade, criado ao submeter a Preparação) ou de qualquer pessoa
(Extraordinário: bebé, casamento, adulto…; ou recebido noutra paróquia), só com o nome.

Os vistos Baptismo/Eucaristia/Crisma do Catecúmeno vêm daqui: gravar um registo com
catecúmeno marca o sacramento (e a data); apagar o registo desmarca-o.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

LIVROS = {
    "Baptismo": frappe._dict(doctype="Livro de Baptismo", data="data_do_baptismo",
                             visto="baptismo", data_catecumeno="data_do_baptismo"),
    "Eucaristia": frappe._dict(doctype="Livro de Primeira Comunhao", data="data_da_comunhao",
                               visto="eucaristia", data_catecumeno="data_da_eucaristia"),
    "Crisma": frappe._dict(doctype="Livro de Crisma", data="data_do_crisma",
                           visto="crisma", data_catecumeno="data_do_crisma"),
}

# Quem recebe um sacramento já recebeu os anteriores (sem mexer nas datas)
ANTERIORES = {"Baptismo": [], "Eucaristia": ["baptismo"], "Crisma": ["baptismo", "eucaristia"]}

ORIGEM_CATEQUESE = "Catequese"
ORIGEM_SEGUNDA = "2ª oportunidade"
ORIGEM_EXTRA = "Extraordinário"
ORIGEM_OUTRA = "Outra paróquia"

# Campos copiados do Catecúmeno quando estão vazios no registo
DO_CATECUMENO = ["nome_completo", "data_de_nascimento", "sexo", "comunidade", "nome_do_pai",
                 "nome_da_mae", "encarregado", "contacto", "padrinhos", "contacto_padrinhos"]


def livro(sacramento):
    return LIVROS.get(sacramento)


class LivroSacramental(Document):
    """Controlador comum dos três livros (cada DocType só define `sacramento`)."""

    sacramento = None

    @property
    def _cfg(self):
        return LIVROS[self.sacramento]

    def validate(self):
        if self.catecumeno:
            outro = frappe.db.get_value(self.doctype, {"catecumeno": self.catecumeno, "name": ["!=", self.name]})
            if outro:
                frappe.throw(_("{0} já tem registo no {1}: {2}.").format(self.catecumeno, _(self.doctype), outro))
            c = frappe.db.get_value("Catecumeno", self.catecumeno, DO_CATECUMENO, as_dict=True) or {}
            for campo in DO_CATECUMENO:
                if not self.get(campo) and c.get(campo):
                    self.set(campo, c[campo])
        if not self.nome_completo:
            frappe.throw(_("Indique o nome completo (ou escolha o catecúmeno)."))

        if not self.origem:
            self.origem = ORIGEM_CATEQUESE if self.catecumeno else ORIGEM_EXTRA
        if self.origem != ORIGEM_EXTRA:
            self.tipo_extraordinario = None
        elif not self.tipo_extraordinario:
            frappe.throw(_("Indique o tipo (bebé, casamento, adulto ou outro)."))
        if self.origem != ORIGEM_OUTRA:
            self.paroquia = None
        elif not self.paroquia:
            frappe.throw(_("Indique a paróquia onde recebeu o sacramento."))

        data = self.get(self._cfg.data)
        if data and not self.ano and frappe.db.exists("Ano Lectivo", str(getdate(data).year)):
            self.ano = str(getdate(data).year)

    def on_update(self):
        anterior = self.get_doc_before_save()
        if anterior and anterior.catecumeno and anterior.catecumeno != self.catecumeno:
            desmarcar_catecumeno(self.sacramento, anterior.catecumeno, anterior.get(self._cfg.data))
        if self.catecumeno:
            marcar_catecumeno(self.sacramento, self.catecumeno, self.get(self._cfg.data))

    def on_trash(self):
        if self.catecumeno:
            desmarcar_catecumeno(self.sacramento, self.catecumeno, self.get(self._cfg.data))


def marcar_catecumeno(sacramento, catecumeno, data):
    cfg = LIVROS[sacramento]
    valores = {cfg.visto: 1}
    if data:
        valores[cfg.data_catecumeno] = data
    for v in ANTERIORES[sacramento]:
        valores[v] = 1
    frappe.db.set_value("Catecumeno", catecumeno, valores)


def desmarcar_catecumeno(sacramento, catecumeno, data):
    """Só desmarca se a data do Catecúmeno é a deste registo (ou está vazia):
    não apaga um sacramento que veio de outro lado."""
    cfg = LIVROS[sacramento]
    actual = frappe.db.get_value("Catecumeno", catecumeno, cfg.data_catecumeno)
    if actual and data and getdate(actual) != getdate(data):
        return
    frappe.db.set_value("Catecumeno", catecumeno, {cfg.visto: 0, cfg.data_catecumeno: None})


def registo_de(sacramento, catecumeno):
    return frappe.db.get_value(LIVROS[sacramento].doctype, {"catecumeno": catecumeno})


def registar(sacramento, catecumeno, data=None, origem=ORIGEM_CATEQUESE, **campos):
    """Cria o registo no livro do sacramento, se o catecúmeno ainda não tiver (não duplica nem
    altera registos manuais ou de uma preparação emendada). Devolve o nome do registo."""
    cfg = LIVROS.get(sacramento)
    if not cfg or not catecumeno:
        return None
    existente = registo_de(sacramento, catecumeno)
    if existente:
        return existente
    doc = frappe.new_doc(cfg.doctype)
    doc.catecumeno = catecumeno
    doc.origem = origem
    doc.set(cfg.data, data)
    for campo, valor in campos.items():
        if valor:
            doc.set(campo, valor)
    doc.insert(ignore_permissions=True)
    return doc.name

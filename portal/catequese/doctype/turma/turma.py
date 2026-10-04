import frappe
from frappe.model.document import Document

from portal.catequese import renovacao, sincronizacao


class Turma(Document):
    def validate(self):
        # Valor e data da renovação só quando a renovação muda (as antigas ficam como estavam)
        antes = self.get_doc_before_save()
        # (por catecúmeno: o botão "Listar" da turma recria as linhas com nomes novos)
        renov_antes = {r.catecumeno: (r.renovacao or "") for r in (antes.get("lista_catecumenos") if antes else [])}
        for linha in self.get("lista_catecumenos"):
            if renov_antes.get(linha.catecumeno) != (linha.renovacao or ""):
                renovacao.preencher(linha)
            if linha.pre_avaliacao != "Permanece":
                linha.motivo_permanencia = None
        # Linhas novas juntam-se aos dados do catecúmeno; as alteradas seguem para ele no on_update
        sincronizacao.turma_validate(self)

    def on_update(self):
        # (era o Server Script "Catequistas Permissions")
        self._sincronizar_permissoes_catequistas()
        sincronizacao.turma_on_update(self)

    def _sincronizar_permissoes_catequistas(self):
        """
        Dá ao catequista (e adjunto) uma User Permission sobre esta turma e retira-a
        ao catequista substituído. O Server Script original lia os valores "antigos"
        da base de dados já depois de gravar, por isso só funcionava em turmas novas;
        aqui usa-se o documento anterior à gravação.
        """
        antes = self.get_doc_before_save()
        nova = self.get("__islocal") or antes is None

        for campo in ("catequista", "catequista_adj"):
            antigo = "" if nova else (antes.get(campo) or "")
            novo = self.get(campo) or ""
            if antigo == novo and not nova:
                continue
            if antigo and antigo != novo:
                _remover_user_permission(_user_do_catequista(antigo), self.name)
            if novo:
                _criar_user_permission(_user_do_catequista(novo), self.name)


def _user_do_catequista(catequista):
    if not catequista:
        return None
    return frappe.db.get_value("Catequista", catequista, "user")


def _criar_user_permission(user, turma):
    if not user:
        return
    if frappe.db.exists("User Permission", {"user": user, "allow": "Turma", "for_value": turma}):
        return
    up = frappe.new_doc("User Permission")
    up.user = user
    up.allow = "Turma"
    up.for_value = turma
    up.apply_to_all_doctypes = 1
    up.insert(ignore_permissions=True)


def _remover_user_permission(user, turma):
    if not user:
        return
    for perm in frappe.get_all(
        "User Permission",
        filters={"user": user, "allow": "Turma", "for_value": turma},
        pluck="name",
    ):
        frappe.delete_doc("User Permission", perm, ignore_permissions=True)

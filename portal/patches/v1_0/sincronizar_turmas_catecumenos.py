from portal.catequese.sincronizacao import reconciliar_turmas_activas


def execute():
    """Alinha uma vez todas as linhas das turmas activas com o Catecúmeno (o Catecúmeno ganha)."""
    reconciliar_turmas_activas()

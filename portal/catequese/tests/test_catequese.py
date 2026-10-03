"""
Testes dos fluxos principais da catequese.

Correr num site de TESTE (nunca em produção):
    bench --site <site_de_teste> set-config allow_tests true
    bench --site <site_de_teste> run-tests --module portal.catequese.tests.test_catequese

Cada classe cria os seus próprios dados (anos 2091/2092, fases "_Teste ...")
e o Frappe desfaz tudo no fim.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

ANO = "2091"
ANO_SEGUINTE = "2092"
FASE_A = "_Teste Fase A"
FASE_B = "_Teste Fase B"
FASE_APOS_BAPTISMO = "1º Ano de Aprofundamento"


# ── Dados de teste ────────────────────────────────────────────────────────────

def ano(nome):
    if not frappe.db.exists("Ano Lectivo", nome):
        frappe.get_doc({"doctype": "Ano Lectivo", "ano_lectivo": int(nome)}).insert()
    return nome


def fase(nome, **campos):
    if not frappe.db.exists("Fase", nome):
        frappe.get_doc(dict({"doctype": "Fase", "nome_da_fase": nome}, **campos)).insert()
    return nome


def sacramento(nome):
    if not frappe.db.exists("Sacramento", nome):
        frappe.get_doc({"doctype": "Sacramento", "nome_do_sacramento": nome, "abreviatura": nome[:3]}).insert()
    return nome


def catecumeno(nome, **campos):
    doc = frappe.get_doc(dict({
        "doctype": "Catecumeno", "nome_completo": nome, "status": "Activo",
        "sexo": "Feminino", "data_de_nascimento": "2015-03-10", "idade": 10,
        "encarregado": "Encarregado de " + nome, "contacto": "841234567",
    }, **campos))
    doc.insert()
    return doc


def turma(fase_nome, catecumenos=(), ano_nome=ANO, **campos):
    t = frappe.get_doc(dict({
        "doctype": "Turma", "ano_lectivo": ano_nome, "fase": fase_nome,
        "dia": "Sabado", "status": "Activo",
    }, **campos))
    for c in catecumenos:
        t.append("lista_catecumenos", {"catecumeno": c.name, "estado": "Activo", "sexo": c.sexo})
    t.insert()
    for c in catecumenos:
        frappe.db.set_value("Catecumeno", c.name, {"turma": t.name, "fase": fase_nome})
    return t


def nomes_na_turma(nome_turma):
    return {r.catecumeno for r in frappe.get_doc("Turma", nome_turma).lista_catecumenos}


class BaseCatequese(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")
        ano(ANO)
        ano(ANO_SEGUINTE)
        fase(FASE_A)
        fase(FASE_B)
        fase(FASE_APOS_BAPTISMO)
        for s in ("Baptismo", "Eucaristia", "Crisma"):
            sacramento(s)


# ── Inscrição ─────────────────────────────────────────────────────────────────

class TestInscricao(BaseCatequese):
    def inscricao(self, nome, **campos):
        return frappe.get_doc(dict({
            "doctype": "Inscricao", "nome_completo": nome, "fase": FASE_A,
            "sexo": "Masculino", "data_de_nascimento": "2016-05-01", "idade": 9,
            "encarregado": "Mãe", "contacto": "829999999",
        }, **campos)).insert()

    def test_com_turma_cria_catecumeno_activo_na_turma(self):
        t = turma(FASE_A)
        self.inscricao("_Teste Insc Com Turma", turma=t.name).submit()

        c = frappe.get_doc("Catecumeno", "_Teste Insc Com Turma")
        self.assertEqual(c.status, "Activo")
        self.assertEqual(c.turma, t.name)
        self.assertIn(c.name, nomes_na_turma(t.name))

    def test_sem_turma_fica_pendente(self):
        self.inscricao("_Teste Insc Sem Turma").submit()
        c = frappe.get_doc("Catecumeno", "_Teste Insc Sem Turma")
        self.assertEqual(c.status, "Pendente")
        self.assertFalse(c.turma)

    def test_transferencia_regista_paroquia_de_origem(self):
        self.inscricao("_Teste Insc Transf", transferencia=1,
                       paroquia_que_frequentava="São José").submit()
        obs = frappe.db.get_value("Catecumeno", "_Teste Insc Transf", "observacoes")
        self.assertIn("São José", obs)

    def test_duplicado_e_recusado(self):
        catecumeno("_Teste Insc Duplicado")
        insc = self.inscricao("_Teste Insc Duplicado")
        self.assertRaises(frappe.ValidationError, insc.submit)


# ── Mudanças de turma ─────────────────────────────────────────────────────────

class TestMovimentos(BaseCatequese):
    def test_troca_de_turma(self):
        c = catecumeno("_Teste Troca")
        origem = turma(FASE_A, [c])
        destino = turma(FASE_B)

        frappe.get_doc({"doctype": "Troca de Turma", "catecumeno": c.name, "nova_turma": destino.name}).insert().submit()

        self.assertNotIn(c.name, nomes_na_turma(origem.name))
        self.assertIn(c.name, nomes_na_turma(destino.name))
        self.assertEqual(frappe.db.get_value("Catecumeno", c.name, ["turma", "fase"]), (destino.name, FASE_B))

    def test_troca_sem_turma_actual_falha(self):
        c = catecumeno("_Teste Troca Sem Turma")
        destino = turma(FASE_B)
        troca = frappe.get_doc({"doctype": "Troca de Turma", "catecumeno": c.name, "nova_turma": destino.name}).insert()
        self.assertRaises(frappe.ValidationError, troca.submit)

    def test_mover_em_massa(self):
        from portal.catequese.turma import mover_catecumenos_em_massa

        cs = [catecumeno(f"_Teste Massa {i}") for i in range(3)]
        origem = turma(FASE_A, cs)
        destino = turma(FASE_B)

        r = mover_catecumenos_em_massa(json.dumps([c.name for c in cs[:2]]), origem.name, destino.name)

        self.assertEqual(r["total"], 2)
        self.assertEqual(nomes_na_turma(origem.name), {cs[2].name})
        self.assertEqual(nomes_na_turma(destino.name), {cs[0].name, cs[1].name})
        self.assertEqual(frappe.db.get_value("Catecumeno", cs[0].name, "turma"), destino.name)

    def test_mover_para_a_mesma_turma_falha(self):
        from portal.catequese.turma import mover_catecumenos_em_massa

        c = catecumeno("_Teste Massa Mesma")
        t = turma(FASE_A, [c])
        self.assertRaises(frappe.ValidationError, mover_catecumenos_em_massa, json.dumps([c.name]), t.name, t.name)

    def test_transferencia_para_outra_paroquia(self):
        c = catecumeno("_Teste Transferido")
        t = turma(FASE_A, [c])

        frappe.get_doc({
            "doctype": "Transferencia de Catecumeno", "catecumeno": c.name, "turma": t.name,
            "nova_paroquia": "Paróquia X",
        }).insert().submit()

        self.assertNotIn(c.name, nomes_na_turma(t.name))
        self.assertEqual(frappe.db.get_value("Catecumeno", c.name, "status"), "Transferido")


# ── Catecúmeno: sincronização com a turma ─────────────────────────────────────

class TestSincronizacao(BaseCatequese):
    def test_alterar_catecumeno_actualiza_linha_da_turma(self):
        c = catecumeno("_Teste Sync")
        t = turma(FASE_A, [c])

        c.reload()
        c.encarregado = "Novo Encarregado"
        c.contacto = "870000000"
        c.save()

        linha = frappe.db.get_value(
            "Turma Catecumenos", {"parent": t.name, "catecumeno": c.name}, ["encarregado", "contacto"]
        )
        self.assertEqual(linha, ("Novo Encarregado", "870000000"))


# ── Sacramentos ───────────────────────────────────────────────────────────────

class TestSacramentos(BaseCatequese):
    def preparacao(self, sac, linhas, ano_nome=ANO):
        doc = frappe.get_doc({
            "doctype": "Preparacao do Sacramento", "sacramento": sac,
            "ano_lectivo": ano_nome, "data_do_sacramento": f"{ano_nome}-06-07",
        })
        for linha in linhas:
            doc.append("candidatos_sacramento_table", linha)
        return doc.insert()

    def test_eucaristia(self):
        cs = [catecumeno(f"_Teste Euc {i}") for i in range(2)]
        self.preparacao("Eucaristia", [{"catecumeno": c.name} for c in cs]).submit()
        for c in cs:
            self.assertEqual(
                frappe.db.get_value("Catecumeno", c.name, ["eucaristia", "data_da_eucaristia"]),
                (1, frappe.utils.getdate(f"{ANO}-06-07")),
            )

    def test_crisma_finaliza_e_cria_fiel(self):
        c = catecumeno("_Teste Crisma")
        turma(FASE_A, [c])
        self.preparacao("Crisma", [{"catecumeno": c.name}]).submit()

        c.reload()
        self.assertEqual((c.status, c.crisma, c.baptismo, c.eucaristia), ("Crismado", 1, 1, 1))
        self.assertFalse(c.turma)
        self.assertTrue(frappe.db.exists("Fiel", {"nome_completo": c.name}))

    def test_baptismo_cria_turma_seguinte_e_livro(self):
        baptizar = catecumeno("_Teste Bap Candidato", baptismo=0)
        ja_baptizado = catecumeno("_Teste Bap Ja Baptizado", baptismo=1)
        antiga = turma(FASE_A, [baptizar, ja_baptizado], catequista=None)

        self.preparacao("Baptismo", [{
            "catecumeno": baptizar.name, "turma": antiga.name,
            "encarregado": "Pai", "contacto_encarregado": "861111111",
            "padrinhos": "Padrinho Teste", "sacerdote": "Pe. Teste",
        }]).submit()

        nova = frappe.db.get_value("Catecumeno", baptizar.name, "turma")
        self.assertNotEqual(nova, antiga.name)
        self.assertEqual(frappe.db.get_value("Turma", nova, "fase"), FASE_APOS_BAPTISMO)
        self.assertEqual(nomes_na_turma(nova), {baptizar.name, ja_baptizado.name})
        self.assertEqual(frappe.db.get_value("Turma", antiga.name, "status"), "Inactivo")
        self.assertTrue(frappe.db.exists("Livro de Baptismo", baptizar.name))
        self.assertEqual(frappe.db.get_value("Catecumeno", baptizar.name, "baptismo"), 1)


# ── Apuramento ────────────────────────────────────────────────────────────────

class TestApuramento(BaseCatequese):
    # O nome do apuramento é APT-{YY}-{fase_actual}: cada teste usa a sua fase
    def apuramento(self, origem, resultados, **campos):
        doc = frappe.get_doc(dict({
            "doctype": "Apuramento de Turmas",
            "ano_lectivo_actual": ANO, "ano_lectivo_seguinte": ANO_SEGUINTE,
            "fase_actual": origem.fase,  # fase_seguinte vem da Fase (fase_seguinte_transita)
            "tamanho_minimo": 2, "tamanho_ideal": 3, "tamanho_maximo": 4,
            "apuramento_turmas": [{"turma": origem.name, "incluir": 1}],
            "apuramento_item": [
                {"catecumeno": nome, "resultado": res, "status": "Activo", "turma_nome": origem.name}
                for nome, res in resultados.items()
            ],
        }, **campos))
        return doc.insert()

    def test_transita_e_permanece(self):
        cs = [catecumeno(f"_Teste Apur {i}") for i in range(3)]
        origem = turma(fase("_Teste Apur Fase 1", fase_seguinte_transita=FASE_B), cs)
        doc = self.apuramento(origem, {cs[0].name: "Transita", cs[1].name: "Transita", cs[2].name: "Permanece"})
        doc.submit()

        self.assertEqual(frappe.db.get_value("Turma", origem.name, "status"), "Inactivo")
        self.assertEqual(len(doc.apuramento_novas_turmas), 2)

        t0 = frappe.db.get_value("Catecumeno", cs[0].name, ["turma", "fase"], as_dict=True)
        t2 = frappe.db.get_value("Catecumeno", cs[2].name, ["turma", "fase"], as_dict=True)
        self.assertEqual(t0.fase, FASE_B)
        self.assertEqual(t2.fase, "_Teste Apur Fase 1")
        self.assertEqual(frappe.db.get_value("Turma", t0.turma, "ano_lectivo"), ANO_SEGUINTE)
        self.assertEqual(nomes_na_turma(t0.turma), {cs[0].name, cs[1].name})

    def test_sem_resultado_e_recusado(self):
        c = catecumeno("_Teste Apur Sem Resultado")
        origem = turma(fase("_Teste Apur Fase 2", fase_seguinte_transita=FASE_B), [c])
        doc = self.apuramento(origem, {c.name: ""})
        self.assertRaises(frappe.ValidationError, doc.submit)

    def test_ano_seguinte_tem_de_ser_maior(self):
        c = catecumeno("_Teste Apur Ano")
        origem = turma(fase("_Teste Apur Fase 3", fase_seguinte_transita=FASE_B), [c])
        doc = self.apuramento(origem, {c.name: "Transita"}, ano_lectivo_seguinte=ANO)
        self.assertRaises(frappe.ValidationError, doc.submit)

    def test_fase_sem_fase_seguinte_da_erro_claro(self):
        c = catecumeno("_Teste Apur Sem Seguinte")
        origem = turma(fase("_Teste Apur Fase 4"), [c])
        doc = self.apuramento(origem, {c.name: "Transita"})
        with self.assertRaises(frappe.ValidationError) as ctx:
            doc.submit()
        self.assertIn("_Teste Apur Fase 4", str(ctx.exception))

    def test_distribuicao_equilibrada(self):
        from portal.catequese.doctype.apuramento_de_turmas.apuramento_de_turmas import _distribuir_em_turmas

        cats = [{"catecumeno": f"C{i:02d}"} for i in range(50)]
        grupos = _distribuir_em_turmas(cats, 20, 25, 30)
        self.assertEqual([len(g["catecumenos"]) for g in grupos], [25, 25])
        self.assertEqual(_distribuir_em_turmas([], 20, 25, 30), [])


# ── Link para encarregados ────────────────────────────────────────────────────

class TestLinkEncarregados(BaseCatequese):
    # O nome da preparação é {sacramento}-{ano}: um ano de teste por teste
    _ano = 2100

    def setUp(self):
        frappe.set_user("Administrator")
        TestLinkEncarregados._ano += 1
        c = catecumeno(f"_Teste Link {TestLinkEncarregados._ano}")
        self.prep = frappe.get_doc({
            "doctype": "Preparacao do Sacramento", "sacramento": "Eucaristia",
            "ano_lectivo": ano(str(TestLinkEncarregados._ano)),
            "candidatos_sacramento_table": [{"catecumeno": c.name, "encarregado": "Antigo"}],
        }).insert()
        self.linha = self.prep.candidatos_sacramento_table[0].name

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_sem_link_nao_ha_acesso(self):
        from portal.api import get_preparacao_sacramento

        frappe.set_user("Guest")
        self.assertRaises(frappe.PermissionError, get_preparacao_sacramento, self.prep.name)
        self.assertRaises(frappe.PermissionError, get_preparacao_sacramento, self.prep.name, "token-errado")

    def test_link_valido_permite_ver_e_editar_e_regista(self):
        from portal.api import atualizar_candidato_sacramento, get_preparacao_sacramento

        url = self.prep.gerar_link_encarregados(dias=1, permite_editar=1)
        token = url.split("t=")[1]

        frappe.set_user("Guest")
        dados = get_preparacao_sacramento(self.prep.name, token)
        self.assertTrue(dados["pode_editar"])
        self.assertEqual(len(dados["candidatos"]), 1)

        atualizar_candidato_sacramento(self.prep.name, self.linha, encarregado="Novo", t=token)
        frappe.set_user("Administrator")
        self.assertEqual(frappe.db.get_value("Candidatos ao Sacramento Table", self.linha, "encarregado"), "Novo")
        self.assertTrue(frappe.db.exists("Comment", {
            "reference_doctype": "Preparacao do Sacramento", "reference_name": self.prep.name,
            "content": ["like", "%Antigo%Novo%"],
        }))

    def test_link_so_leitura_nao_edita(self):
        from portal.api import atualizar_candidato_sacramento

        token = self.prep.gerar_link_encarregados(dias=1, permite_editar=0).split("t=")[1]
        frappe.set_user("Guest")
        self.assertRaises(frappe.PermissionError, atualizar_candidato_sacramento,
                          self.prep.name, self.linha, encarregado="X", t=token)

    def test_link_expirado_ou_revogado(self):
        from portal.api import get_preparacao_sacramento

        token = self.prep.gerar_link_encarregados(dias=1).split("t=")[1]
        frappe.db.set_value("Preparacao do Sacramento", self.prep.name, "link_expira_em",
                            add_to_date(now_datetime(), minutes=-1))
        frappe.set_user("Guest")
        self.assertRaises(frappe.PermissionError, get_preparacao_sacramento, self.prep.name, token)

        frappe.set_user("Administrator")
        token = self.prep.gerar_link_encarregados(dias=1).split("t=")[1]
        self.prep.reload()
        self.prep.revogar_link_encarregados()
        frappe.set_user("Guest")
        self.assertRaises(frappe.PermissionError, get_preparacao_sacramento, self.prep.name, token)

    def test_novo_link_invalida_o_anterior(self):
        from portal.api import get_preparacao_sacramento

        antigo = self.prep.gerar_link_encarregados(dias=1).split("t=")[1]
        self.prep.reload()
        novo = self.prep.gerar_link_encarregados(dias=1).split("t=")[1]
        frappe.set_user("Guest")
        self.assertRaises(frappe.PermissionError, get_preparacao_sacramento, self.prep.name, antigo)
        self.assertTrue(get_preparacao_sacramento(self.prep.name, novo))


# ── Qualidade dos dados ───────────────────────────────────────────────────────

class TestQualidadeDados(BaseCatequese):
    def test_todas_as_verificacoes_correm(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import VERIFICACOES, get_verificacoes

        resumo = get_verificacoes()  # executa cada verificação (apanha erros de SQL / campos)
        self.assertEqual(len(resumo), len(VERIFICACOES))
        for v in resumo:
            self.assertIsInstance(v["total"], int, v["chave"])

    def test_recalcular_idade(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import corrigir, get_registos

        c = catecumeno("_Teste QD Idade", data_de_nascimento="2015-03-10", idade=1)
        self.assertIn(c.name, {r.name for r in get_registos("cat_idade_errada")})
        corrigir("cat_idade_errada", json.dumps([c.name]))
        self.assertNotEqual(frappe.db.get_value("Catecumeno", c.name, "idade"), 1)
        self.assertNotIn(c.name, {r.name for r in get_registos("cat_idade_errada")})

    def test_saiu_mas_continua_na_turma(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import corrigir, get_registos

        c = catecumeno("_Teste QD Saiu")
        t = turma(FASE_A, [c])
        frappe.db.set_value("Catecumeno", c.name, "status", "Transferido")
        linhas = [r for r in get_registos("cat_saiu_mas_na_turma") if r.catecumeno == c.name]
        self.assertEqual(len(linhas), 1)
        corrigir("cat_saiu_mas_na_turma", json.dumps([linhas[0].name]))
        self.assertEqual(
            frappe.db.get_value("Turma Catecumenos", {"parent": t.name, "catecumeno": c.name}, "estado"), "Inativo")

    def test_sacramentos_fora_de_ordem(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import corrigir

        c = catecumeno("_Teste QD Ordem", baptismo=0, eucaristia=0, crisma=1)
        corrigir("sac_ordem", json.dumps([c.name]))
        self.assertEqual(frappe.db.get_value("Catecumeno", c.name, ["baptismo", "eucaristia"]), (1, 1))

    def test_turma_vazia_inactivada(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import corrigir, get_registos

        t = turma(FASE_A)
        self.assertIn(t.name, {r.name for r in get_registos("turma_vazia")})
        corrigir("turma_vazia", json.dumps([t.name]))
        self.assertEqual(frappe.db.get_value("Turma", t.name, "status"), "Inactivo")

    def test_contacto_invalido(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import _contacto_invalido

        self.assertFalse(_contacto_invalido("+258 84 123 4567"))
        self.assertFalse(_contacto_invalido("841234567 / 827654321"))
        self.assertTrue(_contacto_invalido("21 123 456"))

    def test_corrigir_sexo_propaga_para_a_turma(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import corrigir, get_registos

        c = catecumeno("_Teste QD Sexo", sexo="")
        t = turma(FASE_A, [c])
        self.assertIn(c.name, {r.name for r in get_registos("cat_sem_sexo")})

        corrigir("cat_sem_sexo", json.dumps([c.name]), "Masculino")

        self.assertEqual(frappe.db.get_value("Catecumeno", c.name, "sexo"), "Masculino")
        self.assertEqual(
            frappe.db.get_value("Turma Catecumenos", {"parent": t.name, "catecumeno": c.name}, "sexo"), "Masculino"
        )

    def test_valor_invalido_e_recusado(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import corrigir

        c = catecumeno("_Teste QD Invalido")
        self.assertRaises(frappe.ValidationError, corrigir, "cat_sem_sexo", json.dumps([c.name]), "Outro")

    def test_alinhar_turma(self):
        from portal.catequese.page.qualidade_dados.qualidade_dados import corrigir

        c = catecumeno("_Teste QD Alinhar")
        t = turma(FASE_A, [c])
        frappe.db.set_value("Catecumeno", c.name, "turma", None)

        corrigir("cat_turma_divergente", json.dumps([c.name]))
        self.assertEqual(frappe.db.get_value("Catecumeno", c.name, ["turma", "fase"]), (t.name, FASE_A))


# ── Definições e ano lectivo ──────────────────────────────────────────────────

class TestDefinicoesEAno(BaseCatequese):
    def tearDown(self):
        frappe.clear_document_cache("Catequese Settings", "Catequese Settings")

    def definir(self, **valores):
        s = frappe.get_single("Catequese Settings")
        s.update(valores)
        s.save()
        frappe.clear_document_cache("Catequese Settings", "Catequese Settings")

    def test_definicao_usa_padrao_quando_vazia(self):
        from portal.catequese.utils import PADROES, definicao

        # define os três tamanhos: outros testes da classe podem ter deixado valores diferentes
        self.definir(tamanho_minimo=0, tamanho_ideal=0, tamanho_maximo=0)
        self.assertEqual(definicao("tamanho_ideal"), PADROES["tamanho_ideal"])
        self.definir(tamanho_minimo=20, tamanho_ideal=22, tamanho_maximo=30)
        self.assertEqual(definicao("tamanho_ideal"), 22)

    def test_tamanhos_incoerentes_sao_recusados(self):
        s = frappe.get_single("Catequese Settings")
        s.update({"tamanho_minimo": 30, "tamanho_ideal": 25, "tamanho_maximo": 20})
        self.assertRaises(frappe.ValidationError, s.save)

    def test_ano_actual_vem_das_definicoes(self):
        from portal.catequese.utils import ano_actual

        self.definir(ano_lectivo_actual=ANO)
        self.assertEqual(ano_actual(), ANO)

    def test_apuramento_usa_tamanhos_das_definicoes(self):
        self.definir(tamanho_minimo=5, tamanho_ideal=6, tamanho_maximo=7)
        c = catecumeno("_Teste Def Apur")
        origem = turma(fase("_Teste Def Fase", fase_seguinte_transita=FASE_B), [c])
        doc = frappe.get_doc({
            "doctype": "Apuramento de Turmas", "ano_lectivo_actual": ANO, "ano_lectivo_seguinte": ANO_SEGUINTE,
            "fase_actual": origem.fase, "apuramento_turmas": [{"turma": origem.name, "incluir": 1}],
            "apuramento_item": [{"catecumeno": c.name, "resultado": "Transita", "turma_nome": origem.name}],
        }).insert()
        self.assertEqual((doc.tamanho_minimo, doc.tamanho_ideal, doc.tamanho_maximo), (5, 6, 7))

    def test_criar_ano_e_definir_actual(self):
        from portal.catequese.page.abrir_encerrar_ano.abrir_encerrar_ano import criar_ano, definir_ano_actual
        from portal.catequese.utils import ano_actual

        self.definir(ano_lectivo_actual=ANO)
        criar_ano("2099")
        self.assertEqual(frappe.db.get_value("Ano Lectivo", "2099", "estado"), "Planeado")

        definir_ano_actual("2099")
        frappe.clear_document_cache("Catequese Settings", "Catequese Settings")
        self.assertEqual(ano_actual(), "2099")
        self.assertEqual(frappe.db.get_value("Ano Lectivo", "2099", "estado"), "Em curso")
        self.assertEqual(frappe.db.get_value("Ano Lectivo", ANO, "estado"), "Encerrado")

    def test_estado_mostra_fase_por_apurar_e_encerra_turmas(self):
        from portal.catequese.page.abrir_encerrar_ano.abrir_encerrar_ano import encerrar_turmas, get_estado

        t = turma(fase("_Teste Estado Fase"), [catecumeno("_Teste Estado")])
        estado = get_estado(ANO)
        apuramento = next(p for p in estado["encerrar"] if p["chave"] == "apuramento")
        item = next(i for i in apuramento["itens"] if i["texto"] == "_Teste Estado Fase")
        self.assertEqual(item["estado"], "pendente")
        self.assertIn("Fase Seguinte", item["nota"])  # fase sem fase seguinte configurada

        self.assertGreaterEqual(encerrar_turmas(ANO), 1)
        self.assertEqual(frappe.db.get_value("Turma", t.name, "status"), "Inactivo")

    def test_preparacao_recebe_valores_do_sacramento(self):
        s = frappe.get_single("Catequese Settings")
        s.set("valores_sacramento", [{"sacramento": "Crisma", "valor_ofertorio": 500, "valor_fotos": 150}])
        s.save()
        frappe.clear_document_cache("Catequese Settings", "Catequese Settings")

        ano_nome = ano("2098")
        prep = frappe.get_doc({"doctype": "Preparacao do Sacramento", "sacramento": "Crisma",
                               "ano_lectivo": ano_nome, "valor_fotos": 99}).insert()
        self.assertEqual(prep.valor_ofertorio, 500)
        self.assertEqual(prep.valor_fotos, 99)  # valor indicado à mão não é substituído

    def test_configuracao_do_portal_vem_das_definicoes(self):
        from portal import api

        s = frappe.get_single("Catequese Settings")
        s.set("sections", [{"section_key": "teste", "label": "Secção Teste", "icon": "User"}])
        s.save()
        frappe.clear_document_cache("Catequese Settings", "Catequese Settings")
        for attr in ("_portal_section_config", "_portal_field_config"):
            if hasattr(frappe.local, attr):
                delattr(frappe.local, attr)

        self.assertEqual([x["section_key"] for x in api._load_section_config()], ["teste"])


# ── Proposta do Plano (rollover) ──────────────────────────────────────────────

class TestPropostaPlano(BaseCatequese):
    _ano = 2200

    def setUp(self):
        frappe.set_user("Administrator")
        # cada teste usa um par de anos próprio (só pode haver uma proposta por ano de destino)
        TestPropostaPlano._ano += 2
        self.origem = ano(str(TestPropostaPlano._ano))
        self.destino = ano(str(TestPropostaPlano._ano + 1))
        for nome, data in (("Retiro de Teste", f"{self.origem}-02-07"),
                           ("Festa de Teste", f"{self.origem}-06-20")):
            frappe.get_doc({"doctype": "Actividade do Plano", "actividade": nome, "estado": "Realizada",
                            "ano_lectivo": self.origem, "data": data, "local": "Igreja"}).insert()

    def gerar(self):
        from portal.catequista.doctype.proposta_do_plano.proposta_do_plano import gerar_proposta
        return frappe.get_doc("Proposta do Plano", gerar_proposta(self.origem, self.destino))

    def test_gerar_copia_para_o_ano_seguinte(self):
        p = self.gerar()
        self.assertEqual(p.docstatus, 0)
        self.assertEqual(len(p.itens), 2)
        for it in p.itens:
            self.assertEqual(str(it.data)[:4], self.destino)
            self.assertEqual(it.origem, "Rollover")

    def test_so_uma_proposta_por_ano(self):
        from portal.catequista.doctype.proposta_do_plano.proposta_do_plano import gerar_proposta

        self.gerar()
        self.assertRaises(frappe.ValidationError, gerar_proposta, self.origem, self.destino)

    def test_editar_apagar_acrescentar_e_finalizar(self):
        from portal.catequista.doctype.proposta_do_plano.proposta_do_plano import finalizar, guardar_itens

        p = self.gerar()
        itens = [{"name": p.itens[0].name, "actividade": "Retiro Alterado", "data": f"{self.destino}-03-01"},
                 {"actividade": "Actividade Nova", "data": f"{self.destino}-05-05", "notas": "decidido na reunião"}]
        doc = guardar_itens(p.name, json.dumps(itens), notas="Notas da reunião")
        self.assertEqual([i["actividade"] for i in doc["itens"]], ["Retiro Alterado", "Actividade Nova"])
        self.assertEqual(doc["itens"][1]["origem"], "Nova")

        finalizar(p.name)
        p.reload()
        self.assertEqual(p.docstatus, 1)
        criadas = frappe.get_all("Actividade do Plano", filters={"proposta": p.name},
                                 fields=["actividade", "ano_lectivo", "estado"])
        self.assertEqual({c.actividade for c in criadas}, {"Retiro Alterado", "Actividade Nova"})
        self.assertTrue(all(c.ano_lectivo == self.destino and c.estado == "Pendente" for c in criadas))
        self.assertTrue(all(i.actividade_criada for i in p.itens))
        self.assertRaises(frappe.ValidationError, guardar_itens, p.name, json.dumps(itens))

    def test_cancelar_apaga_as_actividades(self):
        from portal.catequista.doctype.proposta_do_plano.proposta_do_plano import finalizar

        p = self.gerar()
        finalizar(p.name)
        p.reload()
        p.cancel()
        self.assertEqual(frappe.db.count("Actividade do Plano", {"proposta": p.name}), 0)

    def test_cancelar_recusado_se_ja_comecou(self):
        from portal.catequista.doctype.proposta_do_plano.proposta_do_plano import finalizar

        p = self.gerar()
        finalizar(p.name)
        p.reload()
        frappe.db.set_value("Actividade do Plano", p.itens[0].actividade_criada, "estado", "Realizada")
        self.assertRaises(frappe.ValidationError, p.cancel)

    def test_nao_repete_actividades_ja_no_destino(self):
        frappe.get_doc({"doctype": "Actividade do Plano", "actividade": "Festa de Teste", "estado": "Pendente",
                        "ano_lectivo": self.destino}).insert()
        p = self.gerar()
        self.assertEqual([i.actividade for i in p.itens], ["Retiro de Teste"])

    def test_dias_de_fim_de_semana_mantidos(self):
        from datetime import date

        from portal.catequista.doctype.proposta_do_plano.proposta_do_plano import _um_ano_depois

        self.assertEqual(_um_ano_depois(date(2026, 2, 7)), date(2027, 2, 6))   # sábado → sábado
        self.assertEqual(_um_ano_depois(date(2026, 3, 18)), date(2027, 3, 18))  # dia útil: mesma data
        self.assertEqual(_um_ano_depois(date(2024, 2, 29)), date(2025, 2, 28))

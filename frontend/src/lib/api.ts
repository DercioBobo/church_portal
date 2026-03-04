import type {
  Turma,
  TurmaDetalhe,
  Catecumeno,
  Aniversariante,
  Estatisticas,
  ResultadoPesquisa,
  PreparacaoSacramento,
  PreparacaoSacramentoLista,
} from '@/types/catequese';

const BASE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || '';
const APP = 'portal.api';

async function frappeFetch<T>(method: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const urlStr = `${BASE_URL}/api/method/${method}${qs}`;
  const res = await fetch(urlStr, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${method}`);
  }
  const data = await res.json();
  return data.message as T;
}

async function frappePOST<T>(method: string, data: Record<string, string | number | null | undefined>): Promise<T> {
  const urlStr = `${BASE_URL}/api/method/${method}`;
  const formData = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, String(value));
    }
  });
  const res = await fetch(urlStr, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${method}`);
  }
  const responseData = await res.json();
  return responseData.message as T;
}

export const api = {
  getTurmas: () =>
    frappeFetch<Turma[]>(`${APP}.get_turmas_publicas`),

  getTurmaDetalhe: (nome: string) =>
    frappeFetch<TurmaDetalhe>(`${APP}.get_turma_detalhe`, { turma_nome: nome }),

  pesquisar: (query: string) =>
    frappeFetch<ResultadoPesquisa>(`${APP}.pesquisar`, { query }),

  getCatecumeno: (nome: string) =>
    frappeFetch<{ catecumeno: Catecumeno; turma: Turma | null }>(
      `${APP}.get_catecumeno_publico`,
      { catecumeno_nome: nome },
    ),

  getAniversariantes: (tipo: 'hoje' | 'semana') =>
    frappeFetch<Aniversariante[]>(`${APP}.get_catecumenos_aniversariantes`, { tipo }),

  getEstatisticas: () =>
    frappeFetch<Estatisticas>(`${APP}.get_estatisticas_publicas`),

  getCatecumenos: () =>
    frappeFetch<Catecumeno[]>(`${APP}.get_catecumenos_publicos`),

  getPreparacoesSacramento: () =>
    frappeFetch<PreparacaoSacramentoLista[]>(`${APP}.get_preparacoes_sacramento`),

  getPreparacaoSacramento: (nome: string) =>
    frappeFetch<PreparacaoSacramento>(`${APP}.get_preparacao_sacramento`, { nome }),

  atualizarCandidatoSacramento: (
    preparacao_nome: string,
    row_name: string,
    dados: {
      encarregado?: string;
      contacto_encarregado?: string;
      padrinhos?: string;
      contacto_padrinhos?: string;
      idade?: number;
      data_de_nascimento?: string;
      dia?: string;
      enc_obs?: string;
    }
  ) =>
    frappePOST<{ success: boolean }>(`${APP}.atualizar_candidato_sacramento`, {
      preparacao_nome,
      row_name,
      ...dados,
    }),
};

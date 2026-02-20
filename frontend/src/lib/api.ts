import type {
  Turma,
  TurmaDetalhe,
  Catecumeno,
  Aniversariante,
  Estatisticas,
  ResultadoPesquisa,
} from '@/types/catequese';

const BASE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || '';
const APP = 'portal.api';

async function frappeFetch<T>(method: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}/api/method/${method}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${method}`);
  }
  const data = await res.json();
  return data.message as T;
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
};

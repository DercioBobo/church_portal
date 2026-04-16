import type {
  Turma,
  TurmaDetalhe,
  Catecumeno,
  Aniversariante,
  Estatisticas,
  ResultadoPesquisa,
  PreparacaoSacramento,
  PreparacaoSacramentoLista,
  QuotaCatequistaRow,
} from '@/types/catequese';

const BASE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || '';
const APP = 'portal.api';

export class AdminAuthError extends Error {
  constructor(message = 'Não autenticado') {
    super(message);
    this.name = 'AdminAuthError';
  }
}

function getAdminCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function frappeAuthFetch<T>(method: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${BASE_URL}/api/method/${APP}.${method}${qs}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 403 || res.status === 401) throw new AdminAuthError();
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String((body as Record<string, unknown>).exc_value || `Erro ${res.status}`));
  }
  const data = await res.json() as Record<string, unknown>;
  if (data.exc_type === 'AuthenticationError' || data.exc_type === 'PermissionError') {
    throw new AdminAuthError(String(data.exc_value || ''));
  }
  if (data.exc) throw new Error(String(data.exc_value || 'Erro no servidor'));
  return data.message as T;
}

async function frappeAuthPOST<T>(method: string, body: Record<string, string | number | null | undefined>): Promise<T> {
  const formData = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => {
    if (v !== null && v !== undefined) formData.append(k, String(v));
  });
  const res = await fetch(`${BASE_URL}/api/method/${APP}.${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Frappe-CSRF-Token': getAdminCsrfToken(),
    },
    body: formData.toString(),
  });
  if (res.status === 403 || res.status === 401) throw new AdminAuthError();
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(errBody.exc_value || `Erro ${res.status}`));
  }
  const data = await res.json() as Record<string, unknown>;
  if (data.exc_type === 'AuthenticationError' || data.exc_type === 'PermissionError') {
    throw new AdminAuthError(String(data.exc_value || ''));
  }
  if (data.exc) throw new Error(String(data.exc_value || 'Erro no servidor'));
  return data.message as T;
}

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

  // ── Quotas (authenticated admin endpoints) ───────────────────────────────────

  getQuotasGrid: (ano: string): Promise<QuotaCatequistaRow[]> =>
    frappeAuthFetch<QuotaCatequistaRow[]>('get_quotas_grid', { ano }),

  upsertQuota: (
    catequista: string,
    ano: string,
    mes: string,
    valor: number,
    data_pagamento?: string,
    notas?: string,
  ): Promise<{ success: boolean; name: string }> =>
    frappeAuthPOST<{ success: boolean; name: string }>('upsert_quota', {
      catequista, ano, mes, valor, data_pagamento, notas,
    }),

  deleteQuota: (quota_name: string): Promise<{ success: boolean }> =>
    frappeAuthPOST<{ success: boolean }>('delete_quota', { quota_name }),
};

import type { AuthInfo, CatecumenoCompleto, TurmaComCatecumenos } from '@/types/catequista';

const BASE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || '';
const APP = 'portal.api';

export class AuthError extends Error {
  constructor(message = 'Não autenticado') {
    super(message);
    this.name = 'AuthError';
  }
}

// Stored after getSessionInfo — avoids relying on cookie parsing
let _csrfToken = '';

export function setCsrfToken(token: string) { _csrfToken = token; }

function getCsrfToken(): string {
  if (_csrfToken) return _csrfToken;
  // Fallback: try cookie (may not work in all deployments)
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function parseServerMsg(raw: unknown): string {
  if (!raw) return '';
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) {
      return arr.map((m: unknown) => {
        try { return (JSON.parse(m as string) as { message?: string }).message || String(m); }
        catch { return String(m); }
      }).join(' ');
    }
    return String(raw);
  } catch {
    return String(raw);
  }
}

async function frappeFetch<T>(method: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${BASE_URL}/api/method/${APP}.${method}${qs}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 403 || res.status === 401) throw new AuthError();

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(parseServerMsg(body._server_messages) || `Erro ${res.status}`);
  }

  const data = await res.json() as Record<string, unknown>;
  if (data.exc_type === 'AuthenticationError' || data.exc_type === 'PermissionError') {
    throw new AuthError(parseServerMsg(data._server_messages) || String(data.exc_value || ''));
  }
  if (data.exc) {
    throw new Error(parseServerMsg(data._server_messages) || String(data.exc_value || 'Erro no servidor'));
  }
  return data.message as T;
}

async function frappePOST<T>(method: string, body: Record<string, string | number | null | undefined>): Promise<T> {
  const formData = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => {
    if (v !== null && v !== undefined) formData.append(k, String(v));
  });

  const res = await fetch(`${BASE_URL}/api/method/${APP}.${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Frappe-CSRF-Token': getCsrfToken(),
    },
    body: formData.toString(),
  });

  if (res.status === 403 || res.status === 401) throw new AuthError();

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(parseServerMsg(errBody._server_messages) || String(errBody.exc_value || `Erro ${res.status}`));
  }

  const data = await res.json() as Record<string, unknown>;
  if (data.exc_type === 'AuthenticationError' || data.exc_type === 'PermissionError') {
    throw new AuthError(parseServerMsg(data._server_messages) || String(data.exc_value || ''));
  }
  if (data.exc) {
    throw new Error(parseServerMsg(data._server_messages) || String(data.exc_value || 'Erro no servidor'));
  }
  return data.message as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(usr: string, pwd: string): Promise<void> {
  const formData = new URLSearchParams({ usr, pwd });
  const res = await fetch(`${BASE_URL}/api/method/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = parseServerMsg(data._server_messages) || String(data.message || 'Credenciais inválidas');
    throw new Error(msg);
  }

  const data = await res.json() as Record<string, unknown>;
  if (data.message === 'Logged In') return;
  throw new Error(String(data.message || 'Erro ao iniciar sessão'));
}

export async function logout(): Promise<void> {
  await fetch(`${BASE_URL}/api/method/logout`, {
    credentials: 'include',
  }).catch(() => {});
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const api = {
  getSessionInfo: (): Promise<AuthInfo> =>
    frappeFetch<AuthInfo>('get_catequista_session_info').then(info => {
      if (info.csrf_token) setCsrfToken(info.csrf_token);
      return info;
    }),

  getMinhaTurma: (): Promise<TurmaComCatecumenos[]> =>
    frappeFetch<TurmaComCatecumenos[]>('get_minha_turma'),

  atualizarCatecumeno: (
    catecumeno_nome: string,
    dados: {
      row_name?: string | null;
      sexo?: string;
      encarregado?: string;
      contacto_encarregado?: string;
      padrinhos?: string;
      contacto_padrinhos?: string;
      data_de_nascimento?: string;
      idade?: number | string;
      obs?: string;
      total_presencas?: number;
      total_faltas?: number;
    }
  ): Promise<{ success: boolean }> =>
    frappePOST<{ success: boolean }>('atualizar_catecumeno', {
      catecumeno_nome,
      ...dados,
    }),

  alterarSenha: (senha_atual: string, senha_nova: string): Promise<{ success: boolean }> =>
    frappePOST<{ success: boolean }>('alterar_senha', { senha_atual, senha_nova }),
};

// Re-export types for convenience
export type { AuthInfo, CatecumenoCompleto, TurmaComCatecumenos };

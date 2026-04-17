import type { AuthInfo, CatecumenoCompleto, TurmaComCatecumenos, FieldConfigItem, AvisoAtivo, QuotasResumo } from '@/types/catequista';

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
// Set to true once getSessionInfo succeeds so we can distinguish
// "never logged in" (no expired param) from "session silently expired" (?expired=1)
let _authenticated = false;

export function setCsrfToken(token: string) { _csrfToken = token; }

/** Called whenever a 401/403 or AuthenticationError is received.
 *  Redirects to login (with ?expired=1 when a session was active)
 *  unless we are already on the login page (avoids redirect loops). */
function _handleAuthError(): never {
  if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
    window.location.href = _authenticated
      ? '/catequista/login/?expired=1'
      : '/catequista/login/';
  }
  throw new AuthError();
}

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

  if (res.status === 403 || res.status === 401) return _handleAuthError();

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(parseServerMsg(body._server_messages) || `Erro ${res.status}`);
  }

  const data = await res.json() as Record<string, unknown>;
  if (data.exc_type === 'AuthenticationError' || data.exc_type === 'PermissionError') {
    return _handleAuthError();
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

  if (res.status === 403 || res.status === 401) return _handleAuthError();

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(parseServerMsg(errBody._server_messages) || String(errBody.exc_value || `Erro ${res.status}`));
  }

  const data = await res.json() as Record<string, unknown>;
  if (data.exc_type === 'AuthenticationError' || data.exc_type === 'PermissionError') {
    return _handleAuthError();
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
      _authenticated = true;
      return info;
    }),

  getMinhaTurma: (): Promise<TurmaComCatecumenos[]> =>
    frappeFetch<TurmaComCatecumenos[]>('get_minha_turma'),

  getFieldConfig: (): Promise<FieldConfigItem[]> =>
    frappeFetch<FieldConfigItem[]>('get_catecumeno_field_config'),

  atualizarCatecumeno: (
    catecumeno_nome: string,
    dados: Record<string, string | number | null | undefined>
  ): Promise<{ success: boolean }> =>
    frappePOST<{ success: boolean }>('atualizar_catecumeno', {
      catecumeno_nome,
      ...dados,
    }),

  alterarSenha: (senha_atual: string, senha_nova: string): Promise<{ success: boolean }> =>
    frappePOST<{ success: boolean }>('alterar_senha', { senha_atual, senha_nova }),

  getAvisosAtivos: (): Promise<AvisoAtivo[]> =>
    frappeFetch<AvisoAtivo[]>('get_avisos_ativos'),

  marcarAvisoVisto: (aviso_name: string): Promise<{ success: boolean }> =>
    frappePOST<{ success: boolean }>('marcar_aviso_visto', { aviso_name }),

  getQuotasResumo: (ano?: string): Promise<QuotasResumo> =>
    frappeFetch<QuotasResumo>('get_quotas_resumo', ano ? { ano } : undefined),
};

// Re-export types for convenience
export type { AuthInfo, CatecumenoCompleto, TurmaComCatecumenos, FieldConfigItem, AvisoAtivo, QuotasResumo };

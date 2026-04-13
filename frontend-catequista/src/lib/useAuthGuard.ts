'use client';

import { useEffect, useState } from 'react';
import { api, AuthError, type AuthInfo } from './api';

interface AuthState {
  loading: boolean;
  auth: AuthInfo | null;
  error: string | null;
}

/**
 * Use on every protected page.
 * - While loading: show spinner.
 * - If unauthenticated: redirects to /catequista/login/ automatically.
 * - If authenticated: auth contains { catequista, user }.
 */
export function useAuthGuard(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, auth: null, error: null });

  useEffect(() => {
    api.getSessionInfo()
      .then(auth => setState({ loading: false, auth, error: null }))
      .catch(err => {
        if (err instanceof AuthError) {
          window.location.href = '/catequista/login/';
        } else {
          setState({ loading: false, auth: null, error: String(err.message || err) });
        }
      });
  }, []);

  return state;
}

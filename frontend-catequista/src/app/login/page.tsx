'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { login, api, AuthError } from '@/lib/api';

export default function LoginPage() {
  const [usr, setUsr] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const short = process.env.NEXT_PUBLIC_PARISH_SHORT || 'PNSA';

  // Redirect if already logged in
  useEffect(() => {
    api.getSessionInfo()
      .then(() => { window.location.href = '/catequista/'; })
      .catch(() => setChecking(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!usr.trim() || !pwd) return;
    setError('');
    setLoading(true);

    try {
      await login(usr.trim(), pwd);
      // Verify it's actually a catequista account
      await api.getSessionInfo();
      window.location.href = '/catequista/';
    } catch (err) {
      if (err instanceof AuthError) {
        setError('Esta conta não tem acesso ao portal de catequistas.');
      } else {
        const msg = String((err as Error).message || err);
        // Frappe returns "not enough priviliges" or similar for wrong creds
        if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('incorrect') ||
            msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('wrong') ||
            msg.toLowerCase().includes('privilege') || msg.toLowerCase().includes('permiss')) {
          setError('Email ou senha incorrectos. Tente novamente.');
        } else {
          setError(msg || 'Erro ao iniciar sessão. Tente novamente.');
        }
      }
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-[3px] border-navy-900/10 border-t-gold-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50 bg-cross-pattern flex flex-col items-center justify-center px-4 py-12">

      {/* Logo + title */}
      <div className="flex flex-col items-center gap-3 mb-8 animate-fade-up">
        <div className="w-14 h-14 rounded-2xl bg-navy-900 flex items-center justify-center shadow-warm-md">
          <img src="/files/20.png" alt={short} className="w-9 h-9 object-contain" />
        </div>
        <div className="text-center">
          <h1 className="font-display font-bold text-navy-900 text-xl tracking-wide">{short}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Portal do Catequista</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm animate-fade-up-1">
        <div className="bg-white rounded-2xl shadow-warm-md border border-cream-200 p-7">
          <h2 className="font-display font-bold text-navy-900 text-lg mb-1">Iniciar sessão</h2>
          <p className="text-sm text-slate-500 mb-6">Acesso exclusivo a catequistas.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Email ou utilizador
              </label>
              <input
                type="text"
                value={usr}
                onChange={e => setUsr(e.target.value)}
                placeholder="catequista@pnsa.co.mz"
                autoComplete="username"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-cream-300 bg-cream-50 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-cream-300 bg-cream-50 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-3 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !usr.trim() || !pwd}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-warm-xs mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'A entrar...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>

      {/* Back link */}
      <a
        href="/portal/"
        className="mt-6 text-sm text-slate-400 hover:text-slate-600 transition-colors animate-fade-up-2"
      >
        ← Voltar ao portal público
      </a>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, CheckCircle, AlertCircle, User } from 'lucide-react';
import Nav from '@/components/Nav';
import { FullPageLoading } from '@/components/Loading';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api } from '@/lib/api';

export default function PerfilPage() {
  const { loading, auth } = useAuthGuard();

  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConf, setSenhaConf] = useState('');
  const [showAtual, setShowAtual] = useState(false);
  const [showNova, setShowNova] = useState(false);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <FullPageLoading />;

  const canSubmit = senhaAtual && senhaNova.length >= 6 && senhaNova === senhaConf;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (senhaNova !== senhaConf) {
      setError('As senhas não coincidem.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.alterarSenha(senhaAtual, senhaNova);
      setSuccess(true);
      setSenhaAtual('');
      setSenhaNova('');
      setSenhaConf('');
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Nav catequistaNome={auth?.catequista} />

      <main className="max-w-lg mx-auto px-4 py-10">

        {/* Profile info */}
        <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs p-6 mb-6 animate-fade-up">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-navy-900 flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-gold-400" />
            </div>
            <div>
              <h1 className="font-display font-bold text-navy-900 text-xl">{auth?.catequista}</h1>
              <p className="text-sm text-slate-400 mt-0.5">{auth?.user}</p>
            </div>
          </div>
        </div>

        {/* Change password card */}
        <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs p-6 animate-fade-up-1">
          <div className="flex items-center gap-2 mb-5">
            <KeyRound className="w-4 h-4 text-gold-500" />
            <h2 className="font-display font-bold text-navy-900 text-base">Alterar senha</h2>
          </div>

          {success && (
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5 animate-fade-in">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">Senha alterada com sucesso!</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordField
              label="Senha actual"
              value={senhaAtual}
              onChange={setSenhaAtual}
              show={showAtual}
              onToggle={() => setShowAtual(v => !v)}
              placeholder="A sua senha actual"
              autoComplete="current-password"
            />
            <PasswordField
              label="Nova senha"
              value={senhaNova}
              onChange={setSenhaNova}
              show={showNova}
              onToggle={() => setShowNova(v => !v)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              hint={senhaNova.length > 0 && senhaNova.length < 6 ? 'Mínimo 6 caracteres' : ''}
            />
            <PasswordField
              label="Confirmar nova senha"
              value={senhaConf}
              onChange={setSenhaConf}
              show={showNova}
              onToggle={() => setShowNova(v => !v)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
              hint={senhaConf.length > 0 && senhaConf !== senhaNova ? 'As senhas não coincidem' : ''}
            />

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all mt-2"
            >
              {saving ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {saving ? 'A guardar...' : 'Alterar senha'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <a href="/catequista/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
            ← Voltar ao início
          </a>
        </div>
      </main>
    </>
  );
}

function PasswordField({
  label, value, onChange, show, onToggle, placeholder, autoComplete, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-cream-300 bg-cream-50 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all"
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-rose-500">{hint}</p>}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, User, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { Catecumeno, Turma } from '@/types/catequese';
import PhaseChip from '@/components/PhaseChip';
import Loading from '@/components/Loading';

export default function CatecumenoContent() {
  const params = useSearchParams();
  const nome = params.get('nome');

  const [data, setData] = useState<{ catecumeno: Catecumeno; turma: Turma | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!nome) {
      window.location.href = '/portal/pesquisa/';
      return;
    }
    api.getCatecumeno(nome)
      .then(setData)
      .catch(() => setError('Catecúmeno não encontrado.'))
      .finally(() => setLoading(false));
  }, [nome]);

  if (loading) return <Loading />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertCircle className="w-10 h-10 mb-3 text-rose-400" />
        <p className="font-display italic">{error || 'Catecúmeno não encontrado.'}</p>
        <button onClick={() => history.back()} className="mt-4 text-navy-700 text-sm hover:underline">
          ← Voltar
        </button>
      </div>
    );
  }

  const { catecumeno: c, turma: t } = data;

  return (
    <div className="animate-fade-up">
      {/* Back */}
      <button
        onClick={() => history.back()}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      {/* Identity card */}
      <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs p-6 mb-5">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-navy-900 flex items-center justify-center text-gold-400 font-display font-bold text-2xl shrink-0 shadow-warm-sm">
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-bold text-navy-900 leading-tight">{c.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <PhaseChip fase={c.fase} />
              {c.sexo && (
                <span className="text-xs text-slate-500 bg-cream-100 border border-cream-300 rounded-full px-2.5 py-0.5">
                  {c.sexo === 'M' ? 'Masculino' : c.sexo === 'F' ? 'Feminino' : c.sexo}
                </span>
              )}
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                c.status === 'Activo'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-cream-100 text-slate-500 border border-cream-300'
              }`}>
                {c.status}
              </span>
            </div>
            {c.encarregado && (
              <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-500">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{c.encarregado}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Turma card */}
      {t ? (
        <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-cream-200 bg-cream-50">
            <h2 className="font-semibold text-navy-900 text-sm">Informação da Turma</h2>
          </div>
          <div className="divide-y divide-cream-100">
            <div className="px-6 py-3.5 flex items-center justify-between gap-4">
              <span className="text-sm text-slate-500">Turma</span>
              <a
                href={`/portal/turma/?nome=${encodeURIComponent(t.name)}`}
                className="text-sm font-semibold text-navy-700 hover:text-navy-900 hover:underline transition-colors"
              >
                {t.name}
              </a>
            </div>
            <div className="px-6 py-3.5 flex items-center justify-between gap-4">
              <span className="text-sm text-slate-500">Fase</span>
              <PhaseChip fase={t.fase} />
            </div>
            {t.ano_lectivo && (
              <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Ano lectivo</span>
                <span className="text-sm text-navy-900 font-medium">{t.ano_lectivo}</span>
              </div>
            )}
            {t.local && (
              <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Local</span>
                <div className="flex items-center gap-1.5 text-sm text-navy-900">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {t.local}
                </div>
              </div>
            )}
            {(t.dia || t.hora) && (
              <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Horário</span>
                <div className="flex items-center gap-1.5 text-sm text-navy-900">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {[t.dia, t.hora].filter(Boolean).join(' · ')}
                </div>
              </div>
            )}
            {(t.catequista || t.catequista_adj) && (
              <div className="px-6 py-3.5 flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Catequistas</span>
                <div className="flex items-center gap-1.5 text-sm text-navy-900">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {[t.catequista, t.catequista_adj].filter(Boolean).join(' & ')}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs p-8 text-center">
          <p className="text-slate-400 text-sm font-display italic">Sem turma atribuída.</p>
        </div>
      )}
    </div>
  );
}

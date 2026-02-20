'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, User, Users, AlertCircle, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { TurmaDetalhe } from '@/types/catequese';
import PhaseChip from '@/components/PhaseChip';
import Loading from '@/components/Loading';

export default function TurmaContent() {
  const params = useSearchParams();
  const nome = params.get('nome');

  const [turma, setTurma] = useState<TurmaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!nome) {
      window.location.href = '/portal/turmas/';
      return;
    }
    api.getTurmaDetalhe(nome)
      .then(setTurma)
      .catch(() => setError('Turma não encontrada ou indisponível.'))
      .finally(() => setLoading(false));
  }, [nome]);

  if (loading) return <Loading />;

  if (error || !turma) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertCircle className="w-10 h-10 mb-3 text-rose-400" />
        <p className="font-display italic">{error || 'Turma não encontrada.'}</p>
        <a href="/portal/turmas/" className="mt-4 text-navy-700 text-sm hover:underline">
          ← Voltar às turmas
        </a>
      </div>
    );
  }

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

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-xl font-bold text-navy-900">{turma.name}</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <PhaseChip fase={turma.fase} />
              {turma.ano_lectivo && (
                <span className="text-xs text-slate-500 bg-cream-100 border border-cream-300 rounded-full px-2.5 py-0.5">
                  {turma.ano_lectivo}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 bg-cream-100 border border-cream-300 rounded-xl px-4 py-2.5 shadow-warm-xs">
            <Users className="w-4 h-4 text-navy-900/40" />
            <span className="text-lg font-display font-bold text-navy-900">{turma.total_catecumenos}</span>
            <span className="text-sm text-slate-500">catecúmenos</span>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {turma.local && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{turma.local}</span>
            </div>
          )}
          {(turma.dia || turma.hora) && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{[turma.dia, turma.hora].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          {(turma.catequista || turma.catequista_adj) && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{[turma.catequista, turma.catequista_adj].filter(Boolean).join(' & ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Catecúmenos list */}
      <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs">
        {/* Header + filter */}
        <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-semibold text-navy-900">
            Catecúmenos
            {filter && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({turma.catecumenos.filter(c => c.catecumeno.toLowerCase().includes(filter.toLowerCase())).length}/{turma.catecumenos.length})
              </span>
            )}
          </h2>
          {turma.catecumenos.length > 4 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar..."
                className="pl-8 pr-7 py-1.5 text-sm rounded-lg border border-cream-300 bg-cream-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-700/20 focus:border-navy-700/30 transition-all w-40"
              />
              {filter && (
                <button
                  onClick={() => setFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {turma.catecumenos.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm font-display italic">
            Nenhum catecúmeno activo nesta turma.
          </div>
        ) : (() => {
          const visible = turma.catecumenos.filter(c =>
            !filter || c.catecumeno.toLowerCase().includes(filter.toLowerCase())
          );
          return visible.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400 text-sm">
              Nenhum resultado para &ldquo;{filter}&rdquo;
            </div>
          ) : (
            <ul className="divide-y divide-cream-100">
              {visible.map((c) => (
                <li key={c.catecumeno}>
                  <a
                    href={`/portal/catecumeno/?nome=${encodeURIComponent(c.catecumeno)}`}
                    className="px-6 py-3.5 flex items-center justify-between hover:bg-cream-50 transition-colors group"
                  >
                    <span className="text-sm text-navy-900 font-medium group-hover:text-navy-700">{c.catecumeno}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {c.total_presencas != null && (
                        <span className="text-emerald-600 font-semibold">{c.total_presencas}P</span>
                      )}
                      {c.total_faltas != null && c.total_faltas > 0 && (
                        <span className="text-rose-500 font-semibold">{c.total_faltas}F</span>
                      )}
                      <span className="text-cream-400 group-hover:text-gold-500 transition-colors">›</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          );
        })()}
      </div>
    </div>
  );
}

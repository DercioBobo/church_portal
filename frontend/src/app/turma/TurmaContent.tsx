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
        <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
        <p>{error || 'Turma não encontrada.'}</p>
        <a href="/portal/turmas/" className="mt-4 text-blue-700 text-sm hover:underline">
          ← Voltar às turmas
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => history.back()}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{turma.name}</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <PhaseChip fase={turma.fase} />
              {turma.ano_lectivo && (
                <span className="text-xs text-slate-500">{turma.ano_lectivo}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 rounded-xl px-4 py-2.5">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-900">{turma.total_catecumenos}</span>
            <span className="text-sm text-slate-500">catecúmenos</span>
          </div>
        </div>

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
              <span>
                {[turma.catequista, turma.catequista_adj].filter(Boolean).join(' e ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Catecúmenos */}
      <div className="bg-white rounded-2xl border border-slate-200">
        {/* Header + filter */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-semibold text-slate-900">
            Catecúmenos
            {filter && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                {turma.catecumenos.filter(c => c.catecumeno.toLowerCase().includes(filter.toLowerCase())).length}/{turma.catecumenos.length}
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
                className="pl-8 pr-7 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all w-40"
              />
              {filter && (
                <button
                  onClick={() => setFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {turma.catecumenos.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm">
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
            <ul className="divide-y divide-slate-100">
              {visible.map((c) => (
                <li key={c.catecumeno}>
                  <a
                    href={`/portal/catecumeno/?nome=${encodeURIComponent(c.catecumeno)}`}
                    className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm text-slate-800 font-medium">{c.catecumeno}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {c.total_presencas != null && (
                        <span className="text-emerald-600">{c.total_presencas}P</span>
                      )}
                      {c.total_faltas != null && c.total_faltas > 0 && (
                        <span className="text-red-500">{c.total_faltas}F</span>
                      )}
                      <span className="text-slate-300">›</span>
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

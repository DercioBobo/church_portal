'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Turma } from '@/types/catequese';
import TurmaCard from '@/components/TurmaCard';
import Loading, { CardSkeleton } from '@/components/Loading';

const ALL = 'Todas';

export default function TurmasPage() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loading, setLoading] = useState(true);
  const [faseFilter, setFaseFilter] = useState(ALL);

  useEffect(() => {
    api.getTurmas()
      .then(setTurmas)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fases = [ALL, ...Array.from(new Set(turmas.map((t) => t.fase).filter(Boolean))).sort()];
  const filtered = faseFilter === ALL ? turmas : turmas.filter((t) => t.fase === faseFilter);

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-7">
        <h1 className="font-display text-2xl font-bold text-navy-900">Turmas</h1>
        <p className="text-slate-500 text-sm mt-1">Todas as turmas activas de catequese</p>
      </div>

      {/* Phase filter pills */}
      {!loading && fases.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {fases.map((f) => (
            <button
              key={f}
              onClick={() => setFaseFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
                faseFilter === f
                  ? 'bg-navy-900 text-white shadow-warm-xs'
                  : 'bg-white text-slate-600 border border-cream-300 hover:border-navy-900/20 hover:bg-cream-50 shadow-warm-xs'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-slate-400 font-display italic">Nenhuma turma encontrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TurmaCard key={t.name} turma={t} />
          ))}
        </div>
      )}
    </div>
  );
}

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
      .finally(() => setLoading(false));
  }, []);

  const fases = [ALL, ...Array.from(new Set(turmas.map((t) => t.fase).filter(Boolean))).sort()];
  const filtered = faseFilter === ALL ? turmas : turmas.filter((t) => t.fase === faseFilter);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Turmas</h1>
        <p className="text-slate-500 text-sm mt-1">Todas as turmas activas de catequese</p>
      </div>

      {/* Phase filter */}
      {!loading && fases.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {fases.map((f) => (
            <button
              key={f}
              onClick={() => setFaseFilter(f)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                faseFilter === f
                  ? 'bg-blue-800 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
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
        <div className="text-center py-16 text-slate-400">
          <p>Nenhuma turma encontrada.</p>
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

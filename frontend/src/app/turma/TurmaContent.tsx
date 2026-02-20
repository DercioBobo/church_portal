'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, User, Users, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { TurmaDetalhe } from '@/types/catequese';
import PhaseChip from '@/components/PhaseChip';
import Loading from '@/components/Loading';

export default function TurmaContent() {
  const params = useSearchParams();
  const router = useRouter();
  const nome = params.get('nome');

  const [turma, setTurma] = useState<TurmaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!nome) {
      router.push('/turmas');
      return;
    }
    api.getTurmaDetalhe(nome)
      .then(setTurma)
      .catch(() => setError('Turma não encontrada ou indisponível.'))
      .finally(() => setLoading(false));
  }, [nome, router]);

  if (loading) return <Loading />;

  if (error || !turma) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
        <p>{error || 'Turma não encontrada.'}</p>
        <button onClick={() => router.push('/turmas')} className="mt-4 text-blue-700 text-sm hover:underline">
          ← Voltar às turmas
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => router.back()}
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
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Catecúmenos</h2>
        </div>
        {turma.catecumenos.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm">
            Nenhum catecúmeno activo nesta turma.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {turma.catecumenos.map((c) => (
              <li
                key={c.catecumeno}
                className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => router.push(`/catecumeno?nome=${encodeURIComponent(c.catecumeno)}`)}
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

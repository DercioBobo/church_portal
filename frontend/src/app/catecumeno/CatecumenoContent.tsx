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
        <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
        <p>{error || 'Catecúmeno não encontrado.'}</p>
        <button onClick={() => history.back()} className="mt-4 text-blue-700 text-sm hover:underline">
          ← Voltar
        </button>
      </div>
    );
  }

  const { catecumeno: c, turma: t } = data;

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

      {/* Catecúmeno card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-800 font-bold text-xl shrink-0">
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{c.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <PhaseChip fase={c.fase} />
              {c.sexo && (
                <span className="text-xs text-slate-500">
                  {c.sexo === 'M' ? 'Masculino' : c.sexo === 'F' ? 'Feminino' : c.sexo}
                </span>
              )}
              <span className={`text-xs font-medium ${c.status === 'Activo' ? 'text-emerald-600' : 'text-slate-400'}`}>
                {c.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Turma info */}
      {t ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Turma</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Turma</span>
              <a
                href={`/portal/turma/?nome=${encodeURIComponent(t.name)}`}
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                {t.name}
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Fase</span>
              <PhaseChip fase={t.fase} />
            </div>
            {t.ano_lectivo && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Ano lectivo</span>
                <span className="text-sm text-slate-900">{t.ano_lectivo}</span>
              </div>
            )}
            {t.local && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Local</span>
                <div className="flex items-center gap-1.5 text-sm text-slate-900">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {t.local}
                </div>
              </div>
            )}
            {(t.dia || t.hora) && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Horário</span>
                <div className="flex items-center gap-1.5 text-sm text-slate-900">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {[t.dia, t.hora].filter(Boolean).join(' · ')}
                </div>
              </div>
            )}
            {(t.catequista || t.catequista_adj) && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Catequistas</span>
                <div className="flex items-center gap-1.5 text-sm text-slate-900">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {[t.catequista, t.catequista_adj].filter(Boolean).join(' e ')}
                </div>
              </div>
            )}

            {(c.encarregado  && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Encarregados</span>
                  <div className="flex items-center gap-1.5 text-sm text-slate-900">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {c.encarregado}
                  </div>
                </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
          Sem turma atribuída.
        </div>
      )}
    </div>
  );
}

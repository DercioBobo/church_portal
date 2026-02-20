'use client';

import { useEffect, useState } from 'react';
import { Cake, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import type { Aniversariante } from '@/types/catequese';
import PhaseChip from '@/components/PhaseChip';
import Loading from '@/components/Loading';

type Tipo = 'hoje' | 'semana';

export default function AniversariosPage() {
  const [tipo, setTipo] = useState<Tipo>('hoje');
  const [data, setData] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getAniversariantes(tipo)
      .then((r) => setData(r ?? []))
      .finally(() => setLoading(false));
  }, [tipo]);

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-7 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900">Aniversários</h1>
          <p className="text-slate-500 text-sm mt-1">Catecúmenos que fazem anos</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-cream-100 border border-cream-300 rounded-xl p-1 gap-1 shadow-warm-xs">
          {(['hoje', 'semana'] as Tipo[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                tipo === t
                  ? 'bg-navy-900 text-white shadow-warm-xs'
                  : 'text-slate-600 hover:bg-cream-200'
              }`}
            >
              {t === 'hoje' ? 'Hoje' : 'Esta semana'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : data.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-cream-200 flex items-center justify-center mx-auto mb-4">
            <Cake className="w-8 h-8 text-slate-300" />
          </div>
          <p className="font-display italic text-slate-400 text-lg">
            Nenhum aniversário {tipo === 'hoje' ? 'hoje' : 'esta semana'}.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-cream-300 shadow-warm-xs">
          {/* Section header */}
          <div className="bg-gradient-to-r from-rose-50 to-pink-50 px-5 py-3.5 border-b border-rose-100 flex items-center gap-2">
            <Cake className="w-4 h-4 text-rose-400" />
            <span className="text-sm font-semibold text-rose-800">
              {data.length} {data.length === 1 ? 'aniversariante' : 'aniversariantes'}
            </span>
          </div>
          <div className="bg-white divide-y divide-cream-100">
            {data.map((a) => (
              <div key={a.name} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-cream-50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0 font-bold text-sm">
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-navy-900 text-sm truncate">{a.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <PhaseChip fase={a.fase} />
                      {a.turma && <span className="text-xs text-slate-500 truncate">{a.turma}</span>}
                      {a.local && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-400">
                          <MapPin className="w-3 h-3" />{a.local}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-center bg-rose-50 border border-rose-100 rounded-xl px-3 py-1.5">
                  <div className="text-lg font-display font-bold text-rose-600 leading-none">{a.idade_nova}</div>
                  <div className="text-[10px] text-rose-400 uppercase tracking-widest mt-0.5">anos</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

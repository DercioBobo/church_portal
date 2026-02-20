'use client';

import { useEffect, useState } from 'react';
import { Cake, MapPin, User } from 'lucide-react';
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
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Aniversários</h1>
          <p className="text-slate-500 text-sm mt-1">Catecúmenos que fazem anos</p>
        </div>
        {/* Toggle */}
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
          {(['hoje', 'semana'] as Tipo[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tipo === t
                  ? 'bg-blue-800 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
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
        <div className="text-center py-20">
          <Cake className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400">
            Nenhum aniversário {tipo === 'hoje' ? 'hoje' : 'esta semana'}.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {data.map((a) => (
            <div key={a.name} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-pink-50 flex items-center justify-center text-pink-500 shrink-0">
                  <Cake className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-slate-900 text-sm">{a.name}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <PhaseChip fase={a.fase} />
                    {a.turma && (
                      <span className="text-xs text-slate-500">{a.turma}</span>
                    )}
                    {a.local && (
                      <span className="flex items-center gap-0.5 text-xs text-slate-400">
                        <MapPin className="w-3 h-3" />{a.local}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-slate-900">{a.idade_nova}</div>
                <div className="text-xs text-slate-400">anos</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

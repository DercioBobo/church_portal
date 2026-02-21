'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Catecumeno } from '@/types/catequese';
import PhaseChip from './PhaseChip';
import Loading from './Loading';

export default function CatecumenosTable() {
  const [all, setAll] = useState<Catecumeno[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.getCatecumenos()
      .then((r) => setAll(r ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter.trim().length === 0
    ? all
    : all.filter((c) => {
        const q = filter.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.turma && c.turma.toLowerCase().includes(q)) ||
          (c.fase && c.fase.toLowerCase().includes(q)) ||
          (c.catequista && c.catequista.toLowerCase().includes(q)) ||
          (c.local && c.local.toLowerCase().includes(q))
        );
      });

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-xs text-slate-500">
            {loading ? '...' : `${all.length} catecúmenos activos`}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por nome, turma, fase..."
            className="pl-8 pr-8 py-2 text-sm rounded-xl border border-cream-300 bg-white focus:outline-none focus:ring-2 focus:ring-navy-700/20 focus:border-navy-700/30 transition-all w-64"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              aria-label="Limpar filtro"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs overflow-hidden">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[1fr_160px_160px_130px] gap-4 px-5 py-2.5 text-[10px] font-bold text-navy-900/40 uppercase tracking-widest bg-cream-50 border-b border-cream-200">
            <span>Nome</span>
            <span>Turma</span>
            <span>Catequista</span>
            <span>Horário</span>
          </div>

          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm font-display italic">
              {filter
                ? `Nenhum resultado para "${filter}"`
                : 'Nenhum catecúmeno activo.'}
            </div>
          ) : (
            <div className="divide-y divide-cream-100">
              {filtered.map((c) => (
                <a
                  key={c.name}
                  href={`/portal/catecumeno/?nome=${encodeURIComponent(c.name)}`}
                  className="flex sm:grid sm:grid-cols-[1fr_160px_160px_130px] gap-x-4 gap-y-0.5 px-5 py-3.5 hover:bg-cream-50 transition-colors group"
                >
                  {/* Name + phase */}
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm font-medium text-navy-900 group-hover:text-navy-700 truncate">
                      {c.name}
                    </span>
                    <PhaseChip fase={c.fase} />
                  </div>

                  {/* Turma */}
                  <div className="hidden sm:flex items-center text-xs text-slate-500 truncate">
                    {c.turma
                      ? <span className="truncate">{c.turma}</span>
                      : <span className="text-slate-300 italic">—</span>}
                  </div>

                  {/* Catequista */}
                  <div className="hidden sm:flex items-center text-xs text-slate-500 truncate">
                    {(c.catequista || c.catequista_adj)
                      ? <span className="truncate">{[c.catequista, c.catequista_adj].filter(Boolean).join(' & ')}</span>
                      : <span className="text-slate-300 italic">—</span>}
                  </div>

                  {/* Horário */}
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 truncate">
                    {c.local && <span className="text-slate-500 truncate">{c.local}</span>}
                    {(c.dia || c.hora) && (
                      <span className="truncate">{[c.dia, c.hora].filter(Boolean).join(' · ')}</span>
                    )}
                    {!c.local && !c.dia && !c.hora && <span className="text-slate-300 italic">—</span>}
                  </div>
                </a>
              ))}
            </div>
          )}

          {filter && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-cream-200 bg-cream-50/60 text-xs text-slate-500">
              {filtered.length} de {all.length} catecúmenos
            </div>
          )}
        </div>
      )}
    </div>
  );
}

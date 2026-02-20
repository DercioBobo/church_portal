'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, User, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { ResultadoPesquisa } from '@/types/catequese';
import PhaseChip from '@/components/PhaseChip';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function PesquisaContent() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [results, setResults] = useState<ResultadoPesquisa | null>(null);
  const [loading, setLoading] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const r = await api.pesquisar(q.trim());
      setResults(r);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search(debouncedQuery);
  }, [debouncedQuery, search]);

  const total = (results?.catecumenos.length ?? 0) + (results?.catequistas.length ?? 0);

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-7">
        <h1 className="font-display text-2xl font-bold text-navy-900">Pesquisa</h1>
        <p className="text-slate-500 text-sm mt-1">Encontre catecúmenos e catequistas</p>
      </div>

      {/* Search input */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escreva o nome..."
          className="w-full pl-12 pr-4 py-4 text-lg rounded-2xl border-2 border-cream-300 bg-white placeholder-slate-400 focus:outline-none focus:border-navy-700 focus:ring-0 shadow-warm-xs transition-colors"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-cream-300 border-t-navy-900 rounded-full animate-spin" />
        )}
      </div>

      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="text-center text-slate-400 text-sm font-display italic">Escreva pelo menos 2 caracteres...</p>
      )}

      {results && !loading && (
        <>
          {total === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-display italic">Nenhum resultado para &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <div className="space-y-8">

              {/* Catecúmenos */}
              {results.catecumenos.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-navy-900/40" />
                    <h2 className="text-xs font-bold text-navy-900/40 uppercase tracking-widest">
                      Catecúmenos ({results.catecumenos.length})
                    </h2>
                  </div>
                  <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs divide-y divide-cream-100">
                    {results.catecumenos.map((c) => (
                      <a
                        key={c.name}
                        href={`/portal/catecumeno/?nome=${encodeURIComponent(c.name)}`}
                        className="px-5 py-4 flex items-center justify-between hover:bg-cream-50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-navy-900 text-sm">{c.name}</span>
                            {c.found_via === 'encarregado' && (
                              <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
                                via encarregado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <PhaseChip fase={c.fase} />
                            {c.turma && <span className="text-xs text-slate-500">{c.turma}</span>}
                            {(c.catequista || c.catequista_adj) && (
                              <span className="text-xs text-slate-400">
                                · {[c.catequista, c.catequista_adj].filter(Boolean).join(' & ')}
                              </span>
                            )}
                          </div>
                          {c.encarregado && (
                            <div className="text-xs text-slate-400 mt-0.5">Enc: {c.encarregado}</div>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 shrink-0 ml-4 group-hover:text-gold-500 transition-colors">
                          {[c.dia, c.hora].filter(Boolean).join(' · ')}
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Catequistas */}
              {results.catequistas.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-navy-900/40" />
                    <h2 className="text-xs font-bold text-navy-900/40 uppercase tracking-widest">
                      Catequistas ({results.catequistas.length})
                    </h2>
                  </div>
                  <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs divide-y divide-cream-100">
                    {results.catequistas.map((c, i) => (
                      <a
                        key={i}
                        href={`/portal/turma/?nome=${encodeURIComponent(c.turma)}`}
                        className="px-5 py-4 flex items-center justify-between hover:bg-cream-50 transition-colors group"
                      >
                        <div>
                          <div className="font-medium text-navy-900 text-sm">
                            {[c.catequista, c.catequista_adj].filter(Boolean).join(' & ')}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <PhaseChip fase={c.fase} />
                            <span className="text-xs text-slate-500">{c.turma}</span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 shrink-0 ml-4 group-hover:text-gold-500 transition-colors">
                          {[c.dia, c.hora].filter(Boolean).join(' · ')}
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

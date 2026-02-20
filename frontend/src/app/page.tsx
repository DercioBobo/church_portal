'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Users, BookOpen, UserCheck, ChevronRight, Search, X, Church, Cake,
} from 'lucide-react';

import { api } from '@/lib/api';
import type { Estatisticas, Aniversariante, ResultadoPesquisa } from '@/types/catequese';
import StatsCard from '@/components/StatsCard';
import BirthdayList from '@/components/BirthdayList';
import Loading from '@/components/Loading';
import PhaseChip from '@/components/PhaseChip';

const PhaseChart = dynamic(() => import('@/components/PhaseChart'), { ssr: false });

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Inline search dropdown ────────────────────────────────────────────────────
function HeroSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultadoPesquisa | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 280);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    api.pesquisar(debouncedQuery.trim())
      .then(setResults)
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  const catecumenos = results?.catecumenos ?? [];
  const catequistas = results?.catequistas ?? [];
  const total = catecumenos.length + catequistas.length;
  const showDropdown = focused && query.trim().length >= 1;

  const clear = useCallback(() => {
    setQuery('');
    setResults(null);
    inputRef.current?.focus();
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl mx-auto">
      {/* Input */}
      <div className={`flex items-center gap-3 px-4 py-4 bg-white rounded-2xl border-2 shadow-sm transition-all ${
        focused ? 'border-blue-500 shadow-blue-100' : 'border-slate-200 hover:border-slate-300'
      }`}>
        <Search className={`w-5 h-5 shrink-0 transition-colors ${focused ? 'text-blue-600' : 'text-slate-400'}`} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Pesquisar catecúmeno, catequista, encarregado..."
          className="flex-1 text-[15px] text-slate-900 placeholder-slate-400 bg-transparent outline-none"
        />
        <div className="flex items-center gap-2 shrink-0">
          {loading && (
            <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          )}
          {query && (
            <button onClick={clear} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50">

          {query.trim().length === 1 && (
            <div className="px-5 py-5 text-center text-sm text-slate-400">
              Escreva pelo menos 2 caracteres...
            </div>
          )}

          {query.trim().length >= 2 && !loading && results && total === 0 && (
            <div className="px-5 py-5 text-center">
              <p className="text-sm text-slate-500">
                Sem resultados para <span className="font-medium">&ldquo;{query}&rdquo;</span>
              </p>
            </div>
          )}

          {catecumenos.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Catecúmenos
              </div>
              {catecumenos.slice(0, 5).map((c) => (
                <a
                  key={c.name}
                  href={`/portal/catecumeno/?nome=${encodeURIComponent(c.name)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">{c.name}</span>
                      {c.found_via === 'encarregado' && (
                        <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                          via encarregado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {c.fase && <PhaseChip fase={c.fase} />}
                      {c.turma && <span className="text-xs text-slate-500">{c.turma}</span>}
                      {(c.catequista || c.catequista_adj) && (
                        <span className="text-xs text-slate-400">
                          · {[c.catequista, c.catequista_adj].filter(Boolean).join(' & ')}
                        </span>
                      )}
                    </div>
                    {c.encarregado && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate">Enc: {c.encarregado}</div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </a>
              ))}
              {catecumenos.length > 5 && (
                <a href={`/portal/pesquisa/?q=${encodeURIComponent(query)}`} className="block px-4 py-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors border-t border-slate-100">
                  Ver mais {catecumenos.length - 5} catecúmenos →
                </a>
              )}
            </div>
          )}

          {catequistas.length > 0 && (
            <div className={catecumenos.length > 0 ? 'border-t border-slate-100' : ''}>
              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Catequistas
              </div>
              {catequistas.slice(0, 3).map((c, i) => (
                <a
                  key={i}
                  href={`/portal/turma/?nome=${encodeURIComponent(c.turma)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold shrink-0">
                    {(c.catequista || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {[c.catequista, c.catequista_adj].filter(Boolean).join(' & ')}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.fase && <PhaseChip fase={c.fase} />}
                      <span className="text-xs text-slate-500">{c.turma}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </a>
              ))}
            </div>
          )}

          {/* Footer: full search link */}
          {total > 0 && (
            <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/60">
              <a
                href={`/portal/pesquisa/?q=${encodeURIComponent(query)}`}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              >
                Ver todos os resultados →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [stats, setStats] = useState<Estatisticas | null>(null);
  const [birthdays, setBirthdays] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(true);
  const parishName = process.env.NEXT_PUBLIC_PARISH_NAME || 'Portal de Catequese';

  useEffect(() => {
    Promise.all([api.getEstatisticas(), api.getAniversariantes('hoje')])
      .then(([s, b]) => {
        setStats(s);
        setBirthdays(b ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="space-y-10">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="text-center pt-4 pb-2 space-y-5">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-800 flex items-center justify-center shadow-lg shadow-blue-800/20">
            <Church className="w-8 h-8 text-white" />
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{parishName}</h1>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            Consulte turmas, catecúmenos, horários e muito mais.
            Disponível para encarregados, catecúmenos e catequistas.
          </p>
        </div>

        {/* Search */}
        <HeroSearch />

        {/* Keyboard hint */}
        <p className="text-xs text-slate-400">
          Prima <kbd className="font-mono bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">Ctrl K</kbd> em qualquer página para pesquisar
        </p>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard
            label="Catecúmenos"
            value={stats.total_catecumenos}
            icon={<Users className="w-5 h-5" />}
          />
          <StatsCard
            label="Turmas activas"
            value={stats.total_turmas}
            icon={<BookOpen className="w-5 h-5" />}
          />
          <StatsCard
            label="Catequistas"
            value={stats.total_catequistas}
            icon={<UserCheck className="w-5 h-5" />}
          />
        </div>
      )}

      {/* ── Quick nav ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Acesso rápido</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
              href="/portal/turmas/"
              className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 group-hover:bg-blue-100 transition-colors">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Turmas</div>
                <div className="text-xs text-slate-500">Ver todas</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </a>

          <a
              href="/portal/pesquisa/"
              className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center text-violet-700 group-hover:bg-violet-100 transition-colors">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Pesquisa</div>
                <div className="text-xs text-slate-500">Nomes completos</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </a>

          <a
              href="/portal/aniversarios/"
              className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-pink-50 flex items-center justify-center text-pink-600 group-hover:bg-pink-100 transition-colors">
                <Cake className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Aniversários</div>
                <div className="text-xs text-slate-500">Hoje e esta semana</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </a>
        </div>
      </div>

      {/* ── Birthdays today ───────────────────────────────────────────── */}
      <BirthdayList birthdays={birthdays} />



      {/* ── Phase chart ───────────────────────────────────────────────── */}
      {stats && stats.por_fase.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Catecúmenos por Fase</h2>
          <PhaseChart data={stats.por_fase} />
        </div>
      )}



    </div>
  );
}

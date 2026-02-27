'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  BookOpen, ChevronRight, Search, X, Cake,
  FileText, ClipboardList, Star, Users, Calendar,
} from 'lucide-react';

import { api } from '@/lib/api';
import type { Aniversariante, ResultadoPesquisa, NavItem } from '@/types/catequese';
import BirthdayList from '@/components/BirthdayList';
import PhaseChip from '@/components/PhaseChip';
import CatecumenosTable from '@/components/CatecumenosTable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, any> = {
  BookOpen, Search, Cake, FileText, ClipboardList,
  Star, Users, Calendar, ChevronRight,
};

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { key: 'turmas',       label: 'Turmas',       descricao: 'Ver todas as turmas',     icon: 'BookOpen', url: '/turmas/',       visible: true, ordem: 1 },
  { key: 'pesquisa',     label: 'Pesquisa',     descricao: 'Busca por nome completo', icon: 'Search',   url: '/pesquisa/',     visible: true, ordem: 2 },
  { key: 'aniversarios', label: 'Aniversários', descricao: 'Hoje e esta semana',      icon: 'Cake',     url: '/aniversarios/', visible: true, ordem: 3 },
];

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
      <div className={`flex items-center gap-3 px-4 py-3.5 bg-white rounded-2xl border-2 shadow-warm-sm transition-all duration-150 ${
        focused
          ? 'border-navy-700 shadow-warm'
          : 'border-cream-300 hover:border-cream-400'
      }`}>
        <Search className={`w-5 h-5 shrink-0 transition-colors ${focused ? 'text-navy-900' : 'text-slate-400'}`} />
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
            <div className="w-4 h-4 border-2 border-cream-300 border-t-navy-900 rounded-full animate-spin" />
          )}
          {query && (
            <button onClick={clear} className="text-slate-400 hover:text-slate-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-cream-300 shadow-warm-md overflow-hidden z-50 animate-fade-in">

          {query.trim().length === 1 && (
            <div className="px-5 py-5 text-center text-sm text-slate-400 font-display italic">
              Escreva pelo menos 2 caracteres...
            </div>
          )}

          {query.trim().length >= 2 && !loading && results && total === 0 && (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-slate-500">
                Sem resultados para <span className="font-semibold text-navy-900">&ldquo;{query}&rdquo;</span>
              </p>
            </div>
          )}

          {catecumenos.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-navy-900/40 uppercase tracking-widest">
                Catecúmenos
              </div>
              {catecumenos.slice(0, 5).map((c) => (
                <a
                  key={c.name}
                  href={`/portal/catecumeno/?nome=${encodeURIComponent(c.name)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-navy-900 flex items-center justify-center text-gold-400 text-xs font-bold shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">{c.name}</span>
                      {c.found_via === 'encarregado' && (
                        <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                          via encarregado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {c.fase && <PhaseChip fase={c.fase} />}
                      {c.turma && <span className="text-xs text-slate-500">{c.turma}</span>}
                      {(c.catequista || c.catequista_adj) && (
                        <span className="text-xs text-slate-400">· {[c.catequista, c.catequista_adj].filter(Boolean).join(' & ')}</span>
                      )}
                    </div>
                    {c.encarregado && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate">Enc: {c.encarregado}</div>
                    )}
                    {(c.local || c.dia || c.hora) && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate">
                        {[c.local, [c.dia, c.hora].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </a>
              ))}
              {catecumenos.length > 5 && (
                <a
                  href={`/portal/pesquisa/?q=${encodeURIComponent(query)}`}
                  className="block px-4 py-2 text-xs text-navy-700 hover:text-navy-900 hover:bg-cream-50 transition-colors border-t border-cream-200"
                >
                  Ver mais {catecumenos.length - 5} catecúmenos →
                </a>
              )}
            </div>
          )}

          {catequistas.length > 0 && (
            <div className={catecumenos.length > 0 ? 'border-t border-cream-200' : ''}>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-navy-900/40 uppercase tracking-widest">
                Catequistas
              </div>
              {catequistas.slice(0, 3).map((c, i) => (
                <a
                  key={i}
                  href={`/portal/turma/?nome=${encodeURIComponent(c.turma)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
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

          {total > 0 && (
            <div className="border-t border-cream-200 px-4 py-2.5 bg-cream-50/60">
              <a
                href={`/portal/pesquisa/?q=${encodeURIComponent(query)}`}
                className="text-xs text-navy-700 hover:text-navy-900 hover:underline transition-colors font-medium"
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
  const [birthdays, setBirthdays] = useState<Aniversariante[]>([]);
  const [navItems, setNavItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS);
  const parishName = process.env.NEXT_PUBLIC_PARISH_NAME || 'Portal de Catequese';

  useEffect(() => {
    api.getAniversariantes('hoje')
      .then((b) => setBirthdays(b ?? []))
      .catch(() => {});
    api.getPortalConfig()
      .then((cfg) => {
        if (cfg?.nav_items?.length) setNavItems(cfg.nav_items);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-10">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="relative rounded-3xl bg-cross-pattern animate-fade-up z-10">
        {/* Layered gradient for readability over pattern */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-cream-100/80 to-cream-100 pointer-events-none" />

        <div className="relative z-10 text-center py-10 px-6 space-y-6">
          {/* Emblem */}
          <div className="flex justify-center">
            <img
              src="/files/20.png"
              alt={parishName}
              className="w-16 h-16 rounded-2xl object-contain shadow-warm-md"
            />
          </div>

          {/* Title */}
          <div>
            <h1 className="font-display text-3xl font-bold text-navy-900 leading-tight">{parishName}</h1>
            <p className="text-slate-500 mt-2 max-w-md mx-auto text-[15px] leading-relaxed">
              Consulte turmas, catecúmenos, horários e muito mais.
              <br className="hidden sm:block" />
              Disponível para encarregados, catecúmenos e catequistas.
            </p>
          </div>

          {/* Search */}
          <HeroSearch />

          {/* Keyboard hint — laptops only */}
          <p className="hidden lg:block text-xs text-slate-400">
            Prima{' '}
            <kbd className="font-mono bg-white border border-cream-300 rounded px-1.5 py-0.5 text-navy-900/50 shadow-warm-xs">
              Ctrl K
            </kbd>{' '}
            em qualquer página para pesquisar
          </p>
        </div>
      </div>

      {/* ── Birthdays today ───────────────────────────────────────────── */}
      <div className="animate-fade-up-2">
        <BirthdayList birthdays={birthdays} />
      </div>

      {/* ── Quick nav ─────────────────────────────────────────────────── */}
      {navItems.filter(i => i.visible).length > 0 && (
        <div className="animate-fade-up-3">
          <h2 className="text-xs font-bold text-navy-900/40 uppercase tracking-widest mb-3">Acesso rápido</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {navItems
              .filter(i => i.visible)
              .sort((a, b) => a.ordem - b.ordem)
              .map((item) => {
                const Icon = ICON_MAP[item.icon] ?? ChevronRight;
                return (
                  <a
                    key={item.key}
                    href={`/portal${item.url}`}
                    className="flex items-center justify-between p-4 bg-white rounded-2xl border border-cream-300 shadow-warm-xs hover:shadow-warm hover:-translate-y-0.5 transition-all duration-150 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-navy-900 flex items-center justify-center text-gold-400 shrink-0 group-hover:bg-navy-800 transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-navy-900">{item.label}</div>
                        <div className="text-xs text-slate-500">{item.descricao}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-gold-500 transition-colors" />
                  </a>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Catecúmenos table ─────────────────────────────────────────── */}
      <div className="animate-fade-up-4">
        <h2 className="text-xs font-bold text-navy-900/40 uppercase tracking-widest mb-3">Todos os catecúmenos</h2>
        <CatecumenosTable />
      </div>

    </div>
  );
}

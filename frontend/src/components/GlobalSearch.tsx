'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Search, X, ChevronRight, Users, User } from 'lucide-react';
import { api } from '@/lib/api';
import type { ResultadoPesquisa } from '@/types/catequese';
import PhaseChip from './PhaseChip';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type NavItem = { href: string };

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultadoPesquisa | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 280);

  // ── Open / close helpers ──────────────────────────────────────────────────
  const openSearch = useCallback(() => {
    setOpen(true);
    setActiveIdx(-1);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults(null);
    setActiveIdx(-1);
  }, []);

  // ── Keyboard: Ctrl+K  /  /  (not inside inputs) ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
        return;
      }
      if (e.key === '/' && !inInput) {
        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openSearch]);

  // ── Custom event from buttons / homepage ─────────────────────────────────
  useEffect(() => {
    const handler = () => openSearch();
    window.addEventListener('open-search', handler);
    return () => window.removeEventListener('open-search', handler);
  }, [openSearch]);

  // ── Focus input when opened ───────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      // Small delay lets the modal paint first
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── Fetch results ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults(null);
      setActiveIdx(-1);
      return;
    }
    setLoading(true);
    api.pesquisar(debouncedQuery.trim())
      .then((r) => { setResults(r); setActiveIdx(-1); })
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // ── Build flat list of navigable items for keyboard nav ───────────────────
  const navItems: NavItem[] = [
    ...(results?.catecumenos ?? []).map((c) => ({
      href: `/portal/catecumeno/?nome=${encodeURIComponent(c.name)}`,
    })),
    ...(results?.catequistas ?? []).map((c) => ({
      href: `/portal/turma/?nome=${encodeURIComponent(c.turma)}`,
    })),
  ];

  // ── Arrow-key / Enter inside panel ───────────────────────────────────────
  const handlePanelKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { closeSearch(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, navItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0 && navItems[activeIdx]) {
      window.location.href = navItems[activeIdx].href;
    }
  };

  // ── Scroll active item into view ──────────────────────────────────────────
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelectorAll<HTMLElement>('[data-nav-item]')[activeIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  const catecumenos = results?.catecumenos ?? [];
  const catequistas = results?.catequistas ?? [];
  const hasResults = catecumenos.length > 0 || catequistas.length > 0;
  let itemIdx = -1; // running index for active highlight

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={closeSearch}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden flex flex-col"
        style={{ maxHeight: '75vh' }}
        onKeyDown={handlePanelKey}
      >
        {/* ── Input row ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search className="w-5 h-5 text-blue-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar catecúmeno, catequista..."
            className="flex-1 text-[15px] text-slate-900 placeholder-slate-400 bg-transparent outline-none"
          />
          <div className="flex items-center gap-2 shrink-0">
            {loading && (
              <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            )}
            {query && (
              <button
                onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Limpar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:flex items-center text-xs text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 font-mono leading-none">
              esc
            </kbd>
          </div>
        </div>

        {/* ── Results body ────────────────────────────────────────────── */}
        <div ref={listRef} className="overflow-y-auto flex-1">

          {/* Empty prompt */}
          {query.trim().length === 0 && (
            <div className="px-5 py-10 text-center space-y-1">
              <p className="text-sm text-slate-500">Escreva para pesquisar</p>
              <p className="text-xs text-slate-400">catecúmenos, catequistas ou encarregados</p>
            </div>
          )}

          {/* Too short */}
          {query.trim().length === 1 && (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              Pelo menos 2 caracteres...
            </div>
          )}

          {/* No results */}
          {results && !loading && !hasResults && query.trim().length >= 2 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-500">
                Sem resultados para <span className="font-medium text-slate-700">&ldquo;{query}&rdquo;</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">Verifique a ortografia ou tente um nome diferente</p>
            </div>
          )}

          {/* ── Catecúmenos section ──────────────────────────────────── */}
          {catecumenos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 pt-4 pb-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Catecúmenos ({catecumenos.length})
                </span>
              </div>
              {catecumenos.map((c) => {
                itemIdx++;
                const idx = itemIdx;
                const isActive = idx === activeIdx;
                return (
                  <a
                    key={c.name}
                    href={`/portal/catecumeno/?nome=${encodeURIComponent(c.name)}`}
                    data-nav-item
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900 truncate">{c.name}</span>
                        {c.found_via === 'encarregado' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                            via encarregado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {c.fase && <PhaseChip fase={c.fase} />}
                        {c.turma && (
                          <span className="text-xs text-slate-500 truncate">{c.turma}</span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-300'}`} />
                  </a>
                );
              })}
            </div>
          )}

          {/* ── Catequistas section ──────────────────────────────────── */}
          {catequistas.length > 0 && (
            <div className={catecumenos.length > 0 ? 'border-t border-slate-100 mt-1' : ''}>
              <div className="flex items-center gap-2 px-4 pt-4 pb-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Catequistas ({catequistas.length})
                </span>
              </div>
              {catequistas.map((c, i) => {
                itemIdx++;
                const idx = itemIdx;
                const isActive = idx === activeIdx;
                return (
                  <a
                    key={i}
                    href={`/portal/turma/?nome=${encodeURIComponent(c.turma)}`}
                    data-nav-item
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold shrink-0">
                      {(c.catequista || 'C').charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {[c.catequista, c.catequista_adj].filter(Boolean).join(' & ')}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {c.fase && <PhaseChip fase={c.fase} />}
                        <span className="text-xs text-slate-500 truncate">{c.turma}</span>
                        {c.local && <span className="text-xs text-slate-400 truncate">{c.local}</span>}
                      </div>
                    </div>

                    <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-300'}`} />
                  </a>
                );
              })}
            </div>
          )}

          {/* Bottom padding */}
          {hasResults && <div className="h-2" />}
        </div>

        {/* ── Footer hints ────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400 bg-slate-50/60">
          <span><kbd className="font-mono bg-white border border-slate-200 px-1 rounded">↑↓</kbd> navegar</span>
          <span><kbd className="font-mono bg-white border border-slate-200 px-1 rounded">↵</kbd> abrir</span>
          <span><kbd className="font-mono bg-white border border-slate-200 px-1 rounded">esc</kbd> fechar</span>
          <a
            href="/portal/pesquisa/"
            className="ml-auto text-blue-600 hover:text-blue-800 hover:underline transition-colors"
          >
            Pesquisa completa →
          </a>
        </div>
      </div>
    </div>
  );
}

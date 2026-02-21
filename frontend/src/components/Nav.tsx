'use client';

import { usePathname } from 'next/navigation';
import { Church, Menu, X, Search } from 'lucide-react';
import { useState } from 'react';

const links = [
  { href: '/', label: 'Início' },
  { href: '/turmas', label: 'Turmas' },
  { href: '/catecumenos', label: 'Catecúmenos' },
  { href: '/pesquisa', label: 'Pesquisa' },
  { href: '/aniversarios', label: 'Aniversários' },
];

function toHref(path: string) {
  return `/portal${path === '/' ? '/' : path + '/'}`;
}

function openSearch() {
  window.dispatchEvent(new CustomEvent('open-search'));
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const short = process.env.NEXT_PUBLIC_PARISH_SHORT || 'PNSA';

  return (
    <nav className="bg-navy-900 sticky top-0 z-50 shadow-warm-md">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-3">

          {/* Logo */}
          <a href="/portal/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 rounded-lg bg-gold-500 flex items-center justify-center shadow-sm group-hover:bg-gold-400 transition-colors">
              <Church className="w-4 h-4 text-navy-900" />
            </div>
            <span className="font-display font-semibold text-white tracking-wide">{short}</span>
            <span className="text-white/40 text-sm hidden sm:block">Portal de Catequese</span>
          </a>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5 flex-1">
            {links.map((l) => {
              const isActive = pathname === l.href || pathname === l.href + '/';
              return (
                <a
                  key={l.href}
                  href={toHref(l.href)}
                  className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {l.label}
                  {isActive && (
                    <span className="absolute bottom-1 left-3.5 right-3.5 h-0.5 bg-gold-500 rounded-full" />
                  )}
                </a>
              );
            })}
          </div>

          {/* Search button */}
          <button
            onClick={openSearch}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 bg-white/8 border border-white/10 hover:bg-white/12 hover:text-white transition-all shrink-0"
            aria-label="Pesquisar"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:block text-xs">Pesquisar</span>
            <kbd className="hidden md:flex items-center text-[10px] text-white/40 bg-white/10 border border-white/10 rounded px-1.5 py-0.5 font-mono leading-none">
              Ctrl K
            </kbd>
          </button>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/8 transition-colors"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-white/10 py-2 animate-fade-in">
            {links.map((l) => {
              const isActive = pathname === l.href || pathname === l.href + '/';
              return (
                <a
                  key={l.href}
                  href={toHref(l.href)}
                  onClick={() => setOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg mx-1 transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {isActive && <span className="w-1 h-1 rounded-full bg-gold-400 mr-2.5" />}
                  {l.label}
                </a>
              );
            })}
            <button
              onClick={() => { setOpen(false); openSearch(); }}
              className="w-full text-left px-4 py-3 text-sm font-medium rounded-lg mx-1 text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
            >
              <Search className="w-4 h-4" />
              Pesquisar
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import { Menu, X, Search } from 'lucide-react';
import { useState } from 'react';

const links = [
  { href: '/', label: 'Início' },
  { href: '/catecumenos', label: 'Catecúmenos' },
  { href: '/turmas', label: 'Turmas' },
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
    <nav className="bg-white sticky top-0 z-50 border-b border-cream-200 shadow-warm-xs">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-3">

          {/* Logo */}
          <a href="/portal/" className="flex items-center gap-2.5 shrink-0 group">
            <img
              src="/files/20.png"
              alt={short}
              className="w-8 h-8 rounded-lg object-contain"
            />
            <span className="font-display font-bold text-navy-900 tracking-wide">{short}</span>
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
                      ? 'text-navy-900'
                      : 'text-navy-600 hover:text-navy-900 hover:bg-cream-100'
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-navy-700 bg-cream-100 border border-cream-200 hover:bg-cream-200 hover:text-navy-900 transition-all shrink-0"
            aria-label="Pesquisar"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:block text-xs">Pesquisar</span>
            <kbd className="hidden md:flex items-center text-[10px] text-navy-900/40 bg-white border border-cream-300 rounded px-1.5 py-0.5 font-mono leading-none">
              Ctrl K
            </kbd>
          </button>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-navy-700 hover:text-navy-900 hover:bg-cream-100 transition-colors"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-cream-200 py-2 animate-fade-in">
            {links.map((l) => {
              const isActive = pathname === l.href || pathname === l.href + '/';
              return (
                <a
                  key={l.href}
                  href={toHref(l.href)}
                  onClick={() => setOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg mx-1 transition-colors ${
                    isActive
                      ? 'bg-cream-100 text-navy-900'
                      : 'text-navy-600 hover:text-navy-900 hover:bg-cream-50'
                  }`}
                >
                  {isActive && <span className="w-1 h-1 rounded-full bg-gold-500 mr-2.5" />}
                  {l.label}
                </a>
              );
            })}
            <button
              onClick={() => { setOpen(false); openSearch(); }}
              className="w-full text-left px-4 py-3 text-sm font-medium rounded-lg mx-1 text-navy-600 hover:text-navy-900 hover:bg-cream-50 flex items-center gap-2 transition-colors"
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

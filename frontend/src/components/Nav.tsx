'use client';

import { usePathname } from 'next/navigation';
import { Church, Menu, X } from 'lucide-react';
import { useState } from 'react';

const links = [
  { href: '/', label: 'Início' },
  { href: '/turmas', label: 'Turmas' },
  { href: '/pesquisa', label: 'Pesquisa' },
  { href: '/aniversarios', label: 'Aniversários' },
];

function toHref(path: string) {
  // Prepend basePath and ensure trailing slash (trailingSlash: true in next.config)
  return `/portal${path === '/' ? '/' : path + '/'}`;
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const short = process.env.NEXT_PUBLIC_PARISH_SHORT || 'PNSA';

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/portal/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-800 flex items-center justify-center">
              <Church className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">{short}</span>
            <span className="text-slate-400 text-sm hidden sm:block">Portal de Catequese</span>
          </a>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={toHref(l.href)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === l.href || pathname === l.href + '/'
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-50"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-slate-100 py-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={toHref(l.href)}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 text-sm font-medium rounded-lg mx-1 transition-colors ${
                  pathname === l.href || pathname === l.href + '/'
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

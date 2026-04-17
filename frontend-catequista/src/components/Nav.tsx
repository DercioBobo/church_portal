'use client';

import { LogOut, User, ChevronDown, Cake, Home, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { logout } from '@/lib/api';

interface NavProps {
  catequistaNome?: string;
  birthdayCount?: number;
  onAniversariantes?: () => void;
}

export default function Nav({ catequistaNome, birthdayCount = 0, onAniversariantes }: NavProps) {
  const short = process.env.NEXT_PUBLIC_PARISH_SHORT || 'PNSA';
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    window.location.href = '/catequista/login/';
  }

  return (
    <>
      <nav className="bg-navy-900 sticky top-0 z-50 shadow-warm-md">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14 gap-3">

            {/* Logo */}
            <a href="/catequista/" className="flex items-center gap-2.5 shrink-0 group">
              <img
                src="/files/20.png"
                alt={short}
                className="w-7 h-7 rounded-md object-contain opacity-90 group-hover:opacity-100 transition-opacity"
              />
              <span className="font-display font-bold text-white tracking-wide text-sm">{short}</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-widest bg-gold-500/20 text-gold-300 uppercase">
                Catequista
              </span>
            </a>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1 flex-1">
              <NavLink href="/catequista/" label="Início" />
              <NavLink href="/catequista/quotas/" label="Quotas" />
              <NavLink href="/catequista/perfil/" label="Perfil" />
              {onAniversariantes && (
                <button
                  onClick={onAniversariantes}
                  className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all"
                >
                  <Cake className="w-4 h-4" />
                  Aniversariantes
                  {birthdayCount > 0 && (
                    <span className="ml-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-amber-400 text-navy-900 text-[9px] font-bold inline-flex items-center justify-center leading-none">
                      {birthdayCount > 9 ? '9+' : birthdayCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Mobile: birthday icon (top-nav only, since bottom bar has the main nav tabs) */}
              {onAniversariantes && (
                <button
                  onClick={onAniversariantes}
                  className="relative md:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Aniversariantes"
                >
                  <Cake className="w-5 h-5" />
                  {birthdayCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 text-navy-900 text-[8px] font-bold flex items-center justify-center leading-none">
                      {birthdayCount > 9 ? '9+' : birthdayCount}
                    </span>
                  )}
                </button>
              )}

              {/* User menu */}
              {catequistaNome && (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <div className="w-7 h-7 rounded-full bg-gold-500/30 flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5 text-gold-300" />
                    </div>
                    <span className="hidden sm:block font-medium max-w-[140px] truncate">
                      {catequistaNome.split(' ')[0]}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60 hidden sm:block" />
                  </button>

                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-warm-md border border-cream-200 py-1 z-50 animate-fade-in">
                        <div className="px-4 py-2.5 border-b border-cream-200">
                          <p className="text-xs text-slate-400 font-medium">Sessão activa</p>
                          <p className="text-sm font-semibold text-navy-900 truncate">{catequistaNome}</p>
                        </div>
                        <a
                          href="/catequista/perfil/"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-cream-50 hover:text-navy-900 transition-colors"
                          onClick={() => setMenuOpen(false)}
                        >
                          <User className="w-4 h-4 text-slate-400" />
                          Perfil e senha
                        </a>
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Terminar sessão
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Mobile: logout only if no user menu visible */}
            {!catequistaNome && (
              <button
                onClick={handleLogout}
                className="md:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <MobileTabBar />
    </>
  );
}

function MobileTabBar() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';

  const tabs = [
    {
      href: '/catequista/',
      Icon: Home,
      label: 'Início',
      active: path === '/catequista/' || path === '/catequista',
    },
    {
      href: '/catequista/quotas/',
      Icon: CreditCard,
      label: 'Quotas',
      active: path.startsWith('/catequista/quotas'),
    },
    {
      href: '/catequista/perfil/',
      Icon: User,
      label: 'Perfil',
      active: path.startsWith('/catequista/perfil'),
    },
  ];

  return (
    <div
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-sm border-t border-cream-200 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch h-16">
        {tabs.map(({ href, Icon, label, active }) => (
          <a
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? 'text-navy-900' : 'text-slate-400'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${active ? 'bg-navy-900/8' : ''}`}>
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
            </div>
            <span className={`text-[10px] font-semibold tracking-wide ${active ? 'text-navy-900' : 'text-slate-400'}`}>
              {label}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  const isActive = typeof window !== 'undefined' &&
    (window.location.pathname === href || window.location.pathname === href.replace(/\/$/, ''));
  return (
    <a
      href={href}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        isActive
          ? 'text-white bg-white/10'
          : 'text-white/60 hover:text-white hover:bg-white/10'
      }`}
    >
      {label}
    </a>
  );
}

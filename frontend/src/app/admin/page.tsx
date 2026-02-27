'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Search, Cake, FileText, ClipboardList,
  Star, Users, Calendar,
  ChevronUp, ChevronDown, Save, ArrowLeft, Check, X,
} from 'lucide-react';

import { api } from '@/lib/api';
import type { NavItem } from '@/types/catequese';

// ── Master nav item registry ───────────────────────────────────────────────────
// To add a future item: add it here and deploy. Admin can then toggle it on/off.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, any> = {
  BookOpen, Search, Cake, FileText, ClipboardList, Star, Users, Calendar,
};

const MASTER_NAV_ITEMS: NavItem[] = [
  { key: 'turmas',       label: 'Turmas',       descricao: 'Ver todas as turmas',     icon: 'BookOpen',     url: '/turmas/',       visible: true, ordem: 1 },
  { key: 'pesquisa',     label: 'Pesquisa',     descricao: 'Busca por nome completo', icon: 'Search',       url: '/pesquisa/',     visible: true, ordem: 2 },
  { key: 'aniversarios', label: 'Aniversários', descricao: 'Hoje e esta semana',      icon: 'Cake',         url: '/aniversarios/', visible: true, ordem: 3 },
  // Future items — add here and they become available in admin to toggle
  // { key: 'pautas',    label: 'Pautas',        descricao: 'Pautas de catequese',     icon: 'FileText',     url: '/pautas/',       visible: false, ordem: 4 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function mergeWithStored(stored: NavItem[]): NavItem[] {
  const storedMap = new Map(stored.map(s => [s.key, s]));

  // Apply stored visible + ordem to each MASTER item (labels/icons/urls stay canonical)
  const merged = MASTER_NAV_ITEMS.map(master => {
    const s = storedMap.get(master.key);
    return s ? { ...master, visible: s.visible, ordem: s.ordem } : { ...master };
  });

  merged.sort((a, b) => a.ordem - b.ordem);
  return merged.map((item, idx) => ({ ...item, ordem: idx + 1 }));
}

function reorder(items: NavItem[]): NavItem[] {
  return items.map((item, idx) => ({ ...item, ordem: idx + 1 }));
}

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-navy-900' : 'bg-slate-300'
      }`}
      aria-checked={checked}
      role="switch"
      aria-label="Visível na página principal"
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error';
function Toast({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-warm-md text-sm font-medium animate-fade-in ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Admin page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    api.getPortalConfig()
      .then(cfg => {
        const stored = cfg?.nav_items ?? [];
        setItems(mergeWithStored(stored));
      })
      .catch(() => setItems(mergeWithStored([])))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (idx: number, visible: boolean) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, visible } : it));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setItems(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return reorder(next);
    });
  };

  const moveDown = (idx: number) => {
    setItems(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return reorder(next);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.savePortalConfig(reorder(items));
      setToast({ message: 'Configuração guardada com sucesso.', type: 'success' });
    } catch {
      setToast({ message: 'Erro ao guardar. Tente novamente.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 py-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a
            href="/portal/"
            className="p-2 rounded-xl hover:bg-cream-100 text-slate-500 hover:text-navy-900 transition-colors"
            title="Voltar ao portal"
          >
            <ArrowLeft className="w-4 h-4" />
          </a>
          <div>
            <h1 className="text-xl font-bold text-navy-900 font-display">Configuração do Portal</h1>
            <p className="text-xs text-slate-500 mt-0.5">Gerir visibilidade e ordem do acesso rápido</p>
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-navy-900 text-gold-400 rounded-xl hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-warm-xs"
        >
          <Save className="w-4 h-4" />
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </div>

      {/* Nav items */}
      <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-cream-200 bg-cream-50/60">
          <span className="text-xs font-bold text-navy-900/50 uppercase tracking-widest">
            Itens de acesso rápido
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            <div className="w-5 h-5 border-2 border-cream-300 border-t-navy-900 rounded-full animate-spin mr-3" />
            A carregar…
          </div>
        ) : (
          <ul className="divide-y divide-cream-200">
            {items.map((item, idx) => {
              const Icon = ICON_MAP[item.icon] ?? BookOpen;
              return (
                <li
                  key={item.key}
                  className={`flex items-center gap-3 px-5 py-4 transition-colors ${
                    item.visible ? '' : 'opacity-50'
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    item.visible ? 'bg-navy-900 text-gold-400' : 'bg-slate-200 text-slate-400'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-navy-900 truncate">{item.label}</div>
                    <div className="text-xs text-slate-500 truncate">{item.descricao}</div>
                  </div>

                  {/* Reorder */}
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-navy-900 disabled:opacity-20 disabled:cursor-default transition-colors"
                      title="Mover para cima"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(idx)}
                      disabled={idx === items.length - 1}
                      className="p-1 text-slate-400 hover:text-navy-900 disabled:opacity-20 disabled:cursor-default transition-colors"
                      title="Mover para baixo"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Toggle */}
                  <Toggle checked={item.visible} onChange={v => toggle(idx, v)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center px-4">
        Alterne a visibilidade e reordene os itens. Guarde para aplicar as alterações na página principal.
      </p>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
    </div>
  );
}

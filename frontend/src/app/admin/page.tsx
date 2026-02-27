'use client';

import { useEffect, useState } from 'react';
import {
  BookOpen, Search, Cake, FileText, ClipboardList,
  Star, Users, Calendar, Church, ChevronRight,
  ChevronUp, ChevronDown, Trash2, Plus, X, Check,
  Save, ArrowLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { NavItem } from '@/types/catequese';

// ── Icon registry ──────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen, Search, Cake, FileText, ClipboardList,
  Star, Users, Calendar, Church, ChevronRight,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { key: 'turmas',       label: 'Turmas',       descricao: 'Ver todas as turmas',     icon: 'BookOpen',  url: '/turmas/',       visible: true, ordem: 1 },
  { key: 'pesquisa',     label: 'Pesquisa',     descricao: 'Busca por nome completo', icon: 'Search',    url: '/pesquisa/',     visible: true, ordem: 2 },
  { key: 'aniversarios', label: 'Aniversários', descricao: 'Hoje e esta semana',      icon: 'Cake',      url: '/aniversarios/', visible: true, ordem: 3 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function reorder(items: NavItem[]): NavItem[] {
  return items.map((item, idx) => ({ ...item, ordem: idx + 1 }));
}

function uniqueKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
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
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
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

// ── Add Item Form ─────────────────────────────────────────────────────────────
interface NewItemDraft {
  label: string;
  descricao: string;
  icon: string;
  url: string;
}

function AddItemForm({ onAdd, onCancel }: { onAdd: (item: NavItem) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<NewItemDraft>({ label: '', descricao: '', icon: 'BookOpen', url: '' });

  const set = (k: keyof NewItemDraft, v: string) => setDraft(d => ({ ...d, [k]: v }));

  const handleAdd = () => {
    if (!draft.label.trim() || !draft.url.trim()) return;
    const url = draft.url.startsWith('/') ? draft.url : '/' + draft.url;
    const finalUrl = url.endsWith('/') ? url : url + '/';
    onAdd({
      key: uniqueKey(draft.label),
      label: draft.label.trim(),
      descricao: draft.descricao.trim(),
      icon: draft.icon,
      url: finalUrl,
      visible: true,
      ordem: 999,
    });
  };

  const IconPreview = ICON_MAP[draft.icon] ?? BookOpen;

  return (
    <div className="mt-4 p-4 bg-cream-50 rounded-2xl border border-cream-300 space-y-3">
      <h3 className="text-xs font-bold text-navy-900/50 uppercase tracking-widest">Novo item</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Label *</label>
          <input
            type="text"
            value={draft.label}
            onChange={e => set('label', e.target.value)}
            placeholder="ex: Pautas"
            className="w-full px-3 py-2 text-sm border border-cream-300 rounded-xl bg-white focus:outline-none focus:border-navy-700"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
          <input
            type="text"
            value={draft.descricao}
            onChange={e => set('descricao', e.target.value)}
            placeholder="ex: Pautas de catequese"
            className="w-full px-3 py-2 text-sm border border-cream-300 rounded-xl bg-white focus:outline-none focus:border-navy-700"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">URL (relativa ao portal) *</label>
          <input
            type="text"
            value={draft.url}
            onChange={e => set('url', e.target.value)}
            placeholder="ex: /pautas/"
            className="w-full px-3 py-2 text-sm border border-cream-300 rounded-xl bg-white focus:outline-none focus:border-navy-700"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Ícone</label>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-navy-900 flex items-center justify-center text-gold-400 shrink-0">
              <IconPreview className="w-4 h-4" />
            </div>
            <select
              value={draft.icon}
              onChange={e => set('icon', e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-cream-300 rounded-xl bg-white focus:outline-none focus:border-navy-700"
            >
              {ICON_OPTIONS.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 rounded-xl hover:bg-cream-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draft.label.trim() || !draft.url.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-navy-900 text-gold-400 rounded-xl hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>
    </div>
  );
}

// ── Admin page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  useEffect(() => {
    api.getPortalConfig()
      .then(cfg => setItems(cfg?.nav_items?.length ? cfg.nav_items : DEFAULT_NAV_ITEMS))
      .catch(() => setItems(DEFAULT_NAV_ITEMS))
      .finally(() => setLoading(false));
  }, []);

  const update = (idx: number, patch: Partial<NavItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
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

  const deleteItem = (idx: number) => {
    setItems(prev => reorder(prev.filter((_, i) => i !== idx)));
  };

  const addItem = (item: NavItem) => {
    setItems(prev => reorder([...prev, item]));
    setShowAddForm(false);
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
    <div className="max-w-2xl mx-auto space-y-6 py-6">

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
            <p className="text-xs text-slate-500 mt-0.5">Gerir itens de acesso rápido na página principal</p>
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
            Itens de navegação ({items.length})
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            <div className="w-5 h-5 border-2 border-cream-300 border-t-navy-900 rounded-full animate-spin mr-3" />
            A carregar…
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400 italic">
            Nenhum item de navegação. Adicione um abaixo.
          </div>
        ) : (
          <ul className="divide-y divide-cream-200">
            {items.map((item, idx) => {
              const Icon = ICON_MAP[item.icon] ?? ChevronRight;
              return (
                <li key={item.key} className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${item.visible ? '' : 'opacity-50'}`}>
                  {/* Icon preview */}
                  <div className="w-9 h-9 rounded-xl bg-navy-900 flex items-center justify-center text-gold-400 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-navy-900 truncate">{item.label}</div>
                    <div className="text-xs text-slate-500 truncate">{item.descricao}</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">/portal{item.url}</div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle checked={item.visible} onChange={v => update(idx, { visible: v })} />

                    <div className="flex flex-col">
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

                    <button
                      type="button"
                      onClick={() => deleteItem(idx)}
                      className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      title="Eliminar item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add item */}
      {showAddForm ? (
        <AddItemForm onAdd={addItem} onCancel={() => setShowAddForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-cream-400 rounded-2xl text-sm text-slate-500 hover:text-navy-900 hover:border-navy-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar item
        </button>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

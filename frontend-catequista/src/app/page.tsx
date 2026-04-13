'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  MapPin, Clock, Calendar, Users, Search, X,
  Save, BookOpen, Cake, AlertCircle, ChevronRight,
} from 'lucide-react';
import Nav from '@/components/Nav';
import PhaseChip from '@/components/PhaseChip';
import { FullPageLoading } from '@/components/Loading';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api } from '@/lib/api';
import type { TurmaComCatecumenos, CatecumenoCompleto, FieldConfigItem } from '@/types/catequista';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(dob: string | null, stored: number | null): number | null {
  if (dob) {
    const born = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - born.getFullYear();
    const m = today.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
    return age;
  }
  return stored;
}

function isBirthdaySoon(dob: string | null): boolean {
  if (!dob) return false;
  const born = new Date(dob);
  const today = new Date();
  const next = new Date(today.getFullYear(), born.getMonth(), born.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  const diff = (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 7;
}

function isBirthdayToday(dob: string | null): boolean {
  if (!dob) return false;
  const born = new Date(dob);
  const today = new Date();
  return born.getMonth() === today.getMonth() && born.getDate() === today.getDate();
}

function formatDate(val: string | null): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return val;
  }
}

function getCatValue(cat: CatecumenoCompleto, fieldname: string): unknown {
  return (cat as unknown as Record<string, unknown>)[fieldname];
}

// ── Column width mapping ──────────────────────────────────────────────────────

const COL_WIDTHS: Record<string, string> = {
  xs: '3rem',
  sm: '6rem',
  md: '10rem',
  lg: '1fr',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TurmaHeader({ turma }: { turma: TurmaComCatecumenos }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs overflow-hidden animate-fade-up">
      <div className={`h-1.5 w-full ${phaseStripe(turma.fase)}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PhaseChip fase={turma.fase} />
              {turma.ano_lectivo && (
                <span className="text-xs text-slate-400">{turma.ano_lectivo}</span>
              )}
            </div>
            <h2 className="font-display font-bold text-navy-900 text-lg">{turma.name}</h2>
          </div>
          <div className="flex items-center gap-1.5 bg-cream-100 px-3 py-1.5 rounded-full shrink-0">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">
              {turma.total_catecumenos} catecúmenos
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-slate-500">
          {turma.local && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              {turma.local}
            </span>
          )}
          {turma.dia && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              {turma.dia}
            </span>
          )}
          {turma.hora && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              {turma.hora}
            </span>
          )}
        </div>
        {turma.catequista_adj && (
          <p className="mt-2 text-xs text-slate-400">
            Catequista adj.: <span className="text-slate-600">{turma.catequista_adj}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function phaseStripe(fase: string): string {
  const map: Record<string, string> = {
    '1ª Fase':          'bg-sky-400',
    '2ª Fase':          'bg-violet-400',
    '3ª Fase':          'bg-amber-400',
    'Pré-Catecumenato': 'bg-emerald-400',
    'Catecumenato':     'bg-rose-400',
  };
  return map[fase] ?? 'bg-gold-400';
}

// ── Field rendering helpers ───────────────────────────────────────────────────

function renderCellValue(cat: CatecumenoCompleto, field: FieldConfigItem): React.ReactNode {
  const val = getCatValue(cat, field.fieldname);

  if (field.fieldname === 'name') {
    const bday = isBirthdayToday(cat.data_de_nascimento);
    const bdaySoon = !bday && isBirthdaySoon(cat.data_de_nascimento);
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        {bday && <span title="Aniversário hoje!"><Cake className="w-3.5 h-3.5 text-amber-500 shrink-0" /></span>}
        {bdaySoon && <span title="Aniversário esta semana"><Cake className="w-3.5 h-3.5 text-amber-300 shrink-0" /></span>}
        <span className="text-sm font-medium text-navy-900 truncate">{String(val ?? '')}</span>
      </div>
    );
  }

  if (field.fieldname === 'total_presencas') {
    return <span className="text-sm font-semibold text-emerald-700">{String(val ?? 0)}</span>;
  }

  if (field.fieldname === 'total_faltas') {
    return <span className="text-sm font-semibold text-rose-600">{String(val ?? 0)}</span>;
  }

  if (field.fieldname === 'idade') {
    const age = calcAge(cat.data_de_nascimento, cat.idade);
    return <span className="text-sm text-slate-500">{age !== null ? age : '—'}</span>;
  }

  if (field.fieldtype === 'Date') {
    return <span className="text-sm text-slate-500">{formatDate(val as string | null)}</span>;
  }

  if (field.fieldtype === 'Check') {
    return <span className="text-sm text-slate-500">{val ? 'Sim' : 'Não'}</span>;
  }

  return (
    <span className="text-sm text-slate-500 truncate">
      {val !== null && val !== undefined && String(val) !== '' ? String(val) : '—'}
    </span>
  );
}

function renderPanelValue(cat: CatecumenoCompleto, field: FieldConfigItem): string {
  const val = getCatValue(cat, field.fieldname);

  if (field.fieldname === 'idade') {
    const age = calcAge(cat.data_de_nascimento, cat.idade);
    return age !== null ? String(age) : '—';
  }
  if (field.fieldtype === 'Date') return formatDate(val as string | null);
  if (field.fieldtype === 'Check') return val ? 'Sim' : 'Não';
  if (field.fieldname === 'sexo') return val === 'M' ? 'Masculino' : val === 'F' ? 'Feminino' : (val as string) || '—';
  if (val !== null && val !== undefined && String(val) !== '') return String(val);
  return '—';
}

// ── Field input ───────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-lg border border-cream-300 bg-cream-50 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all';

interface FieldInputProps {
  field: FieldConfigItem;
  value: string | number;
  onChange: (v: string | number) => void;
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
  if (field.fieldtype === 'Select' && field.options) {
    const opts = field.options.split('\n').filter(Boolean);
    const labelOf = (o: string) => o === 'M' ? 'Masculino' : o === 'F' ? 'Feminino' : o;
    return (
      <select value={String(value ?? '')} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {opts.map(o => <option key={o} value={o}>{labelOf(o)}</option>)}
      </select>
    );
  }

  if (field.fieldtype === 'Int' || field.fieldtype === 'Float') {
    const num = typeof value === 'number' ? value : (parseInt(String(value), 10) || 0);
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, num - 1))}
          className="w-8 h-8 rounded-lg bg-cream-100 hover:bg-cream-200 text-navy-900 font-bold text-sm transition-colors shrink-0"
        >−</button>
        <input
          type="number"
          min={0}
          value={num}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
          className={`flex-1 text-center ${inputCls}`}
        />
        <button
          type="button"
          onClick={() => onChange(num + 1)}
          className="w-8 h-8 rounded-lg bg-cream-100 hover:bg-cream-200 text-navy-900 font-bold text-sm transition-colors shrink-0"
        >+</button>
      </div>
    );
  }

  if (field.fieldtype === 'Date') {
    return (
      <input
        type="date"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }

  if (['Text', 'Small Text', 'Long Text'].includes(field.fieldtype)) {
    return (
      <textarea
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className={`${inputCls} resize-none`}
      />
    );
  }

  const inputType =
    field.fieldname.includes('contacto') || field.fieldname.includes('phone') || field.fieldname.includes('tel')
      ? 'tel'
      : 'text';
  return (
    <input
      type={inputType}
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

// ── Side Panel ────────────────────────────────────────────────────────────────

interface SidePanelProps {
  open: boolean;
  cat: CatecumenoCompleto | null;
  fieldConfig: FieldConfigItem[];
  onClose: () => void;
  onSaved: (updated: CatecumenoCompleto) => void;
}

function SidePanel({ open, cat, fieldConfig, onClose, onSaved }: SidePanelProps) {
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset form when a new catecumeno is opened
  useEffect(() => {
    if (!cat) return;
    const initial: Record<string, string | number> = {};
    fieldConfig.forEach(f => {
      if (!f.editable) return;
      const raw = getCatValue(cat, f.fieldname);
      if (f.fieldtype === 'Int' || f.fieldtype === 'Float') {
        initial[f.fieldname] = raw !== null && raw !== undefined ? Number(raw) : 0;
      } else {
        initial[f.fieldname] = raw !== null && raw !== undefined ? String(raw) : '';
      }
    });
    setForm(initial);
    setError('');
  }, [cat, fieldConfig]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const panelFields = useMemo(
    () => fieldConfig.filter(f => f.show_in_panel && f.fieldname !== 'name'),
    [fieldConfig],
  );

  // Group by section, preserving order of first appearance
  const sections = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, FieldConfigItem[]> = {};
    panelFields.forEach(f => {
      const sec = f.panel_section || 'Informações';
      if (!map[sec]) { map[sec] = []; order.push(sec); }
      map[sec].push(f);
    });
    return order.map(sec => ({ title: sec, fields: map[sec] }));
  }, [panelFields]);

  async function handleSave() {
    if (!cat) return;
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, string | number | null | undefined> = {
        row_name: cat.row_name,
      };
      fieldConfig.filter(f => f.editable).forEach(f => {
        payload[f.fieldname] = form[f.fieldname] ?? null;
      });

      await api.atualizarCatecumeno(cat.name, payload);

      // Build updated catecumeno for optimistic update
      const updated: CatecumenoCompleto = { ...cat };
      fieldConfig.filter(f => f.editable).forEach(f => {
        (updated as unknown as Record<string, unknown>)[f.fieldname] = form[f.fieldname] ?? null;
      });

      onSaved(updated);
    } catch (e) {
      setError(String((e as Error).message || e));
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-navy-900/40 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel — right drawer on desktop, bottom sheet on mobile */}
      <div
        className={[
          'fixed z-50 bg-white shadow-2xl flex flex-col overflow-hidden',
          'transition-transform duration-300 ease-in-out',
          // Mobile: bottom sheet
          'inset-x-0 bottom-0 h-[90dvh] rounded-t-2xl',
          // Desktop: right drawer
          'md:inset-y-0 md:right-0 md:bottom-auto md:h-auto md:w-96 md:rounded-none md:inset-x-auto',
          open
            ? 'translate-y-0 md:translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full',
        ].join(' ')}
      >
        {cat && (
          <>
            {/* Drag handle (mobile only) */}
            <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-cream-300" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-cream-200 shrink-0">
              <div className="min-w-0 pr-3">
                <h3 className="font-display font-bold text-navy-900 text-base leading-tight truncate">
                  {cat.name}
                </h3>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <PhaseChip fase={cat.fase} />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    cat.status === 'Activo'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-cream-200 text-slate-600'
                  }`}>
                    {cat.status}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-navy-900 hover:bg-cream-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
              {sections.map(section => (
                <div key={section.title}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    {section.title}
                  </p>
                  <div className="space-y-3">
                    {section.fields.map(field => (
                      <div key={field.fieldname}>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          {field.label}
                        </label>
                        {field.editable ? (
                          <FieldInput
                            field={field}
                            value={form[field.fieldname] ?? ''}
                            onChange={v => setForm(f => ({ ...f, [field.fieldname]: v }))}
                          />
                        ) : (
                          <p className="text-sm text-navy-900 bg-cream-50 rounded-lg px-3 py-2 border border-cream-200">
                            {renderPanelValue(cat, field)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-cream-200 shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-cream-100 transition-colors"
              >
                Fechar
              </button>
              {fieldConfig.some(f => f.editable) && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 disabled:opacity-50 transition-all"
                >
                  {saving ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saving ? 'A guardar...' : 'Guardar'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Catecumenos Table ─────────────────────────────────────────────────────────

interface TableProps {
  catecumenos: CatecumenoCompleto[];
  fieldConfig: FieldConfigItem[];
  onSelect: (cat: CatecumenoCompleto) => void;
}

function CatecumenosTable({ catecumenos, fieldConfig, onSelect }: TableProps) {
  const [query, setQuery] = useState('');

  const tableColumns = useMemo(
    () => fieldConfig.filter(f => f.show_in_table),
    [fieldConfig],
  );

  const filtered = catecumenos.filter(c => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.encarregado || '').toLowerCase().includes(q)
    );
  });

  const birthdays = catecumenos.filter(c => isBirthdaySoon(c.data_de_nascimento));

  // Build dynamic grid template for desktop header + rows
  const gridTemplate = [
    ...tableColumns.map(f => COL_WIDTHS[f.column_width] ?? '1fr'),
    '2rem', // action chevron
  ].join(' ');

  return (
    <div className="animate-fade-up-1">
      {/* Birthday banner */}
      {birthdays.length > 0 && (
        <div className="mb-4 flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Cake className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>
              {birthdays.filter(c => isBirthdayToday(c.data_de_nascimento)).length > 0 && 'Hoje: '}
              {birthdays.map(c => c.name.split(' ')[0]).join(', ')}
            </strong>
            {' '}
            {birthdays.length === 1 ? 'faz' : 'fazem'} anos esta semana.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Filtrar por nome ou encarregado..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cream-300 bg-white text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-slate-400 mb-2 px-0.5">
        {filtered.length} de {catecumenos.length} catecúmenos
      </p>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">Nenhum resultado.</p>
        ) : (
          <>
            {/* Desktop header */}
            {tableColumns.length > 0 && (
              <div
                className="hidden md:grid gap-2 px-4 py-2.5 border-b border-cream-200 bg-cream-50"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {tableColumns.map(f => (
                  <span key={f.fieldname} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                    {f.label}
                  </span>
                ))}
                <span />
              </div>
            )}

            {/* Rows */}
            <div className="divide-y divide-cream-200">
              {filtered.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => onSelect(cat)}
                  className="w-full text-left hover:bg-cream-50 transition-colors"
                >
                  {/* Desktop row */}
                  <div
                    className="hidden md:grid gap-2 items-center px-4 py-3"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    {tableColumns.map(f => (
                      <div key={f.fieldname} className="min-w-0 overflow-hidden">
                        {renderCellValue(cat, f)}
                      </div>
                    ))}
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>

                  {/* Mobile row */}
                  <div className="md:hidden flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isBirthdayToday(cat.data_de_nascimento) && (
                          <Cake className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        {!isBirthdayToday(cat.data_de_nascimento) && isBirthdaySoon(cat.data_de_nascimento) && (
                          <Cake className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-navy-900 truncate">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {cat.encarregado && (
                          <span className="text-xs text-slate-400 truncate max-w-[150px]">{cat.encarregado}</span>
                        )}
                        <span className="text-xs text-emerald-600 font-semibold">✓ {cat.total_presencas}</span>
                        <span className="text-xs text-rose-500 font-semibold">✗ {cat.total_faltas}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { loading: authLoading, auth } = useAuthGuard();
  const [turmas, setTurmas] = useState<TurmaComCatecumenos[]>([]);
  const [fieldConfig, setFieldConfig] = useState<FieldConfigItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [panel, setPanel] = useState<{ cat: CatecumenoCompleto; turmaIdx: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!auth) return;
    Promise.all([api.getMinhaTurma(), api.getFieldConfig()])
      .then(([data, config]) => {
        setTurmas(data);
        setFieldConfig(config);
        setDataLoading(false);
      })
      .catch(e => {
        setDataError(String(e.message || e));
        setDataLoading(false);
      });
  }, [auth]);

  const openPanel = useCallback((cat: CatecumenoCompleto, turmaIdx: number) => {
    setPanel({ cat, turmaIdx });
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    // Delay clearing cat so exit animation completes
    setTimeout(() => setPanel(null), 320);
  }, []);

  const handleSaved = useCallback((updated: CatecumenoCompleto) => {
    if (!panel) return;
    const { turmaIdx } = panel;
    setTurmas(prev => prev.map((t, i) => {
      if (i !== turmaIdx) return t;
      return {
        ...t,
        catecumenos: t.catecumenos.map(c => c.name === updated.name ? updated : c),
      };
    }));
    // Update panel to show fresh data
    setPanel(p => p ? { ...p, cat: updated } : null);
    setPanelOpen(false);
    setTimeout(() => setPanel(null), 320);
  }, [panel]);

  const retry = useCallback(() => {
    setDataLoading(true);
    setDataError('');
    Promise.all([api.getMinhaTurma(), api.getFieldConfig()])
      .then(([data, config]) => { setTurmas(data); setFieldConfig(config); })
      .catch(e => setDataError(String(e.message || e)))
      .finally(() => setDataLoading(false));
  }, []);

  if (authLoading) return <FullPageLoading />;

  return (
    <>
      <Nav catequistaNome={auth?.catequista} />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-6 animate-fade-up">
          <h1 className="font-display font-bold text-navy-900 text-2xl">
            Olá, {auth?.catequista.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {dataLoading && (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-cream-200 p-5 animate-pulse">
                <div className="h-4 bg-cream-200 rounded-full w-1/4 mb-3" />
                <div className="h-3 bg-cream-200 rounded-full w-1/2" />
              </div>
            ))}
          </div>
        )}

        {!dataLoading && dataError && (
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-5">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-800">Erro ao carregar dados</p>
              <p className="text-sm text-rose-600 mt-0.5">{dataError}</p>
              <button
                onClick={retry}
                className="mt-3 text-sm font-medium text-rose-700 underline underline-offset-2"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {!dataLoading && !dataError && turmas.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-display font-semibold">Sem turma activa</p>
            <p className="text-sm mt-1">Não foi encontrada nenhuma turma activa para este catequista.</p>
          </div>
        )}

        {/* Turmas */}
        {!dataLoading && !dataError && turmas.map((turma, turmaIdx) => (
          <div key={turma.name} className={turmaIdx > 0 ? 'mt-10' : ''}>
            {turmas.length > 1 && (
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-0.5">
                Turma {turmaIdx + 1}
              </p>
            )}
            <TurmaHeader turma={turma} />
            <div className="mt-5">
              <h3 className="font-display font-bold text-navy-900 text-base mb-3 px-0.5">
                Catecúmenos
              </h3>
              <CatecumenosTable
                catecumenos={turma.catecumenos}
                fieldConfig={fieldConfig}
                onSelect={cat => openPanel(cat, turmaIdx)}
              />
            </div>
          </div>
        ))}
      </main>

      {/* Side panel */}
      <SidePanel
        open={panelOpen}
        cat={panel?.cat ?? null}
        fieldConfig={fieldConfig}
        onClose={closePanel}
        onSaved={handleSaved}
      />

      <footer className="border-t border-cream-200 mt-16 py-8 text-center">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} {process.env.NEXT_PUBLIC_PARISH_NAME || 'PNSA'} — Portal do Catequista
        </p>
      </footer>
    </>
  );
}

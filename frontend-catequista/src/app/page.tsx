'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  MapPin, Clock, Calendar, Users, Search, X,
  Save, BookOpen, Cake, AlertCircle, ChevronLeft, ChevronRight, FileDown,
  ArrowUp, ArrowDown, ArrowUpDown,
  User, Heart, MessageSquare, Book, Star, Info, FileText, Pencil, Home, Shield, Phone,
} from 'lucide-react';
import Nav from '@/components/Nav';
import PhaseChip from '@/components/PhaseChip';
import { FullPageLoading } from '@/components/Loading';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api } from '@/lib/api';
import type { TurmaComCatecumenos, CatecumenoCompleto, FieldConfigItem, PortalSectionConfig, AvisoAtivo, RetiroProximo } from '@/types/catequista';

// ── Section icon map ──────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  User, Users, Heart, BookOpen, Book, MessageSquare,
  Calendar, MapPin, Phone, Star, Info, FileText, Pencil, Home, Shield,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(dob: string | null, stored: number | null): number | null {
  if (dob) {
    const born = new Date(dob);
    if (isNaN(born.getTime())) return stored;
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
  if (isNaN(born.getTime())) return false;
  const today = new Date();
  const next = new Date(today.getFullYear(), born.getMonth(), born.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  const diff = (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 7;
}

function isBirthdayToday(dob: string | null): boolean {
  if (!dob) return false;
  const born = new Date(dob);
  if (isNaN(born.getTime())) return false;
  const today = new Date();
  return born.getMonth() === today.getMonth() && born.getDate() === today.getDate();
}

function daysUntilBirthday(dob: string): number {
  const born = new Date(dob);
  if (isNaN(born.getTime())) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(today.getFullYear(), born.getMonth(), born.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function nextBirthdayDate(dob: string): string {
  const born = new Date(dob);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(today.getFullYear(), born.getMonth(), born.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
}

function formatDate(val: string | null): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return val;
  }
}

const INITIALS_PALETTE = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
];
function initialsColor(name: string): string {
  return INITIALS_PALETTE[(name.charCodeAt(0) || 65) % INITIALS_PALETTE.length];
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

const FRAPPE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || '';

function ProgramaButton({ programa }: { programa: { titulo?: string | null; ficheiro: string } }) {
  const url = FRAPPE_URL + programa.ficheiro;
  const label = programa.titulo || 'Programa da Fase';
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-700 bg-cream-100 hover:bg-cream-200 border border-cream-300 px-3 py-1.5 rounded-full transition-colors shrink-0"
      title={`Abrir: ${label}`}
    >
      <FileDown className="w-3.5 h-3.5 shrink-0" />
      {label}
    </a>
  );
}

const TURMA_FIELD_ICONS: Record<string, React.ReactNode> = {
  local: <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />,
  dia:   <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400" />,
  hora:  <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />,
};

function TurmaHeader({ turma, fieldConfig }: { turma: TurmaComCatecumenos; fieldConfig: FieldConfigItem[] }) {
  const headerFields = fieldConfig.filter(f => f.source === 'turma' && f.show_in_header);
  const turmaAny = turma as unknown as Record<string, unknown>;

  // Fields with known short icons render as inline chips; rest render as subtitle rows
  const chipFields = headerFields.filter(f => f.fieldname in TURMA_FIELD_ICONS);
  const subtitleFields = headerFields.filter(f => !(f.fieldname in TURMA_FIELD_ICONS));

  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs overflow-hidden animate-fade-up">
      <div className={`h-1.5 w-full ${phaseStripe(turma.fase)}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <PhaseChip fase={turma.fase} />
              {turma.ano_lectivo && (
                <span className="text-xs text-slate-400">{turma.ano_lectivo}</span>
              )}
            </div>
            <h2 className="font-display font-bold text-navy-900 text-lg">{turma.name}</h2>

            {/* Subtitle row — long-text turma fields (e.g. catecismo) */}
            {subtitleFields.map(f => {
              const val = turmaAny[f.fieldname];
              if (!val) return null;
              return (
                <div key={f.fieldname} className="flex items-center gap-1.5 mt-1.5">
                  <BookOpen className="w-3.5 h-3.5 shrink-0 text-gold-500" />
                  <span className="text-sm text-slate-600 font-medium leading-snug">{String(val)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-cream-100 px-3 py-1.5 rounded-full">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">
                {turma.total_catecumenos} catecúmenos
              </span>
            </div>
            {!!turma.programa && (
              <ProgramaButton programa={turma.programa as { titulo?: string | null; ficheiro: string }} />
            )}
          </div>
        </div>

        {/* Chip info bar — short fields with icons (local, dia, hora) */}
        {(chipFields.length > 0 || headerFields.length === 0) && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-slate-500">
            {chipFields.length > 0 ? chipFields.map(f => {
              const val = turmaAny[f.fieldname];
              if (!val) return null;
              return (
                <span key={f.fieldname} className="flex items-center gap-1.5">
                  {TURMA_FIELD_ICONS[f.fieldname]}
                  {String(val)}
                </span>
              );
            }) : (
              // Fallback when no config at all
              <>
                {turma.local && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />{turma.local}</span>}
                {turma.dia   && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400" />{turma.dia}</span>}
                {turma.hora  && <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />{turma.hora}</span>}
              </>
            )}
          </div>
        )}

        {turma.catequista_adj && (
          <p className="mt-2 text-xs text-slate-400">
            Catequista: <span className="text-slate-600">{turma.catequista_adj}</span>
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
        {bday && (
          <span title={`Aniversário hoje! · ${nextBirthdayDate(cat.data_de_nascimento!)}`}>
            <Cake className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          </span>
        )}
        {bdaySoon && (
          <span title={`Em ${daysUntilBirthday(cat.data_de_nascimento!)} dias · ${nextBirthdayDate(cat.data_de_nascimento!)}`}>
            <Cake className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          </span>
        )}
        <span className="text-sm font-medium text-navy-900 truncate">{String(val ?? '')}</span>
      </div>
    );
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

function MobileSubtitle({ cat, columns }: { cat: CatecumenoCompleto; columns: FieldConfigItem[] }) {
  const items = columns
    .filter(f => f.fieldname !== 'name')
    .slice(0, 3)
    .flatMap((f): React.ReactNode[] => {
      const val = getCatValue(cat, f.fieldname);
      // Skip empty, null, and numeric zero (avoids showing "0" for fields that may not exist)
      if (val === null || val === undefined || val === 0 || String(val) === '') return [];
      const text =
        f.fieldtype === 'Date'  ? formatDate(val as string | null) :
        f.fieldtype === 'Check' ? (val ? 'Sim' : null) :
        String(val);
      if (!text) return [];
      return [<span key={f.fieldname} className="text-xs text-slate-400 truncate max-w-[150px]">{text}</span>];
    });
  if (!items.length) return null;
  return <div className="flex items-center gap-3 mt-0.5 flex-wrap">{items}</div>;
}

function renderPanelValue(val: string | number | boolean | null | undefined, field: FieldConfigItem): string {
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
  turma: TurmaComCatecumenos | null;
  fieldConfig: FieldConfigItem[];
  sectionConfig: PortalSectionConfig[];
  allCatecumenos: CatecumenoCompleto[];
  catIndex: number;
  onNavigate: (cat: CatecumenoCompleto, idx: number) => void;
  onClose: () => void;
  onSaved: (updated: CatecumenoCompleto) => void;
}

function SidePanel({ open, cat, turma, fieldConfig, sectionConfig, allCatecumenos, catIndex, onNavigate, onClose, onSaved }: SidePanelProps) {
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  // Reset form when a new catecumeno is opened
  useEffect(() => {
    if (!cat) return;
    const initial: Record<string, string | number> = {};
    fieldConfig.forEach(f => {
      if (f.source === 'turma') return;
      const raw = getCatValue(cat, f.fieldname);
      if (f.fieldtype === 'Int' || f.fieldtype === 'Float') {
        initial[f.fieldname] = raw !== null && raw !== undefined ? Number(raw) : 0;
      } else {
        initial[f.fieldname] = raw !== null && raw !== undefined ? String(raw) : '';
      }
    });
    // Seed idade from live calculation if data_de_nascimento is present
    const liveAge = calcAge(cat.data_de_nascimento, cat.idade);
    if (liveAge !== null) initial['idade'] = liveAge;
    setForm(initial);
    setSaved(false);
    setConfirmClose(false);
    setError('');
  }, [cat, fieldConfig]);

  // Detect unsaved changes by comparing form values against the current cat snapshot
  const isDirty = useMemo(() => {
    if (!cat) return false;
    return fieldConfig.some(f => {
      if (!f.editable || f.source === 'turma') return false;
      const raw     = getCatValue(cat, f.fieldname);
      const current = form[f.fieldname];
      if (f.fieldtype === 'Int' || f.fieldtype === 'Float') {
        return (raw !== null && raw !== undefined ? Number(raw) : 0) !==
               (current !== null && current !== undefined ? Number(current) : 0);
      }
      return (raw !== null && raw !== undefined ? String(raw) : '') !==
             (current !== null && current !== undefined ? String(current) : '');
    });
  }, [form, cat, fieldConfig]);

  // Guard close: if dirty show inline confirmation; otherwise close immediately
  function handleClose() {
    if (isDirty) { setConfirmClose(true); }
    else { onClose(); }
  }

  // Close on Escape — guarded
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmClose) { setConfirmClose(false); }
        else { handleClose(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty, confirmClose]);

  const panelFields = useMemo(
    () => fieldConfig.filter(f => f.show_in_panel && f.fieldname !== 'name'),
    [fieldConfig],
  );

  // Resolve value for any field, regardless of source
  function resolveValue(field: FieldConfigItem): unknown {
    if (field.source === 'turma' && turma) {
      return (turma as unknown as Record<string, unknown>)[field.fieldname];
    }
    return cat ? getCatValue(cat, field.fieldname) : undefined;
  }

  // Group by section; sectionConfig drives order, label, and icon.
  // Sections not listed in sectionConfig appear after declared ones, in discovery order.
  const sections = useMemo(() => {
    const map: Record<string, FieldConfigItem[]> = {};
    const discovered: string[] = [];
    panelFields.forEach(f => {
      const key = f.panel_section || '';
      if (!map[key]) { map[key] = []; discovered.push(key); }
      map[key].push(f);
    });

    const configMap = new Map(sectionConfig.map(s => [s.section_key, s]));
    const declared  = sectionConfig.map(s => s.section_key).filter(k => map[k]);
    const extras    = discovered.filter(k => !configMap.has(k) && map[k]);

    return [...declared, ...extras].map(key => {
      const cfg = configMap.get(key);
      return {
        key,
        title: (cfg?.label ?? key) || 'Informações',
        icon:  cfg?.icon  ?? '',
        fields: map[key],
      };
    });
  }, [panelFields, sectionConfig]);

  async function handleSave() {
    if (!cat) return;
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, string | number | null | undefined> = {
        row_name: cat.row_name,
      };
      fieldConfig.filter(f => f.editable && f.source !== 'turma').forEach(f => {
        payload[f.fieldname] = form[f.fieldname] ?? null;
      });
      // Always include computed idade when data_de_nascimento is editable
      if ('idade' in form && !('idade' in payload)) {
        payload['idade'] = form['idade'] ?? null;
      }

      await api.atualizarCatecumeno(cat.name, payload);

      // Build updated catecumeno for optimistic update
      const updated: CatecumenoCompleto = { ...cat };
      Object.entries(payload).forEach(([k, v]) => {
        if (k !== 'row_name') (updated as unknown as Record<string, unknown>)[k] = v;
      });

      onSaved(updated); // updates table data; panel stays open
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-navy-900/40 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={handleClose}
      />

      {/* Panel — right drawer on desktop, bottom sheet on mobile */}
      <div
        className={[
          'fixed z-50 bg-white shadow-2xl flex flex-col',
          'transition-transform duration-300 ease-in-out',
          // Mobile: bottom sheet
          'inset-x-0 bottom-0 h-[90dvh] rounded-t-2xl overflow-hidden',
          // Desktop: full-height right drawer — top-0+bottom-0 fills screen, h-auto resets h-[90dvh]
          'md:top-0 md:bottom-0 md:right-0 md:left-auto md:h-auto md:rounded-none md:overflow-visible',
          'md:w-[42%] md:max-w-2xl',
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
            <div className="flex items-start justify-between gap-2 px-4 py-3.5 border-b border-cream-200 shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-bold text-navy-900 text-base leading-tight truncate flex items-center gap-2">
                  {cat.name}
                  {isDirty && !saved && (
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Alterações não guardadas" />
                  )}
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

              {/* Mobile: prev/next navigator */}
              {allCatecumenos.length > 1 && (
                <div className="md:hidden flex items-center gap-0.5 shrink-0 self-center">
                  <button
                    onClick={() => {
                      if (isDirty) { setError('Guarde as alterações antes de navegar.'); return; }
                      if (catIndex > 0) onNavigate(allCatecumenos[catIndex - 1], catIndex - 1);
                    }}
                    disabled={catIndex === 0}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-navy-900 hover:bg-cream-100 disabled:opacity-25 transition-colors"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400 tabular-nums min-w-[2.6rem] text-center select-none">
                    {catIndex + 1}/{allCatecumenos.length}
                  </span>
                  <button
                    onClick={() => {
                      if (isDirty) { setError('Guarde as alterações antes de navegar.'); return; }
                      if (catIndex < allCatecumenos.length - 1) onNavigate(allCatecumenos[catIndex + 1], catIndex + 1);
                    }}
                    disabled={catIndex === allCatecumenos.length - 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-navy-900 hover:bg-cream-100 disabled:opacity-25 transition-colors"
                    aria-label="Próximo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-navy-900 hover:bg-cream-100 transition-colors shrink-0 self-start"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-6">
              {/* Section quick-jump pills (mobile only, shown when there are 2+ sections) */}
              {sections.length > 1 && (
                <div className="md:hidden -mx-5 px-5 flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {sections.map(section => {
                    const Ic = section.icon ? SECTION_ICONS[section.icon] : null;
                    return (
                      <button
                        key={section.key}
                        onClick={() => {
                          document
                            .getElementById(`panel-section-${section.key}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-cream-300 bg-cream-50 text-xs font-semibold text-slate-600 hover:bg-cream-100 active:bg-cream-200 transition-colors"
                      >
                        {Ic && <Ic className="w-3 h-3 shrink-0" />}
                        {section.title}
                      </button>
                    );
                  })}
                </div>
              )}

              {sections.map(section => {
                const IconComponent = section.icon ? SECTION_ICONS[section.icon] : null;
                return (
                <div key={section.key} id={`panel-section-${section.key}`}>
                  <div className="flex items-center gap-1.5 mb-3">
                    {IconComponent && (
                      <IconComponent className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {section.title}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {section.fields.map(field => (
                      <div
                        key={field.fieldname}
                        className={field.col_span === '1' ? 'col-span-1' : 'col-span-2'}
                      >
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          {field.label}
                        </label>
                        {field.editable && field.source !== 'turma' ? (
                          <FieldInput
                            field={field}
                            value={form[field.fieldname] ?? ''}
                            onChange={v => setForm(f => {
                              const next = { ...f, [field.fieldname]: v };
                              if (field.fieldname === 'data_de_nascimento' && v) {
                                const age = calcAge(String(v), null);
                                if (age !== null) next['idade'] = age;
                              }
                              return next;
                            })}
                          />
                        ) : (
                          <p className="text-sm text-navy-900 bg-cream-50 rounded-lg px-3 py-2 border border-cream-200">
                            {renderPanelValue(
                              // Show live form value for idade so auto-calc is visible immediately
                              field.fieldname === 'idade' && 'idade' in form
                                ? (form['idade'] as string | number | null)
                                : resolveValue(field) as string | number | boolean | null,
                              field,
                            )}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-cream-200 shrink-0">
              {confirmClose ? (
                /* Unsaved-changes confirmation */
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-3">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Tem alterações não guardadas. Deseja sair?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmClose(false)}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold bg-navy-900 text-white hover:bg-navy-800 transition-colors"
                    >
                      Continuar a editar
                    </button>
                    <button
                      onClick={() => { setConfirmClose(false); onClose(); }}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors"
                    >
                      Descartar e sair
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal footer */
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-cream-100 transition-colors"
                  >
                    Fechar
                  </button>
                  {fieldConfig.some(f => f.editable) && (
                    <button
                      onClick={handleSave}
                      disabled={saving || saved}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all disabled:cursor-default ${
                        saved
                          ? 'bg-emerald-600'
                          : 'bg-navy-900 hover:bg-navy-800 disabled:opacity-50'
                      }`}
                    >
                      {saving ? (
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : saved ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {saving ? 'A guardar...' : saved ? 'Guardado!' : 'Guardar'}
                    </button>
                  )}
                </div>
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
  const [query,     setQuery]     = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc');

  const tableColumns = useMemo(
    () => fieldConfig.filter(f => f.show_in_table),
    [fieldConfig],
  );

  function toggleSort(fieldname: string) {
    if (sortField === fieldname) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldname);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const base = q
      ? catecumenos.filter(c =>
          c.name.toLowerCase().includes(q) ||
          tableColumns.some(f => {
            const v = getCatValue(c, f.fieldname);
            return v ? String(v).toLowerCase().includes(q) : false;
          })
        )
      : catecumenos;

    if (!sortField) return base;

    const col = tableColumns.find(f => f.fieldname === sortField);
    return [...base].sort((a, b) => {
      const av = getCatValue(a, sortField);
      const bv = getCatValue(b, sortField);
      // Nulls always last regardless of direction
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      let cmp = 0;
      if (col && (col.fieldtype === 'Int' || col.fieldtype === 'Float')) {
        cmp = Number(av) - Number(bv);
      } else {
        // ISO dates sort correctly as strings; everything else uses locale compare
        cmp = String(av).localeCompare(String(bv), 'pt', { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [catecumenos, query, sortField, sortDir, tableColumns]);

  // Build dynamic grid template for desktop header + rows
  const gridTemplate = [
    ...tableColumns.map(f => COL_WIDTHS[f.column_width] ?? '1fr'),
    '2rem', // action chevron
  ].join(' ');

  return (
    <div className="animate-fade-up-1">
      {/* Search — sticky on mobile so it stays accessible while scrolling */}
      <div className="sticky top-14 z-20 bg-cream-50/95 backdrop-blur-sm -mx-4 px-4 pt-2 pb-2 mb-1 md:static md:bg-transparent md:backdrop-blur-none md:mx-0 md:px-0 md:pt-0 md:pb-0 md:mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Filtrar por nome..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cream-300 bg-white text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all shadow-warm-xs"
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
                className="hidden md:grid gap-2 px-4 py-1.5 border-b border-cream-200 bg-cream-50"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {tableColumns.map(f => {
                  const active = sortField === f.fieldname;
                  return (
                    <button
                      key={f.fieldname}
                      onClick={() => toggleSort(f.fieldname)}
                      className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest truncate py-1 transition-colors group ${
                        active ? 'text-navy-900' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <span className="truncate">{f.label}</span>
                      {active
                        ? (sortDir === 'asc'
                            ? <ArrowUp   className="w-3 h-3 shrink-0" />
                            : <ArrowDown className="w-3 h-3 shrink-0" />)
                        : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
                      }
                    </button>
                  );
                })}
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
                  <div className="md:hidden flex items-center gap-3 px-4 py-3.5">
                    {/* Initials avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${initialsColor(cat.name)}`}>
                      {cat.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isBirthdayToday(cat.data_de_nascimento) && (
                          <Cake className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        {!isBirthdayToday(cat.data_de_nascimento) && isBirthdaySoon(cat.data_de_nascimento) && (
                          <Cake className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-navy-900 truncate">{cat.name}</span>
                      </div>
                      <MobileSubtitle cat={cat} columns={tableColumns} />
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

// ── Aviso Modal ───────────────────────────────────────────────────────────────

// ── "Cada login" deduplication via cookie (shared across tabs, 30-min TTL) ────
// sessionStorage would be per-tab; a cookie survives across tabs and a quick
// page reload while expiring naturally after inactivity.

const AVISO_SESSION_COOKIE = 'aviso_sessao';
const AVISO_SESSION_TTL_MIN = 30;

function readCookie(name: string): string {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

function writeCookie(name: string, value: string, minutes: number): void {
  const expires = new Date(Date.now() + minutes * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/catequista/; SameSite=Lax`;
}

function getSessionViews(): Set<string> {
  try {
    const raw = readCookie(AVISO_SESSION_COOKIE);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function addSessionView(name: string): void {
  try {
    const views = getSessionViews();
    views.add(name);
    // Writing refreshes the TTL — clock resets from the last dismissal
    writeCookie(AVISO_SESSION_COOKIE, JSON.stringify(Array.from(views)), AVISO_SESSION_TTL_MIN);
  } catch { /* ignore */ }
}

// ── Aviso view-log retry queue (persists across page reloads) ─────────────────

const AVISO_RETRY_KEY = 'aviso_visto_retry';

function getPendingRetries(): string[] {
  try { return JSON.parse(localStorage.getItem(AVISO_RETRY_KEY) || '[]'); }
  catch { return []; }
}

function enqueueRetry(avisoName: string): void {
  try {
    const q = getPendingRetries();
    if (!q.includes(avisoName))
      localStorage.setItem(AVISO_RETRY_KEY, JSON.stringify([...q, avisoName]));
  } catch { /* storage unavailable */ }
}

function dequeueRetry(avisoName: string): void {
  try {
    localStorage.setItem(
      AVISO_RETRY_KEY,
      JSON.stringify(getPendingRetries().filter(n => n !== avisoName)),
    );
  } catch { /* ignore */ }
}

async function drainAvisoRetryQueue(): Promise<void> {
  const pending = getPendingRetries();
  if (!pending.length) return;
  for (const name of pending) {
    try {
      await api.marcarAvisoVisto(name);
      dequeueRetry(name);
    } catch { /* still offline — leave for next drain */ }
  }
}

function AvisoModal({
  avisos,
  onDismissed,
}: {
  avisos: AvisoAtivo[];
  onDismissed: (aviso: AvisoAtivo) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  // Filter out "Cada login" avisos already seen this session
  const queue = useMemo(() => {
    const sessionViews = getSessionViews();
    return avisos.filter(a => {
      if (a.modo_exibicao === 'Cada login' && sessionViews.has(a.name)) return false;
      return true;
    });
  }, [avisos]);

  if (queue.length === 0 || idx >= queue.length) return null;

  const aviso = queue[idx];
  const isUrgente = aviso.prioridade === 'Urgente';

  async function handleCompreendi() {
    if (dismissing) return;

    // Capture before state updates re-render
    const avisoName = aviso.name;
    const modo      = aviso.modo_exibicao;

    // Advance immediately — user intent is confirmed regardless of network
    if (modo === 'Cada login') addSessionView(avisoName);
    onDismissed(aviso);
    setIdx(i => i + 1);

    // Log server-side in the background; retry later if offline
    try {
      await api.marcarAvisoVisto(avisoName);
    } catch {
      enqueueRetry(avisoName);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/70 backdrop-blur-sm">
      <div
        className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-up
          ${isUrgente ? 'bg-rose-50 border-2 border-rose-300' : 'bg-white border border-cream-200'}`}
      >
        {/* Priority stripe */}
        {isUrgente && <div className="h-1.5 w-full bg-rose-500" />}
        {!isUrgente && <div className="h-1.5 w-full bg-gold-400" />}

        <div className="p-6">
          {/* Counter badge when multiple */}
          {queue.length > 1 && (
            <span className="inline-block mb-3 text-xs font-semibold text-slate-400 bg-cream-100 px-2.5 py-0.5 rounded-full">
              {idx + 1} / {queue.length}
            </span>
          )}

          {isUrgente && (
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Urgente</span>
            </div>
          )}

          <h2 className={`font-display font-bold text-lg mb-3 ${isUrgente ? 'text-rose-900' : 'text-navy-900'}`}>
            {aviso.titulo}
          </h2>
          <div
            className="text-sm text-slate-600 leading-relaxed aviso-richtext"
            dangerouslySetInnerHTML={{ __html: aviso.mensagem }}
          />
        </div>

        <div className="px-6 pb-6 space-y-3">
          {aviso.anexo && (
            <a
              href={aviso.anexo.startsWith('http') ? aviso.anexo : FRAPPE_URL + aviso.anexo}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                border text-sm font-semibold transition-colors
                ${isUrgente
                  ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
            >
              <FileDown className="w-4 h-4 shrink-0" />
              {aviso.anexo_label || 'Descarregar Circular'}
            </a>
          )}
          <button
            onClick={handleCompreendi}
            disabled={dismissing}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all
              ${isUrgente
                ? 'bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-60'
                : 'bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-60'
              }`}
          >
            {dismissing ? 'A registar...' : 'Compreendi'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Birthday Panel ────────────────────────────────────────────────────────────

interface BirthdayEntry {
  name: string;
  dob: string;
  age: number | null;
  turmaName: string;
  daysUntil: number;
}

function birthdayDaysLabel(days: number): string {
  if (days === 0) return 'Hoje!';
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}

function BirthdayRow({ entry, highlight }: { entry: BirthdayEntry; highlight?: boolean }) {
  const isToday = entry.daysUntil === 0;
  const turningAge = entry.age !== null
    ? (isToday ? entry.age : entry.age + 1)
    : null;

  return (
    <div className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border ${
      isToday
        ? 'bg-amber-50 border-amber-200'
        : highlight
          ? 'bg-cream-50 border-cream-200'
          : 'bg-white border-cream-200'
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        isToday ? 'bg-amber-200' : 'bg-cream-200'
      }`}>
        <Cake className={`w-4 h-4 ${isToday ? 'text-amber-600' : 'text-slate-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-navy-900 truncate">{entry.name}</p>
        <p className="text-xs text-slate-400 truncate">{entry.turmaName}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-xs font-semibold ${isToday ? 'text-amber-600' : 'text-slate-600'}`}>
          {birthdayDaysLabel(entry.daysUntil)}
        </p>
        <p className="text-xs text-slate-400">
          {nextBirthdayDate(entry.dob)}{turningAge !== null ? ` · ${turningAge} anos` : ''}
        </p>
      </div>
    </div>
  );
}

function BirthdayPanel({
  open,
  onClose,
  turmas,
}: {
  open: boolean;
  onClose: () => void;
  turmas: TurmaComCatecumenos[];
}) {
  const { thisWeek, thisMonth } = useMemo(() => {
    const week: BirthdayEntry[] = [];
    const month: BirthdayEntry[] = [];
    turmas.forEach(turma => {
      turma.catecumenos.forEach(cat => {
        if (!cat.data_de_nascimento) return;
        const days = daysUntilBirthday(cat.data_de_nascimento);
        const entry: BirthdayEntry = {
          name: cat.name,
          dob: cat.data_de_nascimento,
          age: calcAge(cat.data_de_nascimento, cat.idade),
          turmaName: turma.name,
          daysUntil: days,
        };
        if (days <= 7) week.push(entry);
        else if (days <= 30) month.push(entry);
      });
    });
    week.sort((a, b) => a.daysUntil - b.daysUntil);
    month.sort((a, b) => a.daysUntil - b.daysUntil);
    return { thisWeek: week, thisMonth: month };
  }, [turmas]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-navy-900/40 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={[
          'fixed z-50 bg-white shadow-2xl flex flex-col',
          'transition-transform duration-300 ease-in-out',
          'inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl overflow-hidden',
          'md:top-0 md:bottom-0 md:right-0 md:left-auto md:h-auto md:rounded-none md:overflow-visible',
          'md:w-[380px]',
          open
            ? 'translate-y-0 md:translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full',
        ].join(' ')}
      >
        {/* Drag handle (mobile only) */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-cream-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cream-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <Cake className="w-5 h-5 text-amber-500" />
            <h3 className="font-display font-bold text-navy-900 text-base">Aniversariantes</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-navy-900 hover:bg-cream-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-5 space-y-6">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Esta Semana
            </p>
            {thisWeek.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Nenhum aniversário esta semana.</p>
            ) : (
              <div className="space-y-2">
                {thisWeek.map(entry => (
                  <BirthdayRow key={entry.name + entry.dob} entry={entry} highlight />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Este Mês
            </p>
            {thisMonth.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Nenhum outro aniversário este mês.</p>
            ) : (
              <div className="space-y-2">
                {thisMonth.map(entry => (
                  <BirthdayRow key={entry.name + entry.dob} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Proximos Retiros card ─────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function RetiroCard({ retiro }: { retiro: RetiroProximo }) {
  const d = new Date(retiro.data);
  const day   = isNaN(d.getTime()) ? '—' : String(d.getDate()).padStart(2, '0');
  const month = isNaN(d.getTime()) ? '—' : MONTH_SHORT[d.getMonth()];

  return (
    <div className="flex items-start gap-3 py-3 border-b border-cream-200 last:border-0">
      {/* Date badge */}
      <div className="flex flex-col items-center justify-center bg-navy-900 text-white rounded-xl w-12 shrink-0 py-1.5">
        <span className="text-lg font-bold leading-none">{day}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{month}</span>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-navy-900 truncate">{retiro.titulo}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {retiro.local && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
              {retiro.local}
            </span>
          )}
          {retiro.orador && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <User className="w-3 h-3 shrink-0 text-slate-400" />
              {retiro.orador}
            </span>
          )}
        </div>
        {retiro.tema && (
          <p className="text-xs text-slate-400 italic mt-0.5 truncate">{retiro.tema}</p>
        )}
      </div>
    </div>
  );
}

function ProximosRetiros({ retiros }: { retiros: RetiroProximo[] }) {
  if (retiros.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs overflow-hidden mb-8 animate-fade-up">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-cream-200">
        <Calendar className="w-4 h-4 text-navy-700 shrink-0" />
        <h2 className="font-display font-bold text-navy-900 text-sm">Próximos Retiros</h2>
        <span className="ml-auto text-xs font-semibold text-slate-400 bg-cream-100 px-2 py-0.5 rounded-full">
          {retiros.length}
        </span>
      </div>
      <div className="px-5 divide-y divide-cream-200">
        {retiros.map(r => <RetiroCard key={r.name} retiro={r} />)}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { loading: authLoading, auth } = useAuthGuard();
  const [turmas, setTurmas] = useState<TurmaComCatecumenos[]>([]);
  const [fieldConfig, setFieldConfig]     = useState<FieldConfigItem[]>([]);
  const [sectionConfig, setSectionConfig] = useState<PortalSectionConfig[]>([]);
  const [retiros, setRetiros] = useState<RetiroProximo[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [panel, setPanel] = useState<{ cat: CatecumenoCompleto; turma: TurmaComCatecumenos; turmaIdx: number; catIndex: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [birthdayPanelOpen, setBirthdayPanelOpen] = useState(false);
  const [avisos, setAvisos] = useState<AvisoAtivo[]>([]);

  const weekBirthdayCount = useMemo(
    () => turmas.flatMap(t => t.catecumenos).filter(c => isBirthdaySoon(c.data_de_nascimento)).length,
    [turmas],
  );

  // Drain any pending aviso-view retries once authenticated, and on tab refocus
  useEffect(() => {
    if (!auth) return;
    drainAvisoRetryQueue();
    const onVisible = () => { if (document.visibilityState === 'visible') drainAvisoRetryQueue(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [auth]);

  useEffect(() => {
    if (!auth) return;
    Promise.all([api.getMinhaTurma(), api.getFieldConfig(), api.getAvisosAtivos(), api.getProximosRetiros()])
      .then(([data, config, av, ret]) => {
        setTurmas(data);
        setFieldConfig(config.fields);
        setSectionConfig(config.sections);
        setAvisos(av);
        setRetiros(ret);
        setDataLoading(false);
      })
      .catch(e => {
        setDataError(String(e.message || e));
        setDataLoading(false);
      });
  }, [auth]);

  const openPanel = useCallback((cat: CatecumenoCompleto, turma: TurmaComCatecumenos, turmaIdx: number) => {
    const catIndex = turma.catecumenos.findIndex(c => c.name === cat.name);
    setPanel({ cat, turma, turmaIdx, catIndex: catIndex >= 0 ? catIndex : 0 });
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    // Delay clearing cat so exit animation completes
    if (closePanelTimer.current) clearTimeout(closePanelTimer.current);
    closePanelTimer.current = setTimeout(() => setPanel(null), 320);
  }, []);

  useEffect(() => () => {
    if (closePanelTimer.current) clearTimeout(closePanelTimer.current);
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
    // Refresh the panel's cat data but keep the panel open for verification
    setPanel(p => p ? { ...p, cat: updated } : null);
  }, [panel]);

  const retry = useCallback(() => {
    setDataLoading(true);
    setDataError('');
    Promise.all([api.getMinhaTurma(), api.getFieldConfig(), api.getAvisosAtivos(), api.getProximosRetiros()])
      .then(([data, config, av, ret]) => { setTurmas(data); setFieldConfig(config.fields); setSectionConfig(config.sections); setAvisos(av); setRetiros(ret); })
      .catch(e => setDataError(String(e.message || e)))
      .finally(() => setDataLoading(false));
  }, []);

  if (authLoading) return <FullPageLoading />;

  return (
    <>
      {avisos.length > 0 && (
        <AvisoModal
          avisos={avisos}
          onDismissed={dismissed => setAvisos(prev => prev.filter(a => a.name !== dismissed.name))}
        />
      )}

      <Nav
        catequistaNome={auth?.catequista}
        birthdayCount={weekBirthdayCount}
        onAniversariantes={() => setBirthdayPanelOpen(true)}
      />

      <main className="max-w-5xl mx-auto px-4 py-8 pb-24 md:pb-8">
        {/* Page header */}
        <div className="mb-6 animate-fade-up">
          <h1 className="font-display font-bold text-navy-900 text-2xl">
            Olá, {auth?.catequista.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Upcoming retreats — only when data is loaded and there are retreats */}
        {!dataLoading && !dataError && retiros.length > 0 && (
          <ProximosRetiros retiros={retiros} />
        )}

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
            <TurmaHeader turma={turma} fieldConfig={fieldConfig} />
            <div className="mt-5">
              <h3 className="font-display font-bold text-navy-900 text-base mb-3 px-0.5">
                Catecúmenos
              </h3>
              <CatecumenosTable
                catecumenos={turma.catecumenos}
                fieldConfig={fieldConfig}
                onSelect={cat => openPanel(cat, turma, turmaIdx)}
              />
            </div>
          </div>
        ))}
      </main>

      {/* Birthday panel */}
      <BirthdayPanel
        open={birthdayPanelOpen}
        onClose={() => setBirthdayPanelOpen(false)}
        turmas={turmas}
      />

      {/* Side panel */}
      <SidePanel
        open={panelOpen}
        cat={panel?.cat ?? null}
        turma={panel?.turma ?? null}
        fieldConfig={fieldConfig}
        sectionConfig={sectionConfig}
        allCatecumenos={panel?.turma.catecumenos ?? []}
        catIndex={panel?.catIndex ?? 0}
        onNavigate={(cat, idx) => setPanel(p => p ? { ...p, cat, catIndex: idx } : null)}
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

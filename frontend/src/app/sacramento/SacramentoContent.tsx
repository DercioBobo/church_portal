'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, AlertCircle, Search, X, Check, Save,
  CalendarDays, Users, FileText, Pencil, Phone,
  User, Users2, BookOpen, Sparkles, BadgeCheck, BadgeX,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { PreparacaoSacramento, PreparacaoSacramentoLista, CandidatoSacramento } from '@/types/catequese';
import PhaseChip from '@/components/PhaseChip';
import Loading from '@/components/Loading';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(value?: number | null): string {
  if (value == null) return '—';
  return `Mts ${new Intl.NumberFormat('pt-MZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Strip HTML tags and return plain text; returns '' for empty Quill output. */
function htmlToText(html?: string | null): string {
  if (!html) return '';
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

const DIA_OPTIONS = [
  '', 'Domingo', 'Segunda-feira', 'Terça-feira',
  'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
];

// ─── edit form state ───────────────────────────────────────────────────────────

interface EditState {
  encarregado: string;
  contacto_encarregado: string;
  padrinhos: string;
  contacto_padrinhos: string;
  idade: string;
  data_de_nascimento: string;
  dia: string;
}

function toEditState(c: CandidatoSacramento): EditState {
  return {
    encarregado: c.encarregado ?? '',
    contacto_encarregado: c.contacto_encarregado ?? '',
    padrinhos: c.padrinhos ?? '',
    contacto_padrinhos: c.contacto_padrinhos ?? '',
    idade: c.idade != null ? String(c.idade) : '',
    data_de_nascimento: c.data_de_nascimento ?? '',
    dia: c.dia ?? '',
  };
}

// ─── small shared UI ──────────────────────────────────────────────────────────

function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-cream-100 last:border-0">
      <span className="text-sm text-slate-500 shrink-0 w-32">{label}</span>
      <span className="text-sm text-navy-900 font-medium text-right flex-1">{value || '—'}</span>
    </div>
  );
}

function EditField({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-cream-300 bg-cream-50
          focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-700/20 focus:border-navy-700/40
          transition-all placeholder:text-slate-400"
      />
    </div>
  );
}

function SelectField({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-cream-300 bg-cream-50
          focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-700/20 focus:border-navy-700/40 transition-all"
      >
        {options.map((o) => <option key={o} value={o}>{o || 'Seleccionar...'}</option>)}
      </select>
    </div>
  );
}

function DocBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5
      ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
      {ok
        ? <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        : <BadgeX className="w-4 h-4 text-rose-500 shrink-0" />}
      <span className={`text-xs font-semibold ${ok ? 'text-emerald-700' : 'text-rose-600'}`}>{label}</span>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function CandidatoModal({
  candidato: initial,
  preparacaoNome,
  onClose,
  onSaved,
}: {
  candidato: CandidatoSacramento;
  preparacaoNome: string;
  onClose: () => void;
  onSaved: (updates: Partial<CandidatoSacramento>) => void;
}) {
  const [candidato, setCandidato] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(toEditState(initial));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function field(key: keyof EditState) {
    return (v: string) => setForm((p) => ({ ...p, [key]: v }));
  }

  function handleEdit() {
    setForm(toEditState(candidato));
    setEditing(true);
    setSaved(false);
    setSaveError('');
  }

  function handleCancel() {
    setEditing(false);
    setSaveError('');
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await api.atualizarCandidatoSacramento(preparacaoNome, candidato.name, {
        encarregado: form.encarregado || undefined,
        contacto_encarregado: form.contacto_encarregado || undefined,
        padrinhos: form.padrinhos || undefined,
        contacto_padrinhos: form.contacto_padrinhos || undefined,
        idade: form.idade ? parseInt(form.idade, 10) : undefined,
        data_de_nascimento: form.data_de_nascimento || undefined,
        dia: form.dia || undefined,
      });
      const updates: Partial<CandidatoSacramento> = {
        encarregado: form.encarregado,
        contacto_encarregado: form.contacto_encarregado,
        padrinhos: form.padrinhos,
        contacto_padrinhos: form.contacto_padrinhos,
        idade: form.idade ? parseInt(form.idade, 10) : candidato.idade,
        data_de_nascimento: form.data_de_nascimento,
        dia: form.dia,
      };
      setCandidato((prev) => ({ ...prev, ...updates }));
      onSaved(updates);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError('Erro ao guardar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const totalPago =
    (candidato.valor_ofertorio ?? 0) +
    (candidato.valor_cracha ?? 0) +
    (candidato.valor_accao_gracas ?? 0) +
    (candidato.valor_fotos ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-2xl bg-white sm:rounded-2xl shadow-warm-lg
        max-h-[95dvh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-fade-up">

        {/* Modal header */}
        <div className="bg-navy-900 px-5 py-4 flex items-start gap-4 shrink-0">
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center
            text-gold-400 font-display font-bold text-lg shrink-0">
            {candidato.catecumeno?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-white text-lg leading-tight truncate">
              {candidato.catecumeno}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {candidato.fase && <PhaseChip fase={candidato.fase} />}
              {candidato.turma && (
                <span className="flex items-center gap-1 text-xs text-white/60">
                  <BookOpen className="w-3 h-3" />{candidato.turma}
                </span>
              )}
              {saved && (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                  <Check className="w-3 h-3" />Guardado
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-6">

            {/* ── Personal data ───────────────────────────────────────── */}
            <div>
              <SectionHeading icon={User} label="Dados Pessoais" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-cream-50 rounded-xl border border-cream-200 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-500 mb-0.5">Sexo</div>
                  <div className="text-sm font-semibold text-navy-900">
                    {candidato.sexo === 'M' ? 'Masculino' : candidato.sexo === 'F' ? 'Feminino' : (candidato.sexo || '—')}
                  </div>
                </div>
                <div className="bg-cream-50 rounded-xl border border-cream-200 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-500 mb-0.5">Idade</div>
                  <div className="text-sm font-semibold text-navy-900">
                    {candidato.idade != null ? `${candidato.idade} anos` : '—'}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-cream-50 rounded-xl border border-cream-200 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-500 mb-0.5">Nascimento</div>
                  <div className="text-sm font-semibold text-navy-900">{fmtDate(candidato.data_de_nascimento)}</div>
                </div>
              </div>
              {(candidato.date || candidato.dia || candidato.sacerdote) && (
                <div className="mt-3 space-y-0 bg-white rounded-xl border border-cream-200">
                  {candidato.dia && <Row label="Dia da Celebração" value={
                    <span className="flex items-center justify-end gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-slate-400" />{candidato.dia}
                    </span>
                  } />}
                  {candidato.date && <Row label="Data Cerimónia" value={fmtDate(candidato.date)} />}
                  {candidato.sacerdote && <Row label="Sacerdote" value={candidato.sacerdote} />}
                </div>
              )}
            </div>

            {/* ── Encarregado + Padrinhos (edit / view) ───────────────── */}
            {editing ? (
              <div className="space-y-4">
                <div>
                  <SectionHeading icon={User} label="Encarregado de Educação" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <EditField label="Nome" value={form.encarregado} onChange={field('encarregado')} placeholder="Nome completo" />
                    <EditField label="Contacto" value={form.contacto_encarregado} onChange={field('contacto_encarregado')} type="tel" placeholder="+258 8X XXX XXXX" />
                  </div>
                </div>
                <div>
                  <SectionHeading icon={Users2} label="Padrinhos" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <EditField label="Nome(s)" value={form.padrinhos} onChange={field('padrinhos')} placeholder="Nome dos padrinhos" />
                    <EditField label="Contacto" value={form.contacto_padrinhos} onChange={field('contacto_padrinhos')} type="tel" placeholder="+258 8X XXX XXXX" />
                  </div>
                </div>
                <div>
                  <SectionHeading icon={CalendarDays} label="Dados Pessoais — Editar" />
                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="Idade" value={form.idade} onChange={field('idade')} type="number" placeholder="0" />
                    <div className="col-span-2">
                      <EditField label="Data de Nascimento" value={form.data_de_nascimento} onChange={field('data_de_nascimento')} type="date" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <SelectField label="Dia da Celebração" value={form.dia} options={DIA_OPTIONS} onChange={field('dia')} />
                  </div>
                </div>

                {saveError && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {saveError}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div>
                  <SectionHeading icon={User} label="Encarregado de Educação" />
                  <div className="bg-white rounded-xl border border-cream-200">
                    <Row label="Nome" value={candidato.encarregado} />
                    <Row label="Contacto" value={
                      candidato.contacto_encarregado
                        ? <span className="flex items-center justify-end gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />{candidato.contacto_encarregado}
                          </span>
                        : null
                    } />
                  </div>
                </div>
                <div>
                  <SectionHeading icon={Users2} label="Padrinhos" />
                  <div className="bg-white rounded-xl border border-cream-200">
                    <Row label="Nome(s)" value={candidato.padrinhos} />
                    <Row label="Contacto" value={
                      candidato.contacto_padrinhos
                        ? <span className="flex items-center justify-end gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />{candidato.contacto_padrinhos}
                          </span>
                        : null
                    } />
                  </div>
                </div>
              </>
            )}

            {/* ── Documentação (read-only) ─────────────────────────────── */}
            <div>
              <SectionHeading icon={FileText} label="Documentação" />
              <div className="grid grid-cols-2 gap-3">
                <DocBadge ok={!!candidato.ficha} label="Ficha" />
                <DocBadge ok={!!candidato.documentos_padrinhos} label="Docs Padrinhos" />
              </div>
            </div>

            {/* ── Valores (read-only) ──────────────────────────────────── */}
            <div>
              <SectionHeading icon={Sparkles} label="Valores" />
              <div className="bg-cream-50 rounded-xl border border-cream-200 divide-y divide-cream-200 overflow-hidden">
                {[
                  ['Ofertório', candidato.valor_ofertorio],
                  ['Crachá', candidato.valor_cracha],
                  ['Acção de Graças', candidato.valor_accao_gracas],
                  ['Fotografias', candidato.valor_fotos],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-slate-500">{label}</span>
                    <span className="text-sm font-semibold text-navy-900">{fmt(val as number | null)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 bg-cream-100">
                  <span className="text-sm font-bold text-slate-700">Total</span>
                  <span className="text-sm font-bold text-navy-900">{fmt(totalPago)}</span>
                </div>
              </div>
            </div>

            {/* ── Obs ──────────────────────────────────────────────────── */}
            {candidato.obs && (
              <div className="bg-gold-100 border border-gold-200 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-gold-700 mb-1">Observações</p>
                <p className="text-sm text-slate-700">{candidato.obs}</p>
              </div>
            )}
          </div>
        </div>

        {/* Modal footer */}
        <div className="shrink-0 border-t border-cream-200 px-5 py-3 bg-cream-50 flex items-center justify-between gap-3 flex-wrap">
          {editing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-cream-300 text-slate-600 text-sm font-semibold
                  hover:bg-cream-100 transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-navy-900 text-gold-400
                  text-sm font-semibold hover:bg-navy-800 transition-colors shadow-warm-xs
                  disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'A guardar...' : 'Guardar'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-cream-300 text-slate-600 text-sm font-semibold
                  hover:bg-cream-100 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={handleEdit}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-navy-900 text-gold-400
                  text-sm font-semibold hover:bg-navy-800 transition-colors shadow-warm-xs"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar dados
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Candidates table ─────────────────────────────────────────────────────────

function CandidatosTable({
  candidatos,
  preparacaoNome,
  onCandidatoSaved,
}: {
  candidatos: CandidatoSacramento[];
  preparacaoNome: string;
  onCandidatoSaved: (rowName: string, updates: Partial<CandidatoSacramento>) => void;
}) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<CandidatoSacramento | null>(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidatos;
    return candidatos.filter((c) =>
      c.catecumeno?.toLowerCase().includes(q) ||
      c.encarregado?.toLowerCase().includes(q) ||
      c.padrinhos?.toLowerCase().includes(q)
    );
  }, [candidatos, filter]);

  // Keep modal in sync when parent updates the row
  useEffect(() => {
    if (!selected) return;
    const fresh = candidatos.find((c) => c.name === selected.name);
    if (fresh) setSelected(fresh);
  }, [candidatos, selected?.name]);

  return (
    <>
      {/* Search */}
      {candidatos.length > 3 && (
        <div className="px-4 py-3 border-b border-cream-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Pesquisar por candidato, encarregado ou padrinho..."
              className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-cream-300 bg-cream-50
                focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-700/20 focus:border-navy-700/30 transition-all"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {visible.length === 0 ? (
        <div className="py-14 text-center text-slate-400 text-sm font-display italic">
          {filter ? `Nenhum resultado para "${filter}"` : 'Nenhum candidato nesta preparação.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-50 border-b border-cream-200">
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 w-full">
                  Candidato
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 hidden sm:table-cell whitespace-nowrap">
                  Encarregado
                </th>
                <th className="text-center px-3 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 hidden md:table-cell">
                  Fase
                </th>
                <th className="text-center px-3 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 hidden lg:table-cell whitespace-nowrap">
                  Dia
                </th>
                <th className="text-center px-3 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Ficha
                </th>
                <th className="text-center px-3 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Docs
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {visible.map((c) => (
                <tr
                  key={c.name}
                  onClick={() => setSelected(c)}
                  className="hover:bg-cream-50 cursor-pointer transition-colors group"
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-navy-900 flex items-center justify-center
                        text-gold-400 text-xs font-bold shrink-0 group-hover:bg-navy-800 transition-colors">
                        {c.catecumeno?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      <span className="font-semibold text-navy-900 truncate group-hover:text-navy-700 transition-colors">
                        {c.catecumeno}
                      </span>
                    </div>
                  </td>
                  {/* Encarregado */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-slate-600 truncate block max-w-[14rem]">{c.encarregado || '—'}</span>
                  </td>
                  {/* Fase */}
                  <td className="px-3 py-3 hidden md:table-cell text-center">
                    {c.fase ? <PhaseChip fase={c.fase} /> : <span className="text-slate-400">—</span>}
                  </td>
                  {/* Dia */}
                  <td className="px-3 py-3 hidden lg:table-cell text-center">
                    <span className="text-slate-600 whitespace-nowrap">{c.dia || '—'}</span>
                  </td>
                  {/* Ficha */}
                  <td className="px-3 py-3 text-center">
                    {c.ficha
                      ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                      : <X className="w-4 h-4 text-rose-400 mx-auto" />}
                  </td>
                  {/* Docs */}
                  <td className="px-3 py-3 text-center">
                    {c.documentos_padrinhos
                      ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                      : <X className="w-4 h-4 text-rose-400 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {selected && (
        <CandidatoModal
          candidato={selected}
          preparacaoNome={preparacaoNome}
          onClose={() => setSelected(null)}
          onSaved={(updates) => {
            onCandidatoSaved(selected.name, updates);
          }}
        />
      )}
    </>
  );
}

// ─── Lista de preparações ─────────────────────────────────────────────────────

function ListaPreparacoes({ items }: { items: PreparacaoSacramentoLista[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Sparkles className="w-10 h-10 mb-3 text-gold-400" />
        <p className="font-display italic">Nenhuma preparação disponível.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((p) => (
        <a
          key={p.name}
          href={`/portal/sacramento/?nome=${encodeURIComponent(p.name)}`}
          className="block bg-white rounded-2xl border border-cream-300 shadow-warm-xs p-5
            hover:shadow-warm-sm hover:border-navy-700/20 transition-all group"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-navy-900 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-gold-400" />
            </div>
            <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-cream-100
              border border-cream-300 rounded-full px-2.5 py-0.5 mt-1">
              <Users className="w-3 h-3" />{p.total_candidatos}
            </span>
          </div>
          <h3 className="font-display font-bold text-navy-900 text-base group-hover:text-navy-700 transition-colors">
            {p.sacramento}
          </h3>
          {p.ano_lectivo && <p className="text-xs text-slate-500 mt-0.5">{p.ano_lectivo}</p>}
          {p.data_do_sacramento && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
              {fmtDate(p.data_do_sacramento)}
            </p>
          )}
          <div className="mt-3 text-xs text-navy-700 font-semibold group-hover:underline">Ver detalhes →</div>
        </a>
      ))}
    </div>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function DetalhePreparacao({ nome }: { nome: string }) {
  const [data, setData] = useState<PreparacaoSacramento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPreparacaoSacramento(nome)
      .then(setData)
      .catch(() => setError('Preparação não encontrada ou indisponível.'))
      .finally(() => setLoading(false));
  }, [nome]);

  const handleSaved = useCallback((rowName: string, updates: Partial<CandidatoSacramento>) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        candidatos: prev.candidatos.map((c) => c.name === rowName ? { ...c, ...updates } : c),
      };
    });
  }, []);

  if (loading) return <Loading />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertCircle className="w-10 h-10 mb-3 text-rose-400" />
        <p className="font-display italic">{error || 'Preparação não encontrada.'}</p>
        <button onClick={() => history.back()} className="mt-4 text-navy-700 text-sm hover:underline">← Voltar</button>
      </div>
    );
  }

  const total = data.candidatos.length;
  const sabadoCount = data.candidatos.filter((c) => c.dia === 'Sábado').length;
  const domingoCount = data.candidatos.filter((c) => c.dia === 'Domingo').length;
  const documentosText = htmlToText(data.documentos_exigidos);
  const observacoesText = htmlToText(data.observacoes);

  return (
    <div className="animate-fade-up space-y-5">
      {/* Back */}
      <button
        onClick={() => history.back()}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />Voltar
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs overflow-hidden">
        <div className="bg-navy-900 bg-cross-pattern px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-gold-400" />
                <span className="text-xs font-semibold text-gold-400 uppercase tracking-wider">
                  Preparação do Sacramento
                </span>
              </div>
              <h1 className="font-display text-2xl font-bold text-white">{data.sacramento}</h1>
              {data.ano_lectivo && <p className="text-sm text-white/60 mt-1">{data.ano_lectivo}</p>}
            </div>
          </div>
        </div>
        {/* Summary bar */}
        <div className="grid grid-cols-3 divide-x divide-cream-200">
          <div className="px-4 py-3 text-center">
            <div className="text-xl font-display font-bold text-navy-900">{total}</div>
            <div className="text-xs text-slate-500">Candidatos</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-xl font-display font-bold text-navy-900">{sabadoCount}</div>
            <div className="text-xs text-slate-500">Sábado</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-xl font-display font-bold text-navy-900">{domingoCount}</div>
            <div className="text-xs text-slate-500">Domingo</div>
          </div>
        </div>
      </div>

      {/* Documentos e Observações */}
      {(documentosText || observacoesText) && (
        <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs p-5 space-y-4">
          {documentosText && (
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-navy-900 text-sm mb-2">
                <FileText className="w-4 h-4 text-slate-400" />Documentos Exigidos
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{documentosText}</p>
            </div>
          )}
          {observacoesText && (
            <div className={documentosText ? 'pt-3 border-t border-cream-200' : ''}>
              <h2 className="font-semibold text-navy-900 text-sm mb-2">Observações</h2>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{observacoesText}</p>
            </div>
          )}
        </div>
      )}

      {/* Candidates table */}
      <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-200 flex items-center gap-3">
          <Users className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-navy-900">Candidatos ao Sacramento</h2>
          <span className="text-xs text-slate-400 bg-cream-100 border border-cream-300 rounded-full px-2 py-0.5">
            {total}
          </span>
        </div>
        <CandidatosTable
          candidatos={data.candidatos}
          preparacaoNome={data.name}
          onCandidatoSaved={handleSaved}
        />
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function SacramentoContent() {
  const params = useSearchParams();
  const nome = params.get('nome');

  const [lista, setLista] = useState<PreparacaoSacramentoLista[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [errorLista, setErrorLista] = useState('');

  useEffect(() => {
    if (!nome) {
      setLoadingLista(true);
      api.getPreparacoesSacramento()
        .then(setLista)
        .catch(() => setErrorLista('Erro ao carregar preparações.'))
        .finally(() => setLoadingLista(false));
    }
  }, [nome]);

  if (nome) return <DetalhePreparacao nome={nome} />;

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-navy-900 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-gold-400" />
          </span>
          Preparação do Sacramento
        </h1>
        <p className="text-sm text-slate-500 mt-1.5 ml-12">
          Seleccione a preparação para ver os candidatos e actualizar os seus dados.
        </p>
      </div>

      {loadingLista ? <Loading /> : errorLista ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <AlertCircle className="w-10 h-10 mb-3 text-rose-400" />
          <p className="font-display italic">{errorLista}</p>
        </div>
      ) : (
        <ListaPreparacoes items={lista} />
      )}
    </div>
  );
}

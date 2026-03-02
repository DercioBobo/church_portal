'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, AlertCircle, Search, X, ChevronDown, ChevronUp,
  Check, Save, CalendarDays, Users, Euro, FileText, Pencil,
  Phone, User, Users2, BookOpen, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { PreparacaoSacramento, PreparacaoSacramentoLista, CandidatoSacramento } from '@/types/catequese';
import PhaseChip from '@/components/PhaseChip';
import Loading from '@/components/Loading';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(value?: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const [year, month, day] = d.split('-');
  if (!year || !month || !day) return d;
  return `${day}/${month}/${year}`;
}

const DIA_OPTIONS = [
  '', 'Domingo', 'Segunda-feira', 'Terça-feira',
  'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
];

// ─── sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-cream-100 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-navy-900 font-medium text-right">{value || '—'}</span>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
      ${ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
      {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </span>
  );
}

function EditField({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
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
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-cream-300 bg-cream-50
          focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-700/20 focus:border-navy-700/40
          transition-all"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o || 'Seleccionar...'}</option>
        ))}
      </select>
    </div>
  );
}

// ─── edit form state ──────────────────────────────────────────────────────────

interface EditState {
  encarregado: string;
  contacto_encarregado: string;
  padrinhos: string;
  contacto_padrinhos: string;
  idade: string;
  data_de_nascimento: string;
  dia: string;
}

function buildEditState(c: CandidatoSacramento): EditState {
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

// ─── Candidate Card ───────────────────────────────────────────────────────────

function CandidatoCard({
  candidato,
  preparacaoNome,
  onSaved,
}: {
  candidato: CandidatoSacramento;
  preparacaoNome: string;
  onSaved: (updated: Partial<CandidatoSacramento>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(buildEditState(candidato));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  function field(key: keyof EditState) {
    return (v: string) => setForm((prev) => ({ ...prev, [key]: v }));
  }

  function handleEdit() {
    setForm(buildEditState(candidato));
    setEditing(true);
    setExpanded(true);
    setSaved(false);
    setSaveError('');
  }

  function handleCancel() {
    setEditing(false);
    setSaveError('');
    setForm(buildEditState(candidato));
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
      setSaved(true);
      setEditing(false);
      onSaved({
        encarregado: form.encarregado,
        contacto_encarregado: form.contacto_encarregado,
        padrinhos: form.padrinhos,
        contacto_padrinhos: form.contacto_padrinhos,
        idade: form.idade ? parseInt(form.idade, 10) : candidato.idade,
        data_de_nascimento: form.data_de_nascimento,
        dia: form.dia,
      });
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
    <div className={`bg-white rounded-2xl border shadow-warm-xs overflow-hidden transition-all
      ${expanded ? 'border-navy-700/20' : 'border-cream-300'}`}>

      {/* Card summary */}
      <div
        className="px-5 py-4 cursor-pointer hover:bg-cream-50/60 transition-colors"
        onClick={() => { if (!editing) setExpanded((v) => !v); }}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-xl bg-navy-900 flex items-center justify-center
            text-gold-400 font-display font-bold text-base shrink-0">
            {candidato.catecumeno?.charAt(0)?.toUpperCase() ?? '?'}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-navy-900 text-sm leading-tight truncate">
                {candidato.catecumeno}
              </span>
              {candidato.fase && <PhaseChip fase={candidato.fase} />}
              {saved && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700
                  bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <Check className="w-3 h-3" /> Guardado
                </span>
              )}
            </div>

            {/* Meta row */}
            <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-slate-500">
              {candidato.turma && (
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> {candidato.turma}
                </span>
              )}
              {candidato.sexo && (
                <span>{candidato.sexo === 'M' ? 'Masc.' : candidato.sexo === 'F' ? 'Fem.' : candidato.sexo}</span>
              )}
              {candidato.idade != null && <span>{candidato.idade} anos</span>}
              {candidato.dia && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> {candidato.dia}
                </span>
              )}
            </div>

            {/* Status badges */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatusBadge ok={!!candidato.ficha} label="Ficha" />
              <StatusBadge ok={!!candidato.documentos_padrinhos} label="Docs Padrinhos" />
              {totalPago > 0 && (
                <span className="text-xs text-slate-500 font-medium">
                  {fmt(totalPago)} pagos
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleEdit}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg
                bg-navy-900 text-gold-400 hover:bg-navy-800 transition-colors shadow-warm-xs"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Editar</span>
            </button>
            <button
              className="p-1.5 rounded-lg text-slate-400 hover:text-navy-900 hover:bg-cream-100 transition-colors"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-cream-200 animate-fade-in">
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* LEFT — editable section */}
            <div>
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider
                text-navy-900/50 mb-4">
                <User className="w-3.5 h-3.5" />
                Dados do Encarregado
                {editing && <span className="text-gold-500 normal-case font-normal tracking-normal">— a editar</span>}
              </h3>

              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <EditField label="Encarregado" value={form.encarregado} onChange={field('encarregado')} placeholder="Nome completo" />
                    <EditField label="Contacto" value={form.contacto_encarregado} onChange={field('contacto_encarregado')} type="tel" placeholder="+244 9XX XXX XXX" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <EditField label="Padrinhos" value={form.padrinhos} onChange={field('padrinhos')} placeholder="Nome dos padrinhos" />
                    <EditField label="Contacto Padrinhos" value={form.contacto_padrinhos} onChange={field('contacto_padrinhos')} type="tel" placeholder="+244 9XX XXX XXX" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="Idade" value={form.idade} onChange={field('idade')} type="number" placeholder="0" />
                    <div className="col-span-2">
                      <EditField label="Data de Nascimento" value={form.data_de_nascimento} onChange={field('data_de_nascimento')} type="date" />
                    </div>
                  </div>
                  <SelectField label="Dia da Celebração" value={form.dia} options={DIA_OPTIONS} onChange={field('dia')} />

                  {saveError && (
                    <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {saveError}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-900 text-gold-400
                        font-semibold text-sm hover:bg-navy-800 transition-colors shadow-warm-xs
                        disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'A guardar...' : 'Guardar'}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg border border-cream-300 text-slate-600
                        font-semibold text-sm hover:bg-cream-100 transition-colors disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-0">
                  <InfoRow label="Encarregado" value={
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {candidato.encarregado}
                    </span>
                  } />
                  <InfoRow label="Contacto Enc." value={
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {candidato.contacto_encarregado}
                    </span>
                  } />
                  <InfoRow label="Padrinhos" value={
                    <span className="flex items-center gap-1.5">
                      <Users2 className="w-3.5 h-3.5 text-slate-400" />
                      {candidato.padrinhos}
                    </span>
                  } />
                  <InfoRow label="Contacto Padr." value={
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {candidato.contacto_padrinhos}
                    </span>
                  } />
                  <InfoRow label="Idade" value={candidato.idade != null ? `${candidato.idade} anos` : null} />
                  <InfoRow label="Data Nasc." value={fmtDate(candidato.data_de_nascimento)} />
                  <InfoRow label="Dia Celebração" value={candidato.dia} />
                </div>
              )}
            </div>

            {/* RIGHT — read-only prep info */}
            <div>
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider
                text-navy-900/50 mb-4">
                <FileText className="w-3.5 h-3.5" />
                Informação de Preparação
              </h3>

              {/* Doc status */}
              <div className="flex gap-3 mb-4">
                <div className={`flex-1 rounded-xl border p-3 text-center
                  ${candidato.ficha ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className={`text-lg font-bold ${candidato.ficha ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {candidato.ficha ? '✓' : '✗'}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">Ficha</div>
                </div>
                <div className={`flex-1 rounded-xl border p-3 text-center
                  ${candidato.documentos_padrinhos ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className={`text-lg font-bold ${candidato.documentos_padrinhos ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {candidato.documentos_padrinhos ? '✓' : '✗'}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">Docs Padrinhos</div>
                </div>
              </div>

              {/* Financial breakdown */}
              <div className="bg-cream-50 rounded-xl border border-cream-200 divide-y divide-cream-200">
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Ofertório</span>
                  <span className="text-sm font-semibold text-navy-900">{fmt(candidato.valor_ofertorio)}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Crachá</span>
                  <span className="text-sm font-semibold text-navy-900">{fmt(candidato.valor_cracha)}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Acção de Graças</span>
                  <span className="text-sm font-semibold text-navy-900">{fmt(candidato.valor_accao_gracas)}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Fotografias</span>
                  <span className="text-sm font-semibold text-navy-900">{fmt(candidato.valor_fotos)}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between bg-cream-100 rounded-b-xl">
                  <span className="text-xs font-bold text-slate-600">Total</span>
                  <span className="text-sm font-bold text-navy-900">
                    {fmt((candidato.valor_ofertorio ?? 0) + (candidato.valor_cracha ?? 0) +
                      (candidato.valor_accao_gracas ?? 0) + (candidato.valor_fotos ?? 0))}
                  </span>
                </div>
              </div>

              {/* Obs */}
              {candidato.obs && (
                <div className="mt-3 bg-gold-50 border border-gold-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-gold-700 mb-1">Observações</p>
                  <p className="text-sm text-slate-700">{candidato.obs}</p>
                </div>
              )}

              {/* Sacerdote + date */}
              <div className="mt-3 space-y-0">
                {candidato.sacerdote && <InfoRow label="Sacerdote" value={candidato.sacerdote} />}
                {candidato.date && <InfoRow label="Data Cerimónia" value={fmtDate(candidato.date)} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

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
              <Users className="w-3 h-3" />
              {p.total_candidatos}
            </span>
          </div>
          <h3 className="font-display font-bold text-navy-900 text-base group-hover:text-navy-700 transition-colors">
            {p.sacramento}
          </h3>
          {p.ano_lectivo && (
            <p className="text-xs text-slate-500 mt-0.5">{p.ano_lectivo}</p>
          )}
          {p.data_do_sacramento && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
              {fmtDate(p.data_do_sacramento)}
            </p>
          )}
          <div className="mt-3 text-xs text-navy-700 font-semibold group-hover:underline">
            Ver detalhes →
          </div>
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
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.getPreparacaoSacramento(nome)
      .then(setData)
      .catch(() => setError('Preparação não encontrada ou indisponível.'))
      .finally(() => setLoading(false));
  }, [nome]);

  const candidatosFiltrados = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.candidatos;
    return data.candidatos.filter((c) => {
      return (
        c.catecumeno?.toLowerCase().includes(q) ||
        c.encarregado?.toLowerCase().includes(q) ||
        c.padrinhos?.toLowerCase().includes(q)
      );
    });
  }, [data, filter]);

  function handleCandidatoSaved(rowName: string, updates: Partial<CandidatoSacramento>) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        candidatos: prev.candidatos.map((c) =>
          c.name === rowName ? { ...c, ...updates } : c
        ),
      };
    });
  }

  if (loading) return <Loading />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertCircle className="w-10 h-10 mb-3 text-rose-400" />
        <p className="font-display italic">{error || 'Preparação não encontrada.'}</p>
        <button onClick={() => history.back()} className="mt-4 text-navy-700 text-sm hover:underline">
          ← Voltar
        </button>
      </div>
    );
  }

  const ficha_ok = data.candidatos.filter((c) => c.ficha).length;
  const docs_ok = data.candidatos.filter((c) => c.documentos_padrinhos).length;
  const total = data.candidatos.length;

  return (
    <div className="animate-fade-up space-y-5">
      {/* Back */}
      <button
        onClick={() => history.back()}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      {/* Header card */}
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
              {data.ano_lectivo && (
                <p className="text-sm text-white/60 mt-1">{data.ano_lectivo}</p>
              )}
            </div>
            {data.data_do_sacramento && (
              <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-right">
                <div className="text-xs text-white/60 mb-0.5">Data</div>
                <div className="text-white font-semibold text-sm">
                  {fmtDate(data.data_do_sacramento)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress summary */}
        <div className="grid grid-cols-3 divide-x divide-cream-200 border-t border-cream-200">
          <div className="px-4 py-3 text-center">
            <div className="text-xl font-display font-bold text-navy-900">{total}</div>
            <div className="text-xs text-slate-500">Candidatos</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-xl font-display font-bold text-emerald-600">{ficha_ok}</div>
            <div className="text-xs text-slate-500">Fichas</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-xl font-display font-bold text-emerald-600">{docs_ok}</div>
            <div className="text-xs text-slate-500">Docs Padrinhos</div>
          </div>
        </div>
      </div>

      {/* Requisitos e Custos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Documentos + observações */}
        {(data.documentos_exigidos || data.observacoes) && (
          <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs p-5">
            {data.documentos_exigidos && (
              <>
                <h2 className="flex items-center gap-2 font-semibold text-navy-900 text-sm mb-3">
                  <FileText className="w-4 h-4 text-slate-400" />
                  Documentos Exigidos
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {data.documentos_exigidos}
                </p>
              </>
            )}
            {data.observacoes && (
              <div className={`${data.documentos_exigidos ? 'mt-4 pt-4 border-t border-cream-200' : ''}`}>
                <h2 className="font-semibold text-navy-900 text-sm mb-2">Observações</h2>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {data.observacoes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Custos base */}
        {(data.valor_ofertorio != null || data.valor_cracha != null) && (
          <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs p-5">
            <h2 className="flex items-center gap-2 font-semibold text-navy-900 text-sm mb-4">
              <Euro className="w-4 h-4 text-slate-400" />
              Custos de Referência
            </h2>
            <div className="space-y-3">
              {data.valor_ofertorio != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Ofertório</span>
                  <span className="text-sm font-semibold text-navy-900">{fmt(data.valor_ofertorio)}</span>
                </div>
              )}
              {data.valor_cracha != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Crachá</span>
                  <span className="text-sm font-semibold text-navy-900">{fmt(data.valor_cracha)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Candidates section */}
      <div className="bg-white rounded-2xl border border-cream-300 shadow-warm-xs overflow-hidden">
        {/* Header + search */}
        <div className="px-5 py-4 border-b border-cream-200 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-navy-900">
              Candidatos ao Sacramento
            </h2>
            <span className="text-xs text-slate-400 bg-cream-100 border border-cream-300
              rounded-full px-2 py-0.5">
              {filter ? `${candidatosFiltrados.length}/` : ''}{total}
            </span>
          </div>

          {total > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Pesquisar candidato, encarregado, padrinho..."
                className="pl-9 pr-8 py-2 text-sm rounded-xl border border-cream-300 bg-cream-50
                  focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-700/20 focus:border-navy-700/30
                  transition-all w-full sm:w-72"
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
          )}
        </div>

        {/* Candidate list */}
        <div className="p-4 space-y-3">
          {candidatosFiltrados.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm font-display italic">
              {filter ? `Nenhum resultado para "${filter}"` : 'Nenhum candidato nesta preparação.'}
            </div>
          ) : (
            candidatosFiltrados.map((c) => (
              <CandidatoCard
                key={c.name}
                candidato={c}
                preparacaoNome={data.name}
                onSaved={(updates) => handleCandidatoSaved(c.name, updates)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Root content ─────────────────────────────────────────────────────────────

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

  // Detail view
  if (nome) {
    return <DetalhePreparacao nome={nome} />;
  }

  // List view
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

      {loadingLista ? (
        <Loading />
      ) : errorLista ? (
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

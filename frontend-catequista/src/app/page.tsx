'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  MapPin, Clock, Calendar, Users, Search, Pencil, X,
  Save, ChevronDown, Phone, User, BookOpen, Cake, AlertCircle,
} from 'lucide-react';
import Nav from '@/components/Nav';
import PhaseChip from '@/components/PhaseChip';
import { FullPageLoading } from '@/components/Loading';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api } from '@/lib/api';
import type { TurmaComCatecumenos, CatecumenoCompleto, EditFormData } from '@/types/catequista';

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

function initForm(cat: CatecumenoCompleto): EditFormData {
  return {
    sexo: cat.sexo || '',
    encarregado: cat.encarregado || '',
    contacto_encarregado: cat.contacto_encarregado || '',
    padrinhos: cat.padrinhos || '',
    contacto_padrinhos: cat.contacto_padrinhos || '',
    data_de_nascimento: cat.data_de_nascimento || '',
    idade: cat.idade !== null && cat.idade !== undefined ? String(cat.idade) : '',
    obs: cat.obs || '',
    total_presencas: cat.total_presencas,
    total_faltas: cat.total_faltas,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TurmaHeader({ turma }: { turma: TurmaComCatecumenos }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs overflow-hidden animate-fade-up">
      {/* Coloured top stripe keyed to phase */}
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

// ── Edit Modal ─────────────────────────────────────────────────────────────────

interface EditModalProps {
  cat: CatecumenoCompleto;
  onClose: () => void;
  onSaved: (updated: CatecumenoCompleto) => void;
}

function EditModal({ cat, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState<EditFormData>(initForm(cat));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function set(field: keyof EditFormData, value: string | number) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api.atualizarCatecumeno(cat.name, {
        row_name: cat.row_name,
        sexo: form.sexo || undefined,
        encarregado: form.encarregado || undefined,
        contacto_encarregado: form.contacto_encarregado || undefined,
        padrinhos: form.padrinhos || undefined,
        contacto_padrinhos: form.contacto_padrinhos || undefined,
        data_de_nascimento: form.data_de_nascimento || undefined,
        idade: form.idade ? Number(form.idade) : undefined,
        obs: form.obs || undefined,
        total_presencas: form.total_presencas,
        total_faltas: form.total_faltas,
      });
      onSaved({
        ...cat,
        sexo: form.sexo as CatecumenoCompleto['sexo'] || cat.sexo,
        encarregado: form.encarregado || cat.encarregado,
        contacto_encarregado: form.contacto_encarregado || cat.contacto_encarregado,
        padrinhos: form.padrinhos || cat.padrinhos,
        contacto_padrinhos: form.contacto_padrinhos || cat.contacto_padrinhos,
        data_de_nascimento: form.data_de_nascimento || cat.data_de_nascimento,
        idade: form.idade ? Number(form.idade) : cat.idade,
        obs: form.obs || cat.obs,
        total_presencas: form.total_presencas,
        total_faltas: form.total_faltas,
      });
    } catch (e) {
      setError(String((e as Error).message || e));
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-navy-900/40 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50 p-0 md:p-4">
        <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[92dvh] md:max-h-[88vh] flex flex-col shadow-warm-lg animate-slide-up">

          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-cream-200 shrink-0">
            <div>
              <h3 className="font-display font-bold text-navy-900 text-lg leading-tight">{cat.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <PhaseChip fase={cat.fase} />
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  cat.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-cream-200 text-slate-600'
                }`}>
                  {cat.status}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-navy-900 hover:bg-cream-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="overflow-y-auto flex-1 p-5 space-y-5">

            {/* Dados Pessoais */}
            <Section title="Dados Pessoais" icon={<User className="w-4 h-4" />}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sexo</Label>
                  <select
                    value={form.sexo}
                    onChange={e => set('sexo', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div>
                  <Label>Idade</Label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={form.idade}
                    onChange={e => set('idade', e.target.value)}
                    placeholder="—"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <input
                  type="date"
                  value={form.data_de_nascimento}
                  onChange={e => set('data_de_nascimento', e.target.value)}
                  className={inputCls}
                />
              </div>
            </Section>

            {/* Encarregado */}
            <Section title="Encarregado de Educação" icon={<User className="w-4 h-4" />}>
              <div>
                <Label>Nome</Label>
                <input
                  type="text"
                  value={form.encarregado}
                  onChange={e => set('encarregado', e.target.value)}
                  placeholder="Nome do encarregado"
                  className={inputCls}
                />
              </div>
              <div>
                <Label>Contacto</Label>
                <input
                  type="tel"
                  value={form.contacto_encarregado}
                  onChange={e => set('contacto_encarregado', e.target.value)}
                  placeholder="+258 8X XXX XXXX"
                  className={inputCls}
                />
              </div>
            </Section>

            {/* Padrinhos */}
            <Section title="Padrinhos / Madrinhas" icon={<Users className="w-4 h-4" />}>
              <div>
                <Label>Nome</Label>
                <input
                  type="text"
                  value={form.padrinhos}
                  onChange={e => set('padrinhos', e.target.value)}
                  placeholder="Nomes dos padrinhos"
                  className={inputCls}
                />
              </div>
              <div>
                <Label>Contacto</Label>
                <input
                  type="tel"
                  value={form.contacto_padrinhos}
                  onChange={e => set('contacto_padrinhos', e.target.value)}
                  placeholder="+258 8X XXX XXXX"
                  className={inputCls}
                />
              </div>
            </Section>

            {/* Presenças */}
            <Section title="Presenças e Faltas" icon={<BookOpen className="w-4 h-4" />}>
              <div className="grid grid-cols-2 gap-3">
                <CounterField
                  label="Presenças"
                  value={form.total_presencas}
                  onChange={v => set('total_presencas', v)}
                  color="emerald"
                />
                <CounterField
                  label="Faltas"
                  value={form.total_faltas}
                  onChange={v => set('total_faltas', v)}
                  color="rose"
                />
              </div>
            </Section>

            {/* Observações */}
            <Section title="Observações" icon={<Pencil className="w-4 h-4" />}>
              <textarea
                value={form.obs}
                onChange={e => set('obs', e.target.value)}
                placeholder="Notas adicionais sobre este catecúmeno..."
                rows={3}
                className={inputCls + ' resize-none'}
              />
            </Section>

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
              Cancelar
            </button>
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
          </div>
        </div>
      </div>
    </>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-cream-300 bg-cream-50 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all';

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-slate-400">{icon}</span>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h4>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-500 mb-1">{children}</label>;
}

function CounterField({
  label, value, onChange, color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: 'emerald' | 'rose';
}) {
  const ring = color === 'emerald' ? 'focus:ring-emerald-400/50 focus:border-emerald-400' : 'focus:ring-rose-400/50 focus:border-rose-400';
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 rounded-lg bg-cream-100 hover:bg-cream-200 text-navy-900 font-bold text-sm transition-colors shrink-0"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
          className={`w-full text-center px-2 py-1.5 rounded-lg border border-cream-300 bg-cream-50 text-sm font-semibold text-navy-900 focus:outline-none focus:ring-2 ${ring} transition-all`}
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-lg bg-cream-100 hover:bg-cream-200 text-navy-900 font-bold text-sm transition-colors shrink-0"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ── Catecumeno Table ─────────────────────────────────────────────────────────

interface TableProps {
  catecumenos: CatecumenoCompleto[];
  onEdit: (cat: CatecumenoCompleto) => void;
}

function CatecumenosTable({ catecumenos, onEdit }: TableProps) {
  const [query, setQuery] = useState('');

  const filtered = catecumenos.filter(c => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.encarregado || '').toLowerCase().includes(q)
    );
  });

  const birthdays = catecumenos.filter(c => isBirthdaySoon(c.data_de_nascimento));

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
            {/* Desktop table header */}
            <div className="hidden md:grid grid-cols-[2fr_2rem_3rem_2fr_6rem_4rem_4rem_2.5rem] gap-2 px-4 py-2.5 border-b border-cream-200 bg-cream-50">
              {['Nome', 'Sex', 'Idade', 'Encarregado', 'Contacto', 'Pres.', 'Falt.', ''].map(h => (
                <span key={h} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</span>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-cream-200">
              {filtered.map(cat => {
                const age = calcAge(cat.data_de_nascimento, cat.idade);
                const bday = isBirthdayToday(cat.data_de_nascimento);
                const bdaySoon = !bday && isBirthdaySoon(cat.data_de_nascimento);
                return (
                  <div key={cat.name} className="hover:bg-cream-50 transition-colors">

                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-[2fr_2rem_3rem_2fr_6rem_4rem_4rem_2.5rem] gap-2 items-center px-4 py-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {bday && <span title="Aniversário hoje!"><Cake className="w-3.5 h-3.5 text-amber-500 shrink-0" /></span>}
                        {bdaySoon && <span title="Aniversário esta semana"><Cake className="w-3.5 h-3.5 text-amber-300 shrink-0" /></span>}
                        <span className="text-sm font-medium text-navy-900 truncate">{cat.name}</span>
                      </div>
                      <span className="text-sm text-slate-500">{cat.sexo || '—'}</span>
                      <span className="text-sm text-slate-500">{age !== null ? age : '—'}</span>
                      <span className="text-sm text-slate-600 truncate">{cat.encarregado || '—'}</span>
                      <span className="text-xs text-slate-400 truncate font-mono">
                        {cat.contacto_encarregado || '—'}
                      </span>
                      <span className="text-sm font-semibold text-emerald-700 text-center">{cat.total_presencas}</span>
                      <span className="text-sm font-semibold text-rose-600 text-center">{cat.total_faltas}</span>
                      <button
                        onClick={() => onEdit(cat)}
                        title="Editar"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-navy-900 hover:bg-cream-200 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Mobile row */}
                    <div className="md:hidden flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {(bday || bdaySoon) && <Cake className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span className="text-sm font-medium text-navy-900 truncate">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {cat.encarregado && (
                            <span className="text-xs text-slate-400 truncate max-w-[140px]">{cat.encarregado}</span>
                          )}
                          <span className="text-xs text-emerald-600 font-semibold">✓ {cat.total_presencas}</span>
                          <span className="text-xs text-rose-500 font-semibold">✗ {cat.total_faltas}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => onEdit(cat)}
                        className="p-2 rounded-xl bg-cream-100 hover:bg-cream-200 text-slate-500 hover:text-navy-900 transition-colors shrink-0"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                );
              })}
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
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [editing, setEditing] = useState<{ cat: CatecumenoCompleto; turmaIdx: number } | null>(null);

  useEffect(() => {
    if (!auth) return;
    api.getMinhaTurma()
      .then(data => { setTurmas(data); setDataLoading(false); })
      .catch(e => { setDataError(String(e.message || e)); setDataLoading(false); });
  }, [auth]);

  const handleSaved = useCallback((updated: CatecumenoCompleto, turmaIdx: number) => {
    setTurmas(prev => prev.map((t, i) => {
      if (i !== turmaIdx) return t;
      return {
        ...t,
        catecumenos: t.catecumenos.map(c => c.name === updated.name ? updated : c),
      };
    }));
    setEditing(null);
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
                onClick={() => { setDataLoading(true); setDataError(''); api.getMinhaTurma().then(setTurmas).catch(e => setDataError(String(e.message))).finally(() => setDataLoading(false)); }}
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
                onEdit={cat => setEditing({ cat, turmaIdx })}
              />
            </div>
          </div>
        ))}
      </main>

      {/* Edit modal */}
      {editing && (
        <EditModal
          cat={editing.cat}
          onClose={() => setEditing(null)}
          onSaved={updated => handleSaved(updated, editing.turmaIdx)}
        />
      )}

      <footer className="border-t border-cream-200 mt-16 py-8 text-center">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} {process.env.NEXT_PUBLIC_PARISH_NAME || 'PNSA'} — Portal do Catequista
        </p>
      </footer>
    </>
  );
}

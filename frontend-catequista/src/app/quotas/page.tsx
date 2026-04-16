'use client';

import React, { useEffect, useState } from 'react';
import { TrendingUp, Users, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import Nav from '@/components/Nav';
import { FullPageLoading } from '@/components/Loading';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { api } from '@/lib/api';
import type { QuotasResumo, QuotaCatequistaResumoRow } from '@/types/catequista';

// ── Constants ─────────────────────────────────────────────────────────────────

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL  = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

function fmt(v: number) {
  return v.toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' MT';
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs p-5 flex gap-4 items-start">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-navy-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Monthly grid for one catequista ───────────────────────────────────────────

function MyMonthGrid({ row, ano }: { row: QuotaCatequistaResumoRow; ano: string }) {
  const currentMonth = new Date().getFullYear() === parseInt(ano, 10)
    ? String(new Date().getMonth() + 1).padStart(2, '0')
    : null;

  return (
    <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
      {MONTHS.map((m, i) => {
        const entry = row.meses[m];
        const isCurrent = m === currentMonth;
        return (
          <div
            key={m}
            className={`rounded-xl p-2 text-center transition-all ${
              entry
                ? 'bg-emerald-50 border border-emerald-200'
                : isCurrent
                  ? 'bg-gold-50 border-2 border-gold-400 border-dashed'
                  : 'bg-cream-50 border border-cream-200'
            }`}
          >
            <p className={`text-[10px] font-semibold mb-1 ${
              entry ? 'text-emerald-600' : isCurrent ? 'text-gold-600' : 'text-slate-400'
            }`}>
              {MESES_SHORT[i]}
            </p>
            {entry ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-0.5" />
                <p className="text-[10px] font-bold text-emerald-700 leading-none">
                  {entry.valor.toLocaleString('pt-MZ')}
                </p>
              </>
            ) : (
              <XCircle className={`w-4 h-4 mx-auto ${isCurrent ? 'text-gold-400' : 'text-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Team row ──────────────────────────────────────────────────────────────────

function TeamRow({ row, maxTotal, isMe }: { row: QuotaCatequistaResumoRow; maxTotal: number; isMe: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const progress = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0;

  return (
    <div className={`rounded-xl border transition-all ${
      isMe ? 'border-gold-300 bg-gold-50/40' : 'border-cream-200 bg-white'
    }`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          isMe ? 'bg-gold-500/20 text-gold-700' : 'bg-cream-200 text-slate-600'
        }`}>
          {row.catequista.split(' ').map(w => w[0]).slice(0, 2).join('')}
        </div>

        {/* Name + bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-semibold truncate ${isMe ? 'text-gold-800' : 'text-navy-900'}`}>
              {row.catequista}
            </span>
            {isMe && (
              <span className="text-[10px] font-bold tracking-wide text-gold-600 bg-gold-100 px-1.5 py-0.5 rounded-full shrink-0">
                EU
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-cream-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isMe ? 'bg-gold-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 shrink-0 font-medium">
              {row.meses_pagos}/12 meses
            </span>
          </div>
        </div>

        {/* Total */}
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${isMe ? 'text-gold-800' : 'text-navy-900'}`}>
            {row.total > 0 ? fmt(row.total) : <span className="text-slate-300 font-normal">—</span>}
          </p>
        </div>

        {/* Expand chevron */}
        <svg
          className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded monthly detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-cream-100">
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 mt-3">
            {MONTHS.map((m, i) => {
              const entry = row.meses[m];
              return (
                <div key={m} className={`rounded-lg p-1.5 text-center text-[10px] font-medium ${
                  entry
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-cream-50 text-slate-300 border border-cream-100'
                }`}>
                  <div className="font-semibold">{MESES_SHORT[i]}</div>
                  <div>{entry ? entry.valor.toLocaleString('pt-MZ') : '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuotasPage() {
  const { auth, loading: authLoading } = useAuthGuard();
  const meuNome = auth?.catequista ?? null;

  const currentYear = String(new Date().getFullYear());
  const [ano, setAno]           = useState(currentYear);
  const [data, setData]         = useState<QuotasResumo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (authLoading) return;
    setLoading(true); setError('');
    api.getQuotasResumo(ano)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [ano, authLoading]);

  if (authLoading) return <FullPageLoading />;

  const myRow  = data?.catequistas.find(r => r.catequista === meuNome) ?? null;
  const maxTotal = data ? Math.max(...data.catequistas.map(r => r.total), 1) : 1;
  const meusMesesPagos = myRow?.meses_pagos ?? 0;
  const meusTotal      = myRow?.total ?? 0;

  const yearOptions = [
    String(parseInt(currentYear) - 1),
    currentYear,
    String(parseInt(currentYear) + 1),
  ];

  return (
    <div className="min-h-screen bg-cream-50">
      <Nav catequistaNome={meuNome || undefined} />

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-navy-900">Quotas</h1>
            <p className="text-sm text-slate-500 mt-0.5">Pagamentos mensais do grupo de catequistas</p>
          </div>
          <select
            value={ano}
            onChange={e => setAno(e.target.value)}
            className="border border-cream-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold-500/30 font-medium text-navy-900"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700 mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-gold-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : data && (
          <div className="space-y-6">

            {/* ── Stat cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Os meus pagamentos"
                value={meusTotal > 0 ? fmt(meusTotal) : '—'}
                icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                accent="bg-emerald-50"
              />
              <StatCard
                label="Meses pagos"
                value={`${meusMesesPagos} / 12`}
                icon={<Calendar className="w-5 h-5 text-gold-600" />}
                accent="bg-gold-50"
              />
              <StatCard
                label="Total do grupo"
                value={fmt(data.total_geral)}
                icon={<Users className="w-5 h-5 text-navy-600" />}
                accent="bg-navy-50"
              />
            </div>

            {/* ── My payments ─────────────────────────────────────────────── */}
            {myRow && (
              <div className="bg-white rounded-2xl border border-cream-200 shadow-warm-xs p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-5 rounded-full bg-gold-400" />
                  <h2 className="font-semibold text-navy-900">Os meus pagamentos — {ano}</h2>
                </div>
                <MyMonthGrid row={myRow} ano={ano} />

                {/* Totals summary */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-cream-100">
                  <p className="text-sm text-slate-500">
                    {meusMesesPagos === 0
                      ? 'Nenhum pagamento registado este ano.'
                      : `${meusMesesPagos} pagamento${meusMesesPagos === 1 ? '' : 's'} registado${meusMesesPagos === 1 ? '' : 's'}`
                    }
                  </p>
                  {meusTotal > 0 && (
                    <p className="text-sm font-bold text-emerald-700">Total: {fmt(meusTotal)}</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Month legend if current year ────────────────────────────── */}
            {ano === currentYear && (
              <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
                  Pago
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-gold-50 border-2 border-gold-400 border-dashed" />
                  Mês actual
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-cream-50 border border-cream-200" />
                  Não pago
                </div>
              </div>
            )}

            {/* ── Team overview ────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 rounded-full bg-navy-400" />
                <h2 className="font-semibold text-navy-900">Resumo do grupo — {ano}</h2>
              </div>

              <div className="space-y-2">
                {/* Sort: me first, then by total desc */}
                {[...data.catequistas]
                  .sort((a, b) => {
                    if (a.catequista === meuNome) return -1;
                    if (b.catequista === meuNome) return 1;
                    return b.total - a.total;
                  })
                  .map(row => (
                    <TeamRow
                      key={row.catequista}
                      row={row}
                      maxTotal={maxTotal}
                      isMe={row.catequista === meuNome}
                    />
                  ))
                }
              </div>

              {/* Group total bar */}
              {data.total_geral > 0 && (
                <div className="mt-4 bg-white rounded-xl border border-cream-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">Total arrecadado em {ano}</span>
                  <span className="text-base font-bold text-navy-900">{fmt(data.total_geral)}</span>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

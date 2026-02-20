import { MapPin, Clock, Users, User } from 'lucide-react';
import type { Turma } from '@/types/catequese';
import PhaseChip from './PhaseChip';

const PHASE_ACCENT: Record<string, string> = {
  '1ª Fase':          'border-t-sky-400',
  '2ª Fase':          'border-t-violet-400',
  '3ª Fase':          'border-t-amber-400',
  'Pré-Catecumenato': 'border-t-emerald-400',
  'Catecumenato':     'border-t-rose-400',
};

export default function TurmaCard({ turma }: { turma: Turma }) {
  const accentBorder = PHASE_ACCENT[turma.fase] ?? 'border-t-navy-900';

  return (
    <a
      href={`/portal/turma/?nome=${encodeURIComponent(turma.name)}`}
      className={`block bg-white rounded-2xl border border-cream-300 border-t-[3px] ${accentBorder} p-5 shadow-warm-xs hover:shadow-warm hover:-translate-y-0.5 transition-all duration-150`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-navy-900 text-sm truncate">{turma.name}</h3>
          <div className="mt-1.5">
            <PhaseChip fase={turma.fase} />
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-500 text-xs shrink-0 bg-cream-100 rounded-lg px-2 py-1">
          <Users className="w-3.5 h-3.5 text-navy-900/40" />
          <span className="font-semibold text-navy-900">{turma.total_catecumenos}</span>
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-slate-600">
        {turma.local && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{turma.local}</span>
          </div>
        )}
        {(turma.dia || turma.hora) && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{[turma.dia, turma.hora].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        {(turma.catequista || turma.catequista_adj) && (
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {[turma.catequista, turma.catequista_adj].filter(Boolean).join(' & ')}
            </span>
          </div>
        )}
      </div>
    </a>
  );
}

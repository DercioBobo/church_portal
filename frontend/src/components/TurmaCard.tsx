import Link from 'next/link';
import { MapPin, Clock, Users, User } from 'lucide-react';
import type { Turma } from '@/types/catequese';
import PhaseChip from './PhaseChip';

export default function TurmaCard({ turma }: { turma: Turma }) {
  return (
    <Link
      href={`/turma?nome=${encodeURIComponent(turma.name)}`}
      prefetch={false}
      className="block bg-white rounded-2xl border border-slate-200 p-5 hover:bg-slate-50 hover:border-slate-300 transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">{turma.name}</h3>
          <div className="mt-1">
            <PhaseChip fase={turma.fase} />
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-500 text-xs shrink-0">
          <Users className="w-3.5 h-3.5" />
          <span>{turma.total_catecumenos}</span>
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-slate-600">
        {turma.local && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{turma.local}</span>
          </div>
        )}
        {(turma.dia || turma.hora) && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              {[turma.dia, turma.hora].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
        {(turma.catequista || turma.catequista_adj) && (
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              {[turma.catequista, turma.catequista_adj].filter(Boolean).join(' e ')}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

import { Cake } from 'lucide-react';
import type { Aniversariante } from '@/types/catequese';
import PhaseChip from './PhaseChip';

export default function BirthdayList({ birthdays }: { birthdays: Aniversariante[] }) {
  if (birthdays.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden border border-rose-200 shadow-warm-xs">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-50 to-pink-50 px-5 py-4 flex items-center gap-3 border-b border-rose-100">
        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-warm-xs shrink-0">
          <Cake className="w-4 h-4 text-rose-500" />
        </div>
        <h2 className="font-display font-semibold text-rose-900">Aniversários hoje</h2>
        <span className="ml-auto text-xs bg-white text-rose-600 font-bold px-2.5 py-0.5 rounded-full border border-rose-200 shadow-warm-xs">
          {birthdays.length}
        </span>
      </div>

      {/* List */}
      <ul className="bg-white divide-y divide-rose-50/80">
        {birthdays.map((b) => (
          <li key={b.name} className="px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900 text-sm truncate">{b.name}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <PhaseChip fase={b.fase} />
                {b.turma && <span className="text-xs text-slate-500 truncate">{b.turma}</span>}
              </div>
            </div>
            <div className="shrink-0 text-center bg-rose-50 border border-rose-100 rounded-xl px-3 py-1.5">
              <div className="text-lg font-display font-bold text-rose-600 leading-none">{b.idade_nova}</div>
              <div className="text-[10px] text-rose-400 uppercase tracking-widest mt-0.5">anos</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

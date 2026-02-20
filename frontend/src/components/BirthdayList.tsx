import { Cake } from 'lucide-react';
import type { Aniversariante } from '@/types/catequese';
import PhaseChip from './PhaseChip';

export default function BirthdayList({ birthdays }: { birthdays: Aniversariante[] }) {
  if (birthdays.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Cake className="w-5 h-5 text-pink-500" />
        <h2 className="text-lg font-semibold text-slate-900">Aniversários hoje</h2>
        <span className="ml-auto text-xs bg-pink-50 text-pink-600 font-medium px-2.5 py-0.5 rounded-full">
          {birthdays.length}
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {birthdays.map((b) => (
          <li key={b.name} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-slate-900 text-sm">{b.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <PhaseChip fase={b.fase} />
                {b.turma && (
                  <span className="text-xs text-slate-500">{b.turma}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-slate-900">{b.idade_nova} anos</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

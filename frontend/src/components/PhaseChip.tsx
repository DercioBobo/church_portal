const PHASE_COLORS: Record<string, string> = {
  '1ª Fase': 'bg-sky-100 text-sky-700',
  '2ª Fase': 'bg-violet-100 text-violet-700',
  '3ª Fase': 'bg-amber-100 text-amber-700',
  'Pré-Catecumenato': 'bg-emerald-100 text-emerald-700',
  'Catecumenato': 'bg-red-100 text-red-700',
};

export default function PhaseChip({ fase }: { fase: string }) {
  const color = PHASE_COLORS[fase] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {fase || '—'}
    </span>
  );
}

const PHASE_STYLES: Record<string, string> = {
  '1ª Fase':          'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
  '2ª Fase':          'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
  '3ª Fase':          'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  'Pré-Catecumenato': 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  'Catecumenato':     'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
};

export default function PhaseChip({ fase }: { fase: string }) {
  const style = PHASE_STYLES[fase] ?? 'bg-cream-200 text-slate-600 ring-1 ring-cream-300';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${style}`}>
      {fase || '—'}
    </span>
  );
}

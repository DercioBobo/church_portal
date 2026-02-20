interface Props {
  label: string;
  value: number;
  icon: React.ReactNode;
}

export default function StatsCard({ label, value, icon }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-6 flex items-center gap-4 shadow-warm-xs hover:shadow-warm-sm transition-shadow duration-200">
      <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center text-gold-400 shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-3xl font-display font-bold text-navy-900 leading-none">{value}</div>
        <div className="text-sm text-slate-500 mt-1">{label}</div>
      </div>
    </div>
  );
}

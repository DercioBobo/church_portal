interface Props {
  label: string;
  value: number;
  icon: React.ReactNode;
}

export default function StatsCard({ label, value, icon }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-800 shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}

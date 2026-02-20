export default function Loading({ text = 'A carregar...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      {/* Cross-and-ring spinner — nods to the church context */}
      <div className="relative w-10 h-10">
        {/* Static cross arms */}
        <div className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 bg-navy-900/12 rounded-full" />
        <div className="absolute left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2 bg-navy-900/12 rounded-full" />
        {/* Spinning arc */}
        <div className="absolute inset-0 rounded-full border-[3px] border-navy-900/10 border-t-gold-500 animate-spin" />
      </div>
      <span className="text-sm font-display italic text-navy-900/40">{text}</span>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-cream-300 p-5 shadow-warm-xs animate-pulse">
      <div className="h-4 bg-cream-200 rounded-full w-3/4 mb-3" />
      <div className="h-3 bg-cream-200 rounded-full w-1/3 mb-5" />
      <div className="space-y-2.5">
        <div className="h-3 bg-cream-200 rounded-full w-1/2" />
        <div className="h-3 bg-cream-200 rounded-full w-2/3" />
      </div>
    </div>
  );
}

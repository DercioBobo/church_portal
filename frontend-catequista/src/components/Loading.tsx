export default function Loading({ text = 'A carregar...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="relative w-10 h-10">
        <div className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 bg-navy-900/12 rounded-full" />
        <div className="absolute left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2 bg-navy-900/12 rounded-full" />
        <div className="absolute inset-0 rounded-full border-[3px] border-navy-900/10 border-t-gold-500 animate-spin" />
      </div>
      <span className="text-sm font-display italic text-navy-900/40">{text}</span>
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50">
      <Loading />
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="animate-pulse flex gap-3 py-3 px-4 border-b border-cream-200">
      <div className="h-3 bg-cream-200 rounded-full w-1/3" />
      <div className="h-3 bg-cream-200 rounded-full w-8" />
      <div className="h-3 bg-cream-200 rounded-full w-8" />
      <div className="h-3 bg-cream-200 rounded-full w-1/4" />
    </div>
  );
}

"use client";

export function EmptyState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={`grid place-items-center border border-dashed border-white/10 bg-black/20 p-4 text-center ${compact ? "min-h-20" : "h-full min-h-[300px]"}`}>
      <div>
        <p className="text-sm font-semibold text-zinc-200">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">{detail}</p>
      </div>
    </div>
  );
}

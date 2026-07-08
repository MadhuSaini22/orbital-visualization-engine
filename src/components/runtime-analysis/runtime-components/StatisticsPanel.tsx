"use client";

export function StatisticsPanel({ title = "Statistics", stats }: { title?: string; stats: Record<string, string | number | boolean | null | undefined> }) {
  const entries = Object.entries(stats).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return null;
  return (
    <div className="border border-white/10 bg-black/25 p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300">{title}</p>
      <div className="grid gap-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5 text-xs last:border-b-0 last:pb-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">{key}</span>
            <span className="text-right text-zinc-200">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

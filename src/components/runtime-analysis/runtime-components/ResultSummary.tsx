"use client";

export function ResultSummary({ items }: { items: Array<{ label: string; value: string; tone?: "cyan" | "emerald" | "amber" | "rose" }> }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => {
        const toneClass = item.tone === "emerald" ? "text-emerald-200 border-emerald-300/30" : item.tone === "amber" ? "text-amber-200 border-amber-300/30" : item.tone === "rose" ? "text-rose-200 border-rose-300/30" : "text-cyan-100 border-cyan-300/25";
        return (
          <div key={item.label} className={`border bg-black/30 p-3 ${toneClass}`}>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{item.label}</p>
            <p className="mt-1 truncate text-lg font-semibold" title={item.value}>{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

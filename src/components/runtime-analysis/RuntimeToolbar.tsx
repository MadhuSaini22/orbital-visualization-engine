"use client";

export function RuntimeToolbar({ title, loading }: { title: string; loading: boolean }) {
  return (
    <header className="border-b border-cyan-300/15 bg-black/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Satellite Proximity</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
        </div>
        <div className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${loading ? "border-amber-300/40 text-amber-200" : "border-emerald-300/30 text-emerald-200"}`}>
          {loading ? "Runtime request in progress" : "Ready"}
        </div>
      </div>
    </header>
  );
}

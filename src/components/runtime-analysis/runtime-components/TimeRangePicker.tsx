"use client";

export function TimeRangePicker({ start, stop, onStartChange, onStopChange }: { start: string; stop: string; onStartChange: (value: string) => void; onStopChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Start UTC</span>
        <input type="datetime-local" value={start} onChange={(event) => onStartChange(event.target.value)} className="mt-1 w-full border border-cyan-300/25 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300" />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Stop UTC</span>
        <input type="datetime-local" value={stop} onChange={(event) => onStopChange(event.target.value)} className="mt-1 w-full border border-cyan-300/25 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300" />
      </label>
    </div>
  );
}

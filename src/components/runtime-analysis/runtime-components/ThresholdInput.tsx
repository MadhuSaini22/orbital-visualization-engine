"use client";

export function ThresholdInput({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">{label} ({unit})</span>
      <input value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value)} className="mt-1 w-full border border-cyan-300/25 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300" />
    </label>
  );
}

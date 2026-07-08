"use client";

import type { RuntimeRelativeFrame } from "@/services/orbitServerApi";

export function RelativeFrameSelector({ value, onChange }: { value: RuntimeRelativeFrame; onChange: (value: RuntimeRelativeFrame) => void }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Relative Frame</span>
      <select value={value} onChange={() => onChange("LVLH_RTN")} className="mt-1 w-full border border-cyan-300/25 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300">
        <option value="LVLH_RTN">LVLH RTN</option>
      </select>
    </label>
  );
}

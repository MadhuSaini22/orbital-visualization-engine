import type { ReactNode } from "react";

export function HudPanel({ children, className = "p-4" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-cyan-300/25 bg-[#071016]/82 shadow-[0_0_32px_rgba(34,211,238,0.08)] backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300/55">{label}</p>
      <p className="mt-1 break-words font-mono text-xs font-semibold leading-5 text-zinc-100">{value}</p>
    </div>
  );
}

"use client";

export function LoadingOverlay({ label = "Waiting for runtime API" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 backdrop-blur-sm">
      <div className="border border-cyan-300/30 bg-[#071016] px-4 py-3 font-mono text-xs uppercase tracking-[0.16em] text-cyan-100">{label}</div>
    </div>
  );
}

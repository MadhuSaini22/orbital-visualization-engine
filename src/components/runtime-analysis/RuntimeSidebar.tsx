"use client";

import type { RuntimePageId } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";

export const runtimePages: Array<{ id: RuntimePageId; label: string }> = [
  { id: "satellite", label: "Runtime Satellite" },
  { id: "propagation", label: "Orbit Propagation" },
  { id: "visibility", label: "Visibility" },
  { id: "eclipse", label: "Eclipse" },
  { id: "relative-motion", label: "Relative Motion" },
  { id: "pairwise", label: "Pairwise Conjunction" },
  { id: "catalog-screening", label: "Catalog Screening" },
  { id: "collision", label: "Collision Probability" },
  { id: "covariance", label: "Covariance Propagation" },
];

export function RuntimeSidebar({ activePage, onPageChange }: { activePage: RuntimePageId; onPageChange: (page: RuntimePageId) => void }) {
  return (
    <aside className="thin-scrollbar min-h-0 overflow-auto border-r border-cyan-300/15 bg-[#071016] p-3">
      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Runtime Modules</p>
      <nav className="grid gap-1" aria-label="Runtime analysis modules">
        {runtimePages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => onPageChange(page.id)}
            className={`border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] transition ${
              activePage === page.id
                ? "border-cyan-300 bg-cyan-300 text-slate-950"
                : "border-white/10 bg-black/30 text-zinc-300 hover:border-cyan-300/70 hover:text-cyan-100"
            }`}
          >
            {page.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

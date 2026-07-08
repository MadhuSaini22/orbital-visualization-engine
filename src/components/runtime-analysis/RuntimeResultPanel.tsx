"use client";

import { JsonViewer } from "@/components/runtime-analysis/runtime-components/JsonViewer";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { StatisticsPanel } from "@/components/runtime-analysis/runtime-components/StatisticsPanel";
import { EmptyState } from "@/components/runtime-analysis/runtime-components/EmptyState";
import type { RuntimeWorkspaceResult } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";

export function RuntimeResultPanel({ result }: { result: RuntimeWorkspaceResult }) {
  return (
    <aside className="thin-scrollbar min-h-0 overflow-auto bg-[#071016] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Analysis Results</p>
          <h3 className="mt-1 text-sm font-semibold text-white">Response Summary</h3>
        </div>
        <button type="button" disabled={!result} onClick={() => exportJson("runtime-analysis.json", result)} className="border border-white/10 px-3 py-2 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100 disabled:opacity-40">Export</button>
      </div>
      {!result ? (
        <EmptyState title="No result" detail="Run a runtime page to populate this panel." compact />
      ) : (
        <div className="space-y-3">
          <ResultSummary items={summaryItems(result)} />
          {"statistics" in result && typeof result.statistics === "object" && result.statistics && <StatisticsPanel stats={result.statistics as Record<string, string | number | boolean>} />}
          {"executionStatistics" in result && typeof result.executionStatistics === "object" && result.executionStatistics && <StatisticsPanel title="Execution Statistics" stats={result.executionStatistics as Record<string, string | number | boolean>} />}
          <JsonViewer value={result} />
        </div>
      )}
    </aside>
  );
}

function summaryItems(result: RuntimeWorkspaceResult) {
  if (!result) return [];
  if ("catalogSatellite" in result) {
    return [
      { label: "Satellite", value: result.catalogSatellite.objectName },
      { label: "NORAD", value: String(result.catalogSatellite.noradCatalogId) },
      { label: "Epoch", value: result.catalogSatellite.epochAt?.slice(0, 19) ?? "--" },
      { label: "Validation", value: "Runtime TLE accepted", tone: "emerald" as const },
    ];
  }
  if ("states" in result) return [{ label: "Samples", value: String(result.states.length) }];
  if ("windows" in result) return [{ label: "Visibility Windows", value: String(result.windows.length) }];
  if ("intervals" in result) return [{ label: "Eclipse Intervals", value: String(result.intervals.length) }];
  if ("closestApproach" in result) {
    return [
      { label: "Status", value: result.status, tone: result.status === "CLEAR" ? "emerald" as const : "rose" as const },
      { label: "Miss Distance", value: `${result.closestApproach.missDistanceMeters.toFixed(2)} m` },
      { label: "Relative Speed", value: `${result.closestApproach.relativeSpeedMetersPerSecond.toFixed(2)} m/s` },
      { label: "TCA", value: result.closestApproach.timeOfClosestApproach.slice(0, 19) },
    ];
  }
  if ("candidates" in result) return [{ label: "Candidates", value: String(result.candidates.length) }];
  if ("probabilityOfCollision" in result) {
    const probability = result.probabilityOfCollision;
    return [{ label: "Probability", value: probability.toExponential(3), tone: probability > 1e-4 ? "rose" as const : probability > 1e-6 ? "amber" as const : "emerald" as const }];
  }
  return [{ label: "Result", value: "Available" }];
}

function exportJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

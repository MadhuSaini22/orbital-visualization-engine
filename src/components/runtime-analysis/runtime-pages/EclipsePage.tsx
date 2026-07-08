"use client";

import { useState } from "react";
import { runRuntimeEclipse, runRuntimeOrbitEclipse, type RuntimeEclipseResult } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { TimeRangePicker } from "@/components/runtime-analysis/runtime-components/TimeRangePicker";
import { StepSelector } from "@/components/runtime-analysis/runtime-components/StepSelector";
import { AnalysisTable } from "@/components/runtime-analysis/runtime-components/AnalysisTable";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";
import { validateRuntimeTimeRange } from "@/components/runtime-analysis/runtime-components/time";
import { manualOrbitRuntimeRef } from "@/components/runtime-analysis/runtime-components/runtimeObjectRef";

export function EclipsePage({ primaryObject, primaryNoradCatalogId, onResult, onLoadingChange, onLog, onEclipse, onPrimaryNoradChange }: RuntimePageProps) {
  const [start, setStart] = useState("2026-07-07T00:00");
  const [stop, setStop] = useState("2026-07-07T01:30");
  const [stepSeconds, setStepSeconds] = useState("60");
  const [result, setResult] = useState<RuntimeEclipseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const validation = validate(primaryNoradCatalogId, primaryObject.orbitId ?? null, start, stop, stepSeconds);
    if (validation) return setError(validation);
    const noradCatalogId = primaryNoradCatalogId;
    if (!noradCatalogId && !primaryObject.orbitId) return;
    setLoading(true); onLoadingChange(true); setError(null);
    try {
      const range = validateRuntimeTimeRange(start, stop);
      if (range.error) throw new Error(range.error);
      const next = primaryObject.orbitId
        ? await runRuntimeOrbitEclipse({ primaryObject: manualOrbitRuntimeRef(primaryObject.orbitId), startTime: range.startIso, stopTime: range.stopIso, step: `PT${Number(stepSeconds)}S`, propagatorType: null })
        : await runRuntimeEclipse({ noradCatalogId: Number(noradCatalogId), startTime: range.startIso, stopTime: range.stopIso, step: `PT${Number(stepSeconds)}S` });
      setResult(next); onResult(next); onEclipse(next); if (noradCatalogId) onPrimaryNoradChange(noradCatalogId); onLog("Eclipse completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Eclipse request failed.";
      setError(message); onLog(`Eclipse failed: ${message}`);
    } finally {
      setLoading(false); onLoadingChange(false);
    }
  };
  const counts = result?.intervals.reduce<Record<string, number>>((acc, interval) => ({ ...acc, [interval.type]: (acc[interval.type] ?? 0) + 1 }), {}) ?? {};

  return (
    <div className="space-y-4">
      <ResultSummary items={[{ label: "Primary", value: primaryObject.label }, { label: "Source", value: primaryObject.source }, { label: "Catalog ID", value: primaryNoradCatalogId ?? "Direct orbit" }]} />
      <TimeRangePicker start={start} stop={stop} onStartChange={setStart} onStopChange={setStop} />
      <StepSelector value={stepSeconds} onChange={setStepSeconds} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Running" : "Run Eclipse"}</button>
      {result && <><ResultSummary items={[{ label: "Intervals", value: String(result.intervals.length) }, { label: "Sunlight", value: String(counts.SUNLIGHT ?? 0) }, { label: "Umbra", value: String(counts.UMBRA ?? 0) }, { label: "Penumbra", value: String(counts.PENUMBRA ?? 0) }]} /><AnalysisTable headers={["Type", "Start", "Stop", "Duration"]} rows={result.intervals.map((interval) => [interval.type, interval.startTime.slice(11, 19), interval.stopTime.slice(11, 19), interval.duration])} /></>}
    </div>
  );
}

function validate(norad: string | null, orbitId: string | null, start: string, stop: string, step: string) {
  const range = validateRuntimeTimeRange(start, stop);
  if (!norad && !orbitId) return "Select a current orbit, imported TLE, catalog satellite, or Advanced Catalog NORAD.";
  if (norad && (!Number.isInteger(Number(norad)) || Number(norad) <= 0)) return "NORAD catalog ID must be a positive integer.";
  if (range.error) return range.error;
  if (!Number.isFinite(Number(step)) || Number(step) < 5 || Number(step) > 3600) return "Step must be between 5 and 3600 seconds.";
  return null;
}

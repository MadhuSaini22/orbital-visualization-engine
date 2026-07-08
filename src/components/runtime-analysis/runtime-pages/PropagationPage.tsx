"use client";

import { useState } from "react";
import { runRuntimeOrbitPropagation, runRuntimePropagation, type RuntimePropagationResponse } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { TimeRangePicker } from "@/components/runtime-analysis/runtime-components/TimeRangePicker";
import { StepSelector } from "@/components/runtime-analysis/runtime-components/StepSelector";
import { AnalysisTable } from "@/components/runtime-analysis/runtime-components/AnalysisTable";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";
import { validateRuntimeTimeRange } from "@/components/runtime-analysis/runtime-components/time";
import { manualOrbitRuntimeRef } from "@/components/runtime-analysis/runtime-components/runtimeObjectRef";

export function PropagationPage({ primaryObject, primaryNoradCatalogId, onResult, onLoadingChange, onLog, onPropagation, onPrimaryNoradChange }: RuntimePageProps) {
  const [start, setStart] = useState("2026-07-07T00:00");
  const [stop, setStop] = useState("2026-07-07T01:30");
  const [stepSeconds, setStepSeconds] = useState("60");
  const [result, setResult] = useState<RuntimePropagationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const validation = validate(primaryNoradCatalogId, primaryObject.orbitId ?? null, start, stop, stepSeconds);
    if (validation) {
      setError(validation);
      return;
    }
    const noradCatalogId = primaryNoradCatalogId;
    if (!noradCatalogId && !primaryObject.orbitId) return;
    setLoading(true);
    onLoadingChange(true);
    setError(null);
    try {
      const range = validateRuntimeTimeRange(start, stop);
      if (range.error) throw new Error(range.error);
      const next = primaryObject.orbitId
        ? await runRuntimeOrbitPropagation({ primaryObject: manualOrbitRuntimeRef(primaryObject.orbitId), start: range.startIso, end: range.stopIso, stepSeconds: Number(stepSeconds), propagatorType: null })
        : await runRuntimePropagation({ noradCatalogId: Number(noradCatalogId), start: range.startIso, end: range.stopIso, stepSeconds: Number(stepSeconds), model: null });
      setResult(next);
      onResult(next);
      onPropagation(next);
      if (noradCatalogId) onPrimaryNoradChange(noradCatalogId);
      onLog("Orbit Propagation completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Propagation request failed.";
      setError(message);
      onLog(`Orbit Propagation failed: ${message}`);
    } finally {
      setLoading(false);
      onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <ResultSummary items={[{ label: "Primary", value: primaryObject.label }, { label: "Source", value: primaryObject.source }, { label: "Catalog ID", value: primaryNoradCatalogId ?? "Direct orbit" }]} />
      <TimeRangePicker start={start} stop={stop} onStartChange={setStart} onStopChange={setStop} />
      <StepSelector value={stepSeconds} onChange={setStepSeconds} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Running" : "Run Propagation"}</button>
      {result && (
        <>
          <ResultSummary items={[{ label: "Samples", value: String(result.states.length) }, { label: "Step", value: result.step }, { label: "Start", value: result.startTime.slice(0, 19) }, { label: "Stop", value: result.stopTime.slice(0, 19) }]} />
          <AnalysisTable headers={["Time", "Frame", "Position XYZ m", "Velocity XYZ m/s"]} rows={result.states.slice(0, 20).map((state) => [state.timestamp.slice(11, 19), state.frameName, `${state.position.xMeters.toFixed(1)}, ${state.position.yMeters.toFixed(1)}, ${state.position.zMeters.toFixed(1)}`, `${state.velocity.xMeters.toFixed(3)}, ${state.velocity.yMeters.toFixed(3)}, ${state.velocity.zMeters.toFixed(3)}`])} />
        </>
      )}
    </div>
  );
}

function validate(norad: string | null, orbitId: string | null, start: string, stop: string, step: string) {
  const id = Number(norad);
  const seconds = Number(step);
  const range = validateRuntimeTimeRange(start, stop);
  if (!norad && !orbitId) return "Select a current orbit, imported TLE, catalog satellite, or Advanced Catalog NORAD.";
  if (norad && (!Number.isInteger(id) || id <= 0)) return "NORAD catalog ID must be a positive integer.";
  if (range.error) return range.error;
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600) return "Step must be between 5 and 3600 seconds.";
  return null;
}

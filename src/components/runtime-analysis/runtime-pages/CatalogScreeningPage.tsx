"use client";

import { useState } from "react";
import { runRuntimeCatalogScreening, runRuntimeOrbitCatalogScreening, type RuntimeCatalogConjunctionResult, type RuntimeRelativeFrame } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { TimeRangePicker } from "@/components/runtime-analysis/runtime-components/TimeRangePicker";
import { StepSelector } from "@/components/runtime-analysis/runtime-components/StepSelector";
import { RelativeFrameSelector } from "@/components/runtime-analysis/runtime-components/RelativeFrameSelector";
import { ThresholdInput } from "@/components/runtime-analysis/runtime-components/ThresholdInput";
import { AnalysisTable } from "@/components/runtime-analysis/runtime-components/AnalysisTable";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { StatisticsPanel } from "@/components/runtime-analysis/runtime-components/StatisticsPanel";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";
import { validateRuntimeTimeRange } from "@/components/runtime-analysis/runtime-components/time";
import { manualOrbitRuntimeRef } from "@/components/runtime-analysis/runtime-components/runtimeObjectRef";

export function CatalogScreeningPage({ primaryObject, primaryNoradCatalogId, onResult, onLoadingChange, onLog, onCatalogScreening, onPrimaryNoradChange }: RuntimePageProps) {
  const [start, setStart] = useState("2026-07-07T00:00");
  const [stop, setStop] = useState("2026-07-07T01:30");
  const [stepSeconds, setStepSeconds] = useState("60");
  const [relativeFrame, setRelativeFrame] = useState<RuntimeRelativeFrame>("LVLH_RTN");
  const [missDistanceThresholdMeters, setMissDistanceThresholdMeters] = useState("1000");
  const [filter, setFilter] = useState("");
  const [result, setResult] = useState<RuntimeCatalogConjunctionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const validation = validate(primaryNoradCatalogId, primaryObject.orbitId ?? null, start, stop, stepSeconds, missDistanceThresholdMeters);
    if (validation) return setError(validation);
    const primaryNorad = primaryNoradCatalogId;
    if (!primaryNorad && !primaryObject.orbitId) return;
    setLoading(true); onLoadingChange(true); setError(null);
    try {
      const range = validateRuntimeTimeRange(start, stop);
      if (range.error) throw new Error(range.error);
      const next = primaryObject.orbitId
        ? await runRuntimeOrbitCatalogScreening({ primaryObject: manualOrbitRuntimeRef(primaryObject.orbitId), startTime: range.startIso, stopTime: range.stopIso, step: `PT${Number(stepSeconds)}S`, relativeFrame, missDistanceThresholdMeters: Number(missDistanceThresholdMeters), propagatorType: null })
        : await runRuntimeCatalogScreening({ primaryNoradCatalogId: Number(primaryNorad), startTime: range.startIso, stopTime: range.stopIso, step: `PT${Number(stepSeconds)}S`, relativeFrame, missDistanceThresholdMeters: Number(missDistanceThresholdMeters) });
      setResult(next); onResult(next); onCatalogScreening(next); if (primaryNorad) onPrimaryNoradChange(primaryNorad); onLog("Catalog Screening completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Catalog screening request failed.";
      setError(message); onLog(`Catalog Screening failed: ${message}`);
    } finally {
      setLoading(false); onLoadingChange(false);
    }
  };
  const candidates = result?.candidates.filter((candidate) => `${candidate.satellite.noradCatalogId} ${candidate.satellite.objectName}`.toLowerCase().includes(filter.toLowerCase())) ?? [];

  return (
    <div className="space-y-4">
      <ResultSummary items={[{ label: "Primary", value: primaryObject.label }, { label: "Source", value: primaryObject.source }, { label: "Catalog ID", value: primaryNoradCatalogId ?? "Direct orbit" }]} />
      <TimeRangePicker start={start} stop={stop} onStartChange={setStart} onStopChange={setStop} />
      <StepSelector value={stepSeconds} onChange={setStepSeconds} />
      <RelativeFrameSelector value={relativeFrame} onChange={setRelativeFrame} />
      <ThresholdInput label="Miss Distance Threshold" unit="m" value={missDistanceThresholdMeters} onChange={setMissDistanceThresholdMeters} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Running" : "Run Catalog Screening"}</button>
      {result && <><ResultSummary items={[{ label: "Candidates", value: String(result.candidates.length) }, { label: "Analyzed", value: String(result.statistics.analyzedCandidates) }]} /><StatisticsPanel stats={result.statistics} /><StatisticsPanel title="Execution" stats={result.executionStatistics} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter candidates" className="w-full border border-cyan-300/20 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300" /><AnalysisTable headers={["NORAD", "Name", "Miss", "Status"]} rows={candidates.slice(0, 40).map((candidate) => [String(candidate.satellite.noradCatalogId), candidate.satellite.objectName, `${candidate.conjunctionResult.closestApproach.missDistanceMeters.toFixed(1)} m`, candidate.conjunctionResult.status])} /></>}
    </div>
  );
}

function validate(primary: string | null, orbitId: string | null, start: string, stop: string, step: string, threshold: string) {
  const range = validateRuntimeTimeRange(start, stop);
  if (!primary && !orbitId) return "Select a current orbit, imported TLE satellite, or Advanced Catalog NORAD before screening.";
  if (primary && (!Number.isInteger(Number(primary)) || Number(primary) <= 0)) return "Primary NORAD must be a positive integer.";
  if (range.error) return range.error;
  if (!Number.isFinite(Number(step)) || Number(step) < 5 || Number(step) > 3600) return "Step must be between 5 and 3600 seconds.";
  if (!Number.isFinite(Number(threshold)) || Number(threshold) < 0) return "Miss-distance threshold must be non-negative.";
  return null;
}

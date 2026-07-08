"use client";

import { useState } from "react";
import { runRuntimePairwiseConjunction, type RuntimeConjunctionResult, type RuntimeRelativeFrame } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { SatelliteSelector } from "@/components/runtime-analysis/runtime-components/SatelliteSelector";
import { TimeRangePicker } from "@/components/runtime-analysis/runtime-components/TimeRangePicker";
import { StepSelector } from "@/components/runtime-analysis/runtime-components/StepSelector";
import { RelativeFrameSelector } from "@/components/runtime-analysis/runtime-components/RelativeFrameSelector";
import { ThresholdInput } from "@/components/runtime-analysis/runtime-components/ThresholdInput";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { StatisticsPanel } from "@/components/runtime-analysis/runtime-components/StatisticsPanel";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";
import { validateRuntimeTimeRange } from "@/components/runtime-analysis/runtime-components/time";

export function PairwiseConjunctionPage({ onResult, onLoadingChange, onLog, onPairwiseConjunction, onPrimaryNoradChange }: RuntimePageProps) {
  const [primaryNoradCatalogId, setPrimaryNoradCatalogId] = useState("25544");
  const [secondaryNoradCatalogId, setSecondaryNoradCatalogId] = useState("40967");
  const [start, setStart] = useState("2026-07-07T00:00");
  const [stop, setStop] = useState("2026-07-07T01:30");
  const [stepSeconds, setStepSeconds] = useState("60");
  const [relativeFrame, setRelativeFrame] = useState<RuntimeRelativeFrame>("LVLH_RTN");
  const [missDistanceThresholdMeters, setMissDistanceThresholdMeters] = useState("1000");
  const [result, setResult] = useState<RuntimeConjunctionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const validation = validate(primaryNoradCatalogId, secondaryNoradCatalogId, start, stop, stepSeconds, missDistanceThresholdMeters);
    if (validation) return setError(validation);
    setLoading(true); onLoadingChange(true); setError(null);
    try {
      const range = validateRuntimeTimeRange(start, stop);
      if (range.error) throw new Error(range.error);
      const next = await runRuntimePairwiseConjunction({ primaryNoradCatalogId: Number(primaryNoradCatalogId), secondaryNoradCatalogId: Number(secondaryNoradCatalogId), startTime: range.startIso, stopTime: range.stopIso, step: `PT${Number(stepSeconds)}S`, relativeFrame, missDistanceThresholdMeters: Number(missDistanceThresholdMeters) });
      setResult(next); onResult(next); onPairwiseConjunction(next); onPrimaryNoradChange(primaryNoradCatalogId); onLog("Pairwise Conjunction completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Pairwise conjunction request failed.";
      setError(message); onLog(`Pairwise Conjunction failed: ${message}`);
    } finally {
      setLoading(false); onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <SatelliteSelector label="Primary NORAD" value={primaryNoradCatalogId} onChange={setPrimaryNoradCatalogId} />
      <SatelliteSelector label="Secondary NORAD" value={secondaryNoradCatalogId} onChange={setSecondaryNoradCatalogId} />
      <TimeRangePicker start={start} stop={stop} onStartChange={setStart} onStopChange={setStop} />
      <StepSelector value={stepSeconds} onChange={setStepSeconds} />
      <RelativeFrameSelector value={relativeFrame} onChange={setRelativeFrame} />
      <ThresholdInput label="Miss Distance Threshold" unit="m" value={missDistanceThresholdMeters} onChange={setMissDistanceThresholdMeters} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Running" : "Run Pairwise Conjunction"}</button>
      {result && <><ResultSummary items={[{ label: "Status", value: result.status, tone: result.status === "CLEAR" ? "emerald" : "rose" }, { label: "Miss Distance", value: `${result.closestApproach.missDistanceMeters.toFixed(2)} m` }, { label: "Relative Speed", value: `${result.closestApproach.relativeSpeedMetersPerSecond.toFixed(2)} m/s` }, { label: "TCA", value: result.closestApproach.timeOfClosestApproach.slice(0, 19) }]} /><StatisticsPanel title="Refinement" stats={result.refinementStatistics} /></>}
    </div>
  );
}

function validate(primary: string, secondary: string, start: string, stop: string, step: string, threshold: string) {
  const range = validateRuntimeTimeRange(start, stop);
  if (!Number.isInteger(Number(primary)) || Number(primary) <= 0) return "Primary NORAD must be a positive integer.";
  if (!Number.isInteger(Number(secondary)) || Number(secondary) <= 0) return "Secondary NORAD must be a positive integer.";
  if (primary === secondary) return "Primary and secondary satellites must differ.";
  if (range.error) return range.error;
  if (!Number.isFinite(Number(step)) || Number(step) < 5 || Number(step) > 3600) return "Step must be between 5 and 3600 seconds.";
  if (!Number.isFinite(Number(threshold)) || Number(threshold) < 0) return "Miss-distance threshold must be non-negative.";
  return null;
}

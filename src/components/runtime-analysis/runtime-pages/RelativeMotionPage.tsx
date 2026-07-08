"use client";

import { useState } from "react";
import { runRuntimeOrbitRelativeMotion, runRuntimeRelativeMotion, type RuntimeRelativeFrame, type RuntimeRelativeMotionResult } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { SatelliteSelector } from "@/components/runtime-analysis/runtime-components/SatelliteSelector";
import { TimeRangePicker } from "@/components/runtime-analysis/runtime-components/TimeRangePicker";
import { StepSelector } from "@/components/runtime-analysis/runtime-components/StepSelector";
import { RelativeFrameSelector } from "@/components/runtime-analysis/runtime-components/RelativeFrameSelector";
import { AnalysisTable } from "@/components/runtime-analysis/runtime-components/AnalysisTable";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";
import { validateRuntimeTimeRange } from "@/components/runtime-analysis/runtime-components/time";
import { catalogRuntimeRef, manualOrbitRuntimeRef } from "@/components/runtime-analysis/runtime-components/runtimeObjectRef";

export function RelativeMotionPage({ primaryObject, primaryNoradCatalogId, onResult, onLoadingChange, onLog, onRelativeMotion, onPrimaryNoradChange }: RuntimePageProps) {
  const [secondaryNoradCatalogId, setSecondaryNoradCatalogId] = useState("40967");
  const [start, setStart] = useState("2026-07-07T00:00");
  const [stop, setStop] = useState("2026-07-07T01:30");
  const [stepSeconds, setStepSeconds] = useState("60");
  const [frame, setFrame] = useState<RuntimeRelativeFrame>("LVLH_RTN");
  const [result, setResult] = useState<RuntimeRelativeMotionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const hasDirectOrbit = Boolean(primaryObject.orbitId || primaryObject.orbitDefinition);
    const validation = validate(primaryNoradCatalogId, hasDirectOrbit ? "direct-orbit" : null, secondaryNoradCatalogId, start, stop, stepSeconds);
    if (validation) return setError(validation);
    const primaryNorad = primaryNoradCatalogId;
    if (!primaryNorad && !hasDirectOrbit) return;
    setLoading(true); onLoadingChange(true); setError(null);
    try {
      const range = validateRuntimeTimeRange(start, stop);
      if (range.error) throw new Error(range.error);
      const next = hasDirectOrbit
        ? await runRuntimeOrbitRelativeMotion({
          primaryObject: manualOrbitRuntimeRef(primaryObject.orbitId, primaryObject.orbitDefinition),
          secondaryObject: catalogRuntimeRef(secondaryNoradCatalogId),
          startTime: range.startIso,
          stopTime: range.stopIso,
          step: `PT${Number(stepSeconds)}S`,
          frame,
          propagatorType: null,
        })
        : await runRuntimeRelativeMotion({ primaryNoradCatalogId: Number(primaryNorad), secondaryNoradCatalogId: Number(secondaryNoradCatalogId), startTime: range.startIso, stopTime: range.stopIso, step: `PT${Number(stepSeconds)}S`, frame });
      setResult(next); onResult(next); onRelativeMotion(next); if (primaryNorad) onPrimaryNoradChange(primaryNorad); onLog("Relative Motion completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Relative motion request failed.";
      setError(message); onLog(`Relative Motion failed: ${message}`);
    } finally {
      setLoading(false); onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <ResultSummary items={[{ label: "Primary", value: primaryObject.label }, { label: "Source", value: primaryObject.source }, { label: "Catalog ID", value: primaryNoradCatalogId ?? "Direct orbit" }]} />
      <SatelliteSelector label="Secondary NORAD" value={secondaryNoradCatalogId} onChange={setSecondaryNoradCatalogId} />
      <TimeRangePicker start={start} stop={stop} onStartChange={setStart} onStopChange={setStop} />
      <StepSelector value={stepSeconds} onChange={setStepSeconds} />
      <RelativeFrameSelector value={frame} onChange={setFrame} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Running" : "Run Relative Motion"}</button>
      {result && <><ResultSummary items={[{ label: "Samples", value: String(result.states.length) }, { label: "Frame", value: result.request.frame }]} /><AnalysisTable headers={["Time", "Frame", "Relative Position m", "Relative Velocity m/s"]} rows={result.states.slice(0, 20).map((state) => [state.timestamp.slice(11, 19), state.frame, `${state.relativePosition.xMeters.toFixed(1)}, ${state.relativePosition.yMeters.toFixed(1)}, ${state.relativePosition.zMeters.toFixed(1)}`, `${state.relativeVelocity.xMeters.toFixed(3)}, ${state.relativeVelocity.yMeters.toFixed(3)}, ${state.relativeVelocity.zMeters.toFixed(3)}`])} /></>}
    </div>
  );
}

function validate(primary: string | null, primaryOrbitId: string | null, secondary: string, start: string, stop: string, step: string) {
  const range = validateRuntimeTimeRange(start, stop);
  if (!primary && !primaryOrbitId) return "This runtime endpoint requires a primary orbit or catalog NORAD ID.";
  if (primary && (!Number.isInteger(Number(primary)) || Number(primary) <= 0)) return "Primary NORAD must be a positive integer.";
  if (!Number.isInteger(Number(secondary)) || Number(secondary) <= 0) return "Secondary NORAD must be a positive integer.";
  if (primary === secondary) return "Primary and secondary satellites must differ.";
  if (range.error) return range.error;
  if (!Number.isFinite(Number(step)) || Number(step) < 5 || Number(step) > 3600) return "Step must be between 5 and 3600 seconds.";
  return null;
}

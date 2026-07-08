"use client";

import { useState } from "react";
import { runRuntimeVisibility, type RuntimeVisibilityResult } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { TimeRangePicker } from "@/components/runtime-analysis/runtime-components/TimeRangePicker";
import { StepSelector } from "@/components/runtime-analysis/runtime-components/StepSelector";
import { GroundStationSelector } from "@/components/runtime-analysis/runtime-components/GroundStationSelector";
import { ThresholdInput } from "@/components/runtime-analysis/runtime-components/ThresholdInput";
import { AnalysisTable } from "@/components/runtime-analysis/runtime-components/AnalysisTable";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";
import { validateRuntimeTimeRange } from "@/components/runtime-analysis/runtime-components/time";

export function VisibilityPage({ primaryObject, primaryNoradCatalogId, onResult, onLoadingChange, onLog, onVisibility, onPrimaryNoradChange }: RuntimePageProps) {
  const [groundStationId, setGroundStationId] = useState("nasa-nen-wallops");
  const [start, setStart] = useState("2026-07-07T00:00");
  const [stop, setStop] = useState("2026-07-07T01:30");
  const [stepSeconds, setStepSeconds] = useState("60");
  const [minimumElevationDegrees, setMinimumElevationDegrees] = useState("10");
  const [result, setResult] = useState<RuntimeVisibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const validation = validate(primaryNoradCatalogId, groundStationId, start, stop, stepSeconds, minimumElevationDegrees);
    if (validation) return setError(validation);
    const noradCatalogId = primaryNoradCatalogId;
    if (!noradCatalogId) return;
    setLoading(true); onLoadingChange(true); setError(null);
    try {
      const range = validateRuntimeTimeRange(start, stop);
      if (range.error) throw new Error(range.error);
      const next = await runRuntimeVisibility({ noradCatalogId: Number(noradCatalogId), groundStationId: { value: groundStationId.trim() }, startTime: range.startIso, stopTime: range.stopIso, step: `PT${Number(stepSeconds)}S`, minimumElevationDegrees: Number(minimumElevationDegrees) });
      setResult(next); onResult(next); onVisibility(next); onPrimaryNoradChange(noradCatalogId); onLog("Visibility completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Visibility request failed.";
      setError(message); onLog(`Visibility failed: ${message}`);
    } finally {
      setLoading(false); onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <ResultSummary items={[{ label: "Primary", value: primaryObject.label }, { label: "Source", value: primaryObject.source }, { label: "Catalog ID", value: primaryNoradCatalogId ?? "Direct orbit" }]} />
      <GroundStationSelector value={groundStationId} onChange={setGroundStationId} />
      <TimeRangePicker start={start} stop={stop} onStartChange={setStart} onStopChange={setStop} />
      <StepSelector value={stepSeconds} onChange={setStepSeconds} />
      <ThresholdInput label="Minimum Elevation" unit="deg" value={minimumElevationDegrees} onChange={setMinimumElevationDegrees} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Running" : "Run Visibility"}</button>
      {result && <><ResultSummary items={[{ label: "Windows", value: String(result.windows.length) }, { label: "Station", value: result.request.groundStationId.value }]} /><AnalysisTable headers={["AOS", "LOS", "Max El", "Duration"]} rows={result.windows.map((window) => [window.acquisitionOfSignalTime.slice(11, 19), window.lossOfSignalTime.slice(11, 19), `${window.maximumElevationDegrees.toFixed(2)} deg`, window.duration])} /></>}
    </div>
  );
}

function validate(norad: string | null, groundStationId: string, start: string, stop: string, step: string, elevation: string) {
  const range = validateRuntimeTimeRange(start, stop);
  if (!norad) return "This runtime endpoint requires a catalog NORAD ID. Use an orbit with NORAD metadata, imported TLE, or Advanced Catalog NORAD.";
  if (!Number.isInteger(Number(norad)) || Number(norad) <= 0) return "NORAD catalog ID must be a positive integer.";
  if (!groundStationId.trim()) return "Ground station ID is required.";
  if (range.error) return range.error;
  if (!Number.isFinite(Number(step)) || Number(step) < 5 || Number(step) > 3600) return "Step must be between 5 and 3600 seconds.";
  if (!Number.isFinite(Number(elevation)) || Number(elevation) < -90 || Number(elevation) > 90) return "Minimum elevation must be between -90 and 90 degrees.";
  return null;
}

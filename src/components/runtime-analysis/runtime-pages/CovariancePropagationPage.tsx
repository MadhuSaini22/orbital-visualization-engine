"use client";

import { useState } from "react";
import { runRuntimeCovariancePropagation, type RuntimeCovariancePropagationResponse } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { TimeRangePicker } from "@/components/runtime-analysis/runtime-components/TimeRangePicker";
import { StepSelector } from "@/components/runtime-analysis/runtime-components/StepSelector";
import { CovarianceMatrixEditor, identityMatrix } from "@/components/runtime-analysis/runtime-components/CovarianceMatrixEditor";
import { AnalysisTable } from "@/components/runtime-analysis/runtime-components/AnalysisTable";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { JsonViewer } from "@/components/runtime-analysis/runtime-components/JsonViewer";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";
import { validateRuntimeTimeRange } from "@/components/runtime-analysis/runtime-components/time";

export function CovariancePropagationPage({ primaryObject, primaryNoradCatalogId, onResult, onLoadingChange, onLog, onCovariancePropagation, onPrimaryNoradChange }: RuntimePageProps) {
  const [start, setStart] = useState("2026-07-07T00:00");
  const [stop, setStop] = useState("2026-07-07T01:30");
  const [stepSeconds, setStepSeconds] = useState("60");
  const [covariance, setCovariance] = useState<number[][]>(identityMatrix(6));
  const [result, setResult] = useState<RuntimeCovariancePropagationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const validation = validate(primaryNoradCatalogId, start, stop, stepSeconds, covariance);
    if (validation) return setError(validation);
    const noradCatalogId = primaryNoradCatalogId;
    if (!noradCatalogId) return;
    setLoading(true); onLoadingChange(true); setError(null);
    try {
      const range = validateRuntimeTimeRange(start, stop);
      if (range.error) throw new Error(range.error);
      const next = await runRuntimeCovariancePropagation({ noradCatalogId: Number(noradCatalogId), startTime: range.startIso, stopTime: range.stopIso, step: `PT${Number(stepSeconds)}S`, initialCovariance: { values: covariance } });
      setResult(next); onResult(next); onCovariancePropagation(next); onPrimaryNoradChange(noradCatalogId); onLog("Covariance Propagation completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Covariance propagation request failed.";
      setError(message); onLog(`Covariance Propagation failed: ${message}`);
    } finally {
      setLoading(false); onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <ResultSummary items={[{ label: "Primary", value: primaryObject.label }, { label: "Source", value: primaryObject.source }, { label: "Catalog ID", value: primaryNoradCatalogId ?? "Direct orbit" }]} />
      <TimeRangePicker start={start} stop={stop} onStartChange={setStart} onStopChange={setStop} />
      <StepSelector value={stepSeconds} onChange={setStepSeconds} />
      <CovarianceMatrixEditor values={covariance} size={6} onChange={setCovariance} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Running" : "Run Covariance Propagation"}</button>
      {result && <><ResultSummary items={[{ label: "States", value: String(result.states.length) }, { label: "Step", value: result.request.step }]} /><AnalysisTable headers={["Time", "Dimension", "Trace"]} rows={result.states.slice(0, 20).map((state) => [state.timestamp.slice(11, 19), String(state.covarianceMatrix.values.length), trace(state.covarianceMatrix.values).toExponential(3)])} /><JsonViewer value={result.states[0]?.covarianceMatrix ?? {}} /></>}
    </div>
  );
}

function trace(values: number[][]) { return values.reduce((sum, row, index) => sum + (row[index] ?? 0), 0); }
function validate(norad: string | null, start: string, stop: string, step: string, covariance: number[][]) {
  const range = validateRuntimeTimeRange(start, stop);
  if (!norad) return "This runtime endpoint requires a catalog NORAD ID. Use an orbit with NORAD metadata, imported TLE, or Advanced Catalog NORAD.";
  if (!Number.isInteger(Number(norad)) || Number(norad) <= 0) return "NORAD catalog ID must be a positive integer.";
  if (range.error) return range.error;
  if (!Number.isFinite(Number(step)) || Number(step) < 5 || Number(step) > 3600) return "Step must be between 5 and 3600 seconds.";
  if (covariance.length !== 6 || covariance.some((row) => row.length !== 6 || row.some((value) => !Number.isFinite(value)))) return "Initial covariance must be a finite 6x6 matrix.";
  return null;
}

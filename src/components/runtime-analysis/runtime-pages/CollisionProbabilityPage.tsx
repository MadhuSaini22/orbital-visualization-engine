"use client";

import { useState } from "react";
import { runRuntimeCollisionProbability, type RuntimeCollisionProbabilityResult } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { CovarianceMatrixEditor, identityMatrix } from "@/components/runtime-analysis/runtime-components/CovarianceMatrixEditor";
import { ThresholdInput } from "@/components/runtime-analysis/runtime-components/ThresholdInput";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { StatisticsPanel } from "@/components/runtime-analysis/runtime-components/StatisticsPanel";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";

export function CollisionProbabilityPage({ lastPairwiseConjunction, onResult, onLoadingChange, onLog }: RuntimePageProps) {
  const [primaryCovariance, setPrimaryCovariance] = useState<number[][]>(identityMatrix(3));
  const [secondaryCovariance, setSecondaryCovariance] = useState<number[][]>(identityMatrix(3));
  const [hardBodyRadiusMeters, setHardBodyRadiusMeters] = useState("2");
  const [result, setResult] = useState<RuntimeCollisionProbabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!lastPairwiseConjunction) return setError("Run Pairwise Conjunction before collision probability.");
    if (!isValidMatrix(primaryCovariance) || !isValidMatrix(secondaryCovariance)) return setError("Collision probability requires finite 3x3 covariance matrices.");
    if (!Number.isFinite(Number(hardBodyRadiusMeters)) || Number(hardBodyRadiusMeters) <= 0) return setError("Hard-body radius must be positive.");
    setLoading(true); onLoadingChange(true); setError(null);
    try {
      const next = await runRuntimeCollisionProbability({ conjunctionResult: lastPairwiseConjunction, primaryCovarianceMetersSquared: primaryCovariance, secondaryCovarianceMetersSquared: secondaryCovariance, hardBodyRadiusMeters: Number(hardBodyRadiusMeters), method: "ISOTROPIC_GAUSSIAN_ENCOUNTER_PLANE" });
      setResult(next); onResult(next); onLog("Collision Probability completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Collision probability request failed.";
      setError(message); onLog(`Collision Probability failed: ${message}`);
    } finally {
      setLoading(false); onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      {!lastPairwiseConjunction && <div className="border border-amber-300/25 bg-amber-300/10 p-2 text-xs text-amber-100">Run Pairwise Conjunction first. This page reuses the latest pairwise closest-approach result.</div>}
      <ThresholdInput label="Hard Body Radius" unit="m" value={hardBodyRadiusMeters} onChange={setHardBodyRadiusMeters} />
      <CovarianceMatrixEditor values={primaryCovariance} size={3} onChange={setPrimaryCovariance} />
      <CovarianceMatrixEditor values={secondaryCovariance} size={3} onChange={setSecondaryCovariance} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading || !lastPairwiseConjunction} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Running" : "Run Collision Probability"}</button>
      {result && <><ResultSummary items={[{ label: "Probability", value: result.probabilityOfCollision.toExponential(3), tone: result.probabilityOfCollision > 1e-4 ? "rose" : result.probabilityOfCollision > 1e-6 ? "amber" : "emerald" }, { label: "Method", value: result.statistics.method }]} /><StatisticsPanel stats={result.statistics} /></>}
    </div>
  );
}

function isValidMatrix(values: number[][]) {
  return values.length === 3 && values.every((row) => row.length === 3 && row.every((value) => Number.isFinite(value)));
}

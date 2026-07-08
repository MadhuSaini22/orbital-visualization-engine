"use client";

import { useState } from "react";
import { fetchRuntimeSatellite, type RuntimeSatelliteResponse } from "@/services/orbitServerApi";
import type { RuntimePageProps } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import { ResultSummary } from "@/components/runtime-analysis/runtime-components/ResultSummary";
import { JsonViewer } from "@/components/runtime-analysis/runtime-components/JsonViewer";
import { ErrorPanel } from "@/components/runtime-analysis/runtime-components/ErrorPanel";

export function RuntimeSatellitePage({ primaryObject, primaryNoradCatalogId, onResult, onLoadingChange, onLog, onPrimaryNoradChange }: RuntimePageProps) {
  const [result, setResult] = useState<RuntimeSatelliteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!primaryNoradCatalogId) {
      setError("The current orbit has no catalog NORAD ID. Runtime catalog lookup is available from Advanced Catalog NORAD.");
      return;
    }
    const norad = Number(primaryNoradCatalogId);
    if (!Number.isInteger(norad) || norad <= 0) {
      setError("NORAD catalog ID must be a positive integer.");
      return;
    }
    setLoading(true);
    onLoadingChange(true);
    setError(null);
    try {
      const next = await fetchRuntimeSatellite(norad);
      setResult(next);
      onResult(next);
      onPrimaryNoradChange(primaryNoradCatalogId);
      onLog("Runtime Satellite completed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Runtime satellite request failed.";
      setError(message);
      onLog(`Runtime Satellite failed: ${message}`);
    } finally {
      setLoading(false);
      onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <ResultSummary items={[
        { label: "Primary", value: primaryObject.label },
        { label: "Source", value: primaryObject.source },
        { label: "Catalog ID", value: primaryNoradCatalogId ?? "Direct orbit" },
      ]} />
      <ErrorPanel message={error} />
      <button type="button" onClick={run} disabled={loading || !primaryNoradCatalogId} className="w-full border border-cyan-300 bg-cyan-300 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">{loading ? "Loading" : "Load Catalog Metadata"}</button>
      {result && (
        <>
          <ResultSummary items={[
            { label: "Satellite", value: result.catalogSatellite.objectName },
            { label: "NORAD", value: String(result.catalogSatellite.noradCatalogId) },
            { label: "Epoch", value: result.catalogSatellite.epochAt.slice(0, 19) },
            { label: "Source", value: result.catalogSatellite.sourceDisplayName },
          ]} />
          <JsonViewer value={result.catalogSatellite} />
        </>
      )}
    </div>
  );
}

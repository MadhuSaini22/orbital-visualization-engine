"use client";

import { useMemo, useState } from "react";
import { RuntimeSidebar, runtimePages } from "@/components/runtime-analysis/RuntimeSidebar";
import { RuntimeToolbar } from "@/components/runtime-analysis/RuntimeToolbar";
import { RuntimeVisualizationPanel } from "@/components/runtime-analysis/RuntimeVisualizationPanel";
import { RuntimeResultPanel } from "@/components/runtime-analysis/RuntimeResultPanel";
import { RuntimeBottomPanel } from "@/components/runtime-analysis/RuntimeBottomPanel";
import { RuntimeSatellitePage } from "@/components/runtime-analysis/runtime-pages/RuntimeSatellitePage";
import { PropagationPage } from "@/components/runtime-analysis/runtime-pages/PropagationPage";
import { VisibilityPage } from "@/components/runtime-analysis/runtime-pages/VisibilityPage";
import { EclipsePage } from "@/components/runtime-analysis/runtime-pages/EclipsePage";
import { RelativeMotionPage } from "@/components/runtime-analysis/runtime-pages/RelativeMotionPage";
import { PairwiseConjunctionPage } from "@/components/runtime-analysis/runtime-pages/PairwiseConjunctionPage";
import { CatalogScreeningPage } from "@/components/runtime-analysis/runtime-pages/CatalogScreeningPage";
import { CollisionProbabilityPage } from "@/components/runtime-analysis/runtime-pages/CollisionProbabilityPage";
import { CovariancePropagationPage } from "@/components/runtime-analysis/runtime-pages/CovariancePropagationPage";
import type {
  RuntimeCatalogConjunctionResult,
  RuntimeCollisionProbabilityResult,
  RuntimeConjunctionResult,
  RuntimeCovariancePropagationResponse,
  RuntimeEclipseResult,
  RuntimePropagationResponse,
  RuntimeRelativeMotionResult,
  RuntimeSatelliteResponse,
  RuntimeVisibilityResult,
} from "@/services/orbitServerApi";

export type RuntimePageId =
  | "satellite"
  | "propagation"
  | "visibility"
  | "eclipse"
  | "relative-motion"
  | "pairwise"
  | "catalog-screening"
  | "collision"
  | "covariance";

export type RuntimeWorkspaceResult =
  | RuntimeSatelliteResponse
  | RuntimePropagationResponse
  | RuntimeVisibilityResult
  | RuntimeEclipseResult
  | RuntimeRelativeMotionResult
  | RuntimeConjunctionResult
  | RuntimeCatalogConjunctionResult
  | RuntimeCollisionProbabilityResult
  | RuntimeCovariancePropagationResponse
  | null;

export type RuntimeLogEntry = {
  time: string;
  message: string;
};

export type RuntimePageProps = {
  lastPairwiseConjunction: RuntimeConjunctionResult | null;
  onResult: (result: Exclude<RuntimeWorkspaceResult, null>) => void;
  onLoadingChange: (loading: boolean) => void;
  onLog: (message: string) => void;
  onPropagation: (result: RuntimePropagationResponse) => void;
  onPairwiseConjunction: (result: RuntimeConjunctionResult) => void;
  onPrimaryNoradChange: (noradCatalogId: string) => void;
};

export function RuntimeAnalysisWorkspace() {
  const [activePage, setActivePage] = useState<RuntimePageId>("satellite");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RuntimeWorkspaceResult>(null);
  const [logs, setLogs] = useState<RuntimeLogEntry[]>([]);
  const [lastPropagation, setLastPropagation] = useState<RuntimePropagationResponse | null>(null);
  const [lastPairwiseConjunction, setLastPairwiseConjunction] = useState<RuntimeConjunctionResult | null>(null);
  const [primaryNorad, setPrimaryNorad] = useState("25544");
  const activeLabel = useMemo(() => runtimePages.find((page) => page.id === activePage)?.label ?? "Runtime Analysis", [activePage]);

  const pageProps: RuntimePageProps = {
    lastPairwiseConjunction,
    onResult: setResult,
    onLoadingChange: setLoading,
    onLog: (message) => setLogs((current) => [{ time: new Date().toISOString(), message }, ...current].slice(0, 30)),
    onPropagation: setLastPropagation,
    onPairwiseConjunction: setLastPairwiseConjunction,
    onPrimaryNoradChange: setPrimaryNorad,
  };

  return (
    <div className="relative h-[min(82vh,920px)] min-h-[680px] overflow-hidden bg-[#050b10] text-zinc-100">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_minmax(150px,0.28fr)]">
        <RuntimeToolbar title={activeLabel} loading={loading} />
        <div className="grid min-h-0 grid-cols-[220px_minmax(280px,0.8fr)_minmax(360px,1.35fr)_minmax(300px,0.9fr)] max-2xl:grid-cols-[200px_minmax(260px,0.85fr)_minmax(340px,1.2fr)_minmax(280px,0.9fr)] max-xl:grid-cols-1">
          <RuntimeSidebar activePage={activePage} onPageChange={setActivePage} />
          <section className="thin-scrollbar min-h-0 overflow-auto border-r border-cyan-300/15 bg-[#071016] p-4 max-xl:border-r-0 max-xl:border-b">
            <PanelTitle eyebrow="Analysis Inputs" title={activeLabel} />
            <div className="mt-4">{renderPage(activePage, pageProps)}</div>
          </section>
          <RuntimeVisualizationPanel propagation={lastPropagation} loading={loading} fallbackNorad={primaryNorad} />
          <RuntimeResultPanel result={result} />
        </div>
        <RuntimeBottomPanel result={result} logs={logs} />
      </div>
    </div>
  );
}

function renderPage(page: RuntimePageId, props: RuntimePageProps) {
  if (page === "satellite") return <RuntimeSatellitePage {...props} />;
  if (page === "propagation") return <PropagationPage {...props} />;
  if (page === "visibility") return <VisibilityPage {...props} />;
  if (page === "eclipse") return <EclipsePage {...props} />;
  if (page === "relative-motion") return <RelativeMotionPage {...props} />;
  if (page === "pairwise") return <PairwiseConjunctionPage {...props} />;
  if (page === "catalog-screening") return <CatalogScreeningPage {...props} />;
  if (page === "collision") return <CollisionProbabilityPage {...props} />;
  return <CovariancePropagationPage {...props} />;
}

function PanelTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">{eyebrow}</p>
      <h3 className="mt-1 text-sm font-semibold text-white">{title}</h3>
    </div>
  );
}

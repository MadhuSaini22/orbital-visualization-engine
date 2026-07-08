"use client";

import { useMemo, useState } from "react";
import type { SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
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

export type RuntimePrimaryCandidate = {
  id: string;
  label: string;
  source: string;
  noradCatalogId: string | null;
  satellite: SatelliteObject | null;
  snapshot?: SatelliteSnapshot | null;
};

export type RuntimePrimaryObjectContext = {
  currentOrbit: RuntimePrimaryCandidate | null;
  importedTleSatellites: RuntimePrimaryCandidate[];
};

export type RuntimePrimarySelectionMode = "current-orbit" | "imported-tle" | "catalog-search";

export type RuntimePrimarySelection = RuntimePrimaryCandidate & {
  mode: RuntimePrimarySelectionMode;
};

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
  primaryObject: RuntimePrimarySelection;
  primaryNoradCatalogId: string | null;
  onResult: (result: Exclude<RuntimeWorkspaceResult, null>) => void;
  onLoadingChange: (loading: boolean) => void;
  onLog: (message: string) => void;
  onPropagation: (result: RuntimePropagationResponse) => void;
  onVisibility: (result: RuntimeVisibilityResult) => void;
  onEclipse: (result: RuntimeEclipseResult) => void;
  onRelativeMotion: (result: RuntimeRelativeMotionResult) => void;
  onPairwiseConjunction: (result: RuntimeConjunctionResult) => void;
  onCatalogScreening: (result: RuntimeCatalogConjunctionResult) => void;
  onCollisionProbability: (result: RuntimeCollisionProbabilityResult) => void;
  onCovariancePropagation: (result: RuntimeCovariancePropagationResponse) => void;
  onPrimaryNoradChange: (noradCatalogId: string) => void;
};

const emptyPrimaryContext: RuntimePrimaryObjectContext = {
  currentOrbit: null,
  importedTleSatellites: [],
};

export function RuntimeAnalysisWorkspace({ primaryContext = emptyPrimaryContext }: { primaryContext?: RuntimePrimaryObjectContext }) {
  const [activePage, setActivePage] = useState<RuntimePageId>("satellite");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RuntimeWorkspaceResult>(null);
  const [logs, setLogs] = useState<RuntimeLogEntry[]>([]);
  const [lastPropagation, setLastPropagation] = useState<RuntimePropagationResponse | null>(null);
  const [lastVisibility, setLastVisibility] = useState<RuntimeVisibilityResult | null>(null);
  const [lastEclipse, setLastEclipse] = useState<RuntimeEclipseResult | null>(null);
  const [lastRelativeMotion, setLastRelativeMotion] = useState<RuntimeRelativeMotionResult | null>(null);
  const [lastPairwiseConjunction, setLastPairwiseConjunction] = useState<RuntimeConjunctionResult | null>(null);
  const [lastCatalogScreening, setLastCatalogScreening] = useState<RuntimeCatalogConjunctionResult | null>(null);
  const [lastCollisionProbability, setLastCollisionProbability] = useState<RuntimeCollisionProbabilityResult | null>(null);
  const [lastCovariancePropagation, setLastCovariancePropagation] = useState<RuntimeCovariancePropagationResponse | null>(null);
  const [primaryNorad, setPrimaryNorad] = useState("");
  const [selectedImportedId, setSelectedImportedId] = useState("");
  const [catalogSearchNorad, setCatalogSearchNorad] = useState("");
  const activeLabel = useMemo(() => runtimePages.find((page) => page.id === activePage)?.label ?? "Runtime Analysis", [activePage]);
  const selectedImportedCandidate = useMemo(() => {
    const imported = primaryContext.importedTleSatellites;
    if (imported.length === 0) return null;
    return imported.find((candidate) => candidate.id === selectedImportedId) ?? imported[0];
  }, [primaryContext.importedTleSatellites, selectedImportedId]);
  const primaryObject = useMemo<RuntimePrimarySelection>(() => {
    if (primaryContext.currentOrbit) {
      return { ...primaryContext.currentOrbit, mode: "current-orbit" };
    }
    if (selectedImportedCandidate) {
      return { ...selectedImportedCandidate, mode: "imported-tle" };
    }
    return {
      id: "catalog-search",
      label: catalogSearchNorad.trim() ? `NORAD ${catalogSearchNorad.trim()}` : "Catalog Search",
      source: "Catalog Search",
      noradCatalogId: catalogSearchNorad.trim() || null,
      satellite: null,
      snapshot: null,
      mode: "catalog-search",
    };
  }, [catalogSearchNorad, primaryContext.currentOrbit, selectedImportedCandidate]);
  const primaryNoradCatalogId = primaryObject.noradCatalogId;

  const pageProps: RuntimePageProps = {
    lastPairwiseConjunction,
    primaryObject,
    primaryNoradCatalogId,
    onResult: setResult,
    onLoadingChange: setLoading,
    onLog: (message) => setLogs((current) => [{ time: new Date().toISOString(), message }, ...current].slice(0, 30)),
    onPropagation: setLastPropagation,
    onVisibility: setLastVisibility,
    onEclipse: setLastEclipse,
    onRelativeMotion: setLastRelativeMotion,
    onPairwiseConjunction: setLastPairwiseConjunction,
    onCatalogScreening: setLastCatalogScreening,
    onCollisionProbability: setLastCollisionProbability,
    onCovariancePropagation: setLastCovariancePropagation,
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
            <RuntimePrimaryObjectPanel
              primaryObject={primaryObject}
              importedCandidates={primaryContext.importedTleSatellites}
              selectedImportedId={selectedImportedCandidate?.id ?? selectedImportedId}
              onSelectedImportedIdChange={setSelectedImportedId}
              catalogSearchNorad={catalogSearchNorad}
              onCatalogSearchNoradChange={setCatalogSearchNorad}
            />
            <div className="mt-4">{renderPage(activePage, pageProps)}</div>
          </section>
          <RuntimeVisualizationPanel
            activePage={activePage}
            propagation={lastPropagation}
            visibility={lastVisibility}
            eclipse={lastEclipse}
            relativeMotion={lastRelativeMotion}
            pairwiseConjunction={lastPairwiseConjunction}
            catalogScreening={lastCatalogScreening}
            collisionProbability={lastCollisionProbability}
            covariancePropagation={lastCovariancePropagation}
            loading={loading}
            fallbackNorad={primaryNoradCatalogId ?? primaryNorad}
          />
          <RuntimeResultPanel result={result} />
        </div>
        <RuntimeBottomPanel result={result} logs={logs} />
      </div>
    </div>
  );
}

function RuntimePrimaryObjectPanel({
  primaryObject,
  importedCandidates,
  selectedImportedId,
  onSelectedImportedIdChange,
  catalogSearchNorad,
  onCatalogSearchNoradChange,
}: {
  primaryObject: RuntimePrimarySelection;
  importedCandidates: RuntimePrimaryCandidate[];
  selectedImportedId: string;
  onSelectedImportedIdChange: (id: string) => void;
  catalogSearchNorad: string;
  onCatalogSearchNoradChange: (value: string) => void;
}) {
  return (
    <div className="mt-4 border border-cyan-300/20 bg-black/25 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Primary Object</p>
      <div className="mt-2 grid gap-1 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Object</span>
          <span className="truncate text-right font-semibold text-white">{primaryObject.label}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Source:</span>
          <span className="text-right text-cyan-100">{primaryObject.source}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Catalog ID</span>
          <span className="text-right font-mono text-zinc-200">{primaryObject.noradCatalogId ?? "Direct orbit"}</span>
        </div>
      </div>

      {primaryObject.mode === "imported-tle" && importedCandidates.length > 0 && (
        <label className="mt-3 block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Imported TLE Primary</span>
          <select value={selectedImportedId} onChange={(event) => onSelectedImportedIdChange(event.target.value)} className="mt-1 w-full border border-cyan-300/25 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300">
            {importedCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
            ))}
          </select>
        </label>
      )}

      {primaryObject.mode === "catalog-search" && (
        <label className="mt-3 block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Advanced Catalog NORAD</span>
          <input value={catalogSearchNorad} inputMode="numeric" onChange={(event) => onCatalogSearchNoradChange(event.target.value)} placeholder="Enter NORAD catalog ID" className="mt-1 w-full border border-cyan-300/25 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300" />
        </label>
      )}
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

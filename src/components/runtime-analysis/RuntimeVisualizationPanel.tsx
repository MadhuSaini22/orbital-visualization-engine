"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RuntimePageId } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import type {
  RuntimeCatalogConjunctionCandidate,
  RuntimeCatalogConjunctionResult,
  RuntimeCollisionProbabilityResult,
  RuntimeConjunctionResult,
  RuntimeCovariancePropagationResponse,
  RuntimeEclipseResult,
  RuntimePropagationResponse,
  RuntimeRelativeMotionResult,
  RuntimeVisibilityResult,
} from "@/services/orbitServerApi";
import { EmptyState } from "@/components/runtime-analysis/runtime-components/EmptyState";
import { LoadingOverlay } from "@/components/runtime-analysis/runtime-components/LoadingOverlay";
import {
  buildRuntimeRenderModel,
  candidateId,
  candidateSatelliteId,
  clampIso,
  covarianceTraceAt,
  currentEclipseType,
  isInsideEclipse,
  isInsideVisibility,
  relativeDistanceKm,
  riskLabel,
  riskTone,
} from "@/components/runtime-analysis/runtime-components/RuntimeVisualizationModel";

const CesiumGlobe = dynamic(
  () => import("@/components/CesiumGlobe").then((mod) => mod.CesiumGlobe),
  {
    ssr: false,
    loading: () => <div className="grid h-full min-h-[420px] place-items-center bg-black text-sm text-zinc-500">Loading viewer...</div>,
  },
);

type RuntimeVisualizationPanelProps = {
  activePage: RuntimePageId;
  propagation: RuntimePropagationResponse | null;
  visibility: RuntimeVisibilityResult | null;
  eclipse: RuntimeEclipseResult | null;
  relativeMotion: RuntimeRelativeMotionResult | null;
  pairwiseConjunction: RuntimeConjunctionResult | null;
  catalogScreening: RuntimeCatalogConjunctionResult | null;
  collisionProbability: RuntimeCollisionProbabilityResult | null;
  covariancePropagation: RuntimeCovariancePropagationResponse | null;
  loading: boolean;
  fallbackNorad: string;
};

type PlaybackState = "stopped" | "playing" | "paused";

export function RuntimeVisualizationPanel({
  activePage,
  propagation,
  visibility,
  eclipse,
  relativeMotion,
  pairwiseConjunction,
  catalogScreening,
  collisionProbability,
  covariancePropagation,
  loading,
  fallbackNorad,
}: RuntimeVisualizationPanelProps) {
  const [playback, setPlayback] = useState<PlaybackState>("stopped");
  const [speed, setSpeed] = useState(10);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ satelliteId: string; sequence: number } | null>(null);
  const [covarianceOpacity, setCovarianceOpacity] = useState(0.18);
  const startIso = propagation?.startTime ?? new Date().toISOString();
  const stopIso = propagation?.stopTime ?? startIso;
  const [manualTimeIso, setManualTimeIso] = useState<string | null>(null);
  const currentTimeIso = clampIso(manualTimeIso ?? startIso, startIso, stopIso);
  const durationSeconds = Math.max(0, (Date.parse(stopIso) - Date.parse(startIso)) / 1000);
  const elapsedSeconds = Math.max(0, (Date.parse(currentTimeIso) - Date.parse(startIso)) / 1000);
  const selectedCandidate = catalogScreening?.candidates.find((candidate) => candidateId(candidate) === selectedCandidateId) ?? null;

  const renderModel = useMemo(
    () => buildRuntimeRenderModel({
      activePage,
      propagation,
      visibility,
      eclipse,
      relativeMotion,
      pairwiseConjunction,
      catalogScreening,
      covariancePropagation,
      fallbackNorad,
      currentTimeIso,
      selectedCandidateId,
      covarianceOpacity,
    }),
    [activePage, catalogScreening, covarianceOpacity, covariancePropagation, currentTimeIso, eclipse, fallbackNorad, pairwiseConjunction, propagation, relativeMotion, selectedCandidateId, visibility],
  );

  const stop = () => {
    setPlayback("stopped");
    setManualTimeIso(startIso);
  };

  const focusCandidate = (candidate: RuntimeCatalogConjunctionCandidate) => {
    const id = candidateId(candidate);
    setSelectedCandidateId(id);
    setFocusRequest((request) => ({ satelliteId: candidateSatelliteId(candidate), sequence: (request?.sequence ?? 0) + 1 }));
  };

  return (
    <section className="relative min-h-[420px] border-r border-cyan-300/15 bg-black max-xl:border-r-0 max-xl:border-b">
      <div className="absolute top-3 left-3 z-10 w-[min(520px,calc(100%-1.5rem))] border border-cyan-300/20 bg-black/70 p-3 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">3D Runtime Viewer</p>
            <p className="mt-1 text-xs text-zinc-400">{propagation ? `${propagation.states.length} propagated states` : "Run propagation to draw trajectory"}</p>
          </div>
          <StatusBadge activePage={activePage} playback={playback} eclipseActive={isInsideEclipse(eclipse, currentTimeIso)} visibilityActive={isInsideVisibility(visibility, currentTimeIso)} />
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="Play" onClick={() => setPlayback("playing")} active={playback === "playing"}>▶</IconButton>
            <IconButton label="Pause" onClick={() => setPlayback("paused")} active={playback === "paused"}>Ⅱ</IconButton>
            <IconButton label="Resume" onClick={() => setPlayback("playing")} disabled={playback !== "paused"}>↻</IconButton>
            <IconButton label="Stop" onClick={stop}>■</IconButton>
            <label className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
              Speed
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="border border-white/10 bg-black/60 px-2 py-1 text-cyan-100">
                {[1, 5, 10, 25, 50, 100].map((value) => <option key={value} value={value}>{value}x</option>)}
              </select>
            </label>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, durationSeconds)}
            value={Math.min(durationSeconds, elapsedSeconds)}
            onChange={(event) => {
              setPlayback("paused");
              setManualTimeIso(new Date(Date.parse(startIso) + Number(event.target.value) * 1000).toISOString());
            }}
            className="w-full accent-cyan-300"
            disabled={!propagation}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
            <span>{currentTimeIso.slice(0, 19)} UTC</span>
            <span>{durationSeconds > 0 ? `${Math.round(elapsedSeconds)} / ${Math.round(durationSeconds)} s` : "No timeline"}</span>
          </div>
        </div>
      </div>

      <RuntimeOverlayCards
        activePage={activePage}
        visibility={visibility}
        eclipse={eclipse}
        relativeMotion={relativeMotion}
        pairwiseConjunction={pairwiseConjunction}
        catalogScreening={catalogScreening}
        collisionProbability={collisionProbability}
        covariancePropagation={covariancePropagation}
        currentTimeIso={currentTimeIso}
        selectedCandidate={selectedCandidate}
        onFocusCandidate={focusCandidate}
        covarianceOpacity={covarianceOpacity}
        onCovarianceOpacityChange={setCovarianceOpacity}
      />

      {propagation ? (
        <CesiumGlobe
          renderModel={renderModel}
          frameMode="earth-fixed"
          simTimeIso={currentTimeIso}
          isPlaying={playback === "playing"}
          simulationSpeed={speed}
          focusRequest={focusRequest}
          maneuverFocusRequest={null}
          onSelectConjunction={setSelectedCandidateId}
          onSelectManeuver={() => undefined}
          onToggleSatellite={(satelliteId) => setFocusRequest((request) => ({ satelliteId, sequence: (request?.sequence ?? 0) + 1 }))}
          resetSignal={0}
          onClockTick={(timeIso) => setManualTimeIso(clampIso(timeIso, startIso, stopIso))}
        />
      ) : (
        <EmptyState title="No runtime trajectory" detail="Run Orbit Propagation first. Subsequent analyses will enrich this Cesium scene with visibility, eclipse, conjunction, and covariance overlays." />
      )}
      {loading && <LoadingOverlay />}
    </section>
  );
}

function RuntimeOverlayCards({
  activePage,
  visibility,
  eclipse,
  relativeMotion,
  pairwiseConjunction,
  catalogScreening,
  collisionProbability,
  covariancePropagation,
  currentTimeIso,
  selectedCandidate,
  onFocusCandidate,
  covarianceOpacity,
  onCovarianceOpacityChange,
}: {
  activePage: RuntimePageId;
  visibility: RuntimeVisibilityResult | null;
  eclipse: RuntimeEclipseResult | null;
  relativeMotion: RuntimeRelativeMotionResult | null;
  pairwiseConjunction: RuntimeConjunctionResult | null;
  catalogScreening: RuntimeCatalogConjunctionResult | null;
  collisionProbability: RuntimeCollisionProbabilityResult | null;
  covariancePropagation: RuntimeCovariancePropagationResponse | null;
  currentTimeIso: string;
  selectedCandidate: RuntimeCatalogConjunctionCandidate | null;
  onFocusCandidate: (candidate: RuntimeCatalogConjunctionCandidate) => void;
  covarianceOpacity: number;
  onCovarianceOpacityChange: (value: number) => void;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 grid w-[min(360px,calc(100%-1.5rem))] gap-2">
      {activePage === "visibility" && visibility && <InfoCard title="Visibility"><Metric label="Status" value={isInsideVisibility(visibility, currentTimeIso) ? "Visible" : "Not visible"} tone={isInsideVisibility(visibility, currentTimeIso) ? "ok" : "idle"} /><Metric label="Windows" value={String(visibility.windows.length)} /><Metric label="Station" value={visibility.request.groundStationId.value} /></InfoCard>}
      {activePage === "eclipse" && eclipse && <InfoCard title="Eclipse"><Metric label="Current" value={currentEclipseType(eclipse, currentTimeIso)} tone={isInsideEclipse(eclipse, currentTimeIso) ? "warn" : "ok"} /><Metric label="Intervals" value={String(eclipse.intervals.length)} /></InfoCard>}
      {activePage === "relative-motion" && relativeMotion && <InfoCard title="Relative Motion"><Metric label="Frame" value={relativeMotion.request.frame} /><Metric label="Distance" value={`${relativeDistanceKm(relativeMotion, currentTimeIso).toFixed(2)} km`} tone="warn" /><Metric label="Samples" value={String(relativeMotion.states.length)} /></InfoCard>}
      {activePage === "pairwise" && pairwiseConjunction && <InfoCard title="Closest Approach"><Metric label="Status" value={pairwiseConjunction.status} tone={pairwiseConjunction.status === "CLEAR" ? "ok" : "danger"} /><Metric label="Miss" value={`${pairwiseConjunction.closestApproach.missDistanceMeters.toFixed(1)} m`} /><Metric label="TCA" value={pairwiseConjunction.closestApproach.timeOfClosestApproach.slice(0, 19)} /></InfoCard>}
      {activePage === "catalog-screening" && catalogScreening && (
        <InfoCard title="Screened Candidates">
          <Metric label="Candidates" value={String(catalogScreening.candidates.length)} />
          <Metric label="Selected" value={selectedCandidate ? selectedCandidate.satellite.objectName : "None"} />
          <div className="thin-scrollbar pointer-events-auto max-h-44 overflow-auto">
            {catalogScreening.candidates.slice(0, 18).map((candidate) => (
              <button key={candidateId(candidate)} type="button" onClick={() => onFocusCandidate(candidate)} className="mb-1 flex w-full items-center justify-between gap-2 border border-white/10 bg-black/45 px-2 py-1 text-left text-[11px] text-zinc-300 hover:border-cyan-300">
                <span className="truncate">{candidate.satellite.objectName}</span>
                <span className={candidate.conjunctionResult.status === "CLEAR" ? "text-emerald-200" : "text-rose-200"}>{candidate.conjunctionResult.status}</span>
              </button>
            ))}
          </div>
        </InfoCard>
      )}
      {activePage === "collision" && collisionProbability && (
        <InfoCard title="Collision Probability">
          <Metric label="Risk" value={riskLabel(collisionProbability.probabilityOfCollision)} tone={riskTone(collisionProbability.probabilityOfCollision)} />
          <Metric label="Probability" value={collisionProbability.probabilityOfCollision.toExponential(3)} />
          <Metric label="Sigma" value={`${collisionProbability.statistics.equivalentSigmaMeters.toFixed(2)} m`} />
          <Metric label="Hard Body" value={`${collisionProbability.request.hardBodyRadiusMeters.toFixed(2)} m`} />
        </InfoCard>
      )}
      {activePage === "covariance" && covariancePropagation && (
        <InfoCard title="Covariance">
          <Metric label="States" value={String(covariancePropagation.states.length)} />
          <Metric label="Trace" value={covarianceTraceAt(covariancePropagation, currentTimeIso).toExponential(3)} />
          <label className="pointer-events-auto block font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
            Ellipsoid opacity
            <input type="range" min={0.05} max={0.7} step={0.01} value={covarianceOpacity} onChange={(event) => onCovarianceOpacityChange(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" />
          </label>
        </InfoCard>
      )}
    </div>
  );
}

function IconButton({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: string }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`grid h-8 w-8 place-items-center border font-mono text-xs transition disabled:opacity-40 ${active ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/10 bg-black/45 text-cyan-100 hover:border-cyan-300"}`}>{children}</button>;
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="pointer-events-auto border border-cyan-300/20 bg-black/70 p-3 backdrop-blur"><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">{title}</p><div className="grid gap-2">{children}</div></div>;
}

function Metric({ label, value, tone = "idle" }: { label: string; value: string; tone?: "idle" | "ok" | "warn" | "danger" }) {
  const toneClass = tone === "ok" ? "text-emerald-200" : tone === "warn" ? "text-amber-200" : tone === "danger" ? "text-rose-200" : "text-zinc-200";
  return <div className="flex items-center justify-between gap-3 text-xs"><span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">{label}</span><span className={`max-w-[190px] truncate text-right font-semibold ${toneClass}`} title={value}>{value}</span></div>;
}

function StatusBadge({ activePage, playback, eclipseActive, visibilityActive }: { activePage: RuntimePageId; playback: PlaybackState; eclipseActive: boolean; visibilityActive: boolean }) {
  const detail = activePage === "eclipse" && eclipseActive ? "Eclipse" : activePage === "visibility" && visibilityActive ? "Visible" : playback;
  return <span className="border border-cyan-300/30 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100">{detail}</span>;
}

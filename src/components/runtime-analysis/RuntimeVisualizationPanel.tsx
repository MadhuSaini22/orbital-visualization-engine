"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CesiumRenderModel, GroundStationVisualizationModel } from "@/domain/visualization";
import type { ConjunctionSnapshot, ConjunctionStatus } from "@/domain/conjunction";
import type { GroundStation } from "@/domain/groundOperations";
import type { OrbitState, RangeMeasurement, SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import { groundStationCatalog } from "@/data/groundStationCatalog";
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

const emptyGroundStationVisualization: GroundStationVisualizationModel = {
  markers: [],
  satelliteFootprint: null,
  stationAccessRegions: [],
  contactLines: [],
};

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
      collisionProbability,
      covariancePropagation,
      fallbackNorad,
      currentTimeIso,
      selectedCandidateId,
      covarianceOpacity,
    }),
    [activePage, catalogScreening, collisionProbability, covarianceOpacity, covariancePropagation, currentTimeIso, eclipse, fallbackNorad, pairwiseConjunction, propagation, relativeMotion, selectedCandidateId, visibility],
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

function buildRuntimeRenderModel({
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
}: Omit<RuntimeVisualizationPanelProps, "loading"> & { currentTimeIso: string; selectedCandidateId: string | null; covarianceOpacity: number }): CesiumRenderModel {
  const states = propagation?.states ?? [];
  const primaryId = `runtime-${propagation?.satellite.catalogSatellite.noradCatalogId ?? fallbackNorad}`;
  const trajectory = states.map((state) => runtimeStateToOrbitState(primaryId, state));
  const currentState = stateAtTime(trajectory, currentTimeIso) ?? trajectory[0] ?? null;
  const inEclipse = isInsideEclipse(eclipse, currentTimeIso);
  const primarySatellite = makeSatellite(primaryId, propagation?.satellite.catalogSatellite.objectName ?? `Runtime ${fallbackNorad}`, String(propagation?.satellite.catalogSatellite.noradCatalogId ?? fallbackNorad), inEclipse ? "#f97316" : "#67e8f9");
  const primarySnapshot: SatelliteSnapshot = { satellite: primarySatellite, state: currentState, trajectory, futureTrajectory: trajectory, pastTrail: trailToTime(trajectory, currentTimeIso), groundTrack: trajectory };
  const snapshots: SatelliteSnapshot[] = propagation ? [primarySnapshot] : [];
  const selectedSatelliteIds = [primaryId];
  const candidateSnapshots = catalogScreening?.candidates.slice(0, 40).map((candidate) => syntheticCandidateSnapshot(candidate, currentState))?.filter(Boolean) as SatelliteSnapshot[] | undefined;
  if (candidateSnapshots) {
    snapshots.push(...candidateSnapshots);
    selectedSatelliteIds.push(...candidateSnapshots.filter((snapshot) => snapshot.satellite.id === `${selectedCandidateId}-satellite`).map((snapshot) => snapshot.satellite.id));
  }
  const relativeSnapshot = relativeMotion && currentState ? syntheticRelativeSnapshot(relativeMotion, currentState, currentTimeIso) : null;
  if (relativeSnapshot) {
    snapshots.push(relativeSnapshot);
    selectedSatelliteIds.push(relativeSnapshot.satellite.id);
  }

  const rangeMeasurement = buildRangeMeasurement(primarySnapshot, relativeSnapshot, pairwiseConjunction, currentTimeIso);
  const conjunctionSnapshots = buildConjunctionSnapshots(primarySnapshot, pairwiseConjunction, catalogScreening, currentState);
  const groundStationVisualization = buildGroundStationVisualization(visibility, currentState, currentTimeIso);
  const orbitPathSnapshots = activePage === "visibility" && visibility
    ? buildVisibilitySegments(primarySnapshot, visibility)
    : activePage === "eclipse" && eclipse
      ? buildEclipseSegments(primarySnapshot, eclipse)
      : [primarySnapshot];
  const covarianceEllipsoid = activePage === "covariance" && covariancePropagation && currentState
    ? buildCovarianceEllipsoid(covariancePropagation, currentState, currentTimeIso, covarianceOpacity)
    : null;

  return {
    snapshots,
    orbitSnapshots: snapshots,
    orbitPathSnapshots,
    trailSnapshots: [primarySnapshot],
    groundTrackSnapshots: [primarySnapshot],
    rangeMeasurement,
    selectedSatelliteIds,
    showAllOrbits: true,
    showLabels: true,
    maneuverSnapshots: [],
    selectedManeuverId: null,
    showManeuvers: false,
    conjunctionSnapshots,
    selectedConjunctionId: selectedCandidateId,
    showConjunctions: conjunctionSnapshots.length > 0,
    groundStationVisualization,
    groundOperationsGroundTrackSnapshot: null,
    runtimeCovarianceEllipsoid: covarianceEllipsoid,
  };
}

function makeSatellite(id: string, name: string, noradId: string, color: string): SatelliteObject {
  return { id, name, noradId, sourceType: "EPHEMERIS", visual: { showMarker: true, showLabel: true, showOrbit: true, showGroundTrack: false, showTrail: true, color }, metadata: { mission: "runtime analysis", objectType: "payload" } };
}

function runtimeStateToOrbitState(satelliteId: string, state: { timestamp: string; position: { xMeters: number; yMeters: number; zMeters: number }; velocity: { xMeters: number; yMeters: number; zMeters: number } }): OrbitState {
  const xKm = state.position.xMeters / 1000;
  const yKm = state.position.yMeters / 1000;
  const zKm = state.position.zMeters / 1000;
  const radiusKm = Math.max(1, Math.sqrt(xKm ** 2 + yKm ** 2 + zKm ** 2));
  return { satelliteId, timeUtc: state.timestamp, frame: "ECEF", positionEcefKm: [xKm, yKm, zKm], velocityEcefKmps: [state.velocity.xMeters / 1000, state.velocity.yMeters / 1000, state.velocity.zMeters / 1000], latitudeDeg: Math.asin(zKm / radiusKm) * 180 / Math.PI, longitudeDeg: Math.atan2(yKm, xKm) * 180 / Math.PI, altitudeKm: radiusKm - 6378.137, velocityKmps: vectorMagnitudeMeters(state.velocity) / 1000 };
}

function stateAtTime(states: OrbitState[], timeIso: string) {
  if (states.length === 0) return null;
  const time = Date.parse(timeIso);
  let best = states[0];
  let bestDelta = Math.abs(Date.parse(best.timeUtc) - time);
  for (const state of states) {
    const delta = Math.abs(Date.parse(state.timeUtc) - time);
    if (delta < bestDelta) {
      best = state;
      bestDelta = delta;
    }
  }
  return best;
}

function trailToTime(states: OrbitState[], timeIso: string) {
  const time = Date.parse(timeIso);
  return states.filter((state) => Date.parse(state.timeUtc) <= time);
}

function stateWithOffset(primary: OrbitState, satelliteId: string, offsetMeters: { xMeters: number; yMeters: number; zMeters: number }, timeIso: string): OrbitState {
  const [xKm, yKm, zKm] = primary.positionEcefKm ?? [0, 0, 0];
  const next = { ...primary, satelliteId, timeUtc: timeIso, positionEcefKm: [xKm + offsetMeters.xMeters / 1000, yKm + offsetMeters.yMeters / 1000, zKm + offsetMeters.zMeters / 1000] as [number, number, number] };
  const [nx, ny, nz] = next.positionEcefKm;
  const radiusKm = Math.max(1, Math.sqrt(nx ** 2 + ny ** 2 + nz ** 2));
  return { ...next, latitudeDeg: Math.asin(nz / radiusKm) * 180 / Math.PI, longitudeDeg: Math.atan2(ny, nx) * 180 / Math.PI, altitudeKm: radiusKm - 6378.137 };
}

function syntheticRelativeSnapshot(relativeMotion: RuntimeRelativeMotionResult, primary: OrbitState, currentTimeIso: string): SatelliteSnapshot {
  const relative = closestRelativeState(relativeMotion, currentTimeIso);
  const state = stateWithOffset(primary, "runtime-secondary-relative", relative.relativePosition, currentTimeIso);
  return { satellite: makeSatellite("runtime-secondary-relative", `Secondary ${relativeMotion.request.secondaryNoradCatalogId}`, String(relativeMotion.request.secondaryNoradCatalogId), "#f472b6"), state, trajectory: [state], futureTrajectory: [state], pastTrail: [state] };
}

function syntheticCandidateSnapshot(candidate: RuntimeCatalogConjunctionCandidate, primary: OrbitState | null): SatelliteSnapshot | null {
  if (!primary) return null;
  const state = stateWithOffset(primary, candidateSatelliteId(candidate), candidate.conjunctionResult.closestApproach.relativeState.relativePosition, candidate.conjunctionResult.closestApproach.timeOfClosestApproach);
  return { satellite: makeSatellite(candidateSatelliteId(candidate), candidate.satellite.objectName, String(candidate.satellite.noradCatalogId), candidate.conjunctionResult.status === "CLEAR" ? "#22c55e" : "#ef4444"), state, trajectory: [state], futureTrajectory: [state], pastTrail: [state] };
}

function buildRangeMeasurement(primary: SatelliteSnapshot, secondary: SatelliteSnapshot | null, pairwise: RuntimeConjunctionResult | null, currentTimeIso: string): RangeMeasurement | null {
  if (secondary?.state) return { primary, secondary, distanceKm: distanceKm(primary.state, secondary.state) };
  if (!pairwise || !primary.state) return null;
  const secondaryState = stateWithOffset(primary.state, "runtime-pairwise-secondary", pairwise.closestApproach.relativeState.relativePosition, currentTimeIso);
  const secondarySnapshot: SatelliteSnapshot = { satellite: makeSatellite("runtime-pairwise-secondary", `Secondary ${pairwise.request.secondaryNoradCatalogId}`, String(pairwise.request.secondaryNoradCatalogId), "#f472b6"), state: secondaryState };
  return { primary, secondary: secondarySnapshot, distanceKm: pairwise.closestApproach.missDistanceMeters / 1000 };
}

function buildConjunctionSnapshots(primary: SatelliteSnapshot, pairwise: RuntimeConjunctionResult | null, catalog: RuntimeCatalogConjunctionResult | null, primaryState: OrbitState | null): ConjunctionSnapshot[] {
  const snapshots: ConjunctionSnapshot[] = [];
  if (pairwise && primaryState) {
    snapshots.push(conjunctionSnapshotFromResult(pairwise, primary.satellite, makeSatellite("runtime-pairwise-secondary", `Secondary ${pairwise.request.secondaryNoradCatalogId}`, String(pairwise.request.secondaryNoradCatalogId), "#f472b6"), primaryState, "runtime-pairwise"));
  }
  catalog?.candidates.slice(0, 40).forEach((candidate) => {
    if (!primaryState) return;
    snapshots.push(conjunctionSnapshotFromResult(candidate.conjunctionResult, primary.satellite, makeSatellite(candidateSatelliteId(candidate), candidate.satellite.objectName, String(candidate.satellite.noradCatalogId), candidate.conjunctionResult.status === "CLEAR" ? "#22c55e" : "#ef4444"), primaryState, candidateId(candidate)));
  });
  return snapshots;
}

function conjunctionSnapshotFromResult(result: RuntimeConjunctionResult, primary: SatelliteObject, secondary: SatelliteObject, primaryState: OrbitState, id: string): ConjunctionSnapshot {
  const tca = result.closestApproach.timeOfClosestApproach;
  const secondaryState = stateWithOffset(primaryState, secondary.id, result.closestApproach.relativeState.relativePosition, tca);
  return { event: { id, primarySatelliteId: primary.id, secondarySatelliteId: secondary.id, primaryName: primary.name, secondaryName: secondary.name, startTimeUtc: tca, endTimeUtc: tca, tcaUtc: tca, missDistanceKm: result.closestApproach.missDistanceMeters / 1000, relativeVelocityKmps: result.closestApproach.relativeSpeedMetersPerSecond / 1000, warningDistanceKm: result.request.missDistanceThresholdMeters / 1000, criticalDistanceKm: Math.max(0.001, result.request.missDistanceThresholdMeters / 3000), source: "Runtime" }, primary, secondary, tcaUtc: tca, missDistanceKm: result.closestApproach.missDistanceMeters / 1000, relativeVelocityKmps: result.closestApproach.relativeSpeedMetersPerSecond / 1000, status: conjunctionStatus(result), primaryState, secondaryState };
}

function buildGroundStationVisualization(visibility: RuntimeVisibilityResult | null, currentState: OrbitState | null, currentTimeIso: string): GroundStationVisualizationModel {
  if (!visibility || !currentState) return emptyGroundStationVisualization;
  const station = resolveGroundStation(visibility.request.groundStationId.value);
  if (!station) return emptyGroundStationVisualization;
  const visible = isInsideVisibility(visibility, currentTimeIso);
  return {
    markers: [{ station, isVisible: visible }],
    satelliteFootprint: { id: "runtime-satellite-footprint", name: "Runtime satellite footprint", latitudeDeg: currentState.latitudeDeg, longitudeDeg: currentState.longitudeDeg, radiusMeters: 2200000 },
    stationAccessRegions: [{ id: "runtime-visibility-cone", name: `${station.name} visibility cone`, stationId: station.id, latitudeDeg: station.latitude, longitudeDeg: station.longitude, radiusMeters: 2400000, isVisible: visible }],
    contactLines: visible ? [{ id: "runtime-current-line-of-sight", name: "Current line of sight", station, satelliteState: currentState }] : [],
  };
}

function buildVisibilitySegments(primary: SatelliteSnapshot, visibility: RuntimeVisibilityResult): SatelliteSnapshot[] {
  const trajectory = primary.trajectory ?? [];
  const visible = trajectory.filter((state) => isInsideVisibility(visibility, state.timeUtc));
  const hidden = trajectory.filter((state) => !isInsideVisibility(visibility, state.timeUtc));
  return [segmentSnapshot(primary, visible, "#22c55e", "visible"), segmentSnapshot(primary, hidden, "#64748b", "not-visible")].filter((snapshot) => (snapshot.trajectory?.length ?? 0) > 1);
}

function buildEclipseSegments(primary: SatelliteSnapshot, eclipse: RuntimeEclipseResult): SatelliteSnapshot[] {
  const trajectory = primary.trajectory ?? [];
  const sunlight = trajectory.filter((state) => currentEclipseType(eclipse, state.timeUtc) === "SUNLIGHT");
  const penumbra = trajectory.filter((state) => currentEclipseType(eclipse, state.timeUtc) === "PENUMBRA");
  const umbra = trajectory.filter((state) => currentEclipseType(eclipse, state.timeUtc) === "UMBRA");
  return [segmentSnapshot(primary, sunlight, "#67e8f9", "sunlight"), segmentSnapshot(primary, penumbra, "#f59e0b", "penumbra"), segmentSnapshot(primary, umbra, "#ef4444", "umbra")].filter((snapshot) => (snapshot.trajectory?.length ?? 0) > 1);
}

function segmentSnapshot(primary: SatelliteSnapshot, trajectory: OrbitState[], color: string, suffix: string): SatelliteSnapshot {
  return { ...primary, satellite: { ...primary.satellite, id: `${primary.satellite.id}-${suffix}`, visual: { ...primary.satellite.visual, color } }, trajectory, futureTrajectory: trajectory, pastTrail: [] };
}

function buildCovarianceEllipsoid(covariance: RuntimeCovariancePropagationResponse, currentState: OrbitState, currentTimeIso: string, opacity: number) {
  const state = covariance.states.reduce((best, item) => Math.abs(Date.parse(item.timestamp) - Date.parse(currentTimeIso)) < Math.abs(Date.parse(best.timestamp) - Date.parse(currentTimeIso)) ? item : best, covariance.states[0]);
  const matrix = state.covarianceMatrix.values;
  const radii = [0, 1, 2].map((index) => Math.max(2000, Math.sqrt(Math.abs(matrix[index]?.[index] ?? 1)) * 120)) as [number, number, number];
  return { id: "runtime-covariance-ellipsoid", label: "Covariance ellipsoid", satelliteState: currentState, radiiMeters: radii, opacity, color: "#a78bfa" };
}

function resolveGroundStation(id: string): GroundStation | null {
  const catalog = groundStationCatalog.find((station) => station.catalogId === id || station.name.toLowerCase() === id.toLowerCase());
  if (!catalog) return null;
  return { id: catalog.catalogId, workspaceId: "runtime", name: catalog.name, latitude: catalog.latitude, longitude: catalog.longitude, altitude: catalog.altitude, minimumElevation: catalog.minimumElevation, source: "CATALOG", network: catalog.network, enabled: true };
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

function clampIso(value: string, start: string, stop: string) {
  const time = Date.parse(value);
  const startMs = Date.parse(start);
  const stopMs = Date.parse(stop);
  if (!Number.isFinite(time) || !Number.isFinite(startMs) || !Number.isFinite(stopMs)) return start;
  return new Date(Math.min(Math.max(time, startMs), stopMs)).toISOString();
}

function vectorMagnitudeMeters(vector: { xMeters: number; yMeters: number; zMeters: number }) {
  return Math.sqrt(vector.xMeters ** 2 + vector.yMeters ** 2 + vector.zMeters ** 2);
}

function distanceKm(a: OrbitState | null, b: OrbitState | null) {
  if (!a?.positionEcefKm || !b?.positionEcefKm) return 0;
  return Math.sqrt((a.positionEcefKm[0] - b.positionEcefKm[0]) ** 2 + (a.positionEcefKm[1] - b.positionEcefKm[1]) ** 2 + (a.positionEcefKm[2] - b.positionEcefKm[2]) ** 2);
}

function isInsideVisibility(visibility: RuntimeVisibilityResult | null, timeIso: string) {
  const time = Date.parse(timeIso);
  return Boolean(visibility?.windows.some((window) => time >= Date.parse(window.acquisitionOfSignalTime) && time <= Date.parse(window.lossOfSignalTime)));
}

function currentEclipseType(eclipse: RuntimeEclipseResult | null, timeIso: string) {
  const time = Date.parse(timeIso);
  return eclipse?.intervals.find((interval) => time >= Date.parse(interval.startTime) && time <= Date.parse(interval.stopTime))?.type ?? "SUNLIGHT";
}

function isInsideEclipse(eclipse: RuntimeEclipseResult | null, timeIso: string) {
  const type = currentEclipseType(eclipse, timeIso);
  return type === "UMBRA" || type === "PENUMBRA";
}

function closestRelativeState(relativeMotion: RuntimeRelativeMotionResult, timeIso: string) {
  const time = Date.parse(timeIso);
  return relativeMotion.states.reduce((best, item) => Math.abs(Date.parse(item.timestamp) - time) < Math.abs(Date.parse(best.timestamp) - time) ? item : best, relativeMotion.states[0]);
}

function relativeDistanceKm(relativeMotion: RuntimeRelativeMotionResult, timeIso: string) {
  return vectorMagnitudeMeters(closestRelativeState(relativeMotion, timeIso).relativePosition) / 1000;
}

function conjunctionStatus(result: RuntimeConjunctionResult): ConjunctionStatus {
  if (result.status === "CLEAR") return "safe";
  return result.closestApproach.missDistanceMeters <= result.request.missDistanceThresholdMeters * 0.33 ? "critical" : "warning";
}

function candidateId(candidate: RuntimeCatalogConjunctionCandidate) {
  return `runtime-catalog-${candidate.satellite.noradCatalogId}`;
}

function candidateSatelliteId(candidate: RuntimeCatalogConjunctionCandidate) {
  return `${candidateId(candidate)}-satellite`;
}

function riskLabel(probability: number) {
  if (probability > 1e-4) return "High";
  if (probability > 1e-6) return "Watch";
  return "Low";
}

function riskTone(probability: number): "ok" | "warn" | "danger" {
  if (probability > 1e-4) return "danger";
  if (probability > 1e-6) return "warn";
  return "ok";
}

function covarianceTraceAt(covariance: RuntimeCovariancePropagationResponse, timeIso: string) {
  const time = Date.parse(timeIso);
  const state = covariance.states.reduce((best, item) => Math.abs(Date.parse(item.timestamp) - time) < Math.abs(Date.parse(best.timestamp) - time) ? item : best, covariance.states[0]);
  return state.covarianceMatrix.values.reduce((sum, row, index) => sum + (row[index] ?? 0), 0);
}

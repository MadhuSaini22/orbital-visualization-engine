"use client";

import type { CesiumRenderModel, GroundStationVisualizationModel } from "@/domain/visualization";
import type { ConjunctionSnapshot, ConjunctionStatus } from "@/domain/conjunction";
import type { GroundStation } from "@/domain/groundOperations";
import type { OrbitState, RangeMeasurement, SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import { groundStationCatalog } from "@/data/groundStationCatalog";
import type { RuntimePageId } from "@/components/runtime-analysis/RuntimeAnalysisWorkspace";
import type {
  RuntimeCatalogConjunctionCandidate,
  RuntimeCatalogConjunctionResult,
  RuntimeConjunctionResult,
  RuntimeCovariancePropagationResponse,
  RuntimeEclipseResult,
  RuntimePropagationResponse,
  RuntimeRelativeMotionResult,
  RuntimeVisibilityResult,
} from "@/services/orbitServerApi";

type RuntimeRenderModelInput = {
  activePage: RuntimePageId;
  propagation: RuntimePropagationResponse | null;
  visibility: RuntimeVisibilityResult | null;
  eclipse: RuntimeEclipseResult | null;
  relativeMotion: RuntimeRelativeMotionResult | null;
  pairwiseConjunction: RuntimeConjunctionResult | null;
  catalogScreening: RuntimeCatalogConjunctionResult | null;
  covariancePropagation: RuntimeCovariancePropagationResponse | null;
  fallbackNorad: string;
  currentTimeIso: string;
  selectedCandidateId: string | null;
  covarianceOpacity: number;
};

const emptyGroundStationVisualization: GroundStationVisualizationModel = {
  markers: [],
  satelliteFootprint: null,
  stationAccessRegions: [],
  contactLines: [],
};

export function buildRuntimeRenderModel({
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
}: RuntimeRenderModelInput): CesiumRenderModel {
  const states = propagation?.states ?? [];
  const primaryCatalogId = String(propagation?.satellite?.catalogSatellite.noradCatalogId ?? (fallbackNorad || "orbit"));
  const primaryName = propagation?.satellite?.catalogSatellite.objectName ?? `Runtime ${fallbackNorad || "Orbit"}`;
  const primaryId = `runtime-${primaryCatalogId}`;
  const trajectory = states.map((state) => runtimeStateToOrbitState(primaryId, state));
  const currentState = stateAtTime(trajectory, currentTimeIso) ?? trajectory[0] ?? null;
  const inEclipse = isInsideEclipse(eclipse, currentTimeIso);
  const primarySatellite = makeSatellite(
    primaryId,
    primaryName,
    primaryCatalogId,
    inEclipse ? "#f97316" : "#67e8f9",
  );
  const primarySnapshot: SatelliteSnapshot = { satellite: primarySatellite, state: currentState, trajectory, futureTrajectory: trajectory, pastTrail: trailToTime(trajectory, currentTimeIso), groundTrack: trajectory };
  const snapshots: SatelliteSnapshot[] = propagation ? [primarySnapshot] : [];
  const selectedSatelliteIds = [primaryId];
  const candidateSnapshots = catalogScreening?.candidates.slice(0, 40).map((candidate) => syntheticCandidateSnapshot(candidate, currentState)).filter(isSatelliteSnapshot) ?? [];
  snapshots.push(...candidateSnapshots);
  selectedSatelliteIds.push(...candidateSnapshots.filter((snapshot) => snapshot.satellite.id === `${selectedCandidateId}-satellite`).map((snapshot) => snapshot.satellite.id));

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

export function clampIso(value: string, start: string, stop: string) {
  const time = Date.parse(value);
  const startMs = Date.parse(start);
  const stopMs = Date.parse(stop);
  if (!Number.isFinite(time) || !Number.isFinite(startMs) || !Number.isFinite(stopMs)) return start;
  return new Date(Math.min(Math.max(time, startMs), stopMs)).toISOString();
}

export function isInsideVisibility(visibility: RuntimeVisibilityResult | null, timeIso: string) {
  const time = Date.parse(timeIso);
  return Boolean(visibility?.windows.some((window) => time >= Date.parse(window.acquisitionOfSignalTime) && time <= Date.parse(window.lossOfSignalTime)));
}

export function currentEclipseType(eclipse: RuntimeEclipseResult | null, timeIso: string) {
  const time = Date.parse(timeIso);
  return eclipse?.intervals.find((interval) => time >= Date.parse(interval.startTime) && time <= Date.parse(interval.stopTime))?.type ?? "SUNLIGHT";
}

export function isInsideEclipse(eclipse: RuntimeEclipseResult | null, timeIso: string) {
  const type = currentEclipseType(eclipse, timeIso);
  return type === "UMBRA" || type === "PENUMBRA";
}

export function relativeDistanceKm(relativeMotion: RuntimeRelativeMotionResult, timeIso: string) {
  return vectorMagnitudeMeters(closestRelativeState(relativeMotion, timeIso).relativePosition) / 1000;
}

export function candidateId(candidate: RuntimeCatalogConjunctionCandidate) {
  return `runtime-catalog-${candidate.satellite.noradCatalogId}`;
}

export function candidateSatelliteId(candidate: RuntimeCatalogConjunctionCandidate) {
  return `${candidateId(candidate)}-satellite`;
}

export function riskLabel(probability: number) {
  if (probability > 1e-4) return "High";
  if (probability > 1e-6) return "Watch";
  return "Low";
}

export function riskTone(probability: number): "ok" | "warn" | "danger" {
  if (probability > 1e-4) return "danger";
  if (probability > 1e-6) return "warn";
  return "ok";
}

export function covarianceTraceAt(covariance: RuntimeCovariancePropagationResponse, timeIso: string) {
  const time = Date.parse(timeIso);
  const state = covariance.states.reduce((best, item) => Math.abs(Date.parse(item.timestamp) - time) < Math.abs(Date.parse(best.timestamp) - time) ? item : best, covariance.states[0]);
  return state.covarianceMatrix.values.reduce((sum, row, index) => sum + (row[index] ?? 0), 0);
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
  const positionEcefKm: [number, number, number] = [xKm + offsetMeters.xMeters / 1000, yKm + offsetMeters.yMeters / 1000, zKm + offsetMeters.zMeters / 1000];
  const next = { ...primary, satelliteId, timeUtc: timeIso, positionEcefKm };
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

function isSatelliteSnapshot(snapshot: SatelliteSnapshot | null): snapshot is SatelliteSnapshot {
  return snapshot !== null;
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
  const covarianceRadius = (index: number) => Math.max(2000, Math.sqrt(Math.abs(matrix[index]?.[index] ?? 1)) * 120);
  const radiiMeters: [number, number, number] = [covarianceRadius(0), covarianceRadius(1), covarianceRadius(2)];
  return { id: "runtime-covariance-ellipsoid", label: "Covariance ellipsoid", satelliteState: currentState, radiiMeters, opacity, color: "#a78bfa" };
}

function resolveGroundStation(id: string): GroundStation | null {
  const catalog = groundStationCatalog.find((station) => station.catalogId === id || station.name.toLowerCase() === id.toLowerCase());
  if (!catalog) return null;
  return { id: catalog.catalogId, workspaceId: "runtime", name: catalog.name, latitude: catalog.latitude, longitude: catalog.longitude, altitude: catalog.altitude, minimumElevation: catalog.minimumElevation, source: "CATALOG", network: catalog.network, enabled: true };
}

function vectorMagnitudeMeters(vector: { xMeters: number; yMeters: number; zMeters: number }) {
  return Math.sqrt(vector.xMeters ** 2 + vector.yMeters ** 2 + vector.zMeters ** 2);
}

function distanceKm(a: OrbitState | null, b: OrbitState | null) {
  if (!a?.positionEcefKm || !b?.positionEcefKm) return 0;
  return Math.sqrt((a.positionEcefKm[0] - b.positionEcefKm[0]) ** 2 + (a.positionEcefKm[1] - b.positionEcefKm[1]) ** 2 + (a.positionEcefKm[2] - b.positionEcefKm[2]) ** 2);
}

function closestRelativeState(relativeMotion: RuntimeRelativeMotionResult, timeIso: string) {
  const time = Date.parse(timeIso);
  return relativeMotion.states.reduce((best, item) => Math.abs(Date.parse(item.timestamp) - time) < Math.abs(Date.parse(best.timestamp) - time) ? item : best, relativeMotion.states[0]);
}

function conjunctionStatus(result: RuntimeConjunctionResult): ConjunctionStatus {
  if (result.status === "CLEAR") return "safe";
  return result.closestApproach.missDistanceMeters <= result.request.missDistanceThresholdMeters * 0.33 ? "critical" : "warning";
}

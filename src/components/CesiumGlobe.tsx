"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { OrbitState, SatelliteSnapshot } from "@/domain/orbit";
import type { ManeuverSnapshot } from "@/domain/maneuver";
import { getConjunctionTone } from "@/domain/conjunction";
import { getManeuverTone } from "@/domain/maneuver";
import type { CesiumRenderModel, GroundStationVisualizationModel } from "@/domain/visualization";
import { splitGroundTrackByLongitudeWrap } from "@/geometry/groundTrack";
import { SatelliteJsPropagator } from "@/propagation/SatelliteJsPropagator";

type CesiumModule = typeof import("cesium");
type Viewer = import("cesium").Viewer;
type Entity = import("cesium").Entity;
type Cartesian3 = import("cesium").Cartesian3;
type FrameMode = "earth-fixed" | "inertial";

type CesiumGlobeProps = {
  renderModel: CesiumRenderModel;
  runtimeTlePropagation: boolean;
  frameMode: FrameMode;
  simTimeIso: string;
  isPlaying: boolean;
  simulationSpeed: number;
  focusRequest: { satelliteId: string; sequence: number } | null;
  maneuverFocusRequest: {
    longitudeDeg: number;
    latitudeDeg: number;
    altitudeKm: number;
    sequence: number;
  } | null;
  onSelectConjunction: (conjunctionId: string) => void;
  onSelectManeuver: (maneuverId: string) => void;
  onToggleSatellite: (satelliteId: string) => void;
  resetSignal: number;
  onClockTick: (timeIso: string) => void;
};

const palette = [
  "#63e6be",
  "#74c0fc",
  "#ffd43b",
  "#ff8787",
  "#b197fc",
  "#8ce99a",
  "#ffa94d",
  "#66d9e8",
  "#f783ac",
  "#d8f5a2",
];

const DEFAULT_CAMERA_VIEW = {
  longitudeDeg: 78,
  latitudeDeg: 20,
  heightMeters: 38000000,
};

const EMPTY_GROUND_STATION_VISUALIZATION: GroundStationVisualizationModel = {
  markers: [],
  satelliteFootprint: null,
  stationAccessRegions: [],
  contactLines: [],
};

type HoverInfo = {
  name: string;
  identifier: string;
  x: number;
  y: number;
} | null;

type SatellitePopup = {
  satelliteId: string;
  x: number;
  y: number;
} | null;

type TleOrbitalElements = {
  inclinationDeg: number;
  raanDeg: number;
  eccentricity: number;
  argumentOfPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionRevPerDay: number;
  periodMinutes: number;
  epochUtc: string | null;
};

function stateTimeMs(state: OrbitState) {
  return new Date(state.timeUtc).getTime();
}

function finiteTleNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTleOrbitalElements(line1: string | undefined, line2: string | undefined): TleOrbitalElements | null {
  if (!line2 || line2.length < 63) return null;
  const inclinationDeg = finiteTleNumber(line2.slice(8, 16));
  const raanDeg = finiteTleNumber(line2.slice(17, 25));
  const eccentricity = finiteTleNumber(`0.${line2.slice(26, 33).trim()}`);
  const argumentOfPerigeeDeg = finiteTleNumber(line2.slice(34, 42));
  const meanAnomalyDeg = finiteTleNumber(line2.slice(43, 51));
  const meanMotionRevPerDay = finiteTleNumber(line2.slice(52, 63));
  if (
    inclinationDeg === null
    || raanDeg === null
    || eccentricity === null
    || argumentOfPerigeeDeg === null
    || meanAnomalyDeg === null
    || meanMotionRevPerDay === null
    || meanMotionRevPerDay <= 0
  ) {
    return null;
  }
  const epochMs = tleEpochMs(line1);
  return {
    inclinationDeg,
    raanDeg,
    eccentricity,
    argumentOfPerigeeDeg,
    meanAnomalyDeg,
    meanMotionRevPerDay,
    periodMinutes: 1440 / meanMotionRevPerDay,
    epochUtc: epochMs === null ? null : new Date(epochMs).toISOString(),
  };
}

function snapshotVelocityKmps(state: OrbitState | null) {
  if (!state) return null;
  if (Number.isFinite(state.velocityKmps)) return state.velocityKmps ?? null;
  const velocity = state.velocityEcefKmps ?? state.velocityEciKmps;
  if (!velocity || velocity.some((component) => !Number.isFinite(component))) return null;
  return Math.hypot(...velocity);
}

function stateToSpaceCartesian(Cesium: CesiumModule, state: OrbitState): Cartesian3 {
  if (state.positionEcefKm) {
    const [xKm, yKm, zKm] = state.positionEcefKm;
    return new Cesium.Cartesian3(xKm * 1000, yKm * 1000, zKm * 1000);
  }

  return Cesium.Cartesian3.fromDegrees(
    state.longitudeDeg,
    state.latitudeDeg,
    state.altitudeKm * 1000,
  );
}

function buildSampledPositionProperty(Cesium: CesiumModule, states: OrbitState[]) {
  const orderedStates = states
    .filter((state) => state.positionEcefKm || state.positionEciKm)
    .toSorted((a, b) => stateTimeMs(a) - stateTimeMs(b));

  if (orderedStates.length === 0) {
    return null;
  }

  const property = new Cesium.SampledPositionProperty();
  for (const state of orderedStates) {
    property.addSample(
      Cesium.JulianDate.fromIso8601(state.timeUtc),
      stateToSpaceCartesian(Cesium, state),
    );
  }

  property.setInterpolationOptions({
    interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
    interpolationDegree: Math.min(5, Math.max(1, orderedStates.length - 1)),
  });

  return property;
}

function buildInterpolatedPathPositions(
  Cesium: CesiumModule,
  states: OrbitState[],
  toCartesian: (state: OrbitState) => Cartesian3,
) {
  const orderedStates = states
    .filter((state) => state.positionEcefKm || state.positionEciKm)
    .toSorted((a, b) => stateTimeMs(a) - stateTimeMs(b));

  if (orderedStates.length < 2) {
    return orderedStates.map(toCartesian);
  }

  const startMs = stateTimeMs(orderedStates[0]);
  const endMs = stateTimeMs(orderedStates.at(-1)!);
  const durationSec = Math.max(0, (endMs - startMs) / 1000);
  if (durationSec === 0) {
    return orderedStates.map(toCartesian);
  }

  const property = new Cesium.SampledPositionProperty();
  for (const state of orderedStates) {
    property.addSample(Cesium.JulianDate.fromIso8601(state.timeUtc), toCartesian(state));
  }
  property.setInterpolationOptions({
    interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
    interpolationDegree: Math.min(5, Math.max(1, orderedStates.length - 1)),
  });

  const targetVisualStepSec = 2;
  const maxVisualSamples = 6000;
  const sampleCount = Math.min(
    maxVisualSamples,
    Math.max(orderedStates.length, Math.ceil(durationSec / targetVisualStepSec) + 1),
  );
  const startJulian = Cesium.JulianDate.fromIso8601(orderedStates[0].timeUtc);
  const positions: Cartesian3[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const secondsFromStart = sampleCount === 1 ? 0 : (durationSec * index) / (sampleCount - 1);
    const sampleTime = Cesium.JulianDate.addSeconds(startJulian, secondsFromStart, new Cesium.JulianDate());
    const position = property.getValue(sampleTime);
    if (position) {
      positions.push(Cesium.Cartesian3.clone(position));
    }
  }

  return positions;
}

function ephemerisKey(states: OrbitState[]) {
  if (states.length === 0) {
    return "empty";
  }

  return `${states.length}:${states[0]?.timeUtc ?? ""}:${states.at(-1)?.timeUtc ?? ""}`;
}

function orbitGeometryKey(snapshot: SatelliteSnapshot, states: OrbitState[]) {
  const middle = states[Math.floor(states.length / 2)];
  const vector = (state: OrbitState | undefined) => (state?.positionEciKm ?? state?.positionEcefKm ?? []).join(",");
  return [
    snapshot.satellite.tle?.line1 ?? "",
    snapshot.satellite.tle?.line2 ?? "",
    ephemerisKey(states),
    vector(states[0]),
    vector(middle),
    vector(states.at(-1)),
  ].join("|");
}

function tleEpochMs(line1: string | undefined) {
  if (!line1 || line1.length < 32) return null;
  const shortYear = Number(line1.slice(18, 20));
  const dayOfYear = Number(line1.slice(20, 32));
  if (!Number.isFinite(shortYear) || !Number.isFinite(dayOfYear)) return null;
  const year = shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
  return Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000;
}

function tlePeriodMs(line2: string | undefined) {
  if (!line2 || line2.length < 63) return 100 * 60000;
  const revolutionsPerDay = Number(line2.slice(52, 63));
  return Number.isFinite(revolutionsPerDay) && revolutionsPerDay > 0
    ? 86400000 / revolutionsPerDay
    : 100 * 60000;
}

function isValidOrbitState(state: OrbitState | null): state is OrbitState {
  if (!state || !Number.isFinite(new Date(state.timeUtc).getTime()) || state.altitudeKm < 80) return false;
  const position = state.positionEcefKm ?? state.positionEciKm;
  if (!position || position.some((value) => !Number.isFinite(value))) return false;
  const radiusKm = Math.hypot(...position);
  return Number.isFinite(radiusKm) && radiusKm > 6450;
}

function isTleConsistentOrbitState(snapshot: SatelliteSnapshot, state: OrbitState | null): state is OrbitState {
  if (!isValidOrbitState(state)) return false;
  const line2 = snapshot.satellite.tle?.line2;
  if (!line2 || line2.length < 63) return true;

  const meanMotionRevPerDay = Number(line2.slice(52, 63));
  const eccentricity = Number(`0.${line2.slice(26, 33).trim()}`);
  if (!Number.isFinite(meanMotionRevPerDay) || meanMotionRevPerDay <= 0 || !Number.isFinite(eccentricity)) {
    return true;
  }

  const meanMotionRadSec = meanMotionRevPerDay * Math.PI * 2 / 86400;
  const semiMajorAxisKm = Math.cbrt(398600.4418 / (meanMotionRadSec * meanMotionRadSec));
  const position = state.positionEciKm ?? state.positionEcefKm;
  if (!position) return false;
  const radiusKm = Math.hypot(...position);
  const minimumExpectedRadiusKm = semiMajorAxisKm * Math.max(1 - eccentricity, 0.05) * 0.8;
  const maximumExpectedRadiusKm = semiMajorAxisKm * (1 + eccentricity) * 1.2;
  return radiusKm >= minimumExpectedRadiusKm && radiusKm <= maximumExpectedRadiusKm;
}

function buildValidatedRuntimeRevolution(
  propagator: SatelliteJsPropagator,
  snapshot: SatelliteSnapshot,
  requestedStartMs: number,
) {
  const periodMs = tlePeriodMs(snapshot.satellite.tle?.line2);
  const tleStartMs = tleEpochMs(snapshot.satellite.tle?.line1);
  const candidates = [requestedStartMs, tleStartMs].filter((value): value is number => value !== null);

  for (const startMs of candidates) {
    const states: OrbitState[] = [];
    let previousTimeMs = Number.NEGATIVE_INFINITY;
    let valid = true;
    for (let index = 0; index <= 180; index += 1) {
      const timeMs = startMs + (periodMs * index) / 180;
      const state = propagator.getState(snapshot.satellite.id, new Date(timeMs).toISOString());
      const stateTimeMs = state ? new Date(state.timeUtc).getTime() : Number.NaN;
      if (!isTleConsistentOrbitState(snapshot, state) || stateTimeMs <= previousTimeMs) {
        valid = false;
        break;
      }
      states.push(state);
      previousTimeMs = stateTimeMs;
    }
    if (valid && states.length === 181) return states;
  }
  return [];
}

function eciKmToFixedCartesianAtGmst(
  Cesium: CesiumModule,
  positionEciKm: [number, number, number],
  gmstRad: number,
): Cartesian3 {
  const [xKm, yKm, zKm] = positionEciKm;
  const cosGmst = Math.cos(gmstRad);
  const sinGmst = Math.sin(gmstRad);

  return new Cesium.Cartesian3(
    (xKm * cosGmst + yKm * sinGmst) * 1000,
    (-xKm * sinGmst + yKm * cosGmst) * 1000,
    zKm * 1000,
  );
}

function stateToOrbitArcCartesian(
  Cesium: CesiumModule,
  state: OrbitState,
  displayGmstRad?: number,
): Cartesian3 {
  if (state.positionEciKm && typeof displayGmstRad === "number") {
    return eciKmToFixedCartesianAtGmst(Cesium, state.positionEciKm, displayGmstRad);
  }

  return stateToSpaceCartesian(Cesium, state);
}

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function magnitude(vector: [number, number, number]) {
  return Math.sqrt(dot(vector, vector));
}

function normalize(vector: [number, number, number]): [number, number, number] | null {
  const length = magnitude(vector);
  if (length === 0) {
    return null;
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function subtract(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector: [number, number, number], factor: number): [number, number, number] {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function buildOsculatingOrbitArc(
  Cesium: CesiumModule,
  state: OrbitState,
  displayGmstRad?: number,
): Cartesian3[] {
  if (state.positionEciKm && state.velocityEciKmps && typeof displayGmstRad === "number") {
    return buildOsculatingOrbitArcFromVectors(
      Cesium,
      state.positionEciKm,
      state.velocityEciKmps,
      (pointKm) => eciKmToFixedCartesianAtGmst(Cesium, pointKm, displayGmstRad),
    );
  }

  if (state.positionEcefKm && state.velocityEcefKmps) {
    const earthRotationRadPerSec = 7.2921159e-5;
    const [xKm, yKm] = state.positionEcefKm;
    const inertialVelocityApproxKmps = add(state.velocityEcefKmps, [
      -earthRotationRadPerSec * yKm,
      earthRotationRadPerSec * xKm,
      0,
    ]);

    return buildOsculatingOrbitArcFromVectors(
      Cesium,
      state.positionEcefKm,
      inertialVelocityApproxKmps,
      (pointKm) => new Cesium.Cartesian3(pointKm[0] * 1000, pointKm[1] * 1000, pointKm[2] * 1000),
    );
  }

    return [];
}

function buildOsculatingOrbitArcFromVectors(
  Cesium: CesiumModule,
  positionKm: [number, number, number],
  velocityKmps: [number, number, number],
  toCartesian: (pointKm: [number, number, number]) => Cartesian3,
): Cartesian3[] {
  const muEarthKm3S2 = 398600.4418;
  const r = positionKm;
  const v = velocityKmps;
  const rMag = magnitude(r);
  const h = cross(r, v);
  const hMag = magnitude(h);
  if (rMag === 0 || hMag === 0) {
    return [];
  }

  const eccentricityVector = subtract(scale(cross(v, h), 1 / muEarthKm3S2), scale(r, 1 / rMag));
  const eccentricity = magnitude(eccentricityVector);
  const semiLatusRectumKm = (hMag * hMag) / muEarthKm3S2;

  // Low-Earth TLE examples are nearly circular. For those, using the current
  // radius direction as the first basis vector makes the live marker sit on
  // the drawn arc instead of drifting beside an arbitrary perigee direction.
  const perigeeBasis = eccentricity > 0.01
    ? normalize(eccentricityVector)
    : normalize(r);
  if (!perigeeBasis) {
    return [];
  }

  const normalBasis = normalize(h);
  if (!normalBasis) {
    return [];
  }

  const transverseBasis = normalize(cross(normalBasis, perigeeBasis));
  if (!transverseBasis) {
    return [];
  }

  const points: Cartesian3[] = [];
  for (let index = 0; index <= 360; index += 2) {
    const trueAnomaly = Cesium.Math.toRadians(index);
    const denominator = 1 + eccentricity * Math.cos(trueAnomaly);
    if (denominator <= 0) {
      continue;
    }

    const radiusKm = semiLatusRectumKm / denominator;
    const eciPoint = add(
      scale(perigeeBasis, radiusKm * Math.cos(trueAnomaly)),
      scale(transverseBasis, radiusKm * Math.sin(trueAnomaly)),
    );

    points.push(toCartesian(eciPoint));
  }

  return points;
}

function stateToGroundCartesian(Cesium: CesiumModule, state: OrbitState): Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(state.longitudeDeg, state.latitudeDeg, 0);
}

function getManeuverVectorPositions(Cesium: CesiumModule, snapshot: ManeuverSnapshot) {
  if (!snapshot.state) {
    return null;
  }

  const [radialMps, tangentialMps, normalMps] = snapshot.event.deltaVVectorMps;
  const vectorMagnitudeMps = Math.sqrt(radialMps ** 2 + tangentialMps ** 2 + normalMps ** 2);
  if (vectorMagnitudeMps === 0) {
    return null;
  }

  // Phase 2 uses a scaled visual vector rather than a full post-burn orbital
  // solve. The vector gives users direction/magnitude context without claiming
  // flight-dynamics precision.
  const start = stateToSpaceCartesian(Cesium, snapshot.state);
  const visualLengthMeters = Math.max(1400000, vectorMagnitudeMps * 2600000);
  const localOffset = new Cesium.Cartesian3(
    (tangentialMps / vectorMagnitudeMps) * visualLengthMeters,
    (normalMps / vectorMagnitudeMps) * visualLengthMeters,
    (radialMps / vectorMagnitudeMps) * visualLengthMeters,
  );
  const localFrame = Cesium.Transforms.eastNorthUpToFixedFrame(start);
  const end = Cesium.Matrix4.multiplyByPoint(localFrame, localOffset, new Cesium.Cartesian3());

  return { start, end };
}

function getSnapshotColor(Cesium: CesiumModule, snapshot: SatelliteSnapshot, index: number) {
  return Cesium.Color.fromCssColorString(snapshot.satellite.visual.color ?? palette[index % palette.length]);
}

function isFiniteStationCoordinate(station: GroundStationVisualizationModel["markers"][number]["station"]) {
  return Number.isFinite(station.longitude)
    && Number.isFinite(station.latitude)
    && Number.isFinite(station.altitude)
    && station.latitude >= -90
    && station.latitude <= 90
    && station.longitude >= -180
    && station.longitude <= 180;
}

export function CesiumGlobe({
  renderModel,
  runtimeTlePropagation,
  frameMode,
  simTimeIso,
  isPlaying,
  simulationSpeed,
  focusRequest,
  maneuverFocusRequest,
  onSelectConjunction,
  onSelectManeuver,
  onToggleSatellite,
  resetSignal,
  onClockTick,
}: CesiumGlobeProps) {
  const {
    snapshots,
    orbitSnapshots,
    rangeMeasurement,
    selectedSatelliteIds,
    showAllOrbits,
    showLabels,
    maneuverSnapshots,
    selectedManeuverId,
    showManeuvers,
    conjunctionSnapshots,
    selectedConjunctionId,
    showConjunctions,
    groundStationVisualization = EMPTY_GROUND_STATION_VISUALIZATION,
  } = renderModel;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const entityEphemerisKeysRef = useRef<Map<string, string>>(new Map());
  const orbitEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const trailEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const groundTrackEntitiesRef = useRef<Map<string, Entity[]>>(new Map());
  const orbitGeometryKeysRef = useRef<Map<string, string>>(new Map());
  const runtimeDebugKeyRef = useRef<string>("");
  const latestOrbitSnapshotsRef = useRef<SatelliteSnapshot[]>(orbitSnapshots);
  const runtimePropagatorRef = useRef<SatelliteJsPropagator | null>(null);
  const runtimePropagationEnabledRef = useRef(runtimeTlePropagation);
  const runtimePositionEntityIdsRef = useRef<Set<string>>(new Set());
  const runtimeReactUpdatesRef = useRef(0);
  const runtimeCesiumUpdatesRef = useRef<Map<string, number>>(new Map());
  const runtimeTimeOffsetsMsRef = useRef<Map<string, number>>(new Map());
  const rangeEntityRef = useRef<Entity | null>(null);
  const rangeLabelEntityRef = useRef<Entity | null>(null);
  const rangeDotEntitiesRef = useRef<Entity[]>([]);
  const maneuverEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const maneuverGeometryEntitiesRef = useRef<Entity[]>([]);
  const conjunctionEntitiesRef = useRef<Entity[]>([]);
  const groundStationMarkerEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const stationAccessRegionEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const satelliteFootprintEntityRef = useRef<Entity | null>(null);
  const groundStationContactLineEntitiesRef = useRef<Entity[]>([]);
  const latestSnapshotsRef = useRef<SatelliteSnapshot[]>(snapshots);
  const latestClockTickMsRef = useRef(0);
  const runtimeClockHandshakeSentRef = useRef(false);
  const onClockTickRef = useRef(onClockTick);
  const onSelectConjunctionRef = useRef(onSelectConjunction);
  const onSelectManeuverRef = useRef(onSelectManeuver);
  const onToggleSatelliteRef = useRef(onToggleSatellite);
  const initialClockRef = useRef({ isPlaying, simTimeIso, simulationSpeed });
  const hoverInfoRef = useRef<HoverInfo>(null);
  const [layerStats, setLayerStats] = useState({
    orbits: 0,
    trails: 0,
    groundTracks: 0,
  });
  const layerStatsRef = useRef(layerStats);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo>(null);
  const [satellitePopup, setSatellitePopup] = useState<SatellitePopup>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const runtimeSatelliteKey = snapshots
    .map((snapshot) => `${snapshot.satellite.id}:${snapshot.satellite.tle?.line1 ?? ""}:${snapshot.satellite.tle?.line2 ?? ""}`)
    .join("|");
  const orbitVisibilityKey = (runtimeTlePropagation ? snapshots : orbitSnapshots)
    .map((snapshot) => `${snapshot.satellite.id}:${snapshot.satellite.visual.showOrbit ? 1 : 0}`)
    .join("|");

  useEffect(() => {
    latestSnapshotsRef.current = snapshots;
    if (runtimeTlePropagation) runtimeReactUpdatesRef.current += 1;
  }, [runtimeTlePropagation, snapshots]);

  useEffect(() => {
    if (!runtimeTlePropagation) {
      latestOrbitSnapshotsRef.current = orbitSnapshots;
      return;
    }
    const orbitById = new Map(orbitSnapshots.map((snapshot) => [snapshot.satellite.id, snapshot]));
    latestOrbitSnapshotsRef.current = snapshots.map((snapshot) => ({
      ...snapshot,
      ...orbitById.get(snapshot.satellite.id),
      satellite: snapshot.satellite,
    }));
  }, [orbitSnapshots, runtimeTlePropagation, snapshots]);

  useEffect(() => {
    runtimePropagationEnabledRef.current = runtimeTlePropagation;
    if (runtimeTlePropagation) {
      const runtimeSnapshots = latestSnapshotsRef.current;
      const propagator = new SatelliteJsPropagator(runtimeSnapshots.map((snapshot) => snapshot.satellite));
      runtimePropagatorRef.current = propagator;
      const requestedTimeMs = Date.parse(simTimeIso);
      runtimeTimeOffsetsMsRef.current = new Map(runtimeSnapshots.map((snapshot) => {
        const requestedState = propagator.getState(snapshot.satellite.id, new Date(requestedTimeMs).toISOString());
        const epochMs = tleEpochMs(snapshot.satellite.tle?.line1);
        return [
          snapshot.satellite.id,
          isTleConsistentOrbitState(snapshot, requestedState) || epochMs === null ? 0 : epochMs - requestedTimeMs,
        ];
      }));
    } else {
      runtimePropagatorRef.current = null;
      runtimeTimeOffsetsMsRef.current.clear();
    }
  }, [runtimeSatelliteKey, runtimeTlePropagation, simTimeIso]);

  useEffect(() => {
    onClockTickRef.current = onClockTick;
  }, [onClockTick]);

  useEffect(() => {
    onSelectConjunctionRef.current = onSelectConjunction;
    onSelectManeuverRef.current = onSelectManeuver;
    onToggleSatelliteRef.current = onToggleSatellite;
  }, [onSelectConjunction, onSelectManeuver, onToggleSatellite]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    if (isPlaying) {
      return;
    }
    const nextTime = Cesium.JulianDate.fromIso8601(simTimeIso);
    if (Math.abs(Cesium.JulianDate.secondsDifference(nextTime, viewer.clock.currentTime)) > 0.5) {
      viewer.clock.currentTime = nextTime;
    }
    viewer.scene.requestRender();
  }, [isPlaying, simTimeIso, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer) {
      return;
    }

    if (runtimeTlePropagation && !isPlaying && viewer.clock.shouldAnimate) {
      const Cesium = cesiumRef.current;
      if (Cesium) {
        onClockTickRef.current(Cesium.JulianDate.toDate(viewer.clock.currentTime).toISOString());
      }
    }
    viewer.clock.shouldAnimate = isPlaying;
    viewer.clock.multiplier = simulationSpeed;
    viewer.scene.requestRender();
  }, [isPlaying, runtimeTlePropagation, simulationSpeed, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    if (frameMode === "earth-fixed") {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      viewer.scene.requestRender();
      return;
    }

    // In inertial mode Cesium keeps the camera in a space-like reference frame.
    // The globe rotates underneath, which makes orbit planes feel stable instead
    // of visually glued to Earth's texture.
    const removePostUpdate = viewer.scene.postUpdate.addEventListener((scene, time) => {
      const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
      if (!icrfToFixed) {
        return;
      }

      const camera = scene.camera;
      const offset = Cesium.Cartesian3.clone(camera.position);
      const transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
      camera.lookAtTransform(transform, offset);
    });

    viewer.scene.requestRender();

    return () => {
      removePostUpdate();
      if (!viewer.isDestroyed()) {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      }
    };
  }, [frameMode, viewerReady]);

  function zoomCamera(direction: "in" | "out") {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) {
      return;
    }

    const cameraHeight = viewer.camera.positionCartographic.height;
    const amount = Math.max(cameraHeight * 0.38, 250000);

    if (direction === "in") {
      viewer.camera.zoomIn(amount);
    } else {
      viewer.camera.zoomOut(amount);
    }
  }

  function updateHoverInfo(nextHoverInfo: HoverInfo) {
    const previous = hoverInfoRef.current;
    const isSame =
      previous?.name === nextHoverInfo?.name &&
      previous?.identifier === nextHoverInfo?.identifier &&
      previous?.x === nextHoverInfo?.x &&
      previous?.y === nextHoverInfo?.y;

    if (!isSame) {
      hoverInfoRef.current = nextHoverInfo;
      setHoverInfo(nextHoverInfo);
    }
  }

  useEffect(() => {
    let isMounted = true;
    let removeClockTick: (() => void) | null = null;
    const entityMap = entitiesRef.current;
    const entityEphemerisKeyMap = entityEphemerisKeysRef.current;
    const maneuverEntityMap = maneuverEntitiesRef.current;
    const groundStationMarkerEntityMap = groundStationMarkerEntitiesRef.current;
    const stationAccessRegionEntityMap = stationAccessRegionEntitiesRef.current;

    async function boot() {
      if (!containerRef.current || viewerRef.current) {
        return;
      }

      window.CESIUM_BASE_URL = "/cesium";
      const Cesium = await import("cesium");

      if (!isMounted || !containerRef.current) {
        return;
      }

      cesiumRef.current = Cesium;
      const ionAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN?.trim() ?? "";
      Cesium.Ion.defaultAccessToken = ionAccessToken;

      const naturalEarthLayer = Cesium.ImageryLayer.fromProviderAsync(
        Cesium.TileMapServiceImageryProvider.fromUrl(
          Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
        ),
        {
          brightness: 0.92,
          contrast: 1.08,
          saturation: 0.92,
          gamma: 1.02,
          maximumAnisotropy: 16,
        },
      );

      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        baseLayer: naturalEarthLayer,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        shouldAnimate: initialClockRef.current.isPlaying,
      });

      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(initialClockRef.current.simTimeIso);
      viewer.clock.shouldAnimate = initialClockRef.current.isPlaying;
      viewer.clock.multiplier = initialClockRef.current.simulationSpeed;
      viewer.scene.backgroundColor = Cesium.Color.BLACK;
      viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
      const antialiasScene = viewer.scene as import("cesium").Scene & { fxaa?: boolean };
      antialiasScene.fxaa = true;
      viewer.scene.postProcessStages.fxaa.enabled = true;
      viewer.scene.msaaSamples = 4;
      viewer.scene.highDynamicRange = viewer.scene.highDynamicRangeSupported;
      viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.ACES;
      viewer.scene.gamma = 1.02;
      viewer.scene.postProcessStages.bloom.enabled = false;

      const globe = viewer.scene.globe;
      globe.enableLighting = true;
      globe.showGroundAtmosphere = true;
      globe.dynamicAtmosphereLighting = true;
      globe.dynamicAtmosphereLightingFromSun = true;
      globe.atmosphereLightIntensity = 9.5;
      globe.atmosphereSaturationShift = -0.08;
      globe.atmosphereBrightnessShift = -0.03;
      globe.lambertDiffuseMultiplier = 0.92;
      globe.vertexShadowDarkness = 0.22;
      globe.maximumScreenSpaceError = 1.35;
      globe.tileCacheSize = 220;
      globe.preloadAncestors = true;
      globe.preloadSiblings = false;
      globe.showWaterEffect = true;
      globe.depthTestAgainstTerrain = false;

      const cameraController = viewer.scene.screenSpaceCameraController;
      cameraController.minimumZoomDistance = 1200000;
      cameraController.maximumZoomDistance = 60000000;
      cameraController.inertiaSpin = 0.9;
      cameraController.inertiaTranslate = 0.86;
      cameraController.inertiaZoom = 0.82;
      cameraController.maximumMovementRatio = 0.12;
      cameraController.zoomFactor = 3.5;

      if (viewer.scene.skyBox) {
        viewer.scene.skyBox.show = true;
      }
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.atmosphereLightIntensity = 9.5;
        viewer.scene.skyAtmosphere.hueShift = -0.015;
        viewer.scene.skyAtmosphere.saturationShift = -0.12;
        viewer.scene.skyAtmosphere.brightnessShift = -0.04;
      }

      if (ionAccessToken) {
        void Cesium.createWorldImageryAsync({
          style: Cesium.IonWorldImageryStyle.AERIAL,
        }).then((imageryProvider) => {
          if (!isMounted || viewer.isDestroyed()) return;
          const premiumLayer = new Cesium.ImageryLayer(imageryProvider, {
            brightness: 0.94,
            contrast: 1.06,
            saturation: 0.94,
            gamma: 1.01,
            maximumAnisotropy: 16,
          });
          viewer.imageryLayers.add(premiumLayer, 0);
          viewer.imageryLayers.remove(naturalEarthLayer, true);
          viewer.scene.requestRender();
        }).catch((error: unknown) => {
          console.info("[Cesium imagery] World Imagery unavailable; using offline Natural Earth.", error);
        });

        void Cesium.createWorldTerrainAsync({
          requestVertexNormals: true,
          requestWaterMask: true,
        }).then((terrainProvider) => {
          if (!isMounted || viewer.isDestroyed()) return;
          viewer.terrainProvider = terrainProvider;
          viewer.scene.requestRender();
        }).catch((error: unknown) => {
          console.info("[Cesium terrain] World Terrain unavailable; using ellipsoid terrain.", error);
        });
      } else {
        void Cesium.ArcGisMapServerImageryProvider.fromUrl(
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
          { enablePickFeatures: false },
        ).then((imageryProvider) => {
          if (!isMounted || viewer.isDestroyed()) return;
          const satelliteLayer = new Cesium.ImageryLayer(imageryProvider, {
            brightness: 0.98,
            contrast: 1.12,
            saturation: 0.96,
            gamma: 1.01,
            maximumAnisotropy: 16,
          });
          viewer.imageryLayers.add(satelliteLayer, 0);
          viewer.imageryLayers.remove(naturalEarthLayer, true);
          viewer.scene.requestRender();
        }).catch((error: unknown) => {
          console.info("[Cesium imagery] ArcGIS imagery unavailable; using offline Natural Earth.", error);
        });
      }

      const addAtmosphericTextureLayer = (
        url: string,
        options: import("cesium").ImageryLayer.ConstructorOptions,
      ) => {
        void Cesium.SingleTileImageryProvider.fromUrl(url).then((provider) => {
          if (!isMounted || viewer.isDestroyed()) return;
          viewer.imageryLayers.add(new Cesium.ImageryLayer(provider, options));
          viewer.scene.requestRender();
        }).catch(() => {
          // These local presentation layers are optional; the globe remains usable without them.
        });
      };

      addAtmosphericTextureLayer("/earth-textures/nasa-black-marble-2016-3km.jpg", {
        dayAlpha: 0,
        nightAlpha: 0.7,
        brightness: 1.18,
        contrast: 1.28,
        saturation: 0.82,
        gamma: 0.88,
        maximumAnisotropy: 16,
      });
      addAtmosphericTextureLayer("/earth-textures/nasa-clouds-2048.jpg", {
        alpha: 0.32,
        brightness: 1.2,
        contrast: 1.18,
        saturation: 0.6,
        colorToAlpha: Cesium.Color.BLACK,
        colorToAlphaThreshold: 0.24,
        maximumAnisotropy: 16,
      });
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          DEFAULT_CAMERA_VIEW.longitudeDeg,
          DEFAULT_CAMERA_VIEW.latitudeDeg,
          DEFAULT_CAMERA_VIEW.heightMeters,
        ),
      });

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: import("cesium").ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(movement.position);
        const pickedManeuverId = picked?.id?.properties?.maneuverId?.getValue();
        if (typeof pickedManeuverId === "string") {
          onSelectManeuverRef.current(pickedManeuverId);
          return;
        }

        const pickedConjunctionId = picked?.id?.properties?.conjunctionId?.getValue();
        if (typeof pickedConjunctionId === "string") {
          onSelectConjunctionRef.current(pickedConjunctionId);
          return;
        }

        const pickedId = picked?.id?.properties?.satelliteId?.getValue();
        if (typeof pickedId === "string") {
          const panelWidth = 340;
          const panelHeight = 430;
          const x = movement.position.x + panelWidth + 28 <= viewer.scene.canvas.clientWidth
            ? movement.position.x + 18
            : Math.max(12, movement.position.x - panelWidth - 18);
          const y = Math.min(
            Math.max(70, movement.position.y - 34),
            Math.max(70, viewer.scene.canvas.clientHeight - panelHeight - 18),
          );
          setSatellitePopup({ satelliteId: pickedId, x, y });
          updateHoverInfo(null);
          onToggleSatelliteRef.current(pickedId);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction((movement: import("cesium").ScreenSpaceEventHandler.MotionEvent) => {
        const picked = viewer.scene.pick(movement.endPosition);
        const pickedEntity = picked?.id;
        const pickedId = pickedEntity?.properties?.satelliteId?.getValue();

        if (typeof pickedId === "string") {
          const x = Math.min(movement.endPosition.x + 14, Math.max(0, viewer.scene.canvas.clientWidth - 190));
          const y = Math.min(movement.endPosition.y + 14, Math.max(0, viewer.scene.canvas.clientHeight - 80));
          const pickedSnapshot = latestSnapshotsRef.current.find(
            (snapshot) => snapshot.satellite.id === pickedId,
          );
          const identifier = pickedSnapshot?.satellite.noradId
            ? `NORAD ${pickedSnapshot.satellite.noradId}`
            : `OBJECT ${pickedId}`;

          updateHoverInfo({
            name: pickedEntity.name ?? "Satellite",
            identifier,
            x,
            y,
          });
          viewer.scene.canvas.style.cursor = "pointer";
        } else {
          updateHoverInfo(null);
          viewer.scene.canvas.style.cursor = "grab";
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      removeClockTick = viewer.clock.onTick.addEventListener((clock) => {
        if (runtimePropagationEnabledRef.current) {
          if (!runtimeClockHandshakeSentRef.current) {
            runtimeClockHandshakeSentRef.current = true;
            onClockTickRef.current(Cesium.JulianDate.toDate(clock.currentTime).toISOString());
          }
          return;
        }
        const nowMs = Date.now();
        if (nowMs - latestClockTickMsRef.current < 200) {
          return;
        }
        latestClockTickMsRef.current = nowMs;
        onClockTickRef.current(Cesium.JulianDate.toDate(clock.currentTime).toISOString());
      });

      viewerRef.current = viewer;
      setViewerReady(true);
    }

    boot();

    return () => {
      isMounted = false;
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        removeClockTick?.();
        viewer.destroy();
      }
      viewerRef.current = null;
      setViewerReady(false);
      rangeEntityRef.current = null;
      rangeLabelEntityRef.current = null;
      rangeDotEntitiesRef.current = [];
      maneuverEntityMap.clear();
      maneuverGeometryEntitiesRef.current = [];
      conjunctionEntitiesRef.current = [];
      groundStationMarkerEntityMap.clear();
      stationAccessRegionEntityMap.clear();
      satelliteFootprintEntityRef.current = null;
      groundStationContactLineEntitiesRef.current = [];
      hoverInfoRef.current = null;
      entityMap.clear();
      entityEphemerisKeyMap.clear();
      runtimePositionEntityIdsRef.current.clear();
      runtimeCesiumUpdatesRef.current.clear();
      runtimeTimeOffsetsMsRef.current.clear();
      runtimeClockHandshakeSentRef.current = false;
      orbitEntitiesRef.current.clear();
      trailEntitiesRef.current.clear();
      groundTrackEntitiesRef.current.clear();
      orbitGeometryKeysRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    const ephemerisById = new Map(
      orbitSnapshots
        .map((snapshot) => [snapshot.satellite.id, snapshot.trajectory ?? []] as const)
        .filter(([, states]) => states.length > 0),
    );
    const activeIds = new Set([
      ...snapshots.map((item) => item.satellite.id),
      ...ephemerisById.keys(),
    ]);

    for (const [id, entity] of entitiesRef.current) {
      if (!activeIds.has(id)) {
        viewer.entities.remove(entity);
        entitiesRef.current.delete(id);
        entityEphemerisKeysRef.current.delete(id);
      }
    }
    snapshots.forEach((snapshot, index) => {
      const ephemerisStates = ephemerisById.get(snapshot.satellite.id) ?? [];
      if (!runtimeTlePropagation && !snapshot.state && ephemerisStates.length === 0) {
        return;
      }

      const isSelected = selectedSatelliteIds.includes(snapshot.satellite.id);
      const color = getSnapshotColor(Cesium, snapshot, index);
      const fallbackPosition = snapshot.state ? stateToSpaceCartesian(Cesium, snapshot.state) : null;
      const createRuntimePosition = () => new Cesium.CallbackPositionProperty((time, result) => {
        const propagator = runtimePropagatorRef.current;
        if (!time || !runtimePropagationEnabledRef.current || !propagator) return undefined;
        const viewerTimeMs = Cesium.JulianDate.toDate(time).getTime();
        const propagationTimeMs = viewerTimeMs + (runtimeTimeOffsetsMsRef.current.get(snapshot.satellite.id) ?? 0);
        const state = propagator.getState(snapshot.satellite.id, new Date(propagationTimeMs).toISOString());
        if (!isTleConsistentOrbitState(snapshot, state)) return undefined;
        runtimeCesiumUpdatesRef.current.set(
          snapshot.satellite.id,
          (runtimeCesiumUpdatesRef.current.get(snapshot.satellite.id) ?? 0) + 1,
        );
        return Cesium.Cartesian3.clone(stateToSpaceCartesian(Cesium, state), result);
      }, false);

      let entity = entitiesRef.current.get(snapshot.satellite.id);

      if (!entity) {
        entity = viewer.entities.add({
          id: snapshot.satellite.id,
          name: snapshot.satellite.name,
          position: runtimeTlePropagation
            ? createRuntimePosition()
            : fallbackPosition ?? stateToSpaceCartesian(Cesium, ephemerisStates[0]),
          point: {
            color: color.brighten(isSelected ? 0.55 : 0.32, new Cesium.Color()),
            pixelSize: isSelected ? 15 : 11,
            outlineColor: Cesium.Color.WHITE.withAlpha(isSelected ? 0.95 : 0.68),
            outlineWidth: isSelected ? 3 : 2,
            scaleByDistance: new Cesium.NearFarScalar(1500000, 1, 50000000, 0.8),
            translucencyByDistance: new Cesium.NearFarScalar(1500000, 1, 60000000, 0.72),
            disableDepthTestDistance: 0,
          },
          label: {
            text: snapshot.satellite.name,
            font: "700 13px Inter, system-ui, sans-serif",
            fillColor: isSelected
              ? Cesium.Color.WHITE
              : color.brighten(0.55, new Cesium.Color()),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -24),
            show: showLabels,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString("#03070b").withAlpha(isSelected ? 0.9 : 0.78),
            backgroundPadding: new Cesium.Cartesian2(9, 5),
            scale: isSelected ? 1.08 : 0.96,
            scaleByDistance: new Cesium.NearFarScalar(1500000, 1, 50000000, 0.82),
            translucencyByDistance: new Cesium.NearFarScalar(1500000, 1, 55000000, 0.58),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 55000000),
            disableDepthTestDistance: 0,
          },
          properties: {
            satelliteId: snapshot.satellite.id,
          },
        });
        entitiesRef.current.set(snapshot.satellite.id, entity);
      }

      if (runtimeTlePropagation && !runtimePositionEntityIdsRef.current.has(snapshot.satellite.id)) {
        entity.position = createRuntimePosition();
        runtimePositionEntityIdsRef.current.add(snapshot.satellite.id);
        const currentJulianDate = viewer.clock.currentTime;
        const viewerTimeMs = Cesium.JulianDate.toDate(currentJulianDate).getTime();
        const propagationTimeMs = viewerTimeMs + (runtimeTimeOffsetsMsRef.current.get(snapshot.satellite.id) ?? 0);
        const currentState = runtimePropagatorRef.current?.getState(snapshot.satellite.id, new Date(propagationTimeMs).toISOString()) ?? null;
        console.info("[Cesium runtime satellite]", {
          satelliteId: snapshot.satellite.id,
          propagationSource: "SatelliteJsPropagator/SGP4",
          callbackPositionPropertyAttached: true,
          currentJulianDate: Cesium.JulianDate.toDate(currentJulianDate).toISOString(),
          propagationTime: new Date(propagationTimeMs).toISOString(),
          currentPropagatedPosition: isTleConsistentOrbitState(snapshot, currentState) ? currentState.positionEcefKm : null,
          reactUpdates: runtimeReactUpdatesRef.current,
          cesiumUpdates: runtimeCesiumUpdatesRef.current.get(snapshot.satellite.id) ?? 0,
        });
      }

      const nextEphemerisKey = ephemerisKey(ephemerisStates);
      if (!runtimeTlePropagation && ephemerisStates.length > 0 && entityEphemerisKeysRef.current.get(snapshot.satellite.id) !== nextEphemerisKey) {
        const sampledPosition = buildSampledPositionProperty(Cesium, ephemerisStates);
        if (sampledPosition) {
          entity.position = sampledPosition;
          entityEphemerisKeysRef.current.set(snapshot.satellite.id, nextEphemerisKey);
        }
      } else if (!runtimeTlePropagation && ephemerisStates.length === 0 && fallbackPosition) {
        entity.position = new Cesium.ConstantPositionProperty(fallbackPosition);
        entityEphemerisKeysRef.current.delete(snapshot.satellite.id);
      }
      if (entity.point) {
        entity.point.show = new Cesium.ConstantProperty(snapshot.satellite.visual.showMarker);
        entity.point.pixelSize = new Cesium.ConstantProperty(isSelected ? 15 : 11);
        entity.point.outlineWidth = new Cesium.ConstantProperty(isSelected ? 3 : 2);
        entity.point.outlineColor = new Cesium.ConstantProperty(
          Cesium.Color.WHITE.withAlpha(isSelected ? 0.95 : 0.68),
        );
        entity.point.color = new Cesium.ConstantProperty(
          color.brighten(isSelected ? 0.55 : 0.32, new Cesium.Color()),
        );
      }
      if (entity.label) {
        entity.label.show = new Cesium.ConstantProperty(
          snapshot.satellite.visual.showLabel && (showLabels || isSelected),
        );
        entity.label.scale = new Cesium.ConstantProperty(isSelected ? 1.08 : 0.96);
        entity.label.fillColor = new Cesium.ConstantProperty(
          isSelected ? Cesium.Color.WHITE : color.brighten(0.55, new Cesium.Color()),
        );
        entity.label.backgroundColor = new Cesium.ConstantProperty(
          Cesium.Color.fromCssColorString("#03070b").withAlpha(isSelected ? 0.9 : 0.78),
        );
      }
    });
  }, [orbitSnapshots, runtimeTlePropagation, snapshots, selectedSatelliteIds, showLabels, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) return;

    const geometrySnapshots = latestOrbitSnapshotsRef.current;
    const activeIds = new Set(geometrySnapshots.map((snapshot) => snapshot.satellite.id));
    for (const [id, entity] of orbitEntitiesRef.current) {
      if (!activeIds.has(id)) {
        viewer.entities.remove(entity);
        orbitEntitiesRef.current.delete(id);
        orbitGeometryKeysRef.current.delete(id);
      }
    }
    for (const [id, entity] of trailEntitiesRef.current) {
      if (!activeIds.has(id)) {
        viewer.entities.remove(entity);
        trailEntitiesRef.current.delete(id);
      }
    }
    for (const [id, entities] of groundTrackEntitiesRef.current) {
      if (!activeIds.has(id)) {
        entities.forEach((entity) => viewer.entities.remove(entity));
        groundTrackEntitiesRef.current.delete(id);
      }
    }

    geometrySnapshots.forEach((snapshot, index) => {
      const sourceStates = snapshot.trajectory ?? snapshot.futureTrajectory ?? [];
      const key = runtimeTlePropagation
        ? `runtime-v2:${snapshot.satellite.tle?.line1 ?? ""}:${snapshot.satellite.tle?.line2 ?? ""}`
        : orbitGeometryKey(snapshot, sourceStates);
      if (orbitGeometryKeysRef.current.get(snapshot.satellite.id) === key) return;
      const runtimeStates = runtimeTlePropagation && runtimePropagatorRef.current
        ? buildValidatedRuntimeRevolution(
            runtimePropagatorRef.current,
            snapshot,
            Cesium.JulianDate.toDate(viewer.clock.currentTime).getTime(),
          )
        : [];
      const states = runtimeTlePropagation ? runtimeStates : sourceStates;
      const state = snapshot.state ?? states[0] ?? null;
      const gmst = state?.gmstRad;
      const positions = runtimeTlePropagation
        ? states.map((item) => stateToSpaceCartesian(Cesium, item))
        : states.length > 1
          ? buildInterpolatedPathPositions(Cesium, states, (item) => stateToOrbitArcCartesian(Cesium, item, gmst))
          : state ? buildOsculatingOrbitArc(Cesium, state, gmst) : [];
      if (positions.length !== (runtimeTlePropagation ? 181 : positions.length) || positions.length < 2) {
        console.warn("[Cesium runtime] rejected invalid orbit revolution", snapshot.satellite.id);
        return;
      }

      const existing = orbitEntitiesRef.current.get(snapshot.satellite.id);
      if (existing?.polyline) {
        existing.polyline.positions = new Cesium.ConstantProperty(positions);
      } else {
        const color = getSnapshotColor(Cesium, snapshot, index);
        orbitEntitiesRef.current.set(snapshot.satellite.id, viewer.entities.add({
          id: `orbit-${snapshot.satellite.id}`,
          show: snapshot.satellite.visual.showOrbit
            && (showAllOrbits || selectedSatelliteIds.includes(snapshot.satellite.id)),
          polyline: {
            positions,
            width: selectedSatelliteIds.includes(snapshot.satellite.id) ? 2.4 : 1.4,
            material: new Cesium.ColorMaterialProperty(
              color.withAlpha(selectedSatelliteIds.includes(snapshot.satellite.id) ? 0.96 : 0.72),
            ),
          },
        }));
      }

      const color = getSnapshotColor(Cesium, snapshot, index);
      const trailPositions = (snapshot.pastTrail ?? []).map((item) => stateToSpaceCartesian(Cesium, item));
      const existingTrail = trailEntitiesRef.current.get(snapshot.satellite.id);
      if (trailPositions.length > 1) {
        if (existingTrail?.polyline) {
          existingTrail.polyline.positions = new Cesium.ConstantProperty(trailPositions);
        } else {
          trailEntitiesRef.current.set(snapshot.satellite.id, viewer.entities.add({
            id: `trail-${snapshot.satellite.id}`,
            show: false,
            polyline: {
              positions: trailPositions,
              width: 2.4,
              material: new Cesium.PolylineDashMaterialProperty({ color: color.withAlpha(0.82), dashLength: 16 }),
            },
          }));
        }
      }

      const oldGroundEntities = groundTrackEntitiesRef.current.get(snapshot.satellite.id) ?? [];
      oldGroundEntities.forEach((entity) => viewer.entities.remove(entity));
      const groundEntities = splitGroundTrackByLongitudeWrap(snapshot.groundTrack ?? [])
        .filter((segment) => segment.length > 1)
        .map((segment, segmentIndex) => viewer.entities.add({
          id: `ground-${snapshot.satellite.id}-${segmentIndex}`,
          show: false,
          polyline: {
            positions: segment.map((item) => stateToGroundCartesian(Cesium, item)),
            width: 1,
            material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.LIME.withAlpha(0.35), dashLength: 18 }),
          },
        }));
      groundTrackEntitiesRef.current.set(snapshot.satellite.id, groundEntities);
      orbitGeometryKeysRef.current.set(snapshot.satellite.id, key);
    });

    if (runtimeTlePropagation && runtimeDebugKeyRef.current !== runtimeSatelliteKey) {
      runtimeDebugKeyRef.current = runtimeSatelliteKey;
      console.info("[Cesium runtime] satellites loaded", {
        runtimeSatellitesCreated: geometrySnapshots.length,
        orbitEntitiesCreated: orbitEntitiesRef.current.size,
        dotEntitiesCreated: entitiesRef.current.size,
        callbackPositionPropertiesAttached: entitiesRef.current.size,
      });
    }
  }, [orbitSnapshots, runtimeSatelliteKey, runtimeTlePropagation, selectedSatelliteIds, showAllOrbits, snapshots, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) return;
    let visible = 0;
    let visibleTrails = 0;
    let visibleGroundTracks = 0;
    latestOrbitSnapshotsRef.current.forEach((snapshot, index) => {
      const entity = orbitEntitiesRef.current.get(snapshot.satellite.id);
      const selected = selectedSatelliteIds.includes(snapshot.satellite.id);
      if (entity) {
        entity.show = snapshot.satellite.visual.showOrbit && (showAllOrbits || selected);
        if (entity.polyline && Cesium) {
          const color = getSnapshotColor(Cesium, snapshot, index);
          entity.polyline.width = new Cesium.ConstantProperty(selected ? 2.4 : 1.4);
          entity.polyline.material = new Cesium.ColorMaterialProperty(
            color.withAlpha(selected ? 0.96 : 0.72),
          );
        }
        if (entity.show) visible += 1;
      }
      const trail = trailEntitiesRef.current.get(snapshot.satellite.id);
      if (trail) {
        trail.show = snapshot.satellite.visual.showTrail;
        if (trail.show) visibleTrails += 1;
      }
      const groundTracks = groundTrackEntitiesRef.current.get(snapshot.satellite.id) ?? [];
      const showGround = snapshot.satellite.visual.showGroundTrack;
      groundTracks.forEach((groundTrack) => {
        groundTrack.show = showGround;
      });
      if (showGround && groundTracks.length > 0) visibleGroundTracks += 1;
    });
    if (
      layerStatsRef.current.orbits !== visible
      || layerStatsRef.current.trails !== visibleTrails
      || layerStatsRef.current.groundTracks !== visibleGroundTracks
    ) {
      const next = { orbits: visible, trails: visibleTrails, groundTracks: visibleGroundTracks };
      layerStatsRef.current = next;
      setLayerStats(next);
    }
    viewer.scene.requestRender();
  }, [orbitVisibilityKey, selectedSatelliteIds, showAllOrbits, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    maneuverGeometryEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    maneuverGeometryEntitiesRef.current = [];

    const activeManeuverIds = new Set(
      showManeuvers ? maneuverSnapshots.map((snapshot) => snapshot.event.id) : [],
    );

    for (const [id, entity] of maneuverEntitiesRef.current) {
      if (!activeManeuverIds.has(id)) {
        viewer.entities.remove(entity);
        maneuverEntitiesRef.current.delete(id);
      }
    }

    if (!showManeuvers) {
      return;
    }

    maneuverSnapshots.forEach((maneuverSnapshot) => {
      if (!maneuverSnapshot.state) {
        return;
      }

      const tone = getManeuverTone(maneuverSnapshot.event.status);
      const color = Cesium.Color.fromCssColorString(tone.color);
      const isSelected = selectedManeuverId === maneuverSnapshot.event.id;
      const position = stateToSpaceCartesian(Cesium, maneuverSnapshot.state);
      let entity = maneuverEntitiesRef.current.get(maneuverSnapshot.event.id);

      if (!entity) {
        entity = viewer.entities.add({
          id: maneuverSnapshot.event.id,
          name: maneuverSnapshot.event.title,
          position,
          point: {
            color: color.withAlpha(0.95),
            pixelSize: isSelected ? 17 : 12,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: isSelected ? 3 : 1.5,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: "MNV",
            font: "800 12px monospace",
            fillColor: color.brighten(0.25, new Cesium.Color()),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -30),
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.72),
            backgroundPadding: new Cesium.Cartesian2(7, 4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            maneuverId: maneuverSnapshot.event.id,
          },
        });
        maneuverEntitiesRef.current.set(maneuverSnapshot.event.id, entity);
      }

      entity.position = new Cesium.ConstantPositionProperty(position);
      if (entity.point) {
        entity.point.pixelSize = new Cesium.ConstantProperty(isSelected ? 17 : 12);
        entity.point.color = new Cesium.ConstantProperty(color.withAlpha(isSelected ? 1 : 0.82));
      }

      if (isSelected && maneuverSnapshot.event.visual.showBurnVector) {
        const vectorPositions = getManeuverVectorPositions(Cesium, maneuverSnapshot);
        if (vectorPositions) {
          maneuverGeometryEntitiesRef.current.push(viewer.entities.add({
            id: `${maneuverSnapshot.event.id}-burn-vector`,
            name: `${maneuverSnapshot.event.title} burn vector`,
            polyline: {
              positions: [vectorPositions.start, vectorPositions.end],
              width: isSelected ? 9 : 5,
              material: new Cesium.PolylineArrowMaterialProperty(color.withAlpha(isSelected ? 0.95 : 0.58)),
              depthFailMaterial: new Cesium.PolylineArrowMaterialProperty(color.withAlpha(0.5)),
              arcType: Cesium.ArcType.NONE,
            },
            properties: {
              maneuverId: maneuverSnapshot.event.id,
            },
          }));
        }
      }

      if (isSelected && maneuverSnapshot.event.visual.showPrePostOrbit) {
        const maneuverDisplayGmstRad = maneuverSnapshot.state?.gmstRad
          ?? maneuverSnapshot.preTrajectory.at(-1)?.gmstRad
          ?? maneuverSnapshot.postTrajectory[0]?.gmstRad;
        const prePositions = maneuverSnapshot.preTrajectory.map((state) => stateToOrbitArcCartesian(Cesium, state, maneuverDisplayGmstRad));
        const postPositions = maneuverSnapshot.postTrajectory.map((state) => stateToOrbitArcCartesian(Cesium, state, maneuverDisplayGmstRad));

        if (prePositions.length > 1) {
          maneuverGeometryEntitiesRef.current.push(viewer.entities.add({
            id: `${maneuverSnapshot.event.id}-pre-path`,
            name: `${maneuverSnapshot.event.title} pre-burn context`,
            polyline: {
              positions: prePositions,
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({
                color: color.withAlpha(0.45),
                dashLength: 18,
              }),
              depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
                color: color.withAlpha(0.25),
                dashLength: 18,
              }),
              arcType: Cesium.ArcType.NONE,
            },
            properties: {
              maneuverId: maneuverSnapshot.event.id,
            },
          }));
        }

        if (postPositions.length > 1) {
          maneuverGeometryEntitiesRef.current.push(viewer.entities.add({
            id: `${maneuverSnapshot.event.id}-post-path`,
            name: `${maneuverSnapshot.event.title} post-burn context`,
            polyline: {
              positions: postPositions,
              width: 2.8,
              material: new Cesium.PolylineDashMaterialProperty({
                color: color.withAlpha(0.72),
                dashLength: 28,
              }),
              depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
                color: color.withAlpha(0.34),
                dashLength: 28,
              }),
              arcType: Cesium.ArcType.NONE,
            },
            properties: {
              maneuverId: maneuverSnapshot.event.id,
            },
          }));
        }
      }
    });
    viewer.scene.requestRender();
  }, [maneuverSnapshots, selectedManeuverId, showManeuvers, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    conjunctionEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    conjunctionEntitiesRef.current = [];

    if (!showConjunctions) {
      return;
    }

    conjunctionSnapshots.forEach((snapshot) => {
      if (!snapshot.primaryState || !snapshot.secondaryState) {
        return;
      }

      const tone = getConjunctionTone(snapshot.status);
      const color = Cesium.Color.fromCssColorString(tone.color);
      const primaryPosition = stateToSpaceCartesian(Cesium, snapshot.primaryState);
      const secondaryPosition = stateToSpaceCartesian(Cesium, snapshot.secondaryState);
      const midpoint = Cesium.Cartesian3.midpoint(primaryPosition, secondaryPosition, new Cesium.Cartesian3());
      const isSelected = selectedConjunctionId === snapshot.event.id;

      conjunctionEntitiesRef.current.push(viewer.entities.add({
        id: `${snapshot.event.id}-link`,
        name: `${snapshot.primary.name} / ${snapshot.secondary.name} conjunction`,
        polyline: {
          positions: [primaryPosition, secondaryPosition],
          width: isSelected ? 3.8 : 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: color.withAlpha(isSelected ? 0.96 : 0.58),
            dashLength: 18,
          }),
          arcType: Cesium.ArcType.NONE,
        },
        properties: {
          conjunctionId: snapshot.event.id,
        },
      }));

      conjunctionEntitiesRef.current.push(viewer.entities.add({
        id: `${snapshot.event.id}-label`,
        name: `${tone.label} conjunction`,
        position: midpoint,
        label: {
          text: `${tone.label} ${snapshot.missDistanceKm.toLocaleString("en", { maximumFractionDigits: 0 })} km`,
          font: "700 12px monospace",
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.76),
          backgroundPadding: new Cesium.Cartesian2(7, 4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          conjunctionId: snapshot.event.id,
        },
      }));
    });

    viewer.scene.requestRender();
  }, [conjunctionSnapshots, selectedConjunctionId, showConjunctions, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    const markerVisuals = groundStationVisualization.markers.filter((visual) => isFiniteStationCoordinate(visual.station));
    const activeStationIds = new Set(markerVisuals.map((visual) => visual.station.id));
    for (const [stationId, entity] of groundStationMarkerEntitiesRef.current) {
      if (!activeStationIds.has(stationId)) {
        viewer.entities.remove(entity);
        groundStationMarkerEntitiesRef.current.delete(stationId);
      }
    }

    const activeAccessRegionIds = new Set(groundStationVisualization.stationAccessRegions.map((region) => region.stationId));
    for (const [stationId, entity] of stationAccessRegionEntitiesRef.current) {
      if (!activeAccessRegionIds.has(stationId)) {
        viewer.entities.remove(entity);
        stationAccessRegionEntitiesRef.current.delete(stationId);
      }
    }

    markerVisuals.forEach(({ station, isVisible }) => {
      const color = Cesium.Color.fromCssColorString(isVisible ? "#63e6be" : "#67e8f9");
      const markerPosition = Cesium.Cartesian3.fromDegrees(
        station.longitude,
        station.latitude,
        Math.max(0.05, station.altitude) * 1000,
      );

      let marker = groundStationMarkerEntitiesRef.current.get(station.id);
      if (!marker) {
        marker = viewer.entities.add({
          id: `ground-station-${station.id}-marker`,
          name: station.name,
          position: markerPosition,
          point: {
            pixelSize: isVisible ? 13 : 10,
            color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: station.name,
            font: "700 11px monospace",
            fillColor: color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.72),
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            pixelOffset: new Cesium.Cartesian2(0, -20),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        groundStationMarkerEntitiesRef.current.set(station.id, marker);
      } else {
        marker.name = station.name;
        marker.position = new Cesium.ConstantPositionProperty(markerPosition);
        if (marker.point) {
          marker.point.pixelSize = new Cesium.ConstantProperty(isVisible ? 13 : 10);
          marker.point.color = new Cesium.ConstantProperty(color);
        }
        if (marker.label) {
          marker.label.text = new Cesium.ConstantProperty(station.name);
          marker.label.fillColor = new Cesium.ConstantProperty(color);
        }
      }
    });

    groundStationVisualization.stationAccessRegions.forEach((region) => {
      const position = Cesium.Cartesian3.fromDegrees(region.longitudeDeg, region.latitudeDeg, 0);
      const regionColor = Cesium.Color.fromCssColorString(region.isVisible ? "#63e6be" : "#fbbf24");
      let accessRegion = stationAccessRegionEntitiesRef.current.get(region.stationId);
      if (!accessRegion) {
        accessRegion = viewer.entities.add({
          id: region.id,
          name: region.name,
          position,
          ellipse: {
            semiMajorAxis: region.radiusMeters,
            semiMinorAxis: region.radiusMeters,
            material: regionColor.withAlpha(region.isVisible ? 0.08 : 0.035),
            outline: true,
            outlineColor: regionColor.withAlpha(region.isVisible ? 0.44 : 0.28),
            height: 0,
          },
        });
        stationAccessRegionEntitiesRef.current.set(region.stationId, accessRegion);
      } else {
        accessRegion.name = region.name;
        accessRegion.position = new Cesium.ConstantPositionProperty(position);
        if (accessRegion.ellipse) {
          accessRegion.ellipse.semiMajorAxis = new Cesium.ConstantProperty(region.radiusMeters);
          accessRegion.ellipse.semiMinorAxis = new Cesium.ConstantProperty(region.radiusMeters);
          accessRegion.ellipse.material = new Cesium.ColorMaterialProperty(regionColor.withAlpha(region.isVisible ? 0.08 : 0.035));
          accessRegion.ellipse.outlineColor = new Cesium.ConstantProperty(regionColor.withAlpha(region.isVisible ? 0.44 : 0.28));
        }
      }
    });

    viewer.scene.requestRender();
  }, [groundStationVisualization, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    const footprint = groundStationVisualization.satelliteFootprint;
    if (!footprint) {
      if (satelliteFootprintEntityRef.current) {
        viewer.entities.remove(satelliteFootprintEntityRef.current);
        satelliteFootprintEntityRef.current = null;
        viewer.scene.requestRender();
      }
      return;
    }

    const footprintPosition = Cesium.Cartesian3.fromDegrees(
      footprint.longitudeDeg,
      footprint.latitudeDeg,
      0,
    );
    const color = Cesium.Color.fromCssColorString("#a3e635");

    if (!satelliteFootprintEntityRef.current) {
      satelliteFootprintEntityRef.current = viewer.entities.add({
        id: footprint.id,
        name: footprint.name,
        position: footprintPosition,
        ellipse: {
          semiMajorAxis: footprint.radiusMeters,
          semiMinorAxis: footprint.radiusMeters,
          material: color.withAlpha(0.045),
          outline: true,
          outlineColor: color.withAlpha(0.36),
          height: 0,
        },
      });
    } else {
      satelliteFootprintEntityRef.current.name = footprint.name;
      satelliteFootprintEntityRef.current.position = new Cesium.ConstantPositionProperty(footprintPosition);
      if (satelliteFootprintEntityRef.current.ellipse) {
        satelliteFootprintEntityRef.current.ellipse.semiMajorAxis = new Cesium.ConstantProperty(footprint.radiusMeters);
        satelliteFootprintEntityRef.current.ellipse.semiMinorAxis = new Cesium.ConstantProperty(footprint.radiusMeters);
      }
    }

    viewer.scene.requestRender();
  }, [groundStationVisualization.satelliteFootprint, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    groundStationContactLineEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    groundStationContactLineEntitiesRef.current = [];

    groundStationVisualization.contactLines.forEach((line) => {
      const station = line.station;
      if (!isFiniteStationCoordinate(station)) {
        return;
      }

      const color = Cesium.Color.fromCssColorString("#63e6be");
      const satellitePosition = stateToSpaceCartesian(Cesium, line.satelliteState);
      const markerPosition = Cesium.Cartesian3.fromDegrees(
        station.longitude,
        station.latitude,
        Math.max(0.05, station.altitude) * 1000,
      );
      const contactLine = viewer.entities.add({
        id: line.id,
        name: line.name,
        polyline: {
          positions: [markerPosition, satellitePosition],
          width: 2.4,
          material: new Cesium.PolylineDashMaterialProperty({
            color: color.withAlpha(0.9),
            dashLength: 18,
          }),
          arcType: Cesium.ArcType.NONE,
        },
      });
      groundStationContactLineEntitiesRef.current.push(contactLine);
    });

    viewer.scene.requestRender();
  }, [groundStationVisualization.contactLines, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer) {
      return;
    }

    if (!rangeMeasurement?.primary.state || !rangeMeasurement.secondary.state) {
      if (rangeEntityRef.current) {
        viewer.entities.remove(rangeEntityRef.current);
        rangeEntityRef.current = null;
      }
      if (rangeLabelEntityRef.current) {
        viewer.entities.remove(rangeLabelEntityRef.current);
        rangeLabelEntityRef.current = null;
      }
      rangeDotEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
      rangeDotEntitiesRef.current = [];
      return;
    }

    const primaryPosition = stateToSpaceCartesian(Cesium, rangeMeasurement.primary.state);
    const secondaryPosition = stateToSpaceCartesian(Cesium, rangeMeasurement.secondary.state);
    const midpoint = Cesium.Cartesian3.midpoint(primaryPosition, secondaryPosition, new Cesium.Cartesian3());
    const labelText = `${rangeMeasurement.distanceKm.toLocaleString("en", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    })} km`;

    if (!rangeEntityRef.current) {
      rangeEntityRef.current = viewer.entities.add({
        id: "range-measurement-line",
        name: "Satellite range measurement",
        polyline: {
          positions: [primaryPosition, secondaryPosition],
          width: 5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#ff4dff").withAlpha(0.96),
            dashLength: 26,
          }),
          depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#ff4dff").withAlpha(0.78),
            dashLength: 26,
          }),
          arcType: Cesium.ArcType.NONE,
        },
      });
    }

    if (!rangeLabelEntityRef.current) {
      rangeLabelEntityRef.current = viewer.entities.add({
        id: "range-measurement-label",
        name: "Satellite range distance",
        position: midpoint,
        label: {
          text: labelText,
          font: "600 14px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.82),
          backgroundPadding: new Cesium.Cartesian2(8, 5),
          pixelOffset: new Cesium.Cartesian2(0, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }

    if (rangeEntityRef.current.polyline) {
      rangeEntityRef.current.polyline.positions = new Cesium.ConstantProperty([primaryPosition, secondaryPosition]);
      rangeEntityRef.current.polyline.width = new Cesium.ConstantProperty(5);
      rangeEntityRef.current.polyline.material = new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#ff4dff").withAlpha(0.96),
        dashLength: 26,
      });
      rangeEntityRef.current.polyline.depthFailMaterial = new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#ff4dff").withAlpha(0.78),
        dashLength: 26,
      });
    }
    rangeLabelEntityRef.current.position = new Cesium.ConstantPositionProperty(midpoint);
    if (rangeLabelEntityRef.current.label) {
      rangeLabelEntityRef.current.label.text = new Cesium.ConstantProperty(labelText);
    }
  }, [rangeMeasurement, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer || !focusRequest) {
      return;
    }

    const snapshot = latestSnapshotsRef.current.find((item) => item.satellite.id === focusRequest.satelliteId);
    if (!snapshot?.state) {
      return;
    }

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        snapshot.state.longitudeDeg,
        snapshot.state.latitudeDeg,
        (snapshot.state.altitudeKm + 2200) * 1000,
      ),
      duration: 0.75,
    });
  }, [focusRequest, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer || !maneuverFocusRequest) {
      return;
    }

    const burnPosition = Cesium.Cartesian3.fromDegrees(
      maneuverFocusRequest.longitudeDeg,
      maneuverFocusRequest.latitudeDeg,
      maneuverFocusRequest.altitudeKm * 1000,
    );

    // Frame the burn marker as an object in space instead of placing the camera
    // directly above it. This keeps Earth, the marker, and burn vector visible
    // together when users jump from the maneuver modal.
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(burnPosition, 1000000), {
      offset: new Cesium.HeadingPitchRange(
        viewer.camera.heading,
        Cesium.Math.toRadians(-28),
        7600000,
      ),
      duration: 0.85,
    });
  }, [maneuverFocusRequest, viewerReady]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !Cesium || !viewer || resetSignal === 0) {
      return;
    }

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        DEFAULT_CAMERA_VIEW.longitudeDeg,
        DEFAULT_CAMERA_VIEW.latitudeDeg,
        DEFAULT_CAMERA_VIEW.heightMeters,
      ),
      duration: 0.8,
    });
  }, [resetSignal, viewerReady]);

  const popupSnapshot = satellitePopup
    ? snapshots.find((snapshot) => snapshot.satellite.id === satellitePopup.satelliteId)
      ?? orbitSnapshots.find((snapshot) => snapshot.satellite.id === satellitePopup.satelliteId)
      ?? null
    : null;

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden rounded-md bg-black">
      <div ref={containerRef} className="h-full min-h-[520px] w-full" />
      {satellitePopup && popupSnapshot && (
        <SatelliteInfoPopup
          snapshot={popupSnapshot}
          x={satellitePopup.x}
          y={satellitePopup.y}
          onClose={() => setSatellitePopup(null)}
        />
      )}
      {hoverInfo && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-cyan-300/40 bg-black/80 px-3 py-2 text-sm text-white shadow-xl backdrop-blur"
          style={{
            left: hoverInfo.x,
            top: hoverInfo.y,
          }}
        >
          <p className="font-semibold">{hoverInfo.name}</p>
          <p className="font-mono text-xs text-zinc-400">{hoverInfo.identifier}</p>
        </div>
      )}
      <div className="pointer-events-none absolute right-3 bottom-3 space-y-1 border border-white/10 bg-black/70 px-3 py-2 font-mono text-[11px] text-zinc-300 shadow-xl backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-8 bg-cyan-200" />
          <span><span className="text-cyan-200">{layerStats.orbits}</span> orbit arc</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-8 border-t border-dashed border-cyan-100" />
          <span><span className="text-cyan-200">{layerStats.trails}</span> recent trail</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[2px] w-8 border-t border-dotted border-lime-300" />
          <span><span className="text-lime-300">{layerStats.groundTracks}</span> ground trace</span>
        </div>
      </div>
      <div className="absolute top-28 left-[420px] z-30 flex overflow-hidden border border-cyan-300/45 bg-black/80 shadow-2xl backdrop-blur max-lg:left-4 max-lg:top-28">
        <button
          type="button"
          onClick={() => zoomCamera("in")}
          className="h-14 w-14 border-r border-cyan-300/25 font-mono text-4xl font-black leading-none text-cyan-100 transition hover:bg-cyan-300/20 hover:text-white"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomCamera("out")}
          className="h-14 w-14 font-mono text-4xl font-black leading-none text-cyan-100 transition hover:bg-cyan-300/20 hover:text-white"
          aria-label="Zoom out"
          title="Zoom out"
        >
          -
        </button>
      </div>
    </div>
  );
}

function SatelliteInfoPopup({
  snapshot,
  x,
  y,
  onClose,
}: {
  snapshot: SatelliteSnapshot;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { satellite, state } = snapshot;
  const tle = parseTleOrbitalElements(satellite.tle?.line1, satellite.tle?.line2);
  const velocityKmps = snapshotVelocityKmps(state);
  const identifier = satellite.noradId
    ? `NORAD ${satellite.noradId}`
    : `OBJECT ${satellite.id}`;
  const accent = satellite.visual.color ?? "#63e6be";
  const metadata = [
    satellite.metadata?.owner,
    satellite.metadata?.mission,
    satellite.metadata?.objectType?.replaceAll("_", " "),
  ].filter((value): value is string => Boolean(value));

  return (
    <section
      role="dialog"
      aria-label={`${satellite.name} satellite data`}
      className="pointer-events-auto absolute z-40 w-[340px] max-w-[calc(100%-24px)] overflow-hidden rounded-xl border border-white/10 bg-[#080a0e]/95 text-zinc-300 shadow-[0_24px_80px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl"
      style={{ left: x, top: y }}
    >
      <div className="max-h-[min(620px,calc(100vh-150px))] overflow-y-auto p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-[-0.02em]" style={{ color: accent }}>
              {satellite.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">
              <span>{identifier}</span>
              <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-zinc-400">
                {satellite.sourceType}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Close satellite data"
          >
            ×
          </button>
        </header>

        {metadata.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {metadata.map((value) => (
              <span key={value} className="rounded border border-white/10 bg-white/[0.025] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-400">
                {value}
              </span>
            ))}
          </div>
        )}

        {state && (
          <PopupSection title="Current propagated state" accent={accent}>
            <div className="grid grid-cols-3 gap-2">
              <PopupMetric label="Altitude" value={`${state.altitudeKm.toFixed(1)} km`} />
              {velocityKmps !== null && <PopupMetric label="Speed" value={`${velocityKmps.toFixed(3)} km/s`} />}
              <PopupMetric label="Frame" value={state.frame} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <PopupMetric label="Latitude" value={`${state.latitudeDeg.toFixed(4)}°`} />
              <PopupMetric label="Longitude" value={`${state.longitudeDeg.toFixed(4)}°`} />
            </div>
            <p className="mt-2 truncate font-mono text-[9px] text-zinc-600" title={state.timeUtc}>
              Epoch {state.timeUtc}
            </p>
          </PopupSection>
        )}

        {tle && (
          <PopupSection title="TLE orbit" accent={accent}>
            <div className="grid grid-cols-2 gap-2">
              <PopupMetric label="Inclination" value={`${tle.inclinationDeg.toFixed(4)}°`} />
              <PopupMetric label="Eccentricity" value={tle.eccentricity.toFixed(7)} />
              <PopupMetric label="RAAN" value={`${tle.raanDeg.toFixed(4)}°`} />
              <PopupMetric label="Arg. perigee" value={`${tle.argumentOfPerigeeDeg.toFixed(4)}°`} />
              <PopupMetric label="Mean anomaly" value={`${tle.meanAnomalyDeg.toFixed(4)}°`} />
              <PopupMetric label="Mean motion" value={`${tle.meanMotionRevPerDay.toFixed(6)} rev/d`} />
              <PopupMetric label="Period" value={`${tle.periodMinutes.toFixed(2)} min`} />
              {tle.epochUtc && <PopupMetric label="TLE epoch" value={tle.epochUtc.slice(0, 10)} />}
            </div>
          </PopupSection>
        )}

        {satellite.tle && (
          <details className="mt-3 border-t border-white/[0.07] pt-3">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 transition hover:text-zinc-300">
              Raw TLE
            </summary>
            <div className="mt-2 space-y-1 overflow-x-auto rounded-md border border-white/[0.07] bg-black/35 p-2 font-mono text-[9px] leading-4 text-zinc-500">
              <p className="whitespace-nowrap">{satellite.tle.line1}</p>
              <p className="whitespace-nowrap">{satellite.tle.line2}</p>
            </div>
          </details>
        )}

        {!state && !tle && (
          <p className="mt-4 rounded-md border border-white/[0.07] bg-black/25 p-3 text-xs leading-5 text-zinc-500">
            No propagated state or TLE orbital elements are currently available for this object.
          </p>
        )}
      </div>
    </section>
  );
}

function PopupSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-white/[0.07] pt-3">
      <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        <span className="h-3 w-[3px] rounded-full" style={{ backgroundColor: accent }} />
        {title}
      </h3>
      {children}
    </div>
  );
}

function PopupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
      <p className="truncate font-mono text-[8px] uppercase tracking-[0.13em] text-zinc-600">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] font-semibold tabular-nums text-zinc-300" title={value}>
        {value}
      </p>
    </div>
  );
}

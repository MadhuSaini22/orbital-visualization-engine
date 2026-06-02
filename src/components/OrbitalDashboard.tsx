"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import type { OrbitState, SatelliteObject, SatelliteSnapshot, SatelliteVisualSettings } from "@/domain/orbit";
import { GroundTrackMiniMap } from "@/components/GroundTrackMiniMap";
import type { GroundTrackRangeId, GroundTrackRangeOption } from "@/components/GroundTrackMiniMap";
import type { ConjunctionEvent, ConjunctionSnapshot } from "@/domain/conjunction";
import { getConjunctionStatus, getConjunctionTone } from "@/domain/conjunction";
import type { ManeuverEvent, ManeuverSnapshot } from "@/domain/maneuver";
import { getManeuverTone } from "@/domain/maneuver";
import { parseSatelliteSource } from "@/domain/satelliteConfig";
import { MAX_TLE_OBJECTS } from "@/domain/tle";
import { distanceBetweenOrbitStatesKm } from "@/geometry/distance";
import { formatNumber, formatUtc } from "@/geometry/format";
import {
  isValidUtcDateAndTimeInput,
  utcDateAndTimeInputToIso,
  utcIsoToDateInput,
  utcIsoToTimeInput,
} from "@/geometry/utcDateTime";
import { SatelliteJsPropagator } from "@/propagation/SatelliteJsPropagator";
import {
  applyAnalysisPreset,
  createManualOrbit,
  createMission,
  createMissionTimelineEvent,
  deleteMissionTimelineEvent,
  fetchCatalogGroupTle,
  fetchAnalysisConfig,
  fetchConjunctions,
  fetchCurrentOrbitState,
  fetchMissionTimelineEvents,
  fetchMissionTrajectory,
  fetchMissions,
  fetchManualOrbitState,
  fetchManualOrbitTrajectory,
  fetchManeuvers,
  fetchOrbitTrajectory,
  refreshConjunctions,
  reorderMissionTimelineEvents,
  setAnalysisMode,
  setMissionTimelineEventEnabled,
  updateMissionTimelineEvent,
} from "@/services/orbitServerApi";
import {
  buildWorkspace,
  deleteMission,
  deleteOrbit,
  duplicateMission,
  duplicateOrbit,
  readMissionLibrary,
  readOrbitLibrary,
  storedEventFromBackend,
  storedMissionFromBackend,
  upsertMission,
  upsertMissionEvents,
  upsertOrbit,
  validateWorkspaceImport,
  writeMissionLibrary,
  writeOrbitLibrary,
  writeWorkspace,
} from "@/services/workspaceStorage";
import type {
  AnalysisPresetId,
  BackendMission,
  BackendMissionTimelineEvent,
  BackendManualOrbitResponse,
  BackendAnalysisConfigResponse,
  BackendConjunctionRecord,
  BackendEphemerisState,
  BackendManeuverEvent,
  CreateTimelineEventRequest,
  CreateManualOrbitRequest,
  ManualOrbitType,
  PropagatorTypeId,
} from "@/services/orbitServerApi";
import type {
  MissionLibraryState,
  StoredEvent,
  StoredMission,
  StoredOrbit,
  StoredOrbitSourceType,
  StoredWorkspace,
} from "@/services/workspaceStorage";
import { StateCacheService } from "@/services/StateCacheService";

const CesiumGlobe = dynamic(
  () => import("@/components/CesiumGlobe").then((mod) => mod.CesiumGlobe),
  {
    ssr: false,
    loading: () => <div className="flex h-full min-h-[520px] items-center justify-center rounded-md bg-black text-sm text-zinc-400">Loading globe...</div>,
  },
);

type ManeuverFocusRequest = {
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeKm: number;
  sequence: number;
};
type FrameMode = "earth-fixed" | "inertial";
type OrbitSourceId = "catalog" | "tle" | "classical" | "cartesian";
type TleImportMode = "paste" | "upload" | "url";
type TimelineModalMode = "create" | "edit";
type MissionDurationPreset = "ONE_ORBIT" | "THREE_HOURS" | "TWELVE_HOURS" | "TWENTY_FOUR_HOURS" | "CUSTOM";
type TimelineEditorDraft = {
  type: "COAST" | "FINITE_BURN";
  name: string;
  executionDateUtc: string;
  executionTimeUtc: string;
  durationSeconds: string;
  thrustNewton: string;
  ispSeconds: string;
  directionFrame: "TNW" | "QSW" | "LVLH" | "RTN";
  directionX: string;
  directionY: string;
  directionZ: string;
};
type MissionSetupDraft = {
  name: string;
  startDateUtc: string;
  startTimeUtc: string;
  endDateUtc: string;
  endTimeUtc: string;
  durationPreset: MissionDurationPreset;
};
type MissionTrajectoryOverlay = {
  mission: SatelliteSnapshot | null;
  legacy: SatelliteSnapshot | null;
  generatedAt: string;
  message: string;
};

const catalogGroupOptions = [
  { id: "STATIONS", label: "Stations" },
  { id: "ACTIVE", label: "Active" },
  { id: "WEATHER", label: "Weather" },
  { id: "GEO", label: "GEO" },
  { id: "SCIENCE", label: "Science" },
] as const;
type CatalogGroupId = (typeof catalogGroupOptions)[number]["id"];
const initialSimulationTime = new Date("2026-05-08T00:00:00.000Z");
const trajectoryOptions = {
  futureMinutes: 110,
  pastMinutes: 35,
};
const ephemerisRefreshMarginMinutes = 18;
const speedPresetOptions = [
  { speed: 1, label: "Realtime" },
  { speed: 10, label: "10x" },
  { speed: 60, label: "60x" },
  { speed: 300, label: "300x" },
  { speed: 1000, label: "1000x" },
  { speed: 10000, label: "10000x" },
] as const;
const maneuverWindowMinutes = 45;
const conjunctionStepSec = 120;
const defaultMissionTrajectoryWindowMinutes = 90;
const analysisPresetOptions = [
  { id: "FAST_PREVIEW", label: "Fast" },
  { id: "OPERATIONAL_REVIEW", label: "Ops" },
  { id: "HIGH_FIDELITY", label: "High" },
  { id: "MANEUVER_PLANNING", label: "Burn" },
] satisfies Array<{ id: AnalysisPresetId; label: string }>;
const analysisModeOptions = [
  { id: "gravity", label: "Grav", key: "gravityEnabled" },
  { id: "drag", label: "Drag", key: "dragEnabled" },
  { id: "srp", label: "SRP", key: "solarRadiationPressureEnabled" },
  { id: "sun", label: "Sun", key: "thirdBodySunEnabled" },
  { id: "moon", label: "Moon", key: "thirdBodyMoonEnabled" },
  { id: "maneuver", label: "Burn", key: "maneuverModelEnabled" },
] satisfies Array<{ id: string; label: string; key: keyof BackendAnalysisConfigResponse["config"] }>;
type ActiveDataSource = "sample" | "endpoint" | "backend" | "manual";
const defaultTimelineDraft: TimelineEditorDraft = {
  type: "FINITE_BURN",
  name: "Finite Burn",
  executionDateUtc: utcIsoToDateInput(initialSimulationTime.toISOString()),
  executionTimeUtc: utcIsoToTimeInput(initialSimulationTime.toISOString()),
  durationSeconds: "120",
  thrustNewton: "0.2",
  ispSeconds: "220",
  directionFrame: "TNW",
  directionX: "1",
  directionY: "0",
  directionZ: "0",
};
const missionDurationPresets = [
  { id: "ONE_ORBIT", label: "1 orbit", seconds: 90 * 60 },
  { id: "THREE_HOURS", label: "3 hours", seconds: 3 * 60 * 60 },
  { id: "TWELVE_HOURS", label: "12 hours", seconds: 12 * 60 * 60 },
  { id: "TWENTY_FOUR_HOURS", label: "24 hours", seconds: 24 * 60 * 60 },
  { id: "CUSTOM", label: "Custom", seconds: null },
] satisfies Array<{ id: MissionDurationPreset; label: string; seconds: number | null }>;
const groundTrackRangeOptions = [
  {
    id: "live",
    label: "Live 6h",
    pastMinutes: 360,
    stepSec: 60,
    bucketMs: 60 * 1000,
  },
  {
    id: "day",
    label: "Last 24h",
    pastMinutes: 24 * 60,
    stepSec: 3 * 60,
    bucketMs: 10 * 60 * 1000,
  },
  {
    id: "week",
    label: "Last 7d",
    pastMinutes: 7 * 24 * 60,
    stepSec: 15 * 60,
    bucketMs: 60 * 60 * 1000,
  },
  {
    id: "twoMonths",
    label: "Last 2mo",
    pastMinutes: 60 * 24 * 60,
    stepSec: 60 * 60,
    bucketMs: 6 * 60 * 60 * 1000,
  },
  {
    id: "twoYears",
    label: "Last 2y",
    pastMinutes: 730 * 24 * 60,
    stepSec: 6 * 60 * 60,
    bucketMs: 24 * 60 * 60 * 1000,
  },
] satisfies Array<GroundTrackRangeOption & {
  pastMinutes: number;
  stepSec: number;
  bucketMs: number;
}>;

function isExternalEndpoint(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function getTleFetchUrl(value: string) {
  const trimmed = value.trim();
  return isExternalEndpoint(trimmed) ? `/api/tle?url=${encodeURIComponent(trimmed)}` : trimmed;
}

function getInitialSelectedIds(satellites: SatelliteObject[]) {
  return satellites.slice(0, 1).map((satellite) => satellite.id);
}

function getFirstDifferentSatelliteId(satellites: SatelliteObject[], id: string) {
  return satellites.find((satellite) => satellite.id !== id)?.id ?? "";
}

function getRangePair(selectedSatelliteIds: string[]) {
  return {
    primaryId: selectedSatelliteIds[0] ?? "",
    secondaryId: selectedSatelliteIds[1] ?? "",
  };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getEphemerisSampleStepSec(source: ActiveDataSource, propagatorType?: PropagatorTypeId) {
  if (!isServerDrivenSource(source)) {
    return 1;
  }

  return propagatorType === "NUMERICAL" ? 10 : 5;
}

function normalizeCustomSpeedMultiplier(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(Math.max(parsed, 1), 100000);
}

function timestampMs(value: string) {
  return new Date(value).getTime();
}

function lerpNumber(a: number | undefined, b: number | undefined, alpha: number) {
  if (typeof a !== "number" || typeof b !== "number") {
    return undefined;
  }
  return a + (b - a) * alpha;
}

function lerpVector(
  a: [number, number, number] | undefined,
  b: [number, number, number] | undefined,
  alpha: number,
) {
  if (!a || !b) {
    return undefined;
  }
  return [
    a[0] + (b[0] - a[0]) * alpha,
    a[1] + (b[1] - a[1]) * alpha,
    a[2] + (b[2] - a[2]) * alpha,
  ] as [number, number, number];
}

function lerpLongitudeDeg(a: number, b: number, alpha: number) {
  let delta = b - a;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }

  const value = a + delta * alpha;
  return value > 180 ? value - 360 : value < -180 ? value + 360 : value;
}

function interpolateStateFromSamples(
  satelliteId: string,
  samples: OrbitState[] | undefined,
  timeUtc: string,
): OrbitState | null {
  if (!samples || samples.length === 0) {
    return null;
  }

  const targetMs = timestampMs(timeUtc);
  const ordered = samples.toSorted((a, b) => timestampMs(a.timeUtc) - timestampMs(b.timeUtc));
  if (targetMs <= timestampMs(ordered[0].timeUtc)) {
    return { ...ordered[0], satelliteId };
  }
  if (targetMs >= timestampMs(ordered.at(-1)!.timeUtc)) {
    return { ...ordered.at(-1)!, satelliteId };
  }

  let low = 0;
  let high = ordered.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (timestampMs(ordered[mid].timeUtc) <= targetMs) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const before = ordered[low];
  const after = ordered[high];
  const beforeMs = timestampMs(before.timeUtc);
  const afterMs = timestampMs(after.timeUtc);
  const alpha = (targetMs - beforeMs) / Math.max(1, afterMs - beforeMs);
  const velocityEciKmps = lerpVector(before.velocityEciKmps, after.velocityEciKmps, alpha);
  const velocityEcefKmps = lerpVector(before.velocityEcefKmps, after.velocityEcefKmps, alpha);
  const velocityVector = velocityEcefKmps ?? velocityEciKmps;

  return {
    satelliteId,
    timeUtc,
    frame: before.frame,
    positionEciKm: lerpVector(before.positionEciKm, after.positionEciKm, alpha),
    velocityEciKmps,
    positionEcefKm: lerpVector(before.positionEcefKm, after.positionEcefKm, alpha),
    velocityEcefKmps,
    gmstRad: lerpNumber(before.gmstRad, after.gmstRad, alpha),
    latitudeDeg: before.latitudeDeg + (after.latitudeDeg - before.latitudeDeg) * alpha,
    longitudeDeg: lerpLongitudeDeg(before.longitudeDeg, after.longitudeDeg, alpha),
    altitudeKm: before.altitudeKm + (after.altitudeKm - before.altitudeKm) * alpha,
    velocityKmps: velocityVector
      ? Math.sqrt(velocityVector[0] ** 2 + velocityVector[1] ** 2 + velocityVector[2] ** 2)
      : lerpNumber(before.velocityKmps, after.velocityKmps, alpha),
  };
}

function backendStateToOrbitState(satelliteId: string, state: BackendEphemerisState): OrbitState {
  return {
    satelliteId,
    timeUtc: state.time,
    frame: "ECEF",
    positionEcefKm: state.positionKm,
    velocityEcefKmps: state.velocityKmps,
    latitudeDeg: state.latitudeDeg,
    longitudeDeg: state.longitudeDeg,
    altitudeKm: state.altitudeKm,
    velocityKmps: Math.sqrt(
      state.velocityKmps[0] ** 2 +
      state.velocityKmps[1] ** 2 +
      state.velocityKmps[2] ** 2,
    ),
  };
}

function manualOrbitToSatellite(orbit: BackendManualOrbitResponse): SatelliteObject {
  return {
    id: orbit.id,
    name: orbit.name,
    sourceType: orbit.type === "TLE" ? "TLE" : "MANUAL_STATE",
    visual: {
      showMarker: true,
      showLabel: true,
      showOrbit: true,
      showGroundTrack: false,
      showTrail: false,
    },
    metadata: {
      mission: orbit.type.replaceAll("_", " ").toLowerCase(),
      objectType: "payload",
    },
  };
}

function manualOrbitSourceType(type: ManualOrbitType): StoredOrbitSourceType {
  if (type === "CARTESIAN_STATE") {
    return "MANUAL_CARTESIAN";
  }
  if (type === "CLASSICAL_ELEMENTS") {
    return "MANUAL_CLASSICAL";
  }
  return "MANUAL_TLE";
}

function orbitSummaryForSatellite(satellite: SatelliteObject, sourceType: StoredOrbitSourceType) {
  return {
    sourceType,
    noradId: satellite.noradId ?? null,
    objectType: satellite.metadata?.objectType ?? null,
    mission: typeof satellite.metadata?.mission === "string" ? satellite.metadata.mission : null,
  };
}

function storedOrbitFromCatalogSatellite(satellite: SatelliteObject, catalogGroup: string): StoredOrbit {
  const now = new Date().toISOString();
  return {
    orbitId: `catalog-${satellite.noradId ?? satellite.id}`,
    orbitName: satellite.name,
    sourceType: "CATALOG_TLE",
    creationDate: now,
    lastModified: now,
    orbitDefinition: {
      satellite,
      catalogGroup,
    },
    propagatorType: "NUMERICAL",
    summary: orbitSummaryForSatellite(satellite, "CATALOG_TLE"),
  };
}

function storedOrbitsFromImportedTle(satellites: SatelliteObject[], rawTle: string, sourceLabel: string): StoredOrbit[] {
  const now = new Date().toISOString();
  return satellites.map((satellite) => ({
    orbitId: `tle-${satellite.noradId ?? satellite.id}`,
    orbitName: satellite.name,
    sourceType: "IMPORTED_TLE",
    creationDate: now,
    lastModified: now,
    orbitDefinition: {
      satellite,
      rawTle,
    },
    propagatorType: "TLE_SGP4",
    summary: {
      ...orbitSummaryForSatellite(satellite, "IMPORTED_TLE"),
      sourceLabel,
    },
  }));
}

function storedOrbitFromManualOrbit(
  request: CreateManualOrbitRequest,
  response: BackendManualOrbitResponse,
  satellite: SatelliteObject,
): StoredOrbit {
  const now = new Date().toISOString();
  const sourceType = manualOrbitSourceType(request.type);
  return {
    orbitId: response.id,
    orbitName: response.name,
    sourceType,
    creationDate: now,
    lastModified: now,
    orbitDefinition: {
      satellite,
      manualRequest: request,
      backendManualOrbitId: response.id,
    },
    propagatorType: response.propagatorType,
    summary: {
      ...orbitSummaryForSatellite(satellite, sourceType),
      frame: response.frame,
      epoch: response.epoch,
    },
  };
}

function eventsFromStoredMission(state: MissionLibraryState, missionId: string): BackendMissionTimelineEvent[] {
  return state.events
    .filter((event) => event.missionId === missionId && event.backendEvent)
    .map((event) => event.backendEvent!)
    .toSorted((a, b) => a.sequenceIndex - b.sequenceIndex);
}

function missionFromStoredMission(storedMission: StoredMission): BackendMission | null {
  if (storedMission.backendMission) {
    return storedMission.backendMission;
  }
  if (!storedMission.backendMissionId) {
    return null;
  }
  return {
    id: storedMission.backendMissionId,
    name: storedMission.missionName,
    subjectNoradId: null,
    subjectOrbitId: null,
    propagatorType: "NUMERICAL",
    scenarioStart: storedMission.startTime,
    scenarioEnd: storedMission.endTime,
    createdAt: storedMission.createdAt,
    updatedAt: storedMission.updatedAt,
  };
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isServerDrivenSource(source: ActiveDataSource) {
  return source === "backend" || source === "manual";
}

function eventStateKey(satelliteId: string, timeUtc: string) {
  return `${satelliteId}@${timeUtc}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function normalizeBackendManeuvers(raw: BackendManeuverEvent[]): ManeuverEvent[] {
  return raw.map((event): ManeuverEvent => {
    const vector = event.vector ?? {};
    const metadata = event.metadata ?? {};
    const type = typeof metadata.type === "string" ? metadata.type : "station_keep";
    const description = typeof metadata.description === "string"
      ? metadata.description
      : "Maneuver event loaded from the backend database.";

    return {
      id: event.id,
      satelliteId: String(event.noradId),
      title: event.name,
      timeUtc: event.eventTime,
      type: ["orbit_raise", "phasing", "station_keep", "avoidance"].includes(type) ? type as ManeuverEvent["type"] : "station_keep",
      status: event.status.toLowerCase() === "cancelled" ? "candidate" : event.status.toLowerCase() as ManeuverEvent["status"],
      deltaVMps: event.deltaVMps,
      deltaVVectorMps: [
        vector.r ?? vector.x ?? 0,
        vector.t ?? vector.y ?? event.deltaVMps,
        vector.n ?? vector.z ?? 0,
      ],
      frame: ["RTN", "ECI", "BODY", "LVLH"].includes(event.frame) ? event.frame as ManeuverEvent["frame"] : "RTN",
      durationSec: event.durationSec,
      description,
      visual: {
        showBurnVector: true,
        showPrePostOrbit: true,
      },
    };
  });
}

function normalizeBackendConjunctions(raw: BackendConjunctionRecord[]): ConjunctionEvent[] {
  return raw.flatMap((record): ConjunctionEvent[] => {
    if (!record.sat1NoradId || !record.sat2NoradId || !record.tca) {
      return [];
    }

    const tcaMs = new Date(record.tca).getTime();
    const warningDistanceKm = record.risk === "CRITICAL" ? 25 : record.risk === "WARNING" ? 25 : 50;
    const criticalDistanceKm = record.risk === "CRITICAL" ? Math.max(record.missDistanceKm ?? 1, 1) : 10;

    return [{
      id: record.id,
      primarySatelliteId: String(record.sat1NoradId),
      secondarySatelliteId: String(record.sat2NoradId),
      primaryName: record.sat1Name ?? undefined,
      secondaryName: record.sat2Name ?? undefined,
      startTimeUtc: new Date(tcaMs - 30 * 60 * 1000).toISOString(),
      endTimeUtc: new Date(tcaMs + 30 * 60 * 1000).toISOString(),
      tcaUtc: record.tca,
      missDistanceKm: record.missDistanceKm ?? undefined,
      relativeVelocityKmps: record.relativeVelocityKmps,
      probabilityOfCollision: record.probabilityOfCollision,
      risk: record.risk,
      source: record.source,
      warningDistanceKm,
      criticalDistanceKm,
    }];
  });
}

function missionOverlaySatellite(base: SatelliteObject, mode: "mission" | "legacy"): SatelliteObject {
  return {
    ...base,
    id: `${base.id}-${mode}-trajectory`,
    name: mode === "mission" ? `${base.name} Mission` : `${base.name} Legacy`,
    sourceType: "EPHEMERIS",
    visual: {
      showMarker: false,
      showLabel: false,
      showOrbit: true,
      showGroundTrack: false,
      showTrail: false,
    },
    metadata: {
      ...base.metadata,
      mission: mode === "mission" ? "mission timeline preview" : "legacy trajectory comparison",
    },
  };
}

function buildTrajectorySnapshot(satellite: SatelliteObject, states: BackendEphemerisState[], centerTime: Date): SatelliteSnapshot {
  const trajectory = states.map((state) => backendStateToOrbitState(satellite.id, state));
  return {
    satellite,
    state: null,
    trajectory,
    futureTrajectory: trajectory.filter((state) => new Date(state.timeUtc) >= centerTime),
    pastTrail: trajectory.filter((state) => new Date(state.timeUtc) <= centerTime),
    groundTrack: trajectory,
  };
}

function timelineDraftFromEvent(event: BackendMissionTimelineEvent): TimelineEditorDraft {
  const parameters = event.parameters ?? {};
  return {
    type: event.type === "COAST" ? "COAST" : "FINITE_BURN",
    name: event.name,
    executionDateUtc: utcIsoToDateInput(event.executionTime, initialSimulationTime.toISOString()),
    executionTimeUtc: utcIsoToTimeInput(event.executionTime, initialSimulationTime.toISOString()),
    durationSeconds: String(readNumberParameter(parameters, "durationSeconds", 120)),
    thrustNewton: String(readNumberParameter(parameters, "thrustNewton", 0.2)),
    ispSeconds: String(readNumberParameter(parameters, "ispSeconds", 220)),
    directionFrame: readStringParameter(parameters, "directionFrame", "TNW") as TimelineEditorDraft["directionFrame"],
    directionX: String(readNumberParameter(parameters, "directionX", 1)),
    directionY: String(readNumberParameter(parameters, "directionY", 0)),
    directionZ: String(readNumberParameter(parameters, "directionZ", 0)),
  };
}

function buildTimelineRequest(
  draft: TimelineEditorDraft,
  sequenceIndex: number,
  enabled: boolean,
): CreateTimelineEventRequest {
  const executionTime = utcDateAndTimeInputToIso(draft.executionDateUtc, draft.executionTimeUtc);
  if (draft.type === "COAST") {
    return {
      sequenceIndex,
      type: "COAST",
      name: draft.name.trim() || "Coast",
      enabled,
      executionTime,
      parameters: {},
    };
  }

  return {
    sequenceIndex,
    type: "FINITE_BURN",
    name: draft.name.trim() || "Finite Burn",
    enabled,
    executionTime,
    parameters: {
      durationSeconds: Number(draft.durationSeconds),
      thrustNewton: Number(draft.thrustNewton),
      ispSeconds: Number(draft.ispSeconds),
      directionFrame: draft.directionFrame,
      directionX: Number(draft.directionX),
      directionY: Number(draft.directionY),
      directionZ: Number(draft.directionZ),
    },
  };
}

function validateTimelineDraft(draft: TimelineEditorDraft) {
  const errors: Partial<Record<keyof TimelineEditorDraft, string>> = {};
  if (!draft.name.trim()) {
    errors.name = "Required";
  }
  if (!draft.executionDateUtc) {
    errors.executionDateUtc = "Date required";
  }
  if (!draft.executionTimeUtc) {
    errors.executionTimeUtc = "Time required";
  }
  if (draft.executionDateUtc && draft.executionTimeUtc && !isValidUtcDateAndTimeInput(draft.executionDateUtc, draft.executionTimeUtc)) {
    errors.executionTimeUtc = "Invalid UTC time";
  }
  if (draft.type === "FINITE_BURN") {
    validatePositiveDraftNumber(draft.durationSeconds, "durationSeconds", errors);
    validatePositiveDraftNumber(draft.thrustNewton, "thrustNewton", errors);
    validatePositiveDraftNumber(draft.ispSeconds, "ispSeconds", errors);
    (["directionX", "directionY", "directionZ"] as const).forEach((key) => {
      const value = Number(draft[key]);
      if (!Number.isFinite(value)) {
        errors[key] = "Number required";
      }
    });
  }
  return errors;
}

function compactIsoUtc(iso: string) {
  return iso.replace(".000Z", "Z");
}

function secondsToDurationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
  }
  return `${remainingSeconds}s`;
}

function signedOffsetLabel(fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return "--";
  }
  const deltaSeconds = Math.round((to - from) / 1000);
  const sign = deltaSeconds < 0 ? "T-" : "T+";
  const absolute = Math.abs(deltaSeconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function missionWindowFromDraft(draft: MissionSetupDraft) {
  return {
    startIso: utcDateAndTimeInputToIso(draft.startDateUtc, draft.startTimeUtc),
    endIso: utcDateAndTimeInputToIso(draft.endDateUtc, draft.endTimeUtc),
  };
}

function missionSetupDraftFor(
  satellite: SatelliteObject | null | undefined,
  centerTime: Date,
  durationPreset: MissionDurationPreset = "THREE_HOURS",
): MissionSetupDraft {
  const preset = missionDurationPresets.find((item) => item.id === durationPreset) ?? missionDurationPresets[1];
  const start = centerTime;
  const end = new Date(start.getTime() + (preset.seconds ?? 3 * 60 * 60) * 1000);
  return {
    name: `${satellite?.name ?? "Orbit"} Mission`,
    startDateUtc: utcIsoToDateInput(start.toISOString()),
    startTimeUtc: utcIsoToTimeInput(start.toISOString()),
    endDateUtc: utcIsoToDateInput(end.toISOString()),
    endTimeUtc: utcIsoToTimeInput(end.toISOString()),
    durationPreset: preset.id,
  };
}

function applyMissionDurationPreset(draft: MissionSetupDraft, presetId: MissionDurationPreset): MissionSetupDraft {
  const preset = missionDurationPresets.find((item) => item.id === presetId);
  if (!preset || preset.seconds === null) {
    return { ...draft, durationPreset: presetId };
  }
  const startIso = utcDateAndTimeInputToIso(draft.startDateUtc, draft.startTimeUtc);
  const end = new Date(new Date(startIso).getTime() + preset.seconds * 1000);
  return {
    ...draft,
    durationPreset: presetId,
    endDateUtc: utcIsoToDateInput(end.toISOString()),
    endTimeUtc: utcIsoToTimeInput(end.toISOString()),
  };
}

function validateMissionSetupDraft(draft: MissionSetupDraft) {
  const errors: Partial<Record<keyof MissionSetupDraft, string>> = {};
  if (!draft.name.trim()) {
    errors.name = "Mission name is required";
  }
  if (!draft.startDateUtc) {
    errors.startDateUtc = "Start date required";
  }
  if (!draft.startTimeUtc) {
    errors.startTimeUtc = "Start time required";
  }
  if (!draft.endDateUtc) {
    errors.endDateUtc = "End date required";
  }
  if (!draft.endTimeUtc) {
    errors.endTimeUtc = "End time required";
  }
  try {
    const { startIso, endIso } = missionWindowFromDraft(draft);
    if (Number.isNaN(new Date(startIso).getTime()) || Number.isNaN(new Date(endIso).getTime())) {
      errors.endTimeUtc = errors.endTimeUtc ?? "Valid UTC window required";
    }
    if (new Date(startIso) >= new Date(endIso)) {
      errors.endTimeUtc = "Mission end must be after start";
    }
  } catch {
    errors.endTimeUtc = errors.endTimeUtc ?? "Valid UTC window required";
  }
  return errors;
}

function missionDurationSeconds(mission: BackendMission) {
  return Math.max(0, Math.round((new Date(mission.scenarioEnd).getTime() - new Date(mission.scenarioStart).getTime()) / 1000));
}

function missionSubjectSummary(
  source: ActiveDataSource,
  satellite: SatelliteObject | null | undefined,
  selectedNoradId: string | number | null,
  manualOrbitId: string | null,
) {
  if (source === "manual") {
    const type = satellite?.metadata?.mission ? titleCase(String(satellite.metadata.mission)) : "Manual Orbit";
    return {
      label: `${type} mission`,
      detail: manualOrbitId ?? satellite?.id ?? "manual orbit",
    };
  }
  if (source === "backend" && selectedNoradId) {
    return {
      label: "Catalog NORAD mission",
      detail: `NORAD ${selectedNoradId}`,
    };
  }
  return {
    label: "No backend mission subject",
    detail: "Select a catalog or manual backend orbit",
  };
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function eventWindowError(mission: BackendMission | null, executionIso: string) {
  if (!mission) {
    return null;
  }
  const execution = new Date(executionIso);
  const start = new Date(mission.scenarioStart);
  const end = new Date(mission.scenarioEnd);
  if (execution >= start && execution <= end) {
    return null;
  }
  return [
    `Event time: ${compactIsoUtc(executionIso)}`,
    `Mission window: ${compactIsoUtc(mission.scenarioStart)} -> ${compactIsoUtc(mission.scenarioEnd)}`,
    "Event is outside the mission window.",
  ].join("\n");
}

function validatePositiveDraftNumber(
  value: string,
  key: keyof TimelineEditorDraft,
  errors: Partial<Record<keyof TimelineEditorDraft, string>>,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors[key] = "Number required";
    return;
  }
  if (parsed <= 0) {
    errors[key] = "> 0 required";
  }
}

function readNumberParameter(parameters: Record<string, unknown>, key: string, fallback: number) {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringParameter(parameters: Record<string, unknown>, key: string, fallback: string) {
  const value = parameters[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function userErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function getConjunctionStatusFromRisk(event: ConjunctionEvent, missDistanceKm: number) {
  if (event.risk === "CRITICAL") {
    return "critical" as const;
  }
  if (event.risk === "WARNING" || event.risk === "WATCH") {
    return "warning" as const;
  }
  return getConjunctionStatus(missDistanceKm, event.warningDistanceKm, event.criticalDistanceKm);
}

function relativeVelocityKmps(a: SatelliteSnapshot["state"], b: SatelliteSnapshot["state"]) {
  if (!a?.velocityEciKmps || !b?.velocityEciKmps) {
    return null;
  }

  return Math.sqrt(
    (a.velocityEciKmps[0] - b.velocityEciKmps[0]) ** 2 +
    (a.velocityEciKmps[1] - b.velocityEciKmps[1]) ** 2 +
    (a.velocityEciKmps[2] - b.velocityEciKmps[2]) ** 2,
  );
}

export function OrbitalDashboard() {
  const [tleUrl, setTleUrl] = useState("");
  const [activeDataSource, setActiveDataSource] = useState<ActiveDataSource>("sample");
  const [manualOrbitId, setManualOrbitId] = useState<string | null>(null);
  const [activeSourceModal, setActiveSourceModal] = useState<OrbitSourceId | null>(null);
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [backendCatalogGroup, setBackendCatalogGroup] = useState<CatalogGroupId>("STATIONS");
  const [satellites, setSatellites] = useState<SatelliteObject[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [selectedSatelliteIds, setSelectedSatelliteIds] = useState<string[]>([]);
  const [simTime, setSimTime] = useState(() => initialSimulationTime);
  const [trajectoryAnchorTime, setTrajectoryAnchorTime] = useState(() => initialSimulationTime);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [customSpeedInput, setCustomSpeedInput] = useState("120");
  const [frameMode, setFrameMode] = useState<FrameMode>("earth-fixed");
  const [showLabels, setShowLabels] = useState(true);
  const [showAllOrbits, setShowAllOrbits] = useState(false);
  const [showRangeCheck, setShowRangeCheck] = useState(false);
  const [groundTrackRangeId, setGroundTrackRangeId] = useState<GroundTrackRangeId>("live");
  const [showManeuvers, setShowManeuvers] = useState(false);
  const [maneuverEvents, setManeuverEvents] = useState<ManeuverEvent[]>([]);
  const [selectedManeuverId, setSelectedManeuverId] = useState<string | null>(null);
  const [isManeuverModalOpen, setIsManeuverModalOpen] = useState(false);
  const [mission, setMission] = useState<BackendMission | null>(null);
  const [missionTimelineEvents, setMissionTimelineEvents] = useState<BackendMissionTimelineEvent[]>([]);
  const [orbitLibrary, setOrbitLibrary] = useState<StoredOrbit[]>(() => readOrbitLibrary());
  const [missionLibrary, setMissionLibrary] = useState<MissionLibraryState>(() => readMissionLibrary());
  const [activeWorkspaceOrbitId, setActiveWorkspaceOrbitId] = useState<string | null>(null);
  const [activeWorkspaceMissionId, setActiveWorkspaceMissionId] = useState<string | null>(null);
  const workspaceImportInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<string | null>(null);
  const [timelineModalMode, setTimelineModalMode] = useState<TimelineModalMode | null>(null);
  const [timelineDraft, setTimelineDraft] = useState<TimelineEditorDraft>(defaultTimelineDraft);
  const [isMissionSetupOpen, setIsMissionSetupOpen] = useState(false);
  const [missionSetupDraft, setMissionSetupDraft] = useState<MissionSetupDraft>(
    () => missionSetupDraftFor(null, initialSimulationTime),
  );
  const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
  const [timelineDragEventId, setTimelineDragEventId] = useState<string | null>(null);
  const [missionTrajectoryOverlay, setMissionTrajectoryOverlay] = useState<MissionTrajectoryOverlay | null>(null);
  const [showMissionComparison, setShowMissionComparison] = useState(false);
  const [isMissionTrajectoryLoading, setIsMissionTrajectoryLoading] = useState(false);
  const [showConjunctions, setShowConjunctions] = useState(false);
  const [conjunctionEvents, setConjunctionEvents] = useState<ConjunctionEvent[]>([]);
  const [selectedConjunctionId, setSelectedConjunctionId] = useState<string | null>(null);
  const [dynamicDataMessage, setDynamicDataMessage] = useState<string | null>(null);
  const [analysisConfig, setAnalysisConfig] = useState<BackendAnalysisConfigResponse | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [serverStateBySatelliteId, setServerStateBySatelliteId] = useState<Map<string, OrbitState>>(() => new Map());
  const [serverOrbitSnapshots, setServerOrbitSnapshots] = useState<SatelliteSnapshot[] | null>(null);
  const [serverGroundTrackSnapshots, setServerGroundTrackSnapshots] = useState<SatelliteSnapshot[] | null>(null);
  const [serverEventStateByKey, setServerEventStateByKey] = useState<Map<string, OrbitState>>(() => new Map());
  const [backendRequestPauseUntil, setBackendRequestPauseUntil] = useState(0);
  const [backendRequestsPaused, setBackendRequestsPaused] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{ satelliteId: string; sequence: number } | null>(null);
  const [maneuverFocusRequest, setManeuverFocusRequest] = useState<ManeuverFocusRequest | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const simTimeRef = useRef(simTime);
  const viewerClockAvailableRef = useRef(false);
  const trajectoryRequestInFlightRef = useRef(false);
  const lastTrajectoryAnchorShiftMsRef = useRef(0);
  const hasOrbitLoaded = satellites.length > 0;

  const propagator = useMemo(() => new SatelliteJsPropagator(satellites), [satellites]);
  const stateCache = useMemo(() => new StateCacheService(propagator, satellites), [propagator, satellites]);
  const groundTrackRange = groundTrackRangeOptions.find((option) => option.id === groundTrackRangeId) ?? groundTrackRangeOptions[0];
  const trajectorySampleStepSec = getEphemerisSampleStepSec(
    activeDataSource,
    analysisConfig?.config.propagatorType,
  );
  const trajectoryWindowOptions = useMemo(() => ({
    ...trajectoryOptions,
    stepSec: trajectorySampleStepSec,
  }), [trajectorySampleStepSec]);
  const groundTrackStepSec = groundTrackRange.id === "live"
    ? 30
    : groundTrackRange.stepSec;
  const groundTrackAnchorMs = Math.floor(simTime.getTime() / groundTrackRange.bucketMs) * groundTrackRange.bucketMs;
  const serverGroundTrackAnchorMs = isServerDrivenSource(activeDataSource)
    ? trajectoryAnchorTime.getTime()
    : groundTrackAnchorMs;
  const orbitSnapshots: SatelliteSnapshot[] = useMemo(() => {
    if (isServerDrivenSource(activeDataSource) && serverOrbitSnapshots) {
      return serverOrbitSnapshots;
    }
    return stateCache.getWindowedSnapshots(trajectoryAnchorTime.toISOString(), trajectoryWindowOptions);
  }, [activeDataSource, serverOrbitSnapshots, stateCache, trajectoryAnchorTime, trajectoryWindowOptions]);
  const displayOrbitSnapshots = useMemo(() => {
    const overlays = showMissionComparison && missionTrajectoryOverlay
      ? [missionTrajectoryOverlay.legacy, missionTrajectoryOverlay.mission].filter((snapshot): snapshot is SatelliteSnapshot => snapshot !== null)
      : [];
    return overlays.length > 0 ? [...orbitSnapshots, ...overlays] : orbitSnapshots;
  }, [missionTrajectoryOverlay, orbitSnapshots, showMissionComparison]);
  const snapshots: SatelliteSnapshot[] = useMemo(() => {
    const simTimeIso = simTime.toISOString();
    const ephemerisBySatelliteId = new Map(displayOrbitSnapshots.map((snapshot) => [
      snapshot.satellite.id,
      snapshot.trajectory ?? [],
    ]));

    return satellites.map((satellite) => {
      const ephemerisState = interpolateStateFromSamples(
        satellite.id,
        ephemerisBySatelliteId.get(satellite.id),
        simTimeIso,
      );
      if (ephemerisState) {
        return {
          satellite,
          state: ephemerisState,
          error: undefined,
        };
      }

      const fallbackState = isServerDrivenSource(activeDataSource)
        ? serverStateBySatelliteId.get(satellite.id) ?? null
        : propagator.getState(satellite.id, simTimeIso);

      return {
        satellite,
        state: fallbackState,
        error: fallbackState ? undefined : "Waiting for ephemeris samples.",
      };
    });
  }, [activeDataSource, displayOrbitSnapshots, propagator, satellites, serverStateBySatelliteId, simTime]);
  const groundTrackSnapshots: SatelliteSnapshot[] = useMemo(() => {
    if (isServerDrivenSource(activeDataSource) && serverGroundTrackSnapshots) {
      return serverGroundTrackSnapshots;
    }
    return stateCache.getGroundTrackSnapshots(new Date(groundTrackAnchorMs).toISOString(), {
      pastMinutes: groundTrackRange.pastMinutes,
      stepSec: groundTrackStepSec,
    });
  }, [activeDataSource, groundTrackAnchorMs, groundTrackRange.pastMinutes, groundTrackStepSec, serverGroundTrackSnapshots, stateCache]);
  const maneuverSnapshots: ManeuverSnapshot[] = useMemo(() => {
    return maneuverEvents.flatMap((event) => {
      const satellite = satellites.find((item) => item.id === event.satelliteId || item.noradId === event.satelliteId);
      if (!satellite) {
        return [];
      }
      const eventTime = new Date(event.timeUtc);
      const serverEventState = serverEventStateByKey.get(eventStateKey(satellite.id, event.timeUtc)) ?? null;

      return [{
        event,
        satellite,
        state: isServerDrivenSource(activeDataSource) ? serverEventState : propagator.getState(satellite.id, event.timeUtc),
        preTrajectory: isServerDrivenSource(activeDataSource)
          ? []
          : propagator.getTrajectory(
              satellite.id,
              addMinutes(eventTime, -maneuverWindowMinutes).toISOString(),
              event.timeUtc,
              90,
            ),
        postTrajectory: isServerDrivenSource(activeDataSource)
          ? []
          : propagator.getTrajectory(
              satellite.id,
              event.timeUtc,
              addMinutes(eventTime, maneuverWindowMinutes).toISOString(),
              90,
            ),
        minutesFromSimulationTime: (new Date(event.timeUtc).getTime() - simTime.getTime()) / 60000,
      }];
    });
  }, [activeDataSource, maneuverEvents, propagator, satellites, serverEventStateByKey, simTime]);
  const selectedManeuver = maneuverSnapshots.find((snapshot) => snapshot.event.id === selectedManeuverId) ?? maneuverSnapshots[0] ?? null;
  const selectedTimelineEvent = missionTimelineEvents.find((event) => event.id === selectedTimelineEventId) ?? missionTimelineEvents[0] ?? null;
  const conjunctionSnapshots: ConjunctionSnapshot[] = useMemo(() => {
    return conjunctionEvents.flatMap((event): ConjunctionSnapshot[] => {
      const primary = satellites.find((item) => item.id === event.primarySatelliteId || item.noradId === event.primarySatelliteId);
      const secondary = satellites.find((item) => item.id === event.secondarySatelliteId || item.noradId === event.secondarySatelliteId);

      if (!primary || !secondary) {
        return [];
      }

      if (event.tcaUtc && event.missDistanceKm !== undefined) {
        const primaryState = isServerDrivenSource(activeDataSource)
          ? serverEventStateByKey.get(eventStateKey(primary.id, event.tcaUtc)) ?? null
          : propagator.getState(primary.id, event.tcaUtc);
        const secondaryState = isServerDrivenSource(activeDataSource)
          ? serverEventStateByKey.get(eventStateKey(secondary.id, event.tcaUtc)) ?? null
          : propagator.getState(secondary.id, event.tcaUtc);
        return [{
          event,
          primary: {
            ...primary,
            name: event.primaryName ?? primary.name,
          },
          secondary: {
            ...secondary,
            name: event.secondaryName ?? secondary.name,
          },
          tcaUtc: event.tcaUtc,
          missDistanceKm: event.missDistanceKm,
          relativeVelocityKmps: event.relativeVelocityKmps ?? relativeVelocityKmps(primaryState, secondaryState),
          status: getConjunctionStatusFromRisk(event, event.missDistanceKm),
          primaryState,
          secondaryState,
        }];
      }

      let best: ConjunctionSnapshot | null = null;
      const startMs = new Date(event.startTimeUtc).getTime();
      const endMs = new Date(event.endTimeUtc).getTime();

      for (let timeMs = startMs; timeMs <= endMs; timeMs += conjunctionStepSec * 1000) {
        if (isServerDrivenSource(activeDataSource)) {
          break;
        }
        const timeUtc = new Date(timeMs).toISOString();
        const primaryState = propagator.getState(primary.id, timeUtc);
        const secondaryState = propagator.getState(secondary.id, timeUtc);
        const missDistanceKm = distanceBetweenOrbitStatesKm(primaryState, secondaryState);

        if (missDistanceKm === null) {
          continue;
        }

        if (!best || missDistanceKm < best.missDistanceKm) {
          best = {
            event,
            primary,
            secondary,
            tcaUtc: timeUtc,
            missDistanceKm,
            relativeVelocityKmps: relativeVelocityKmps(primaryState, secondaryState),
            status: getConjunctionStatus(missDistanceKm, event.warningDistanceKm, event.criticalDistanceKm),
            primaryState,
            secondaryState,
          };
        }
      }

      return best ? [best] : [];
    });
  }, [activeDataSource, conjunctionEvents, propagator, satellites, serverEventStateByKey]);
  const selectedConjunction = conjunctionSnapshots.find((snapshot) => snapshot.event.id === selectedConjunctionId) ?? conjunctionSnapshots[0] ?? null;
  const latestSelectedId = selectedSatelliteIds.at(-1) ?? null;
  const selectedSnapshot = snapshots.find((item) => item.satellite.id === latestSelectedId) ?? snapshots[0];
  const selectedNoradId = activeDataSource === "manual" ? null : selectedSnapshot?.satellite.noradId ?? selectedSnapshot?.satellite.id ?? null;
  const canUseAnalysisConfig = activeDataSource === "backend" && Boolean(selectedNoradId);
  const canUseMissionTimeline = canUseAnalysisConfig || (activeDataSource === "manual" && Boolean(manualOrbitId));
  const missionTimelineUnavailableReason = canUseMissionTimeline
    ? null
    : activeDataSource === "manual"
      ? "Create a manual Cartesian or Classical Elements orbit first, then create a mission."
      : activeDataSource === "endpoint"
        ? "Mission planning currently requires a backend catalog orbit. Imported TLEs run locally in the browser."
        : "Load a backend catalog orbit to create a mission timeline.";
  const canUseRangeCheck = satellites.length >= 2;
  const canShowManeuvers = maneuverSnapshots.length > 0;
  const canShowConjunctions = satellites.length >= 2 && conjunctionSnapshots.length > 0;
  const effectiveShowRangeCheck = showRangeCheck && canUseRangeCheck;
  const effectiveShowManeuvers = showManeuvers && canShowManeuvers;
  const effectiveShowConjunctions = showConjunctions && canShowConjunctions;
  const currentDisplayGmstRadRaw = selectedSnapshot?.state?.gmstRad ?? snapshots.find((item) => item.state?.gmstRad)?.state?.gmstRad;
  // Orbit arcs are rendered in a space-like frame and rotated into Cesium's
  // Earth-fixed scene. Quantizing avoids rebuilding long polylines every
  // animation frame while keeping the marker visually seated on its orbit.
  const currentDisplayGmstRad = typeof currentDisplayGmstRadRaw === "number"
    ? Math.round(currentDisplayGmstRadRaw / 0.004) * 0.004
    : undefined;
  const validCount = snapshots.filter((item) => item.state).length;
  const { primaryId: rangePrimaryId, secondaryId: rangeSecondaryId } = getRangePair(selectedSatelliteIds);
  const primaryRangeSnapshot = snapshots.find((item) => item.satellite.id === rangePrimaryId);
  const secondaryRangeSnapshot = snapshots.find((item) => item.satellite.id === rangeSecondaryId);
  const rangeDistanceKm = distanceBetweenOrbitStatesKm(
    primaryRangeSnapshot?.state ?? null,
    secondaryRangeSnapshot?.state ?? null,
  );
  const rangeMeasurement =
    effectiveShowRangeCheck && primaryRangeSnapshot && secondaryRangeSnapshot && rangeDistanceKm !== null
      ? {
          primary: primaryRangeSnapshot,
          secondary: secondaryRangeSnapshot,
          distanceKm: rangeDistanceKm,
        }
      : null;
  const loadedNoradIds = useMemo(() => {
    if (activeDataSource === "manual") {
      return [];
    }
    return satellites
      .map((satellite) => satellite.noradId ?? satellite.id)
      .filter((id): id is string => Boolean(id));
  }, [activeDataSource, satellites]);
  const activeStoredOrbit = useMemo(() => {
    if (activeWorkspaceOrbitId) {
      return orbitLibrary.find((orbit) => orbit.orbitId === activeWorkspaceOrbitId) ?? null;
    }
    if (manualOrbitId) {
      return orbitLibrary.find((orbit) => orbit.orbitDefinition.backendManualOrbitId === manualOrbitId || orbit.orbitId === manualOrbitId) ?? null;
    }
    if (selectedNoradId) {
      return orbitLibrary.find((orbit) => orbit.orbitId === `catalog-${selectedNoradId}` || orbit.orbitId === `tle-${selectedNoradId}`) ?? null;
    }
    return null;
  }, [activeWorkspaceOrbitId, manualOrbitId, orbitLibrary, selectedNoradId]);
  const activeStoredMission = useMemo(() => {
    if (activeWorkspaceMissionId) {
      return missionLibrary.missions.find((item) => item.missionId === activeWorkspaceMissionId) ?? null;
    }
    if (mission) {
      return missionLibrary.missions.find((item) => item.backendMissionId === mission.id || item.missionId === mission.id) ?? null;
    }
    return null;
  }, [activeWorkspaceMissionId, mission, missionLibrary.missions]);
  const isPresetSpeed = speedPresetOptions.some((option) => option.speed === speed);
  const pauseBackendRequests = useCallback((error: unknown) => {
    setBackendRequestPauseUntil(Date.now() + 10_000);
    setBackendRequestsPaused(true);
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Backend ephemeris requests failed.";
    setDynamicDataMessage(`${message} Retrying shortly.`);
  }, []);

  useEffect(() => {
    simTimeRef.current = simTime;
  }, [simTime]);

  useEffect(() => {
    if (backendRequestPauseUntil <= Date.now()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setBackendRequestPauseUntil(0);
      setBackendRequestsPaused(false);
    }, backendRequestPauseUntil - Date.now());

    return () => window.clearTimeout(timeoutId);
  }, [backendRequestPauseUntil]);

  const applyCustomSpeed = useCallback(() => {
    const customSpeed = normalizeCustomSpeedMultiplier(customSpeedInput);
    if (customSpeed === null) {
      return;
    }

    setSpeed(customSpeed);
    setCustomSpeedInput(String(customSpeed));
  }, [customSpeedInput]);

  const saveOrbitLibrary = useCallback((next: StoredOrbit[]) => {
    setOrbitLibrary(next);
    writeOrbitLibrary(next);
  }, []);

  const saveMissionLibrary = useCallback((next: MissionLibraryState) => {
    setMissionLibrary(next);
    writeMissionLibrary(next);
  }, []);

  const rememberOrbit = useCallback((orbit: StoredOrbit) => {
    setActiveWorkspaceOrbitId(orbit.orbitId);
    setOrbitLibrary((current) => {
      const next = upsertOrbit(current, orbit);
      writeOrbitLibrary(next);
      return next;
    });
  }, []);

  const rememberMission = useCallback((backendMission: BackendMission, orbitId: string) => {
    const stored = storedMissionFromBackend(backendMission, orbitId);
    setActiveWorkspaceMissionId(stored.missionId);
    setMissionLibrary((current) => {
      const next = upsertMission(current, stored);
      writeMissionLibrary(next);
      return next;
    });
  }, []);

  const rememberMissionEvents = useCallback((missionId: string, events: BackendMissionTimelineEvent[]) => {
    setMissionLibrary((current) => {
      const next = upsertMissionEvents(current, missionId, events.map((event) => storedEventFromBackend(event, missionId)));
      writeMissionLibrary(next);
      return next;
    });
  }, []);

  const loadStoredOrbit = useCallback(async (orbit: StoredOrbit) => {
    const storedSatellites = orbit.orbitDefinition.satellites ?? (orbit.orbitDefinition.satellite ? [orbit.orbitDefinition.satellite] : []);
    const satellite = storedSatellites[0];
    if (!satellite) {
      toast.error("Stored orbit is missing its orbit definition.");
      return;
    }

    setSatellites(storedSatellites);
    setSelectedSatelliteIds(getInitialSelectedIds(storedSatellites));
    setShowRangeCheck(false);
    setShowManeuvers(false);
    setShowConjunctions(false);
    setTrajectoryAnchorTime(simTime);
    setServerOrbitSnapshots(null);
    setServerGroundTrackSnapshots(null);
    setMissionTrajectoryOverlay(null);
    setActiveWorkspaceOrbitId(orbit.orbitId);

    if (orbit.sourceType.startsWith("MANUAL")) {
      const backendManualOrbitId = orbit.orbitDefinition.backendManualOrbitId ?? orbit.orbitId;
      setActiveDataSource("manual");
      setManualOrbitId(backendManualOrbitId);
      try {
        const currentState = await fetchManualOrbitState(backendManualOrbitId, simTime.toISOString());
        setServerStateBySatelliteId(new Map([[satellite.id, backendStateToOrbitState(satellite.id, currentState)]]));
      } catch (error) {
        setServerStateBySatelliteId(new Map());
        toast.error(userErrorMessage(error, "Unable to load manual orbit state."));
      }
    } else {
      setActiveDataSource(orbit.sourceType === "CATALOG_TLE" ? "backend" : "endpoint");
      setManualOrbitId(null);
      setServerStateBySatelliteId(new Map());
    }

    const linkedMission = missionLibrary.missions.find((item) => item.orbitId === orbit.orbitId) ?? null;
    if (linkedMission) {
      setActiveWorkspaceMissionId(linkedMission.missionId);
    }
    setMessages([`Loaded orbit "${orbit.orbitName}" from Orbit Library.`]);
    toast.success("Orbit loaded from library.");
  }, [missionLibrary.missions, simTime]);

  const openStoredMission = useCallback((storedMission: StoredMission) => {
    const backendMission = missionFromStoredMission(storedMission);
    setActiveWorkspaceMissionId(storedMission.missionId);
    if (!backendMission) {
      setTimelineStatus("This cloned/imported mission is stored locally. Recreate it against the backend before trajectory generation.");
      toast.info("Local mission opened as a library draft.");
      setMissionTimelineEvents(eventsFromStoredMission(missionLibrary, storedMission.missionId));
      return;
    }
    setMission(backendMission);
    setMissionTimelineEvents(eventsFromStoredMission(missionLibrary, storedMission.missionId));
    setTimelineStatus("Mission opened from library.");
    toast.success("Mission opened from library.");
  }, [missionLibrary]);

  const renameStoredOrbit = useCallback((orbit: StoredOrbit) => {
    const name = window.prompt("Rename orbit", orbit.orbitName)?.trim();
    if (!name) {
      return;
    }
    saveOrbitLibrary(upsertOrbit(orbitLibrary, { ...orbit, orbitName: name }));
  }, [orbitLibrary, saveOrbitLibrary]);

  const renameStoredMission = useCallback((storedMission: StoredMission) => {
    const name = window.prompt("Rename mission", storedMission.missionName)?.trim();
    if (!name) {
      return;
    }
    saveMissionLibrary(upsertMission(missionLibrary, { ...storedMission, missionName: name }));
  }, [missionLibrary, saveMissionLibrary]);

  const deleteStoredOrbit = useCallback((orbit: StoredOrbit) => {
    if (!window.confirm(`Delete orbit "${orbit.orbitName}" and its local missions?`)) {
      return;
    }
    const result = deleteOrbit(orbitLibrary, missionLibrary, orbit.orbitId);
    saveOrbitLibrary(result.orbits);
    saveMissionLibrary(result.missionState);
    if (activeWorkspaceOrbitId === orbit.orbitId) {
      setActiveWorkspaceOrbitId(null);
      setActiveWorkspaceMissionId(null);
    }
  }, [activeWorkspaceOrbitId, missionLibrary, orbitLibrary, saveMissionLibrary, saveOrbitLibrary]);

  const deleteStoredMission = useCallback((storedMission: StoredMission) => {
    if (!window.confirm(`Delete local mission "${storedMission.missionName}"? Backend records are not deleted.`)) {
      return;
    }
    const next = deleteMission(missionLibrary, storedMission.missionId);
    saveMissionLibrary(next);
    if (activeWorkspaceMissionId === storedMission.missionId) {
      setActiveWorkspaceMissionId(null);
    }
  }, [activeWorkspaceMissionId, missionLibrary, saveMissionLibrary]);

  const cloneStoredOrbit = useCallback((orbit: StoredOrbit, cloneMissions: boolean) => {
    const result = duplicateOrbit(orbitLibrary, orbit.orbitId, cloneMissions, missionLibrary);
    saveOrbitLibrary(result.orbits);
    saveMissionLibrary(result.missionState);
    if (result.clonedOrbitId) {
      setActiveWorkspaceOrbitId(result.clonedOrbitId);
      toast.success(cloneMissions ? "Orbit and missions cloned locally." : "Orbit cloned locally.");
    }
  }, [missionLibrary, orbitLibrary, saveMissionLibrary, saveOrbitLibrary]);

  const cloneStoredMission = useCallback((storedMission: StoredMission) => {
    const result = duplicateMission(missionLibrary, storedMission.missionId);
    saveMissionLibrary(result.missionState);
    if (result.clonedMissionId) {
      setActiveWorkspaceMissionId(result.clonedMissionId);
      toast.success("Mission cloned locally.");
    }
  }, [missionLibrary, saveMissionLibrary]);

  const exportStoredOrbit = useCallback((orbit: StoredOrbit) => {
    downloadJson(`${orbit.orbitName.replaceAll(/\s+/g, "-").toLowerCase()}-orbit.json`, orbit);
  }, []);

  const exportStoredMission = useCallback((storedMission: StoredMission) => {
    const events = missionLibrary.events.filter((event) => event.missionId === storedMission.missionId);
    downloadJson(`${storedMission.missionName.replaceAll(/\s+/g, "-").toLowerCase()}-mission.json`, {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      ownerMode: "anonymous",
      orbits: orbitLibrary.filter((orbit) => orbit.orbitId === storedMission.orbitId),
      missions: [storedMission],
      events,
    } satisfies StoredWorkspace);
  }, [missionLibrary.events, orbitLibrary]);

  const exportWorkspace = useCallback(() => {
    downloadJson("orbit-mission-workspace.json", buildWorkspace(orbitLibrary, missionLibrary));
  }, [missionLibrary, orbitLibrary]);

  const importWorkspaceFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const workspace = validateWorkspaceImport(JSON.parse(text));
      const nextOrbitLibrary = [
        ...orbitLibrary.filter((orbit) => !workspace.orbits.some((imported) => imported.orbitId === orbit.orbitId)),
        ...workspace.orbits,
      ];
      const importedMissionIds = new Set(workspace.missions.map((item) => item.missionId));
      const nextMissionLibrary: MissionLibraryState = {
        schemaVersion: 1,
        missions: [
          ...missionLibrary.missions.filter((item) => !importedMissionIds.has(item.missionId)),
          ...workspace.missions,
        ],
        events: [
          ...missionLibrary.events.filter((item) => !importedMissionIds.has(item.missionId)),
          ...workspace.events,
        ],
      };
      saveOrbitLibrary(nextOrbitLibrary);
      saveMissionLibrary(nextMissionLibrary);
      writeWorkspace({ ...workspace, orbits: nextOrbitLibrary, missions: nextMissionLibrary.missions, events: nextMissionLibrary.events });
      toast.success("Workspace JSON imported.");
    } catch (error) {
      toast.error(userErrorMessage(error, "Invalid workspace JSON."));
    }
  }, [missionLibrary, orbitLibrary, saveMissionLibrary, saveOrbitLibrary]);

  const loadTleText = useCallback((raw: string) => {
    const result = parseSatelliteSource(raw);
    const defaultSelectedIds = getInitialSelectedIds(result.satellites);
    setMessages(result.errors);
    setSatellites(result.satellites);
    setSelectedSatelliteIds(defaultSelectedIds);
    setShowRangeCheck(false);
    setShowManeuvers(false);
    setShowConjunctions(false);
    setTrajectoryAnchorTime(simTime);
    return result;
  }, [simTime]);

  const updateSatelliteVisual = useCallback((
    satelliteId: string,
    key: keyof SatelliteVisualSettings,
    value: boolean,
  ) => {
    setSatellites((current) =>
      current.map((satellite) =>
        satellite.id === satelliteId
          ? {
              ...satellite,
              visual: {
                ...satellite.visual,
                [key]: value,
              },
            }
          : satellite,
      ),
    );
  }, []);

  const keepSatelliteInSelection = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      if (current.includes(satelliteId)) {
        return current;
      }

      if (!showRangeCheck) {
        return [satelliteId];
      }

      if (current.length >= 2) {
        return [current[1], satelliteId];
      }

      return [...current, satelliteId];
    });
  }, [showRangeCheck]);

  const updateSatelliteLayer = useCallback((
    satelliteId: string,
    key: keyof SatelliteVisualSettings,
    value: boolean,
  ) => {
    updateSatelliteVisual(satelliteId, key, value);

    if (value && ["showOrbit", "showTrail", "showGroundTrack"].includes(key)) {
      keepSatelliteInSelection(satelliteId);
    }
  }, [keepSatelliteInSelection, updateSatelliteVisual]);

  const toggleSatelliteSelection = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      if (!showRangeCheck) {
        return [satelliteId];
      }

      if (current.includes(satelliteId)) {
        return current.filter((id) => id !== satelliteId);
      }

      if (current.length >= 2) {
        return [current[1], satelliteId];
      }

      return [...current, satelliteId];
    });
  }, [showRangeCheck]);

  const updateRangePrimary = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      const currentSecondaryId = current[1] && current[1] !== satelliteId
        ? current[1]
        : getFirstDifferentSatelliteId(satellites, satelliteId);

      return currentSecondaryId ? [satelliteId, currentSecondaryId] : [satelliteId];
    });
  }, [satellites]);

  const updateRangeSecondary = useCallback((satelliteId: string) => {
    setSelectedSatelliteIds((current) => {
      const currentPrimaryId = current[0] && current[0] !== satelliteId
        ? current[0]
        : getFirstDifferentSatelliteId(satellites, satelliteId);

      return currentPrimaryId ? [currentPrimaryId, satelliteId] : [satelliteId];
    });
  }, [satellites]);

  const toggleRangeCheck = useCallback(() => {
    if (!canUseRangeCheck) {
      setShowRangeCheck(false);
      setSelectedSatelliteIds((selectedIds) => selectedIds.slice(-1));
      return;
    }
    if (showRangeCheck) {
      setSelectedSatelliteIds((selectedIds) => selectedIds.slice(-1));
    }
    setShowRangeCheck((current) => !current);
  }, [canUseRangeCheck, showRangeCheck]);

  const handleCreateManualOrbit = useCallback(async (request: CreateManualOrbitRequest) => {
    setMessages([`Creating ${request.type.replaceAll("_", " ").toLowerCase()} orbit...`]);
    const orbit = await createManualOrbit(request);
    const satellite = manualOrbitToSatellite(orbit);
    rememberOrbit(storedOrbitFromManualOrbit(request, orbit, satellite));
    setSatellites([satellite]);
    setSelectedSatelliteIds([satellite.id]);
    setShowRangeCheck(false);
    setShowManeuvers(false);
    setShowConjunctions(false);
    setActiveDataSource("manual");
    setManualOrbitId(orbit.id);
    setTrajectoryAnchorTime(simTime);
    const currentState = await fetchManualOrbitState(orbit.id, simTime.toISOString());
    setServerStateBySatelliteId(new Map([[satellite.id, backendStateToOrbitState(satellite.id, currentState)]]));
    setServerOrbitSnapshots(null);
    setServerGroundTrackSnapshots(null);
    setMessages([`Manual orbit "${orbit.name}" created and loaded.`]);
    setActiveSourceModal(null);
  }, [rememberOrbit, simTime]);

  const handleLoadImportedTle = useCallback((raw: string, sourceLabel: string) => {
    const result = loadTleText(raw);
    if (result.satellites.length > 0) {
      storedOrbitsFromImportedTle(result.satellites, raw, sourceLabel).forEach(rememberOrbit);
      setActiveDataSource("endpoint");
      setManualOrbitId(null);
      setActiveSourceModal(null);
    }
    setMessages(
      result.errors.length > 0
        ? result.errors
        : [`Loaded ${result.satellites.length} satellites from ${sourceLabel}.`],
    );
    return result;
  }, [loadTleText, rememberOrbit]);

  const handleLoadCatalogSatellite = useCallback((satellite: SatelliteObject) => {
    rememberOrbit(storedOrbitFromCatalogSatellite(satellite, backendCatalogGroup));
    setSatellites([satellite]);
    setSelectedSatelliteIds([satellite.id]);
    setShowRangeCheck(false);
    setShowManeuvers(false);
    setShowConjunctions(false);
    setActiveDataSource("backend");
    setManualOrbitId(null);
    setTrajectoryAnchorTime(simTime);
    setServerStateBySatelliteId(new Map());
    setServerOrbitSnapshots(null);
    setServerGroundTrackSnapshots(null);
    setMessages([`Loaded ${satellite.name} from backend catalog ${backendCatalogGroup}.`]);
    setActiveSourceModal(null);
  }, [backendCatalogGroup, rememberOrbit, simTime]);

  const updateSelectedAnalysisConfig = useCallback(async (
    action: (noradId: string) => Promise<BackendAnalysisConfigResponse>,
    successMessage: string,
  ) => {
    if (!selectedNoradId || !canUseAnalysisConfig) {
      setAnalysisMessage("Analysis config is available for backend catalog orbits only.");
      return;
    }

    try {
      const response = await action(selectedNoradId);
      setAnalysisConfig(response);
      setAnalysisMessage(successMessage);
      setBackendRequestsPaused(false);
      setServerOrbitSnapshots(null);
      setTrajectoryAnchorTime(simTimeRef.current);
    } catch (error) {
      setAnalysisMessage(error instanceof Error ? error.message : "Unable to update analysis configuration.");
    }
  }, [canUseAnalysisConfig, selectedNoradId]);

  const applySelectedPreset = useCallback((preset: AnalysisPresetId) => {
    updateSelectedAnalysisConfig(
      (noradId) => applyAnalysisPreset(noradId, preset),
      `Applied ${preset.replaceAll("_", " ").toLowerCase()} preset.`,
    );
  }, [updateSelectedAnalysisConfig]);

  const toggleSelectedMode = useCallback((mode: string, enabled: boolean) => {
    updateSelectedAnalysisConfig(
      (noradId) => setAnalysisMode(noradId, mode, enabled),
      `${mode.toUpperCase()} ${enabled ? "enabled" : "disabled"}.`,
    );
  }, [updateSelectedAnalysisConfig]);

  const openOrbitSource = useCallback((source: OrbitSourceId) => {
    setActiveSourceModal(source);
    setIsSourcePickerOpen(false);
  }, []);

  const refreshMissionTimeline = useCallback(async (missionId: string) => {
    const events = await fetchMissionTimelineEvents(missionId);
    setMissionTimelineEvents(events);
    setSelectedTimelineEventId((current) => events.some((event) => event.id === current) ? current : events[0]?.id ?? null);
    rememberMissionEvents(missionId, events);
    return events;
  }, [rememberMissionEvents]);

  const openMissionSetup = useCallback(() => {
    if (!selectedSnapshot?.satellite || (!selectedNoradId && !manualOrbitId)) {
      const message = "Select a catalog or manual backend orbit first.";
      setTimelineStatus(message);
      toast.error(message);
      return;
    }
    setMissionSetupDraft(missionSetupDraftFor(selectedSnapshot.satellite, simTimeRef.current));
    setIsMissionSetupOpen(true);
  }, [manualOrbitId, selectedNoradId, selectedSnapshot]);

  const initializeMissionTimeline = useCallback(async () => {
    if (!selectedSnapshot?.satellite || (!selectedNoradId && !manualOrbitId)) {
      const message = "Select a catalog or manual backend orbit first.";
      setTimelineStatus(message);
      toast.error(message);
      return;
    }
    const errors = validateMissionSetupDraft(missionSetupDraft);
    if (Object.keys(errors).length > 0) {
      const message = Object.values(errors)[0] ?? "Fix mission setup fields.";
      setTimelineStatus(message);
      toast.error(message);
      return;
    }
    setTimelineStatus("Creating mission timeline...");
    try {
      const { startIso, endIso } = missionWindowFromDraft(missionSetupDraft);
      const created = await createMission({
        name: missionSetupDraft.name.trim(),
        ...(manualOrbitId ? { subjectOrbitId: manualOrbitId } : { subjectNoradId: Number(selectedNoradId) }),
        propagatorType: "NUMERICAL",
        scenarioStart: startIso,
        scenarioEnd: endIso,
      });
      setMission(created);
      if (activeStoredOrbit) {
        rememberMission(created, activeStoredOrbit.orbitId);
      }
      await refreshMissionTimeline(created.id);
      setIsMissionSetupOpen(false);
      setTimelineStatus("Mission timeline initialized.");
      toast.success("Mission timeline initialized.");
    } catch (error) {
      const message = userErrorMessage(error, "Unable to initialize mission timeline.");
      setTimelineStatus(message);
      toast.error(message);
    }
  }, [activeStoredOrbit, manualOrbitId, missionSetupDraft, refreshMissionTimeline, rememberMission, selectedNoradId, selectedSnapshot]);

  const openCreateTimelineModal = useCallback((type: TimelineEditorDraft["type"] = "FINITE_BURN") => {
    setTimelineDraft({
      ...defaultTimelineDraft,
      type,
      name: type === "COAST" ? "Coast" : "Finite Burn",
      executionDateUtc: utcIsoToDateInput(simTimeRef.current.toISOString()),
      executionTimeUtc: utcIsoToTimeInput(simTimeRef.current.toISOString()),
    });
    setTimelineModalMode("create");
  }, []);

  const openEditTimelineModal = useCallback((event: BackendMissionTimelineEvent) => {
    setTimelineDraft(timelineDraftFromEvent(event));
    setSelectedTimelineEventId(event.id);
    setTimelineModalMode("edit");
  }, []);

  const saveTimelineEvent = useCallback(async () => {
    if (!mission) {
      const message = "Initialize a mission before editing the timeline.";
      setTimelineStatus(message);
      toast.error(message);
      return;
    }

    const errors = validateTimelineDraft(timelineDraft);
    if (Object.keys(errors).length > 0) {
      const message = Object.values(errors)[0] ?? "Fix timeline event fields.";
      setTimelineStatus(message);
      toast.error(message);
      return;
    }
    const executionIso = utcDateAndTimeInputToIso(timelineDraft.executionDateUtc, timelineDraft.executionTimeUtc);
    const windowError = eventWindowError(mission, executionIso);
    if (windowError) {
      setTimelineStatus(windowError);
      toast.error(windowError);
      return;
    }

    setTimelineStatus("Saving timeline event...");
    try {
      if (timelineModalMode === "edit" && selectedTimelineEvent) {
        const request = buildTimelineRequest(timelineDraft, selectedTimelineEvent.sequenceIndex, selectedTimelineEvent.enabled);
        await updateMissionTimelineEvent(mission.id, selectedTimelineEvent.id, request);
      } else {
        const request = buildTimelineRequest(timelineDraft, missionTimelineEvents.length, true);
        await createMissionTimelineEvent(mission.id, request);
      }
      await refreshMissionTimeline(mission.id);
      setTimelineModalMode(null);
      setMissionTrajectoryOverlay(null);
      setTimelineStatus("Timeline saved.");
      toast.success("Timeline event saved.");
    } catch (error) {
      const message = userErrorMessage(error, "Unable to save timeline event.");
      setTimelineStatus(message);
      toast.error(message);
    }
  }, [mission, missionTimelineEvents.length, refreshMissionTimeline, selectedTimelineEvent, timelineDraft, timelineModalMode]);

  const deleteTimelineEvent = useCallback(async (event: BackendMissionTimelineEvent) => {
    if (!mission) {
      return;
    }
    setTimelineStatus("Deleting timeline event...");
    try {
      await deleteMissionTimelineEvent(mission.id, event.id);
      await refreshMissionTimeline(mission.id);
      setMissionTrajectoryOverlay(null);
      setTimelineStatus("Timeline event deleted.");
      toast.success("Timeline event deleted.");
    } catch (error) {
      const message = userErrorMessage(error, "Unable to delete timeline event.");
      setTimelineStatus(message);
      toast.error(message);
    }
  }, [mission, refreshMissionTimeline]);

  const toggleTimelineEventEnabled = useCallback(async (event: BackendMissionTimelineEvent) => {
    if (!mission) {
      return;
    }
    setTimelineStatus(event.enabled ? "Disabling event..." : "Enabling event...");
    try {
      await setMissionTimelineEventEnabled(mission.id, event.id, !event.enabled);
      await refreshMissionTimeline(mission.id);
      setMissionTrajectoryOverlay(null);
      setTimelineStatus(event.enabled ? "Event disabled." : "Event enabled.");
      toast.success(event.enabled ? "Event disabled." : "Event enabled.");
    } catch (error) {
      const message = userErrorMessage(error, "Unable to update event state.");
      setTimelineStatus(message);
      toast.error(message);
    }
  }, [mission, refreshMissionTimeline]);

  const reorderTimelineEvent = useCallback(async (sourceEventId: string, targetEventId: string) => {
    if (!mission || sourceEventId === targetEventId) {
      return;
    }
    const sourceIndex = missionTimelineEvents.findIndex((event) => event.id === sourceEventId);
    const targetIndex = missionTimelineEvents.findIndex((event) => event.id === targetEventId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    const next = [...missionTimelineEvents];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setMissionTimelineEvents(next.map((event, index) => ({ ...event, sequenceIndex: index })));
    setTimelineStatus("Reordering timeline...");
    try {
      const reordered = await reorderMissionTimelineEvents(mission.id, next.map((event) => event.id));
      setMissionTimelineEvents(reordered);
      rememberMissionEvents(mission.id, reordered);
      setMissionTrajectoryOverlay(null);
      setTimelineStatus("Timeline reordered.");
    } catch (error) {
      await refreshMissionTimeline(mission.id);
      const message = userErrorMessage(error, "Unable to reorder timeline.");
      setTimelineStatus(message);
      toast.error(message);
    }
  }, [mission, missionTimelineEvents, refreshMissionTimeline, rememberMissionEvents]);

  const generateMissionTrajectory = useCallback(async () => {
    if (!mission || !selectedSnapshot?.satellite) {
      const message = "Initialize a mission before generating a trajectory.";
      setTimelineStatus(message);
      toast.error(message);
      return;
    }
    if (!selectedNoradId && !manualOrbitId) {
      const message = "Mission trajectory preview is available for backend catalog or manual backend orbits.";
      setTimelineStatus(message);
      toast.error(message);
      return;
    }

    const centerTime = trajectoryAnchorTime;
    const start = addMinutes(centerTime, -defaultMissionTrajectoryWindowMinutes);
    const end = addMinutes(centerTime, defaultMissionTrajectoryWindowMinutes);
    setIsMissionTrajectoryLoading(true);
    setTimelineStatus("Generating mission trajectory...");
    try {
      const [missionResponse, legacyResponse] = await Promise.all([
        fetchMissionTrajectory(mission.id, start.toISOString(), end.toISOString(), trajectoryWindowOptions.stepSec),
        manualOrbitId
          ? fetchManualOrbitTrajectory(manualOrbitId, start.toISOString(), end.toISOString(), trajectoryWindowOptions.stepSec, undefined)
          : fetchOrbitTrajectory(selectedNoradId as string | number, start.toISOString(), end.toISOString(), trajectoryWindowOptions.stepSec),
      ]);
      const missionSatellite = missionOverlaySatellite(selectedSnapshot.satellite, "mission");
      const legacySatellite = missionOverlaySatellite(selectedSnapshot.satellite, "legacy");
      setMissionTrajectoryOverlay({
        mission: buildTrajectorySnapshot(missionSatellite, missionResponse.states, centerTime),
        legacy: buildTrajectorySnapshot(legacySatellite, legacyResponse.states, centerTime),
        generatedAt: new Date().toISOString(),
        message: `${missionResponse.states.length} mission samples generated.`,
      });
      setShowMissionComparison(true);
      setTimelineStatus("Mission trajectory generated.");
      toast.success("Mission trajectory generated.");
    } catch (error) {
      const message = userErrorMessage(error, "Unable to generate mission trajectory.");
      setTimelineStatus(message);
      toast.error(message);
    } finally {
      setIsMissionTrajectoryLoading(false);
    }
  }, [manualOrbitId, mission, selectedNoradId, selectedSnapshot, trajectoryAnchorTime, trajectoryWindowOptions.stepSec]);

  const syncConjunctionsFromSpaceTrack = useCallback(async () => {
    setDynamicDataMessage("Syncing public CDM conjunctions from Space-Track...");

    try {
      const response = await refreshConjunctions();
      const loadedIdSet = new Set(loadedNoradIds);
      const parsed = normalizeBackendConjunctions(response.conjunctions)
        .filter((event) => loadedIdSet.has(event.primarySatelliteId) || loadedIdSet.has(event.secondarySatelliteId));
      setConjunctionEvents(parsed);
      setSelectedConjunctionId((current) => parsed.some((event) => event.id === current) ? current : parsed[0]?.id ?? null);
      setDynamicDataMessage(`Synced ${response.conjunctions.length} Space-Track CDM records. ${parsed.length} match loaded satellites.`);
    } catch (error) {
      setDynamicDataMessage(error instanceof Error ? error.message : "Unable to sync Space-Track conjunctions.");
    }
  }, [loadedNoradIds]);

  const handleCesiumClockTick = useCallback((timeIso: string) => {
    viewerClockAvailableRef.current = true;
    setSimTime((current) => {
      const next = new Date(timeIso);
      return Number.isNaN(next.getTime()) || next.getTime() === current.getTime() ? current : next;
    });
  }, []);

  const shiftSimulationTime = useCallback((minutes: number) => {
    setSimTime((current) => {
      const next = new Date(current.getTime() + minutes * 60 * 1000);
      setTrajectoryAnchorTime(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadMission() {
      if (!canUseMissionTimeline || (!selectedNoradId && !manualOrbitId)) {
        await Promise.resolve();
        if (!ignore) {
          setMission(null);
          setMissionTimelineEvents([]);
          setSelectedTimelineEventId(null);
          setMissionTrajectoryOverlay(null);
          setTimelineStatus(null);
        }
        return;
      }

      try {
        const allMissions = await fetchMissions();
        const selectedMission = manualOrbitId
          ? allMissions.find((item) => item.subjectOrbitId === manualOrbitId) ?? null
          : allMissions.find((item) => String(item.subjectNoradId) === String(selectedNoradId)) ?? null;
        if (ignore) {
          return;
        }
        setMission(selectedMission);
        if (selectedMission && activeStoredOrbit) {
          rememberMission(selectedMission, activeStoredOrbit.orbitId);
        }
        setMissionTrajectoryOverlay(null);
        if (!selectedMission) {
          setMissionTimelineEvents([]);
          setSelectedTimelineEventId(null);
          setTimelineStatus(null);
          return;
        }
        const events = await fetchMissionTimelineEvents(selectedMission.id);
        if (!ignore) {
          setMissionTimelineEvents(events);
          setSelectedTimelineEventId((current) => events.some((event) => event.id === current) ? current : events[0]?.id ?? null);
          setTimelineStatus(null);
        }
      } catch (error) {
        if (!ignore) {
          setMission(null);
          setMissionTimelineEvents([]);
          setSelectedTimelineEventId(null);
          setTimelineStatus(error instanceof Error ? error.message : "Unable to load mission timeline.");
        }
      }
    }

    loadMission();

    return () => {
      ignore = true;
    };
  }, [activeStoredOrbit, canUseMissionTimeline, manualOrbitId, rememberMission, selectedNoradId]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    async function loadServerTrajectoryWindows() {
      if (!isServerDrivenSource(activeDataSource)) {
        setServerOrbitSnapshots(null);
        return;
      }
      if (activeDataSource === "manual" && !manualOrbitId) {
        return;
      }
      if (backendRequestsPaused) {
        return;
      }
      if (trajectoryRequestInFlightRef.current) {
        return;
      }

      const centerTime = trajectoryAnchorTime;
      const start = addMinutes(centerTime, -trajectoryOptions.pastMinutes);
      const end = addMinutes(centerTime, trajectoryOptions.futureMinutes);
      const targetSatellites = satellites.filter((satellite) => {
        if (!(showAllOrbits || selectedSatelliteIds.includes(satellite.id))) {
          return false;
        }
        return satellite.visual.showOrbit || satellite.visual.showTrail || satellite.visual.showGroundTrack;
      });
      const nextSnapshots: SatelliteSnapshot[] = [];
      if (targetSatellites.length === 0) {
        setServerOrbitSnapshots([]);
        return;
      }

      trajectoryRequestInFlightRef.current = true;
      try {
        for (const satellite of targetSatellites) {
          if (ignore || controller.signal.aborted) {
            return;
          }
          const noradId = satellite.noradId ?? satellite.id;
          try {
            const response = activeDataSource === "manual" && manualOrbitId
              ? await fetchManualOrbitTrajectory(
                  manualOrbitId,
                  start.toISOString(),
                  end.toISOString(),
                  trajectoryWindowOptions.stepSec,
                  { signal: controller.signal },
                )
              : await fetchOrbitTrajectory(
                  noradId,
                  start.toISOString(),
                  end.toISOString(),
                  trajectoryWindowOptions.stepSec,
                  { signal: controller.signal },
                );
            const states = response.states.map((state) => backendStateToOrbitState(satellite.id, state));
            nextSnapshots.push({
              satellite,
              state: null,
              trajectory: states,
              futureTrajectory: states.filter((state) => new Date(state.timeUtc) >= centerTime),
              pastTrail: states.filter((state) => new Date(state.timeUtc) <= centerTime),
              groundTrack: states,
            });
          } catch (error) {
            if (isAbortError(error)) {
              return;
            }
            nextSnapshots.push({
              satellite,
              state: null,
              error: error instanceof Error ? error.message : "Unable to load backend trajectory.",
            });
            pauseBackendRequests(error);
            break;
          }
        }

        if (!ignore) {
          if (targetSatellites.length > 0 && nextSnapshots.every((snapshot) => snapshot.error)) {
            pauseBackendRequests("Backend trajectory requests are unavailable.");
          }
          setServerOrbitSnapshots(nextSnapshots);
        }
      } finally {
        trajectoryRequestInFlightRef.current = false;
      }
    }

    loadServerTrajectoryWindows();

    return () => {
      ignore = true;
      trajectoryRequestInFlightRef.current = false;
      controller.abort();
    };
  }, [activeDataSource, backendRequestsPaused, manualOrbitId, pauseBackendRequests, satellites, selectedSatelliteIds, showAllOrbits, trajectoryAnchorTime, trajectoryWindowOptions.stepSec]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    async function loadServerGroundTracks() {
      if (!isServerDrivenSource(activeDataSource)) {
        setServerGroundTrackSnapshots(null);
        return;
      }
      if (activeDataSource === "manual" && !manualOrbitId) {
        return;
      }
      if (backendRequestsPaused) {
        return;
      }

      const end = new Date(serverGroundTrackAnchorMs);
      const start = addMinutes(end, -groundTrackRange.pastMinutes);
      const targetSatellites = satellites.filter((satellite) => selectedSatelliteIds.includes(satellite.id));
      const nextSnapshots: SatelliteSnapshot[] = [];

      for (const satellite of targetSatellites) {
        if (ignore || controller.signal.aborted) {
          return;
        }
        const noradId = satellite.noradId ?? satellite.id;
        try {
          const response = activeDataSource === "manual" && manualOrbitId
            ? await fetchManualOrbitTrajectory(
                manualOrbitId,
                start.toISOString(),
                end.toISOString(),
                groundTrackStepSec,
                { signal: controller.signal },
              )
            : await fetchOrbitTrajectory(
                noradId,
                start.toISOString(),
                end.toISOString(),
                groundTrackStepSec,
                { signal: controller.signal },
              );
          nextSnapshots.push({
            satellite,
            state: null,
            groundTrack: response.states.map((state) => backendStateToOrbitState(satellite.id, state)),
          });
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          nextSnapshots.push({
            satellite,
            state: null,
            error: error instanceof Error ? error.message : "Unable to load backend ground track.",
          });
          pauseBackendRequests(error);
          break;
        }
      }

      if (!ignore) {
        if (targetSatellites.length > 0 && nextSnapshots.every((snapshot) => snapshot.error)) {
          pauseBackendRequests("Backend ground-track requests are unavailable.");
        }
        setServerGroundTrackSnapshots(nextSnapshots);
      }
    }

    loadServerGroundTracks();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [activeDataSource, backendRequestsPaused, groundTrackRange.pastMinutes, groundTrackStepSec, manualOrbitId, pauseBackendRequests, satellites, selectedSatelliteIds, serverGroundTrackAnchorMs]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    async function loadServerEventStates() {
      if (!isServerDrivenSource(activeDataSource)) {
        setServerEventStateByKey(new Map());
        return;
      }
      if (activeDataSource === "manual" && !manualOrbitId) {
        return;
      }
      if (backendRequestsPaused) {
        return;
      }

      const requests: Array<{ satellite: SatelliteObject; timeUtc: string }> = [];
      for (const event of maneuverEvents) {
        const satellite = satellites.find((item) => item.id === event.satelliteId || item.noradId === event.satelliteId);
        if (satellite) {
          requests.push({ satellite, timeUtc: event.timeUtc });
        }
      }
      for (const event of conjunctionEvents) {
        if (!event.tcaUtc) {
          continue;
        }
        const primary = satellites.find((item) => item.id === event.primarySatelliteId || item.noradId === event.primarySatelliteId);
        const secondary = satellites.find((item) => item.id === event.secondarySatelliteId || item.noradId === event.secondarySatelliteId);
        if (primary) {
          requests.push({ satellite: primary, timeUtc: event.tcaUtc });
        }
        if (secondary) {
          requests.push({ satellite: secondary, timeUtc: event.tcaUtc });
        }
      }

      const uniqueRequests = [...new Map(requests.map((request) => [
        eventStateKey(request.satellite.id, request.timeUtc),
        request,
      ])).values()];

      const pairs: Array<[string, OrbitState] | null> = [];
      for (const request of uniqueRequests) {
        if (ignore || controller.signal.aborted) {
          return;
        }
        const noradId = request.satellite.noradId ?? request.satellite.id;
        try {
          const state = activeDataSource === "manual" && manualOrbitId
            ? await fetchManualOrbitState(manualOrbitId, request.timeUtc, { signal: controller.signal })
            : await fetchCurrentOrbitState(noradId, request.timeUtc, { signal: controller.signal });
          pairs.push([
            eventStateKey(request.satellite.id, request.timeUtc),
            backendStateToOrbitState(request.satellite.id, state),
          ]);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          pairs.push(null);
          pauseBackendRequests(error);
          break;
        }
      }

      if (!ignore) {
        if (uniqueRequests.length > 0 && pairs.every((pair) => pair === null)) {
          pauseBackendRequests("Backend event-state requests are unavailable.");
        }
        setServerEventStateByKey(new Map(pairs.filter((pair): pair is [string, OrbitState] => pair !== null)));
      }
    }

    loadServerEventStates();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [activeDataSource, backendRequestsPaused, conjunctionEvents, maneuverEvents, manualOrbitId, pauseBackendRequests, satellites]);

  useEffect(() => {
    let ignore = false;
    const loadedIdSet = new Set(loadedNoradIds);

    async function loadManeuvers() {
      try {
        if (loadedNoradIds.length === 0) {
          await Promise.resolve();
          if (!ignore) {
            setManeuverEvents([]);
            setSelectedManeuverId(null);
          }
          return;
        }

        const parsed = normalizeBackendManeuvers(await fetchManeuvers())
          .filter((event) => loadedIdSet.has(event.satelliteId));
        if (!ignore) {
          setManeuverEvents(parsed);
          setSelectedManeuverId((current) => parsed.some((event) => event.id === current) ? current : parsed[0]?.id ?? null);
          setDynamicDataMessage(null);
        }
      } catch (error) {
        if (!ignore) {
          setManeuverEvents([]);
          setSelectedManeuverId(null);
          setDynamicDataMessage(error instanceof Error ? error.message : "Unable to load maneuvers from the backend.");
        }
      }
    }

    loadManeuvers();

    return () => {
      ignore = true;
    };
  }, [loadedNoradIds]);

  useEffect(() => {
    let ignore = false;

    async function loadAnalysisConfig() {
      if (!selectedNoradId || !canUseAnalysisConfig) {
        await Promise.resolve();
        if (!ignore) {
          setAnalysisConfig(null);
          setAnalysisMessage(null);
        }
        return;
      }

      try {
        const response = await fetchAnalysisConfig(selectedNoradId);
        if (!ignore) {
          setAnalysisConfig(response);
          setAnalysisMessage(null);
        }
      } catch (error) {
        if (!ignore) {
          setAnalysisConfig(null);
          setAnalysisMessage(error instanceof Error ? error.message : "Unable to load analysis configuration.");
        }
      }
    }

    loadAnalysisConfig();

    return () => {
      ignore = true;
    };
  }, [canUseAnalysisConfig, selectedNoradId]);

  useEffect(() => {
    let ignore = false;

    async function loadConjunctions() {
      try {
        if (loadedNoradIds.length === 0) {
          await Promise.resolve();
          if (!ignore) {
            setConjunctionEvents([]);
            setSelectedConjunctionId(null);
          }
          return;
        }

        const response = await fetchConjunctions(loadedNoradIds);
        const parsed = normalizeBackendConjunctions(response.conjunctions);
        if (!ignore) {
          setConjunctionEvents(parsed);
          setSelectedConjunctionId((current) => parsed.some((event) => event.id === current) ? current : parsed[0]?.id ?? null);
          setDynamicDataMessage(null);
        }
      } catch (error) {
        if (!ignore) {
          setConjunctionEvents([]);
          setSelectedConjunctionId(null);
          setDynamicDataMessage(error instanceof Error ? error.message : "Unable to load conjunctions from the backend.");
        }
      }
    }

    loadConjunctions();

    return () => {
      ignore = true;
    };
  }, [loadedNoradIds]);

  useEffect(() => {
    const windowStartMs = addMinutes(trajectoryAnchorTime, -trajectoryOptions.pastMinutes).getTime();
    const windowEndMs = addMinutes(trajectoryAnchorTime, trajectoryOptions.futureMinutes).getTime();
    const marginMs = ephemerisRefreshMarginMinutes * 60 * 1000;
    const simTimeMs = simTime.getTime();

    if (simTimeMs < windowStartMs + marginMs || simTimeMs > windowEndMs - marginMs) {
      const nowMs = Date.now();
      if (trajectoryRequestInFlightRef.current || nowMs - lastTrajectoryAnchorShiftMsRef.current < 5000) {
        return;
      }
      lastTrajectoryAnchorShiftMsRef.current = nowMs;
      const timeoutId = window.setTimeout(() => setTrajectoryAnchorTime(simTime), 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [simTime, trajectoryAnchorTime]);

  useEffect(() => {
    if (viewerClockAvailableRef.current) {
      return;
    }

    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }

    lastTickRef.current = Date.now();
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const elapsedMs = lastTickRef.current === null ? 0 : Math.min(now - lastTickRef.current, 250);
      lastTickRef.current = now;

      if (elapsedMs > 0) {
        setSimTime((current) => {
          const nextTime = current.getTime() + elapsedMs * speed;
          return nextTime === current.getTime() ? current : new Date(nextTime);
        });
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [isPlaying, speed]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-zinc-100">
      <div className="absolute inset-0">
        {hasOrbitLoaded ? (
          <CesiumGlobe
            snapshots={snapshots}
            orbitSnapshots={displayOrbitSnapshots}
            rangeMeasurement={rangeMeasurement}
            selectedSatelliteIds={selectedSatelliteIds}
            showAllOrbits={showAllOrbits}
            showLabels={showLabels}
            frameMode={frameMode}
            simTimeIso={simTime.toISOString()}
            isPlaying={isPlaying}
            simulationSpeed={speed}
            currentGmstRad={currentDisplayGmstRad}
            focusRequest={focusRequest}
            maneuverFocusRequest={maneuverFocusRequest}
            maneuverSnapshots={maneuverSnapshots}
            selectedManeuverId={selectedManeuver?.event.id ?? null}
            showManeuvers={effectiveShowManeuvers}
            conjunctionSnapshots={conjunctionSnapshots}
            selectedConjunctionId={selectedConjunction?.event.id ?? null}
            showConjunctions={effectiveShowConjunctions}
            onSelectConjunction={setSelectedConjunctionId}
            onSelectManeuver={setSelectedManeuverId}
            onToggleSatellite={toggleSatelliteSelection}
            resetSignal={resetSignal}
            onClockTick={handleCesiumClockTick}
          />
        ) : (
          <div className="h-full bg-[radial-gradient(circle_at_50%_38%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(135deg,#020617_0%,#050b12_44%,#020617_100%)]" />
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(0,0,0,0.45)_100%)]" />

      <header className="pointer-events-auto absolute top-0 right-0 left-0 z-20 border-b border-cyan-300/20 bg-[#071016]/88 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Multi-Satellite Orbital Operations</h1>
          </div>
          {hasOrbitLoaded && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSourcePickerOpen(true)}
                className="border border-cyan-300/55 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300 hover:text-slate-950"
              >
                Add Orbit
              </button>
              <div className="grid min-w-[520px] grid-cols-4 gap-3 max-lg:min-w-0 max-lg:flex-1 max-sm:grid-cols-2">
                <HudMetric label="Satellites" value={`${satellites.length}/${MAX_TLE_OBJECTS}`} />
                <HudMetric label="Visible" value={String(validCount)} />
                <HudMetric label="Range" value={effectiveShowRangeCheck && rangeMeasurement ? `${formatNumber(rangeMeasurement.distanceKm, 1)} km` : "--"} />
                <HudMetric label="Speed" value={`${speed}x`} />
              </div>
            </div>
          )}
        </div>
      </header>

      {!hasOrbitLoaded && (
        <section className="pointer-events-auto absolute inset-x-4 top-1/2 z-20 mx-auto w-[min(880px,calc(100vw-2rem))] -translate-y-1/2">
          <OrbitSourceSelection variant="center" onSelect={openOrbitSource} />
        </section>
      )}

      {hasOrbitLoaded && (
      <section className="pointer-events-auto absolute top-24 bottom-4 left-4 z-20 w-[360px] max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto pr-1 max-lg:relative max-lg:top-auto max-lg:bottom-auto max-lg:left-auto max-lg:mt-24 max-lg:ml-4 max-lg:max-h-[calc(100vh-7rem)]">
        {messages.length > 0 && (
          <HudPanel className="p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">System Message</p>
            <div className="mt-2 space-y-1 text-xs leading-5 text-amber-100">
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          </HudPanel>
        )}

        {dynamicDataMessage && (
          <HudPanel className="p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Backend Status</p>
            <p className="mt-2 text-xs leading-5 text-cyan-100">{dynamicDataMessage}</p>
          </HudPanel>
        )}

        {hasOrbitLoaded && (
          <HudPanel>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  {selectedSnapshot?.satellite.name ?? "No Target Lock"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{activeDataSource === "manual" ? "Manual Orbit" : `NORAD ${selectedSnapshot?.satellite.noradId ?? selectedSnapshot?.satellite.id ?? "--"}`}</p>
              </div>
              <span className="border border-emerald-300/50 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-emerald-300">
                {selectedSnapshot ? "Tracking" : "Idle"}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
              <Telemetry label="Altitude" value={`${formatNumber(selectedSnapshot?.state?.altitudeKm)} km`} />
              <Telemetry label="Velocity" value={`${formatNumber((selectedSnapshot?.state?.velocityKmps ?? 0) * 3600)} km/h`} />
              <Telemetry label="Latitude" value={`${formatNumber(selectedSnapshot?.state?.latitudeDeg)} deg`} />
              <Telemetry label="Longitude" value={`${formatNumber(selectedSnapshot?.state?.longitudeDeg)} deg`} />
              <Telemetry label="Mission" value={selectedSnapshot?.satellite.metadata?.mission ?? "--"} />
              <Telemetry label="Source" value={selectedSnapshot?.satellite.sourceType ?? "--"} />
            </div>
          </HudPanel>
        )}

        {hasOrbitLoaded && selectedNoradId && canUseAnalysisConfig && (
          <HudPanel className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Analysis Config</p>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">NORAD {selectedNoradId}</p>
              </div>
              <span className="border border-cyan-300/30 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                {analysisConfig?.config.propagatorType.replaceAll("_", " ") ?? "--"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {analysisPresetOptions.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applySelectedPreset(preset.id)}
                  className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${
                    analysisConfig?.config.preset === preset.id
                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                      : "border-cyan-300/25 text-cyan-100 hover:border-cyan-300"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {analysisModeOptions.map((mode) => {
                const checked = Boolean(analysisConfig?.config[mode.key]);
                return (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleSelectedMode(mode.id, !checked)}
                    className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${
                      checked
                        ? "border-lime-300 bg-lime-300/15 text-lime-100"
                        : "border-white/10 text-zinc-500 hover:border-lime-300/60 hover:text-zinc-200"
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <DetailMetric label="Gravity" value={`${analysisConfig?.config.gravityDegree ?? "--"} x ${analysisConfig?.config.gravityOrder ?? "--"}`} />
              <DetailMetric label="Preset" value={analysisConfig?.config.preset.replaceAll("_", " ") ?? "--"} />
            </div>
            {analysisConfig && analysisConfig.warnings.length > 0 && (
              <p className="mt-2 line-clamp-3 text-[10px] leading-4 text-amber-100" title={analysisConfig.warnings[0]}>
                {analysisConfig.warnings[0]}
              </p>
            )}
            {analysisMessage && (
              <div className="mt-3 border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">
                {analysisMessage}
              </div>
            )}
          </HudPanel>
        )}

        {hasOrbitLoaded && (
          <GroundTrackMiniMap
            currentSnapshots={snapshots}
            groundTrackSnapshots={groundTrackSnapshots}
            selectedSatelliteIds={selectedSatelliteIds}
            rangeLabel={groundTrackRange.label}
            rangeOptions={groundTrackRangeOptions}
            selectedRangeId={groundTrackRangeId}
            onRangeChange={setGroundTrackRangeId}
          />
        )}
      </section>
      )}

      {hasOrbitLoaded && (
      <section className="pointer-events-auto absolute top-24 right-4 bottom-4 z-20 w-[340px] max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto pr-1 max-sm:hidden">
        <HudPanel>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Sat Filter</p>
            <button
              type="button"
              onClick={() => setShowAllOrbits((value) => !value)}
              className={`border px-3 py-1 font-mono text-[11px] uppercase transition ${
                showAllOrbits ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-cyan-300/30 text-cyan-200 hover:border-cyan-300"
              }`}
            >
              All Orbits
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-300">
            <span>{effectiveShowRangeCheck ? "Selected range pair" : "Selected satellite"}</span>
            <span className="font-mono text-cyan-200">{selectedSatelliteIds.length}/{effectiveShowRangeCheck ? 2 : 1}</span>
          </div>
          <div className="mt-3 max-h-[34vh] space-y-2 overflow-auto pr-1">
            {snapshots.map((snapshot) => (
              <SatelliteControl
                key={snapshot.satellite.id}
                snapshot={snapshot}
                isSelected={selectedSatelliteIds.includes(snapshot.satellite.id)}
                selectionIndex={selectedSatelliteIds.indexOf(snapshot.satellite.id)}
                onSelect={() => toggleSatelliteSelection(snapshot.satellite.id)}
                onFocus={() => {
                  keepSatelliteInSelection(snapshot.satellite.id);
                  setFocusRequest((request) => ({
                    satelliteId: snapshot.satellite.id,
                    sequence: (request?.sequence ?? 0) + 1,
                  }));
                }}
                onVisualChange={(key, checked) => updateSatelliteLayer(snapshot.satellite.id, key, checked)}
                onMarkerChange={(checked) => updateSatelliteVisual(snapshot.satellite.id, "showMarker", checked)}
                onLabelChange={(checked) => updateSatelliteVisual(snapshot.satellite.id, "showLabel", checked)}
              />
            ))}
          </div>
        </HudPanel>

        <HudPanel>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Range Check</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-cyan-100">{effectiveShowRangeCheck && rangeMeasurement ? `${formatNumber(rangeMeasurement.distanceKm, 1)} km` : "--"}</span>
              <button
                type="button"
                aria-pressed={effectiveShowRangeCheck}
                disabled={!canUseRangeCheck}
                onClick={toggleRangeCheck}
                className={`flex min-w-16 items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase transition ${
                  !canUseRangeCheck
                    ? "cursor-not-allowed border-white/10 text-zinc-600 opacity-60"
                    : effectiveShowRangeCheck
                      ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 text-zinc-500 hover:border-cyan-300"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${effectiveShowRangeCheck ? "bg-cyan-300" : "bg-zinc-600"}`} />
                {effectiveShowRangeCheck ? "On" : "Off"}
              </button>
            </div>
          </div>
          {!effectiveShowRangeCheck ? (
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              {canUseRangeCheck ? "Range is off. Globe clicks select one active satellite only." : "Load at least 2 satellites to enable range check."}
            </p>
          ) : satellites.length < 2 ? (
            <p className="mt-3 text-xs text-zinc-500">Load at least 2 satellites.</p>
          ) : (
            <div className="mt-3 grid gap-2">
              <select
                value={rangePrimaryId}
                onChange={(event) => updateRangePrimary(event.target.value)}
                className="border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
              >
                {!rangePrimaryId && <option value="">Primary: Select satellite</option>}
                {satellites.map((satellite) => (
                  <option key={satellite.id} value={satellite.id}>Primary: {satellite.name}</option>
                ))}
              </select>
              <select
                value={rangeSecondaryId}
                onChange={(event) => updateRangeSecondary(event.target.value)}
                className="border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
              >
                {!rangeSecondaryId && <option value="">Secondary: Select satellite</option>}
                {satellites.map((satellite) => (
                  <option key={satellite.id} value={satellite.id} disabled={satellite.id === rangePrimaryId}>
                    Secondary: {satellite.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </HudPanel>

        <MissionTimelinePanel
          mission={mission}
          events={missionTimelineEvents}
          selectedEventId={selectedTimelineEvent?.id ?? null}
          status={timelineStatus}
          canUseMissionTimeline={canUseMissionTimeline}
          unavailableReason={missionTimelineUnavailableReason}
          subjectSummary={missionSubjectSummary(activeDataSource, selectedSnapshot?.satellite, selectedNoradId, manualOrbitId)}
          isTrajectoryLoading={isMissionTrajectoryLoading}
          showComparison={showMissionComparison}
          trajectoryOverlay={missionTrajectoryOverlay}
          dragEventId={timelineDragEventId}
          onInitializeMission={openMissionSetup}
          onOpenCatalog={() => openOrbitSource("catalog")}
          onCreateEvent={openCreateTimelineModal}
          onEditEvent={openEditTimelineModal}
          onDeleteEvent={deleteTimelineEvent}
          onToggleEvent={toggleTimelineEventEnabled}
          onSelectEvent={setSelectedTimelineEventId}
          onGenerateTrajectory={generateMissionTrajectory}
          onToggleComparison={() => setShowMissionComparison((value) => !value)}
          onDragEvent={setTimelineDragEventId}
          onDropEvent={reorderTimelineEvent}
        />

        <WorkspaceLibraryPanel
          orbitLibrary={orbitLibrary}
          missionLibrary={missionLibrary}
          activeOrbitId={activeStoredOrbit?.orbitId ?? activeWorkspaceOrbitId}
          activeMissionId={activeStoredMission?.missionId ?? activeWorkspaceMissionId}
          onLoadOrbit={loadStoredOrbit}
          onRenameOrbit={renameStoredOrbit}
          onDeleteOrbit={deleteStoredOrbit}
          onCloneOrbitOnly={(orbit) => cloneStoredOrbit(orbit, false)}
          onCloneOrbitWithMissions={(orbit) => cloneStoredOrbit(orbit, true)}
          onExportOrbit={exportStoredOrbit}
          onOpenMission={openStoredMission}
          onRenameMission={renameStoredMission}
          onDeleteMission={deleteStoredMission}
          onCloneMission={cloneStoredMission}
          onExportMission={exportStoredMission}
          onExportWorkspace={exportWorkspace}
          onImportWorkspace={() => workspaceImportInputRef.current?.click()}
        />

        <ManeuverPanel
          maneuverSnapshots={maneuverSnapshots}
          selectedManeuverId={selectedManeuver?.event.id ?? null}
          showManeuvers={effectiveShowManeuvers}
          disabled={!canShowManeuvers}
          onSelectManeuver={setSelectedManeuverId}
          onToggleManeuvers={() => setShowManeuvers((value) => !value)}
          onOpenManeuverModal={() => setIsManeuverModalOpen(true)}
        />

        <ConjunctionPanel
          conjunctionSnapshots={conjunctionSnapshots}
          selectedConjunctionId={selectedConjunction?.event.id ?? null}
          showConjunctions={effectiveShowConjunctions}
          disabled={!canShowConjunctions}
          onSelectConjunction={setSelectedConjunctionId}
          onToggleConjunctions={() => setShowConjunctions((value) => !value)}
          onRefreshConjunctions={syncConjunctionsFromSpaceTrack}
        />
      </section>
      )}

      {hasOrbitLoaded && (
      <section className="pointer-events-auto absolute right-1/2 bottom-4 z-20 w-[min(900px,calc(100vw-2rem))] translate-x-1/2 border border-cyan-300/25 bg-[#071016]/88 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[240px] border-r border-cyan-300/20 pr-4 max-sm:border-r-0">
            <p className="font-mono text-[10px] uppercase text-zinc-500">Simulation Time</p>
            <p className="mt-1 font-mono text-sm font-semibold text-zinc-100">{formatUtc(simTime)}</p>
          </div>
          <div className="border-r border-cyan-300/20 pr-4 max-sm:border-r-0">
            <p className="font-mono text-[10px] uppercase text-zinc-500">Frame</p>
            <div className="mt-1 grid grid-cols-2 border border-cyan-300/20">
              {[
                { id: "earth-fixed" as const, label: "Fixed" },
                { id: "inertial" as const, label: "Inertial" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFrameMode(item.id)}
                  className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition ${
                    frameMode === item.id
                      ? "bg-cyan-300 text-slate-950"
                      : "text-cyan-200 hover:bg-cyan-300/10"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ControlButton label="-10" onClick={() => shiftSimulationTime(-10)} />
            <ControlButton label="-1" onClick={() => shiftSimulationTime(-1)} />
            <button
              onClick={() => setIsPlaying((value) => !value)}
              className={`min-w-32 border px-5 py-2 font-mono text-sm font-semibold uppercase tracking-[0.18em] transition ${
                isPlaying ? "border-emerald-300 bg-emerald-300/10 text-emerald-200" : "border-cyan-300 bg-cyan-300 text-slate-950"
              }`}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <ControlButton label="+1" onClick={() => shiftSimulationTime(1)} />
            <ControlButton label="+10" onClick={() => shiftSimulationTime(10)} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {speedPresetOptions.map((item) => (
              <button
                key={item.speed}
                onClick={() => setSpeed(item.speed)}
                className={`border px-3 py-2 font-mono text-xs transition ${
                  speed === item.speed ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-cyan-300/20 text-cyan-200 hover:border-cyan-300"
                }`}
                title={`${item.speed}x`}
              >
                {item.label}
              </button>
            ))}
            <div className={`flex items-center border transition ${isPresetSpeed ? "border-cyan-300/20" : "border-cyan-300 bg-cyan-300/10"}`}>
              <button
                type="button"
                onClick={applyCustomSpeed}
                className={`px-3 py-2 font-mono text-xs uppercase transition ${
                  isPresetSpeed ? "text-cyan-200 hover:bg-cyan-300/10" : "text-cyan-100"
                }`}
              >
                Custom
              </button>
              <input
                value={customSpeedInput}
                onChange={(event) => setCustomSpeedInput(event.target.value)}
                onBlur={applyCustomSpeed}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyCustomSpeed();
                    event.currentTarget.blur();
                  }
                }}
                inputMode="numeric"
                aria-label="Custom simulation speed multiplier"
                className="h-9 w-14 border-l border-cyan-300/20 bg-black/35 px-2 font-mono text-xs text-cyan-50 outline-none focus:bg-cyan-300/10"
              />
              <span className="pr-2 font-mono text-xs text-cyan-200">x</span>
            </div>
            <ControlButton
              label="Now"
              onClick={() => {
                const now = new Date();
                setSimTime(now);
                setTrajectoryAnchorTime(now);
              }}
            />
            <ControlButton label="Reset" onClick={() => setResetSignal((value) => value + 1)} />
          </div>
        </div>
      </section>
      )}

      {hasOrbitLoaded && (
      <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex flex-col gap-2 max-sm:hidden">
        <IconButton label="Home" onClick={() => setResetSignal((value) => value + 1)} />
        <IconButton label="Labels" active={showLabels} onClick={() => setShowLabels((value) => !value)} />
      </div>
      )}

      {isManeuverModalOpen && (
        <ManeuverModal
          maneuverSnapshots={maneuverSnapshots}
          selectedManeuverId={selectedManeuver?.event.id ?? null}
          onSelectManeuver={setSelectedManeuverId}
          onJumpToManeuver={(snapshot) => {
            setShowManeuvers(true);
            setSelectedManeuverId(snapshot.event.id);
            const eventTime = new Date(snapshot.event.timeUtc);
            setSimTime(eventTime);
            setTrajectoryAnchorTime(eventTime);
            setIsManeuverModalOpen(false);
            keepSatelliteInSelection(snapshot.satellite.id);
            const maneuverState = snapshot.state;
            if (maneuverState) {
              setManeuverFocusRequest((request) => ({
                longitudeDeg: maneuverState.longitudeDeg,
                latitudeDeg: maneuverState.latitudeDeg,
                altitudeKm: maneuverState.altitudeKm,
                sequence: (request?.sequence ?? 0) + 1,
              }));
            }
          }}
          onClose={() => setIsManeuverModalOpen(false)}
        />
      )}

      {timelineModalMode && (
        <TimelineEventModal
          mode={timelineModalMode}
          mission={mission}
          simulationTimeIso={simTime.toISOString()}
          draft={timelineDraft}
          onDraftChange={setTimelineDraft}
          onSave={saveTimelineEvent}
          onClose={() => setTimelineModalMode(null)}
        />
      )}

      {isMissionSetupOpen && (
        <MissionSetupModal
          draft={missionSetupDraft}
          subjectSummary={missionSubjectSummary(activeDataSource, selectedSnapshot?.satellite, selectedNoradId, manualOrbitId)}
          onDraftChange={setMissionSetupDraft}
          onCreate={initializeMissionTimeline}
          onClose={() => setIsMissionSetupOpen(false)}
        />
      )}

      {isSourcePickerOpen && (
        <div className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-black/72 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Select orbit source">
          <div className="w-[min(880px,calc(100vw-2rem))]">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSourcePickerOpen(false)}
                className="border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
              >
                Close
              </button>
            </div>
            <OrbitSourceSelection variant="center" onSelect={openOrbitSource} />
          </div>
        </div>
      )}

      {activeSourceModal && (
        <OrbitSourceModal
          source={activeSourceModal}
          onClose={() => setActiveSourceModal(null)}
          onCreateManualOrbit={handleCreateManualOrbit}
          onLoadImportedTle={handleLoadImportedTle}
          onLoadCatalogSatellite={handleLoadCatalogSatellite}
          backendCatalogGroup={backendCatalogGroup}
          onBackendCatalogGroupChange={setBackendCatalogGroup}
          tleUrl={tleUrl}
          onTleUrlChange={setTleUrl}
        />
      )}
      <input
        ref={workspaceImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={importWorkspaceFile}
      />
      <ToastContainer
        position="bottom-right"
        theme="dark"
        newestOnTop
        closeOnClick
        pauseOnFocusLoss={false}
        toastClassName="!rounded-none !border !border-cyan-300/25 !bg-[#071016] !font-sans !text-sm !text-zinc-100"
        progressClassName="!bg-cyan-300"
      />
    </main>
  );
}

function HudPanel({ children, className = "p-4" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-cyan-300/20 bg-[#071016]/82 shadow-2xl backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

function HudMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-cyan-300/25 bg-black/30 px-4 py-2 text-center">
      <p className="text-xs font-semibold text-zinc-400">{label}</p>
      <p className="font-mono text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

type ManualOrbitFormState = {
  type: ManualOrbitType;
  name: string;
  epoch: string;
  line1: string;
  line2: string;
  semiMajorAxisKm: string;
  eccentricity: string;
  inclinationDeg: string;
  raanDeg: string;
  argumentOfPeriapsisDeg: string;
  trueAnomalyDeg: string;
  xKm: string;
  yKm: string;
  zKm: string;
  vxKmps: string;
  vyKmps: string;
  vzKmps: string;
};

const defaultManualOrbitForm: ManualOrbitFormState = {
  type: "CLASSICAL_ELEMENTS",
  name: "Manual LEO Orbit",
  epoch: new Date().toISOString().slice(0, 16),
  line1: "",
  line2: "",
  semiMajorAxisKm: "7000",
  eccentricity: "0.001",
  inclinationDeg: "51.6",
  raanDeg: "120",
  argumentOfPeriapsisDeg: "45",
  trueAnomalyDeg: "0",
  xKm: "7000",
  yKm: "0",
  zKm: "0",
  vxKmps: "0",
  vyKmps: "7.5",
  vzKmps: "1",
};

const sourceCards = [
  {
    id: "catalog",
    title: "Catalog TLE",
    subtitle: "Browse satellites",
    icon: "catalog",
  },
  {
    id: "tle",
    title: "Import TLE",
    subtitle: "Paste or upload",
    icon: "tle",
  },
  {
    id: "classical",
    title: "Classical Elements",
    subtitle: "Define COE",
    icon: "classical",
  },
  {
    id: "cartesian",
    title: "Cartesian State",
    subtitle: "Position velocity",
    icon: "cartesian",
  },
] satisfies Array<{ id: OrbitSourceId; title: string; subtitle: string; icon: string }>;

function OrbitSourceSelection({
  onSelect,
  variant = "rail",
}: {
  onSelect: (source: OrbitSourceId) => void;
  variant?: "rail" | "center";
}) {
  const isCenter = variant === "center";

  return (
    <HudPanel className={`overflow-hidden p-0 ${isCenter ? "bg-[#071016]/90" : ""}`}>
      <div className={`border-b border-cyan-300/15 bg-cyan-300/[0.03] ${isCenter ? "px-8 py-7 text-center" : "px-5 py-4"}`}>
        {isCenter && (
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
            <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
              <circle cx="24" cy="24" r="5" fill="currentColor" />
              <path d="M8 25c8-15 24-15 32 0M8 23c8 15 24 15 32 0" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M24 4v8M24 36v8M4 24h8M36 24h8" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </div>
        )}
        {isCenter && <p className="mb-2 text-lg font-semibold text-white">No Orbit Loaded</p>}
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Select Orbit Source</p>
        <p className={`mt-2 text-sm leading-6 text-zinc-400 ${isCenter ? "mx-auto max-w-[42ch]" : ""}`}>Choose how you want to define the spacecraft orbit.</p>
      </div>
      <div className={`grid gap-3 p-4 ${isCenter ? "grid-cols-2 p-6 max-sm:grid-cols-1" : "grid-cols-1"}`}>
        {sourceCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className={`group relative overflow-hidden border border-white/10 bg-black/25 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/60 hover:bg-cyan-300/10 hover:shadow-[0_0_30px_rgba(103,232,249,0.12)] ${isCenter ? "p-5" : "p-4"}`}
          >
            <div className="absolute inset-y-0 right-0 w-20 bg-cyan-300/[0.03] opacity-0 transition group-hover:opacity-100" />
            <div className="relative flex items-center gap-3">
              <SourceIcon id={card.icon} />
              <span>
                <span className="block text-sm font-semibold text-white">{card.title}</span>
                <span className="mt-1 block text-xs text-zinc-500">{card.subtitle}</span>
              </span>
            </div>
          </button>
        ))}
      </div>
    </HudPanel>
  );
}

function SourceIcon({ id }: { id: string }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 transition group-hover:border-cyan-200 group-hover:bg-cyan-300/20">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        {id === "catalog" && <path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />}
        {id === "tle" && <path d="M6 4h9l3 3v13H6zM9 10h6M9 14h6M9 18h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />}
        {id === "classical" && <path d="M4 13c4-8 12-8 16 0M4 11c4 8 12 8 16 0M12 4v16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />}
        {id === "cartesian" && <path d="M4 18h16M6 16V5M6 16l5-5M6 16l8-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />}
      </svg>
    </span>
  );
}

function OrbitSourceModal({
  source,
  onClose,
  onCreateManualOrbit,
  onLoadImportedTle,
  onLoadCatalogSatellite,
  backendCatalogGroup,
  onBackendCatalogGroupChange,
  tleUrl,
  onTleUrlChange,
}: {
  source: OrbitSourceId;
  onClose: () => void;
  onCreateManualOrbit: (request: CreateManualOrbitRequest) => Promise<void>;
  onLoadImportedTle: (raw: string, sourceLabel: string) => { satellites: SatelliteObject[]; errors: string[] };
  onLoadCatalogSatellite: (satellite: SatelliteObject) => void;
  backendCatalogGroup: CatalogGroupId;
  onBackendCatalogGroupChange: (group: CatalogGroupId) => void;
  tleUrl: string;
  onTleUrlChange: (value: string) => void;
}) {
  const title = source === "catalog"
    ? "Catalog TLE"
    : source === "tle"
      ? "Import TLE"
      : source === "classical"
        ? "Classical Elements"
        : "Cartesian State";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-[min(980px,94vw)] flex-col overflow-hidden border border-cyan-300/30 bg-[#071016]/96 shadow-2xl">
        <div className="flex items-center justify-between border-b border-cyan-300/20 px-5 py-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Orbit Source Wizard</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 transition hover:border-cyan-300 hover:text-white"
            aria-label="Close orbit source wizard"
            title="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 overflow-auto p-5">
          {source === "catalog" && (
            <CatalogOrbitFlow
              backendCatalogGroup={backendCatalogGroup}
              onBackendCatalogGroupChange={onBackendCatalogGroupChange}
              onLoadCatalogSatellite={onLoadCatalogSatellite}
            />
          )}
          {source === "tle" && (
            <TleImportFlow
              tleUrl={tleUrl}
              onTleUrlChange={onTleUrlChange}
              onLoadImportedTle={onLoadImportedTle}
            />
          )}
          {source === "classical" && (
            <ManualOrbitForm
              mode="CLASSICAL_ELEMENTS"
              onCreate={onCreateManualOrbit}
              onClose={onClose}
            />
          )}
          {source === "cartesian" && (
            <ManualOrbitForm
              mode="CARTESIAN_STATE"
              onCreate={onCreateManualOrbit}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TleImportFlow({
  tleUrl,
  onTleUrlChange,
  onLoadImportedTle,
}: {
  tleUrl: string;
  onTleUrlChange: (value: string) => void;
  onLoadImportedTle: (raw: string, sourceLabel: string) => { satellites: SatelliteObject[]; errors: string[] };
}) {
  const [mode, setMode] = useState<TleImportMode>("paste");
  const [raw, setRaw] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const preview = raw.trim() ? parseSatelliteSource(raw) : { satellites: [], errors: [] };

  const readFile = async (file: File) => {
    const text = await file.text();
    setRaw(text);
    setStatus(`Loaded ${file.name}. Validate the preview, then import.`);
  };

  const fetchUrl = async () => {
    if (!tleUrl.trim()) {
      setStatus("Enter a TLE endpoint URL.");
      return;
    }
    setIsLoading(true);
    setStatus(null);
    try {
      const response = await fetch(getTleFetchUrl(tleUrl), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}.`);
      }
      const text = await response.text();
      setRaw(text);
      setStatus("Endpoint fetched. Review the preview and import.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to fetch TLE endpoint.");
    } finally {
      setIsLoading(false);
    }
  };

  const importTle = () => {
    const result = onLoadImportedTle(raw, mode === "url" ? "URL import" : mode === "upload" ? "uploaded file" : "pasted TLE");
    if (result.satellites.length === 0) {
      setStatus(result.errors[0] ?? "No valid TLE objects found.");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <div className="space-y-2">
        {[
          { id: "paste" as const, label: "Paste TLE" },
          { id: "upload" as const, label: "Upload File" },
          { id: "url" as const, label: "Fetch From URL" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            className={`w-full border px-3 py-3 text-left font-mono text-xs uppercase transition ${mode === item.id ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/10 text-zinc-400 hover:border-cyan-300/50 hover:text-cyan-100"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {mode === "paste" && (
          <textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={12}
            className="w-full resize-none border border-cyan-300/25 bg-black/45 p-4 font-mono text-xs leading-5 text-zinc-100 outline-none transition focus:border-cyan-300"
            placeholder="ISS (ZARYA)&#10;1 25544U ...&#10;2 25544 ..."
          />
        )}
        {mode === "upload" && (
          <FileDropZone onFile={readFile} />
        )}
        {mode === "url" && (
          <div className="grid gap-3">
            <input
              value={tleUrl}
              onChange={(event) => onTleUrlChange(event.target.value)}
              className="border border-cyan-300/25 bg-black/45 px-4 py-3 font-mono text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
              placeholder="https://example.com/catalog.tle"
            />
            <button
              type="button"
              onClick={fetchUrl}
              disabled={isLoading}
              className="w-fit border border-cyan-300/70 px-4 py-2 font-mono text-xs uppercase text-cyan-100 transition hover:bg-cyan-300 hover:text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              {isLoading ? "Fetching" : "Validate Endpoint"}
            </button>
          </div>
        )}

        <div className="border border-white/10 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Preview</p>
              <p className="mt-1 text-sm text-zinc-300">{preview.satellites.length} valid object{preview.satellites.length === 1 ? "" : "s"} detected</p>
            </div>
            <button
              type="button"
              onClick={importTle}
              disabled={preview.satellites.length === 0}
              className="border border-cyan-300 bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-zinc-500"
            >
              Import
            </button>
          </div>
          {preview.errors.length > 0 && (
            <div className="mt-3 space-y-1 text-xs leading-5 text-amber-100">
              {preview.errors.map((error) => <p key={error}>{error}</p>)}
            </div>
          )}
          {status && <p className="mt-3 text-xs leading-5 text-cyan-100">{status}</p>}
        </div>
      </div>
    </div>
  );
}

function FileDropZone({ onFile }: { onFile: (file: File) => void }) {
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      onFile(file);
    }
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFile(file);
    }
  };

  return (
    <label
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="grid min-h-64 cursor-pointer place-items-center border border-dashed border-cyan-300/35 bg-cyan-300/[0.04] p-8 text-center transition hover:border-cyan-300 hover:bg-cyan-300/10 focus-within:border-cyan-300 focus-within:bg-cyan-300/10"
    >
      <input type="file" accept=".tle,.txt,.json" className="sr-only" onChange={onChange} />
      <span>
        <span className="mx-auto grid h-14 w-14 place-items-center border border-cyan-300/35 bg-black/30 text-cyan-100">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M5 20h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
          </svg>
        </span>
        <span className="mt-4 block text-sm font-semibold text-white">Drop a TLE file here</span>
        <span className="mt-1 block text-xs text-zinc-500">or browse from disk</span>
      </span>
    </label>
  );
}

function CatalogOrbitFlow({
  backendCatalogGroup,
  onBackendCatalogGroupChange,
  onLoadCatalogSatellite,
}: {
  backendCatalogGroup: CatalogGroupId;
  onBackendCatalogGroupChange: (group: CatalogGroupId) => void;
  onLoadCatalogSatellite: (satellite: SatelliteObject) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SatelliteObject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const filtered = items.filter((satellite) => {
    const text = `${satellite.name} ${satellite.noradId ?? satellite.id}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const loadCatalog = async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const raw = await fetchCatalogGroupTle(backendCatalogGroup, MAX_TLE_OBJECTS);
      const result = parseSatelliteSource(raw);
      setItems(result.satellites);
      setSelectedId(result.satellites[0]?.id ?? "");
      setStatus(result.errors[0] ?? `Loaded ${result.satellites.length} catalog satellites.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load backend catalog.");
    } finally {
      setIsLoading(false);
    }
  };

  const selected = filtered.find((satellite) => satellite.id === selectedId) ?? items.find((satellite) => satellite.id === selectedId);

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3 border border-white/10 bg-black/25 p-4">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Catalog</span>
          <select
            value={backendCatalogGroup}
            onChange={(event) => onBackendCatalogGroupChange(event.target.value as CatalogGroupId)}
            className="mt-2 w-full border border-cyan-300/25 bg-black/45 px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
          >
            {catalogGroupOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full border border-cyan-300/25 bg-black/45 px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
          placeholder="Search name or NORAD"
        />
        <button
          type="button"
          onClick={loadCatalog}
          disabled={isLoading}
          className="w-full border border-cyan-300 bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
        >
          {isLoading ? "Loading" : "Load Catalog"}
        </button>
        {status && <p className="text-xs leading-5 text-cyan-100">{status}</p>}
      </div>
      <div className="min-h-[360px] border border-white/10 bg-black/25">
        {filtered.length === 0 ? (
          <div className="grid h-full min-h-[360px] place-items-center p-8 text-center text-sm text-zinc-500">
            Load a catalog group to browse satellites.
          </div>
        ) : (
          <div className="max-h-[430px] overflow-auto p-3">
            <div className="space-y-2">
              {filtered.map((satellite) => (
                <button
                  key={satellite.id}
                  type="button"
                  onClick={() => setSelectedId(satellite.id)}
                  className={`w-full border p-3 text-left transition ${selectedId === satellite.id ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-black/25 hover:border-cyan-300/45"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">{satellite.name}</span>
                    <span className="font-mono text-[10px] text-zinc-500">NORAD {satellite.noradId ?? satellite.id}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-white/10 p-4">
          <p className="text-xs text-zinc-500">{selected ? `Selected ${selected.name}` : "Select a satellite to load."}</p>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onLoadCatalogSatellite(selected)}
            className="border border-cyan-300 bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-zinc-500"
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualOrbitForm({
  mode,
  onCreate,
  onClose,
}: {
  mode: "CLASSICAL_ELEMENTS" | "CARTESIAN_STATE";
  onCreate: (request: CreateManualOrbitRequest) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ManualOrbitFormState>(defaultManualOrbitForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [propagatorType, setPropagatorType] = useState<"KEPLERIAN" | "NUMERICAL">("KEPLERIAN");
  const activeForm = form.type === mode ? form : { ...form, type: mode };
  const validation = validateManualOrbitForm(activeForm);
  const isValid = Object.keys(validation).length === 0;

  const update = (key: keyof ManualOrbitFormState, value: string) => {
    setForm((current) => ({ ...current, type: mode, [key]: value }));
    setStatus(null);
  };

  const submit = async () => {
    if (!isValid || isSubmitting) {
      setStatus({ tone: "error", message: "Resolve highlighted fields before creating the orbit." });
      return;
    }
    setIsSubmitting(true);
    setStatus(null);
    try {
      await onCreate({
        ...buildManualOrbitRequest(activeForm),
        propagatorType,
      });
      setStatus({ tone: "success", message: "Orbit created. Loading trajectory on the globe." });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Unable to create manual orbit." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-4 border border-white/10 bg-black/25 p-4">
          <ManualField label="Name" value={activeForm.name} onChange={(value) => update("name", value)} error={validation.name} help="Displayed on the globe and in the satellite list." />
          <ManualField label="Epoch" value={activeForm.epoch} onChange={(value) => update("epoch", value)} error={validation.epoch} type="datetime-local" help="UTC epoch used for the seed state." />

          {mode === "CLASSICAL_ELEMENTS" && (
            <div className="grid grid-cols-2 gap-3">
              <ManualField label="Semi-major Axis" unit="km" value={activeForm.semiMajorAxisKm} onChange={(value) => update("semiMajorAxisKm", value)} error={validation.semiMajorAxisKm} help="Must be greater than Earth radius." />
              <ManualField label="Eccentricity" value={activeForm.eccentricity} onChange={(value) => update("eccentricity", value)} error={validation.eccentricity} help="0 <= e < 1." />
              <ManualField label="Inclination" unit="deg" value={activeForm.inclinationDeg} onChange={(value) => update("inclinationDeg", value)} error={validation.inclinationDeg} help="0 to 180 degrees." />
              <ManualField label="RAAN" unit="deg" value={activeForm.raanDeg} onChange={(value) => update("raanDeg", value)} error={validation.raanDeg} help="Right ascension of ascending node." />
              <ManualField label="Argument of Periapsis" unit="deg" value={activeForm.argumentOfPeriapsisDeg} onChange={(value) => update("argumentOfPeriapsisDeg", value)} error={validation.argumentOfPeriapsisDeg} />
              <ManualField label="True Anomaly" unit="deg" value={activeForm.trueAnomalyDeg} onChange={(value) => update("trueAnomalyDeg", value)} error={validation.trueAnomalyDeg} />
            </div>
          )}

          {mode === "CARTESIAN_STATE" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">Position EME2000</p>
                <div className="grid grid-cols-3 gap-3">
                  <ManualField label="X" unit="km" value={activeForm.xKm} onChange={(value) => update("xKm", value)} error={validation.xKm} />
                  <ManualField label="Y" unit="km" value={activeForm.yKm} onChange={(value) => update("yKm", value)} error={validation.yKm} />
                  <ManualField label="Z" unit="km" value={activeForm.zKm} onChange={(value) => update("zKm", value)} error={validation.zKm} />
                </div>
              </div>
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">Velocity EME2000</p>
                <div className="grid grid-cols-3 gap-3">
                  <ManualField label="VX" unit="km/s" value={activeForm.vxKmps} onChange={(value) => update("vxKmps", value)} error={validation.vxKmps} />
                  <ManualField label="VY" unit="km/s" value={activeForm.vyKmps} onChange={(value) => update("vyKmps", value)} error={validation.vyKmps} />
                  <ManualField label="VZ" unit="km/s" value={activeForm.vzKmps} onChange={(value) => update("vzKmps", value)} error={validation.vzKmps} />
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4 border border-white/10 bg-black/25 p-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Propagator</p>
            <div className="mt-2 grid gap-2">
              {(["KEPLERIAN", "NUMERICAL"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPropagatorType(item)}
                  className={`border px-3 py-2 text-left font-mono text-xs uppercase transition ${propagatorType === item ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/10 text-zinc-400 hover:border-cyan-300/50 hover:text-cyan-100"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Frame</p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">Phase 1 manual states are Earth-centered and interpreted in EME2000.</p>
          </div>
        </aside>
      </div>

      <div className="flex items-center justify-between border-t border-cyan-300/15 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="border border-white/10 px-4 py-2 font-mono text-xs uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {status && (
            <p className={`text-xs ${status.tone === "success" ? "text-lime-100" : "text-rose-100"}`}>{status.message}</p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={isSubmitting}
            className="border border-cyan-300 bg-cyan-300 px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? "Creating" : "Create Orbit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualField({
  label,
  value,
  onChange,
  error,
  unit,
  help,
  type = "text",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  unit?: string;
  help?: string;
  type?: string;
  multiline?: boolean;
}) {
  const baseClass = `w-full border bg-black/45 px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition placeholder:text-zinc-700 ${
    error ? "border-rose-300/70 focus:border-rose-200" : "border-cyan-300/25 focus:border-cyan-300"
  }`;

  return (
    <label className="block" title={help}>
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/70">{label}</span>
        {unit && <span className="font-mono text-[10px] text-zinc-500">{unit}</span>}
      </span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={2} className={`${baseClass} resize-none leading-5`} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} type={type} step="any" className={baseClass} />
      )}
      {error ? (
        <span className="mt-1 block text-[10px] leading-4 text-rose-200">{error}</span>
      ) : help ? (
        <span className="mt-1 block text-[10px] leading-4 text-zinc-600">{help}</span>
      ) : null}
    </label>
  );
}

function validateManualOrbitForm(form: ManualOrbitFormState) {
  const errors: Partial<Record<keyof ManualOrbitFormState, string>> = {};
  if (!form.name.trim()) {
    errors.name = "Required";
  }
  if (form.type === "TLE") {
    if (!form.line1.trim().startsWith("1 ")) {
      errors.line1 = "Line 1 must start with 1";
    }
    if (!form.line2.trim().startsWith("2 ")) {
      errors.line2 = "Line 2 must start with 2";
    }
    return errors;
  }
  if (!form.epoch) {
    errors.epoch = "Required";
  }
  if (form.type === "CLASSICAL_ELEMENTS") {
    validateNumber(form.semiMajorAxisKm, "semiMajorAxisKm", errors, 6378.137);
    validateNumber(form.eccentricity, "eccentricity", errors, 0, 0.999999);
    validateNumber(form.inclinationDeg, "inclinationDeg", errors, 0, 180);
    validateNumber(form.raanDeg, "raanDeg", errors, 0, 360);
    validateNumber(form.argumentOfPeriapsisDeg, "argumentOfPeriapsisDeg", errors, 0, 360);
    validateNumber(form.trueAnomalyDeg, "trueAnomalyDeg", errors, 0, 360);
  }
  if (form.type === "CARTESIAN_STATE") {
    (["xKm", "yKm", "zKm", "vxKmps", "vyKmps", "vzKmps"] as const).forEach((key) => {
      validateNumber(form[key], key, errors);
    });
  }
  return errors;
}

function validateNumber(
  value: string,
  key: keyof ManualOrbitFormState,
  errors: Partial<Record<keyof ManualOrbitFormState, string>>,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors[key] = "Enter a number";
    return;
  }
  if (parsed < min || parsed > max) {
    errors[key] = `Range ${formatNumber(min)} to ${Number.isFinite(max) ? formatNumber(max) : "inf"}`;
  }
}

function buildManualOrbitRequest(form: ManualOrbitFormState): CreateManualOrbitRequest {
  if (form.type === "TLE") {
    return {
      name: form.name.trim(),
      type: "TLE",
      tle: {
        line1: form.line1.trim(),
        line2: form.line2.trim(),
      },
      propagatorType: "TLE_SGP4",
    };
  }
  const epoch = new Date(form.epoch).toISOString();
  if (form.type === "CLASSICAL_ELEMENTS") {
    return {
      name: form.name.trim(),
      type: "CLASSICAL_ELEMENTS",
      epoch,
      frame: "EME2000",
      centralBody: "EARTH",
      propagatorType: "KEPLERIAN",
      classicalElements: {
        semiMajorAxisKm: Number(form.semiMajorAxisKm),
        eccentricity: Number(form.eccentricity),
        inclinationDeg: Number(form.inclinationDeg),
        raanDeg: Number(form.raanDeg),
        argumentOfPeriapsisDeg: Number(form.argumentOfPeriapsisDeg),
        trueAnomalyDeg: Number(form.trueAnomalyDeg),
      },
    };
  }
  return {
    name: form.name.trim(),
    type: "CARTESIAN_STATE",
    epoch,
    frame: "EME2000",
    centralBody: "EARTH",
    propagatorType: "KEPLERIAN",
    cartesianState: {
      positionKm: [Number(form.xKm), Number(form.yKm), Number(form.zKm)],
      velocityKmps: [Number(form.vxKmps), Number(form.vyKmps), Number(form.vzKmps)],
    },
  };
}

function Telemetry({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300/55">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300/55">{label}</p>
      <p className="mt-1 break-words font-mono text-xs font-semibold leading-5 text-zinc-100">{value}</p>
    </div>
  );
}

function ControlButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-cyan-300/20 px-3 py-2 font-mono text-xs text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-300/10"
    >
      {label}
    </button>
  );
}

function IconButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 w-12 border font-mono text-[10px] font-semibold uppercase transition ${
        active
          ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
          : "border-cyan-300/25 bg-[#071016]/82 text-cyan-300 hover:border-cyan-300"
      }`}
      title={label}
    >
      {label.slice(0, 2)}
    </button>
  );
}

function LayerToggle({
  label,
  title,
  tone = "cyan",
  checked,
  onChange,
}: {
  label: string;
  title?: string;
  tone?: "cyan" | "lime" | "zinc";
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const activeClass = tone === "lime"
    ? "border-lime-300 bg-lime-300/15 text-lime-100"
    : "border-cyan-300 bg-cyan-300/15 text-cyan-100";

  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      title={title ?? label}
      className={`border px-2 py-1 font-mono text-[10px] uppercase transition ${
        checked
          ? activeClass
          : "border-white/10 text-zinc-500 hover:border-cyan-300/60 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function formatRelativeMinutes(minutes: number) {
  const absoluteMinutes = Math.abs(minutes);
  if (absoluteMinutes < 1) {
    return "now";
  }

  const value = absoluteMinutes >= 60
    ? `${formatNumber(absoluteMinutes / 60, 1)}h`
    : `${formatNumber(absoluteMinutes, 0)}m`;

  return minutes >= 0 ? `T+${value}` : `T-${value}`;
}

function getManeuverStatusDescription(status: ManeuverEvent["status"]) {
  if (status === "planned") {
    return "Planned means the burn is scheduled or approved, but has not happened yet.";
  }

  if (status === "candidate") {
    return "Candidate means this is a possible burn option being reviewed, not final.";
  }

  return "Executed means the burn already happened and is shown as historical context.";
}

function getConjunctionStatusDescription(status: ConjunctionSnapshot["status"]) {
  if (status === "critical") {
    return "Critical means the closest approach is inside the configured critical miss-distance threshold.";
  }

  if (status === "warning") {
    return "Warning means the satellites pass inside the warning threshold, but not inside the critical threshold.";
  }

  return "Safe means the closest approach stays outside the configured warning threshold.";
}

function WorkspaceLibraryPanel({
  orbitLibrary,
  missionLibrary,
  activeOrbitId,
  activeMissionId,
  onLoadOrbit,
  onRenameOrbit,
  onDeleteOrbit,
  onCloneOrbitOnly,
  onCloneOrbitWithMissions,
  onExportOrbit,
  onOpenMission,
  onRenameMission,
  onDeleteMission,
  onCloneMission,
  onExportMission,
  onExportWorkspace,
  onImportWorkspace,
}: {
  orbitLibrary: StoredOrbit[];
  missionLibrary: MissionLibraryState;
  activeOrbitId: string | null;
  activeMissionId: string | null;
  onLoadOrbit: (orbit: StoredOrbit) => void;
  onRenameOrbit: (orbit: StoredOrbit) => void;
  onDeleteOrbit: (orbit: StoredOrbit) => void;
  onCloneOrbitOnly: (orbit: StoredOrbit) => void;
  onCloneOrbitWithMissions: (orbit: StoredOrbit) => void;
  onExportOrbit: (orbit: StoredOrbit) => void;
  onOpenMission: (mission: StoredMission) => void;
  onRenameMission: (mission: StoredMission) => void;
  onDeleteMission: (mission: StoredMission) => void;
  onCloneMission: (mission: StoredMission) => void;
  onExportMission: (mission: StoredMission) => void;
  onExportWorkspace: () => void;
  onImportWorkspace: () => void;
}) {
  const missionsByOrbit = useMemo(() => {
    const map = new Map<string, StoredMission[]>();
    missionLibrary.missions.forEach((mission) => {
      const current = map.get(mission.orbitId) ?? [];
      current.push(mission);
      map.set(mission.orbitId, current);
    });
    return map;
  }, [missionLibrary.missions]);
  const eventsByMission = useMemo(() => {
    const map = new Map<string, StoredEvent[]>();
    missionLibrary.events.forEach((event) => {
      const current = map.get(event.missionId) ?? [];
      current.push(event);
      map.set(event.missionId, current.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex));
    });
    return map;
  }, [missionLibrary.events]);

  return (
    <HudPanel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Workspace</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {orbitLibrary.length} orbits / {missionLibrary.missions.length} missions / {missionLibrary.events.length} events
          </p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={onImportWorkspace} className="workspace-action">Import</button>
          <button type="button" onClick={onExportWorkspace} className="workspace-action">Export</button>
        </div>
      </div>

      <div className="mt-3 border border-cyan-300/15 bg-black/25 px-3 py-2 text-xs">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Active Context</p>
        <p className="mt-1 text-zinc-300">Orbit: <span className="font-mono text-cyan-100">{activeOrbitId ?? "--"}</span></p>
        <p className="mt-1 text-zinc-300">Mission: <span className="font-mono text-cyan-100">{activeMissionId ?? "--"}</span></p>
      </div>

      <div className="mt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Orbit Library</p>
        <div className="mt-2 max-h-[30vh] space-y-2 overflow-auto pr-1">
          {orbitLibrary.length === 0 ? (
            <p className="border border-white/10 bg-black/25 px-3 py-2 font-mono text-[10px] uppercase text-zinc-600">No saved orbits yet</p>
          ) : (
            orbitLibrary.map((orbit) => {
              const missions = missionsByOrbit.get(orbit.orbitId) ?? [];
              return (
                <div key={orbit.orbitId} className={`border bg-black/25 p-3 ${activeOrbitId === orbit.orbitId ? "border-cyan-300/60" : "border-white/10"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{orbit.orbitName}</p>
                      <p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">{orbit.sourceType.replaceAll("_", " ")}</p>
                    </div>
                    <span className="font-mono text-[10px] text-cyan-200">{missions.length} missions</span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    <button type="button" onClick={() => onLoadOrbit(orbit)} className="workspace-action">Load</button>
                    <button type="button" onClick={() => onRenameOrbit(orbit)} className="workspace-action">Name</button>
                    <button type="button" onClick={() => onExportOrbit(orbit)} className="workspace-action">JSON</button>
                    <button type="button" onClick={() => onDeleteOrbit(orbit)} className="workspace-action danger">Del</button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => onCloneOrbitOnly(orbit)} className="workspace-action">Clone Orbit</button>
                    <button type="button" onClick={() => onCloneOrbitWithMissions(orbit)} className="workspace-action">Clone + Missions</button>
                  </div>
                  {missions.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-2">
                      {missions.map((item) => (
                        <MissionLibraryRow
                          key={item.missionId}
                          mission={item}
                          events={eventsByMission.get(item.missionId) ?? []}
                          active={activeMissionId === item.missionId}
                          onOpen={() => onOpenMission(item)}
                          onRename={() => onRenameMission(item)}
                          onClone={() => onCloneMission(item)}
                          onExport={() => onExportMission(item)}
                          onDelete={() => onDeleteMission(item)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-3 border border-white/10 bg-black/25 px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Auth Ready</p>
        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
          Anonymous local workspace now. Future login can sync this Orbit / Mission / Event graph without changing propagation.
        </p>
      </div>
    </HudPanel>
  );
}

function MissionLibraryRow({
  mission,
  events,
  active,
  onOpen,
  onRename,
  onClone,
  onExport,
  onDelete,
}: {
  mission: StoredMission;
  events: StoredEvent[];
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onClone: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`border px-2 py-2 ${active ? "border-emerald-300/50 bg-emerald-300/[0.04]" : "border-white/10 bg-black/25"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-zinc-100">└ {mission.missionName}</p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">{compactIsoUtc(mission.startTime)} -&gt; {compactIsoUtc(mission.endTime)}</p>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">{events.length} events</span>
      </div>
      {events.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {events.map((event) => (
            <span key={event.eventId} className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${event.type === "FINITE_BURN" ? "border-rose-300/35 text-rose-100" : "border-sky-300/30 text-sky-100"}`}>
              {event.type === "FINITE_BURN" ? "Burn" : "Coast"}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 grid grid-cols-5 gap-1">
        <button type="button" onClick={onOpen} className="workspace-action">Open</button>
        <button type="button" onClick={onRename} className="workspace-action">Name</button>
        <button type="button" onClick={onClone} className="workspace-action">Clone</button>
        <button type="button" onClick={onExport} className="workspace-action">JSON</button>
        <button type="button" onClick={onDelete} className="workspace-action danger">Del</button>
      </div>
    </div>
  );
}

function MissionTimelinePanel({
  mission,
  events,
  selectedEventId,
  status,
  canUseMissionTimeline,
  unavailableReason,
  subjectSummary,
  isTrajectoryLoading,
  showComparison,
  trajectoryOverlay,
  dragEventId,
  onInitializeMission,
  onOpenCatalog,
  onCreateEvent,
  onEditEvent,
  onDeleteEvent,
  onToggleEvent,
  onSelectEvent,
  onGenerateTrajectory,
  onToggleComparison,
  onDragEvent,
  onDropEvent,
}: {
  mission: BackendMission | null;
  events: BackendMissionTimelineEvent[];
  selectedEventId: string | null;
  status: string | null;
  canUseMissionTimeline: boolean;
  unavailableReason: string | null;
  subjectSummary: { label: string; detail: string };
  isTrajectoryLoading: boolean;
  showComparison: boolean;
  trajectoryOverlay: MissionTrajectoryOverlay | null;
  dragEventId: string | null;
  onInitializeMission: () => void;
  onOpenCatalog: () => void;
  onCreateEvent: (type?: TimelineEditorDraft["type"]) => void;
  onEditEvent: (event: BackendMissionTimelineEvent) => void;
  onDeleteEvent: (event: BackendMissionTimelineEvent) => void;
  onToggleEvent: (event: BackendMissionTimelineEvent) => void;
  onSelectEvent: (eventId: string) => void;
  onGenerateTrajectory: () => void;
  onToggleComparison: () => void;
  onDragEvent: (eventId: string | null) => void;
  onDropEvent: (sourceEventId: string, targetEventId: string) => void;
}) {
  return (
    <HudPanel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Mission Timeline</p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">{mission ? mission.name : "No mission"}</p>
        </div>
        {!mission ? (
          <div className="flex items-center gap-1.5">
            {!canUseMissionTimeline && (
              <button
                type="button"
                onClick={onOpenCatalog}
                className="border border-cyan-300/45 px-3 py-1.5 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10"
              >
                Catalog
              </button>
            )}
            <button
              type="button"
              disabled={!canUseMissionTimeline}
              onClick={onInitializeMission}
              className="border border-emerald-300/50 px-3 py-1.5 font-mono text-[10px] uppercase text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-zinc-600"
            >
              Create Mission
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onCreateEvent("COAST")}
              className="border border-white/15 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
            >
              Coast
            </button>
            <button
              type="button"
              onClick={() => onCreateEvent("FINITE_BURN")}
              className="border border-rose-300/50 px-2 py-1.5 font-mono text-[10px] uppercase text-rose-100 transition hover:border-rose-300 hover:bg-rose-300/10"
            >
              Burn
            </button>
          </div>
        )}
      </div>

      {!mission && (
        <div className={`mt-3 border px-3 py-2 text-xs leading-5 ${
          canUseMissionTimeline
            ? "border-emerald-300/20 bg-emerald-300/[0.04] text-emerald-100"
            : "border-amber-300/20 bg-amber-300/[0.04] text-amber-100"
        }`}>
          {canUseMissionTimeline
            ? "Create a mission for this catalog orbit, then add Coast and Finite Burn events."
            : unavailableReason}
        </div>
      )}

      {mission && (
        <div className="mt-3 grid gap-2 border border-cyan-300/15 bg-black/25 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Subject</span>
            <span className="text-right text-zinc-200">{subjectSummary.label}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Identifier</span>
            <span className="text-right font-mono text-[10px] text-zinc-400">{subjectSummary.detail}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Start UTC</span>
            <span className="font-mono text-[10px] text-zinc-200">{compactIsoUtc(mission.scenarioStart)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">End UTC</span>
            <span className="font-mono text-[10px] text-zinc-200">{compactIsoUtc(mission.scenarioEnd)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Duration</span>
            <span className="text-zinc-200">{secondsToDurationLabel(missionDurationSeconds(mission))}</span>
          </div>
          <div className="border-t border-white/10 pt-2 text-[11px] leading-5 text-zinc-500">
            Trajectory generation currently uses a separate preview window centered on the simulation clock.
          </div>
        </div>
      )}

      <div className="mt-3 overflow-hidden border border-white/10 bg-black/25">
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-2">
          {events.length === 0 ? (
            <span className="font-mono text-[10px] uppercase text-zinc-600">Empty timeline</span>
          ) : (
            events.map((event, index) => (
              <span key={event.id} className="flex items-center gap-1">
                <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${event.type === "FINITE_BURN" ? "border-rose-300/45 text-rose-100" : "border-sky-300/35 text-sky-100"}`}>
                  {event.type === "FINITE_BURN" ? "Burn" : "Coast"}
                </span>
                {index < events.length - 1 && <span className="text-zinc-600">→</span>}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 max-h-[34vh] space-y-2 overflow-auto pr-1">
        {events.map((event, index) => (
          <TimelineEventCard
            key={event.id}
            event={event}
            index={index}
            selected={selectedEventId === event.id}
            dragging={dragEventId === event.id}
            onSelect={() => onSelectEvent(event.id)}
            onEdit={() => onEditEvent(event)}
            onDelete={() => onDeleteEvent(event)}
            onToggle={() => onToggleEvent(event)}
            onDragStart={() => onDragEvent(event.id)}
            onDragEnd={() => onDragEvent(null)}
            onDrop={() => {
              if (dragEventId) {
                onDropEvent(dragEventId, event.id);
              }
              onDragEvent(null);
            }}
          />
        ))}
      </div>

      {mission && (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={onGenerateTrajectory}
            disabled={isTrajectoryLoading}
            className="border border-cyan-300 bg-cyan-300 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
          >
            {isTrajectoryLoading ? "Generating" : "Generate Trajectory"}
          </button>
          <button
            type="button"
            disabled={!trajectoryOverlay}
            aria-pressed={showComparison}
            onClick={onToggleComparison}
            className={`border px-3 py-2 font-mono text-[10px] uppercase transition ${
              showComparison && trajectoryOverlay
                ? "border-lime-300 bg-lime-300/15 text-lime-100"
                : "border-white/10 text-zinc-500 hover:border-lime-300/60 hover:text-lime-100 disabled:cursor-not-allowed disabled:text-zinc-700"
            }`}
          >
            Overlay
          </button>
        </div>
      )}

      {trajectoryOverlay && (
        <div className="mt-3 border border-lime-300/20 bg-lime-300/[0.04] px-3 py-2">
          <p className="font-mono text-[10px] uppercase text-lime-200">{showComparison ? "Mission vs Legacy" : "Trajectory Ready"}</p>
          <p className="mt-1 text-xs text-zinc-400">{trajectoryOverlay.message}</p>
        </div>
      )}

      {status && (
        <p className="mt-3 border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-zinc-300">{status}</p>
      )}
    </HudPanel>
  );
}

function TimelineEventCard({
  event,
  index,
  selected,
  dragging,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  event: BackendMissionTimelineEvent;
  index: number;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const parameters = event.parameters ?? {};
  const isBurn = event.type === "FINITE_BURN";
  const summary = isBurn
    ? `${readNumberParameter(parameters, "durationSeconds", 0)}s, ${readNumberParameter(parameters, "thrustNewton", 0)} N, ${readStringParameter(parameters, "directionFrame", "TNW")}`
    : "Coast segment";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(dragEvent) => dragEvent.preventDefault()}
      onDrop={onDrop}
      className={`border bg-black/30 p-3 transition ${
        selected ? "border-cyan-300/70" : "border-white/10 hover:border-cyan-300/45"
      } ${dragging ? "opacity-50" : "opacity-100"}`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">[{index + 1}] {event.name}</span>
            <span className="mt-1 block font-mono text-[10px] uppercase text-zinc-500">{formatUtc(new Date(event.executionTime))}</span>
          </span>
          <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${isBurn ? "border-rose-300/45 text-rose-100" : "border-sky-300/35 text-sky-100"}`}>
            {isBurn ? "Finite" : "Coast"}
          </span>
        </span>
        <span className="mt-2 block truncate text-xs text-zinc-400">{summary}</span>
      </button>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${
            event.enabled ? "border-lime-300/50 text-lime-100 hover:bg-lime-300/10" : "border-white/10 text-zinc-500 hover:border-zinc-300"
          }`}
        >
          {event.enabled ? "On" : "Off"}
        </button>
        <button type="button" onClick={onEdit} className="border border-white/10 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
          Edit
        </button>
        <button type="button" onClick={onDelete} className="border border-white/10 px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-rose-300 hover:text-rose-100">
          Del
        </button>
        <span className="grid place-items-center border border-white/10 font-mono text-[10px] uppercase text-zinc-600" title="Drag to reorder">
          Move
        </span>
      </div>
    </div>
  );
}

function MissionSetupModal({
  draft,
  subjectSummary,
  onDraftChange,
  onCreate,
  onClose,
}: {
  draft: MissionSetupDraft;
  subjectSummary: { label: string; detail: string };
  onDraftChange: (draft: MissionSetupDraft) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const errors = validateMissionSetupDraft(draft);
  const isValid = Object.keys(errors).length === 0;
  const update = (patch: Partial<MissionSetupDraft>) => {
    const next = { ...draft, ...patch };
    if (
      next.durationPreset !== "CUSTOM"
      && (patch.startDateUtc !== undefined || patch.startTimeUtc !== undefined || patch.durationPreset !== undefined)
    ) {
      try {
        onDraftChange(applyMissionDurationPreset(next, next.durationPreset));
      } catch {
        onDraftChange(next);
      }
      return;
    }
    onDraftChange(next);
  };
  const windowPreview = useMemo(() => {
    try {
      return missionWindowFromDraft(draft);
    } catch {
      return null;
    }
  }, [draft]);
  const durationLabel = windowPreview
    ? secondsToDurationLabel(Math.round((new Date(windowPreview.endIso).getTime() - new Date(windowPreview.startIso).getTime()) / 1000))
    : "--";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-[min(720px,94vw)] flex-col overflow-hidden border border-cyan-300/30 bg-[#071016]/96 shadow-2xl">
        <div className="flex items-center justify-between border-b border-cyan-300/20 px-5 py-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Mission Setup</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Define Mission Window</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 transition hover:border-cyan-300 hover:text-white"
            aria-label="Close mission setup modal"
            title="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 overflow-auto p-5">
          <div className="grid gap-4">
            <div className="border border-cyan-300/15 bg-black/25 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Subject Summary</p>
              <p className="mt-1 text-sm font-semibold text-white">{subjectSummary.label}</p>
              <p className="mt-1 font-mono text-[10px] text-zinc-500">{subjectSummary.detail}</p>
            </div>

            <TimelineField label="Mission Name" error={errors.name}>
              <input value={draft.name} onChange={(event) => update({ name: event.target.value })} className="timeline-input" />
            </TimelineField>

            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Duration Preset</span>
              <div className="mt-2 grid grid-cols-5 gap-2 max-sm:grid-cols-2">
                {missionDurationPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => update({ durationPreset: preset.id })}
                    className={`border px-2 py-2 font-mono text-[10px] uppercase transition ${
                      draft.durationPreset === preset.id
                        ? "border-cyan-300 bg-cyan-300 text-slate-950"
                        : "border-white/10 text-zinc-400 hover:border-cyan-300/50 hover:text-cyan-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <div>
                <span className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Mission Start UTC</span>
                  {(errors.startDateUtc || errors.startTimeUtc) && (
                    <span className="font-mono text-[10px] uppercase text-rose-200">{errors.startDateUtc ?? errors.startTimeUtc}</span>
                  )}
                </span>
                <div className="mt-1 grid grid-cols-[minmax(0,1fr)_130px] gap-2">
                  <input type="date" value={draft.startDateUtc} onChange={(event) => update({ startDateUtc: event.target.value })} className="timeline-input" />
                  <input type="time" step="1" value={draft.startTimeUtc} onChange={(event) => update({ startTimeUtc: event.target.value })} className="timeline-input" />
                </div>
              </div>
              <div>
                <span className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Mission End UTC</span>
                  {(errors.endDateUtc || errors.endTimeUtc) && (
                    <span className="font-mono text-[10px] uppercase text-rose-200">{errors.endDateUtc ?? errors.endTimeUtc}</span>
                  )}
                </span>
                <div className="mt-1 grid grid-cols-[minmax(0,1fr)_130px] gap-2">
                  <input
                    type="date"
                    value={draft.endDateUtc}
                    onChange={(event) => update({ endDateUtc: event.target.value, durationPreset: "CUSTOM" })}
                    className="timeline-input"
                  />
                  <input
                    type="time"
                    step="1"
                    value={draft.endTimeUtc}
                    onChange={(event) => update({ endTimeUtc: event.target.value, durationPreset: "CUSTOM" })}
                    className="timeline-input"
                  />
                </div>
              </div>
            </div>

            <div className="border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-zinc-300">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Mission Window Preview</p>
              <p className="mt-1 font-mono text-[11px] text-cyan-100">
                {windowPreview ? `${compactIsoUtc(windowPreview.startIso)} -> ${compactIsoUtc(windowPreview.endIso)}` : "Invalid UTC window"}
              </p>
              <p className="mt-1 text-zinc-500">Duration: {durationLabel}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-cyan-300/20 px-5 py-4">
          <button type="button" onClick={onClose} className="border border-white/10 px-4 py-2 font-mono text-xs uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={!isValid}
            className="border border-cyan-300 bg-cyan-300 px-4 py-2 font-mono text-xs font-semibold uppercase text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-zinc-500"
          >
            Create Mission
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TimelineEventModal({
  mode,
  mission,
  simulationTimeIso,
  draft,
  onDraftChange,
  onSave,
  onClose,
}: {
  mode: TimelineModalMode;
  mission: BackendMission | null;
  simulationTimeIso: string;
  draft: TimelineEditorDraft;
  onDraftChange: (draft: TimelineEditorDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const errors = validateTimelineDraft(draft);
  const update = (patch: Partial<TimelineEditorDraft>) => onDraftChange({ ...draft, ...patch });
  const isoPreview = useMemo(() => {
    try {
      return utcDateAndTimeInputToIso(draft.executionDateUtc, draft.executionTimeUtc);
    } catch {
      return "Invalid UTC timestamp";
    }
  }, [draft.executionDateUtc, draft.executionTimeUtc]);
  const missionWindowError = isoPreview.endsWith("Z") ? eventWindowError(mission, isoPreview) : null;
  const offsetFromMissionStart = mission && isoPreview.endsWith("Z")
    ? signedOffsetLabel(mission.scenarioStart, isoPreview)
    : "--";
  const canSave = Object.keys(errors).length === 0 && !missionWindowError;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-[min(720px,94vw)] flex-col overflow-hidden border border-cyan-300/30 bg-[#071016]/96 shadow-2xl">
        <div className="flex items-center justify-between border-b border-cyan-300/20 px-5 py-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Mission Timeline</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{mode === "edit" ? "Edit Event" : "Create Event"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 transition hover:border-cyan-300 hover:text-white"
            aria-label="Close timeline event modal"
            title="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 overflow-auto p-5">
          <div className="grid grid-cols-2 gap-2">
            {(["COAST", "FINITE_BURN"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => update({ type, name: draft.name || (type === "COAST" ? "Coast" : "Finite Burn") })}
                className={`border px-3 py-2 font-mono text-xs uppercase transition ${
                  draft.type === type ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/10 text-zinc-400 hover:border-cyan-300/50"
                }`}
              >
                {type === "FINITE_BURN" ? "Finite Burn" : "Coast"}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4">
            {mission && (
              <div className="grid gap-2 border border-cyan-300/15 bg-black/25 px-3 py-2 text-xs leading-5 text-zinc-300">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Mission Window</p>
                <p className="font-mono text-[11px] text-cyan-100">{compactIsoUtc(mission.scenarioStart)} -&gt; {compactIsoUtc(mission.scenarioEnd)}</p>
                <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                  <span>Current simulation time: <span className="font-mono text-zinc-100">{compactIsoUtc(simulationTimeIso)}</span></span>
                  <span>Offset: <span className="font-mono text-zinc-100">{offsetFromMissionStart}</span></span>
                </div>
              </div>
            )}
            <TimelineField label="Name" error={errors.name}>
              <input value={draft.name} onChange={(event) => update({ name: event.target.value })} className="timeline-input" />
            </TimelineField>
            <div>
              <span className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Execution Time</span>
                {(errors.executionDateUtc || errors.executionTimeUtc) && (
                  <span className="font-mono text-[10px] uppercase text-rose-200">{errors.executionDateUtc ?? errors.executionTimeUtc}</span>
                )}
              </span>
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_150px_auto] gap-2 max-sm:grid-cols-1">
                <input
                  type="date"
                  value={draft.executionDateUtc}
                  onChange={(event) => update({ executionDateUtc: event.target.value })}
                  className="timeline-input"
                  aria-label="Execution UTC date"
                />
                <input
                  type="time"
                  step="1"
                  value={draft.executionTimeUtc}
                  onChange={(event) => update({ executionTimeUtc: event.target.value })}
                  className="timeline-input"
                  aria-label="Execution UTC time"
                />
                <span className="grid min-h-[42px] place-items-center border border-cyan-300/35 bg-cyan-300/[0.08] px-3 font-mono text-xs font-semibold uppercase text-cyan-100">
                  UTC
                </span>
              </div>
              <p className="mt-2 border border-white/10 bg-black/25 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                ISO UTC: <span className="text-cyan-100">{isoPreview}</span>
              </p>
              {missionWindowError && (
                <p className="mt-2 whitespace-pre-line border border-rose-300/35 bg-rose-300/[0.06] px-3 py-2 text-xs leading-5 text-rose-100">
                  {missionWindowError}
                </p>
              )}
            </div>

            {draft.type === "FINITE_BURN" && (
              <>
                <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                  <TimelineField label="Duration sec" error={errors.durationSeconds}>
                    <input value={draft.durationSeconds} onChange={(event) => update({ durationSeconds: event.target.value })} inputMode="decimal" className="timeline-input" />
                  </TimelineField>
                  <TimelineField label="Thrust N" error={errors.thrustNewton}>
                    <input value={draft.thrustNewton} onChange={(event) => update({ thrustNewton: event.target.value })} inputMode="decimal" className="timeline-input" />
                  </TimelineField>
                  <TimelineField label="ISP sec" error={errors.ispSeconds}>
                    <input value={draft.ispSeconds} onChange={(event) => update({ ispSeconds: event.target.value })} inputMode="decimal" className="timeline-input" />
                  </TimelineField>
                </div>
                <TimelineField label="Attitude Frame">
                  <select value={draft.directionFrame} onChange={(event) => update({ directionFrame: event.target.value as TimelineEditorDraft["directionFrame"] })} className="timeline-input">
                    <option value="TNW">TNW</option>
                    <option value="QSW">QSW</option>
                    <option value="RTN">RTN</option>
                    <option value="LVLH">LVLH</option>
                  </select>
                </TimelineField>
                <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                  <TimelineField label="Direction X" error={errors.directionX}>
                    <input value={draft.directionX} onChange={(event) => update({ directionX: event.target.value })} inputMode="decimal" className="timeline-input" />
                  </TimelineField>
                  <TimelineField label="Direction Y" error={errors.directionY}>
                    <input value={draft.directionY} onChange={(event) => update({ directionY: event.target.value })} inputMode="decimal" className="timeline-input" />
                  </TimelineField>
                  <TimelineField label="Direction Z" error={errors.directionZ}>
                    <input value={draft.directionZ} onChange={(event) => update({ directionZ: event.target.value })} inputMode="decimal" className="timeline-input" />
                  </TimelineField>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-cyan-300/20 px-5 py-4">
          <button type="button" onClick={onClose} className="border border-white/10 px-4 py-2 font-mono text-xs uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="border border-cyan-300 bg-cyan-300 px-4 py-2 font-mono text-xs font-semibold uppercase text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-zinc-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TimelineField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">{label}</span>
        {error && <span className="font-mono text-[10px] uppercase text-rose-200">{error}</span>}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function ManeuverPanel({
  maneuverSnapshots,
  selectedManeuverId,
  showManeuvers,
  disabled,
  onSelectManeuver,
  onToggleManeuvers,
  onOpenManeuverModal,
}: {
  maneuverSnapshots: ManeuverSnapshot[];
  selectedManeuverId: string | null;
  showManeuvers: boolean;
  disabled: boolean;
  onSelectManeuver: (maneuverId: string) => void;
  onToggleManeuvers: () => void;
  onOpenManeuverModal: () => void;
}) {
  const selectedManeuver = maneuverSnapshots.find((snapshot) => snapshot.event.id === selectedManeuverId);
  const handleToggleManeuvers = () => {
    if (disabled) {
      return;
    }
    if (!showManeuvers && !selectedManeuverId && maneuverSnapshots[0]) {
      onSelectManeuver(maneuverSnapshots[0].event.id);
    }

    onToggleManeuvers();
  };

  return (
    <HudPanel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Maneuvers</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={showManeuvers}
            disabled={disabled}
            onClick={handleToggleManeuvers}
            className={`flex min-w-16 items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase transition ${
              disabled
                ? "cursor-not-allowed border-white/10 text-zinc-600 opacity-60"
                : showManeuvers
                  ? "border-fuchsia-300 bg-fuchsia-300/15 text-fuchsia-100"
                  : "border-white/10 text-zinc-500 hover:border-fuchsia-300"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${showManeuvers ? "bg-fuchsia-300" : "bg-zinc-600"}`} />
            {showManeuvers ? "On" : "Off"}
          </button>
          <button
            type="button"
            disabled={maneuverSnapshots.length === 0}
            onClick={onOpenManeuverModal}
            className="grid h-8 w-8 place-items-center border border-fuchsia-300/35 text-fuchsia-100 transition hover:border-fuchsia-300 hover:bg-fuchsia-300/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-zinc-600 disabled:opacity-60"
            aria-label="Open maneuver details"
            title="Open maneuver details"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {maneuverSnapshots.length === 0
          ? "No maneuver events found for the loaded orbit."
          : showManeuvers
            ? `${maneuverSnapshots.length} event markers visible`
            : "Enable to show maneuver markers and event details."}
      </p>
      {showManeuvers && selectedManeuver && (
        <button
          type="button"
          onClick={onOpenManeuverModal}
          className="mt-3 w-full border border-fuchsia-300/25 bg-fuchsia-300/5 px-3 py-2 text-left transition hover:border-fuchsia-300/60"
        >
          <span className="block text-xs font-semibold text-white">{selectedManeuver.event.title}</span>
          <span className="mt-1 flex items-center justify-between font-mono text-[11px] text-zinc-400">
            <span>{selectedManeuver.satellite.name}</span>
            <span>{formatNumber(selectedManeuver.event.deltaVMps, 2)} m/s</span>
          </span>
        </button>
      )}
    </HudPanel>
  );
}

function ManeuverModal({
  maneuverSnapshots,
  selectedManeuverId,
  onSelectManeuver,
  onJumpToManeuver,
  onClose,
}: {
  maneuverSnapshots: ManeuverSnapshot[];
  selectedManeuverId: string | null;
  onSelectManeuver: (maneuverId: string) => void;
  onJumpToManeuver: (snapshot: ManeuverSnapshot) => void;
  onClose: () => void;
}) {
  const selectedManeuver = maneuverSnapshots.find((snapshot) => snapshot.event.id === selectedManeuverId) ?? maneuverSnapshots[0] ?? null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative flex h-[75vh] w-[min(1180px,75vw)] flex-col border border-fuchsia-300/35 bg-[#071016]/95 shadow-2xl max-lg:w-[94vw]">
        <div className="flex items-center justify-between border-b border-fuchsia-300/20 px-5 py-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Backend Maneuver Events</p>
            <h2 className="text-xl font-semibold text-white">Maneuver Events</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 transition hover:border-fuchsia-300 hover:text-white"
            aria-label="Close maneuver modal"
            title="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] gap-4 overflow-hidden p-5 max-lg:grid-cols-1">
          <div className="min-h-0 overflow-auto border border-white/10 bg-black/25 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Event Timeline</p>
            <div className="mt-3 space-y-2">
              {maneuverSnapshots.map((snapshot) => {
                const tone = getManeuverTone(snapshot.event.status);
                const isSelected = selectedManeuver?.event.id === snapshot.event.id;

                return (
                  <button
                    key={snapshot.event.id}
                    type="button"
                    onClick={() => onSelectManeuver(snapshot.event.id)}
                    className={`w-full border p-3 text-left transition ${
                      isSelected ? "border-fuchsia-300 bg-fuchsia-300/10" : "border-white/10 bg-black/30 hover:border-fuchsia-300/45"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-sm font-semibold text-white">{snapshot.event.title}</span>
                        <span className="mt-1 block font-mono text-[10px] uppercase text-zinc-500">{snapshot.satellite.name}</span>
                      </span>
                      <span
                        className="border px-2 py-0.5 font-mono text-[10px]"
                        style={{ borderColor: tone.color, color: tone.color }}
                        title={getManeuverStatusDescription(snapshot.event.status)}
                      >
                        {tone.label}
                      </span>
                    </span>
                    <span className="mt-2 flex items-center justify-between font-mono text-[11px] text-zinc-400">
                      <span>{formatRelativeMinutes(snapshot.minutesFromSimulationTime)}</span>
                      <span>{formatNumber(snapshot.event.deltaVMps, 2)} m/s</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedManeuver ? (
            <div className="min-h-0 overflow-auto border border-white/10 bg-black/25 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-fuchsia-200">Selected Maneuver</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{selectedManeuver.event.title}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">{selectedManeuver.event.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onJumpToManeuver(selectedManeuver)}
                  className="border border-fuchsia-300 bg-fuchsia-300/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-fuchsia-100 transition hover:bg-fuchsia-300 hover:text-slate-950"
                >
                  Jump To Burn
                </button>
              </div>

              <div className="mt-6 grid grid-cols-4 gap-3 max-xl:grid-cols-2">
                <ManeuverMetric label="Satellite" value={selectedManeuver.satellite.name} />
                <ManeuverMetric
                  label="Status"
                  value={getManeuverTone(selectedManeuver.event.status).label}
                  title={getManeuverStatusDescription(selectedManeuver.event.status)}
                />
                <ManeuverMetric label="Type" value={selectedManeuver.event.type.replaceAll("_", " ")} />
                <ManeuverMetric label="Burn Duration" value={`${selectedManeuver.event.durationSec}s`} />
                <ManeuverMetric label="Event Time" value={formatUtc(new Date(selectedManeuver.event.timeUtc))} />
                <ManeuverMetric label="Relative Time" value={formatRelativeMinutes(selectedManeuver.minutesFromSimulationTime)} />
                <ManeuverMetric label="Altitude" value={`${formatNumber(selectedManeuver.state?.altitudeKm)} km`} />
                <ManeuverMetric label="Delta-V" value={`${formatNumber(selectedManeuver.event.deltaVMps, 2)} m/s`} />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                <div className="border border-white/10 bg-black/30 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Delta-V Vector</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">
                    RTN means Radial, Along-track, Cross-track. These values show the planned burn direction components.
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {["R", "T", "N"].map((axis, index) => (
                      <div key={axis} className="border border-white/10 bg-black/35 p-3">
                        <p className="font-mono text-[10px] text-zinc-500">{axis}</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-white">{formatNumber(selectedManeuver.event.deltaVVectorMps[index], 2)} m/s</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/30 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Visual Layers</p>
                  <div className="mt-3 space-y-3 text-sm text-zinc-300">
                    <p>Burn marker: magenta event point on the globe.</p>
                    <p>Vector: arrow from burn point showing the planned direction.</p>
                    <p>Only the selected maneuver shows a burn vector. Other events stay as markers to keep the globe readable.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid place-items-center border border-white/10 bg-black/25 text-sm text-zinc-500">No maneuver events found in the backend database for the loaded satellites.</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ManeuverMetric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="border border-white/10 bg-black/30 p-3" title={title}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300/60">{label}</p>
      <p className="mt-2 break-words font-mono text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ConjunctionPanel({
  conjunctionSnapshots,
  selectedConjunctionId,
  showConjunctions,
  disabled,
  onSelectConjunction,
  onToggleConjunctions,
  onRefreshConjunctions,
}: {
  conjunctionSnapshots: ConjunctionSnapshot[];
  selectedConjunctionId: string | null;
  showConjunctions: boolean;
  disabled: boolean;
  onSelectConjunction: (conjunctionId: string) => void;
  onToggleConjunctions: () => void;
  onRefreshConjunctions: () => void;
}) {
  const selectedConjunction = conjunctionSnapshots.find((snapshot) => snapshot.event.id === selectedConjunctionId) ?? conjunctionSnapshots[0] ?? null;

  return (
    <HudPanel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Conjunctions</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefreshConjunctions}
            className="border border-amber-300/35 px-2 py-1 font-mono text-[10px] uppercase text-amber-100 transition hover:border-amber-300 hover:bg-amber-300/10"
          >
            Sync
          </button>
          <button
            type="button"
            aria-pressed={showConjunctions}
            disabled={disabled}
            onClick={onToggleConjunctions}
            className={`flex min-w-16 items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase transition ${
              disabled
                ? "cursor-not-allowed border-white/10 text-zinc-600 opacity-60"
                : showConjunctions
                  ? "border-amber-300 bg-amber-300/15 text-amber-100"
                  : "border-white/10 text-zinc-500 hover:border-amber-300"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${showConjunctions ? "bg-amber-300" : "bg-zinc-600"}`} />
            {showConjunctions ? "On" : "Off"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {conjunctionSnapshots.length === 0
          ? "No conjunction events found for the loaded satellites."
          : showConjunctions
            ? `${conjunctionSnapshots.length} close-approach pair visible`
            : "Enable to show close-approach links and risk labels."}
      </p>
      {showConjunctions && (
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          Conjunction = a close-approach check between two tracked objects. TCA is the predicted closest-approach time from the backend CDM record.
        </p>
      )}

      {showConjunctions && (
        <div className="mt-3 space-y-2">
          {conjunctionSnapshots.map((snapshot) => {
            const tone = getConjunctionTone(snapshot.status);
            const isSelected = selectedConjunction?.event.id === snapshot.event.id;

            return (
              <button
                key={snapshot.event.id}
                type="button"
                onClick={() => onSelectConjunction(snapshot.event.id)}
                className={`w-full border p-3 text-left transition ${
                  isSelected ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-black/30 hover:border-amber-300/45"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{snapshot.primary.name} / {snapshot.secondary.name}</span>
                  <span
                    className="border px-2 py-0.5 font-mono text-[10px]"
                    style={{ borderColor: tone.color, color: tone.color }}
                    title={getConjunctionStatusDescription(snapshot.status)}
                  >
                    {tone.label}
                  </span>
                </span>
                <span className="mt-2 flex items-center justify-between font-mono text-[11px] text-zinc-400">
                  <span>{formatNumber(snapshot.missDistanceKm, 1)} km</span>
                  <span>{snapshot.relativeVelocityKmps === null ? "--" : formatNumber(snapshot.relativeVelocityKmps, 2)} km/s</span>
                </span>
              </button>
            );
          })}
          {selectedConjunction && (
            <div className="border border-white/10 bg-black/35 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200">TCA Summary</p>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                Time of Closest Approach for the selected satellite pair.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <DetailMetric label="Closest Time" value={formatUtc(new Date(selectedConjunction.tcaUtc))} />
                <DetailMetric label="Miss Distance" value={`${formatNumber(selectedConjunction.missDistanceKm, 1)} km`} />
                <DetailMetric
                  label="Rel Velocity"
                  value={`${selectedConjunction.relativeVelocityKmps === null ? "--" : formatNumber(selectedConjunction.relativeVelocityKmps, 2)} km/s`}
                />
                <DetailMetric label="Risk" value={getConjunctionTone(selectedConjunction.status).label} />
              </div>
            </div>
          )}
        </div>
      )}
    </HudPanel>
  );
}

function SatelliteControl({
  snapshot,
  isSelected,
  selectionIndex,
  onSelect,
  onFocus,
  onVisualChange,
  onMarkerChange,
  onLabelChange,
}: {
  snapshot: SatelliteSnapshot;
  isSelected: boolean;
  selectionIndex: number;
  onSelect: () => void;
  onFocus: () => void;
  onVisualChange: (key: "showOrbit" | "showTrail" | "showGroundTrack", checked: boolean) => void;
  onMarkerChange: (checked: boolean) => void;
  onLabelChange: (checked: boolean) => void;
}) {
  return (
    <div className={`border p-3 transition ${isSelected ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-black/30 hover:border-cyan-300/35"}`}>
      <button type="button" onClick={onSelect} className="w-full text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-white">{snapshot.satellite.name}</span>
          {isSelected && (
            <span className="border border-cyan-300/40 px-2 py-0.5 font-mono text-[10px] text-cyan-200">
              SAT {selectionIndex + 1}
            </span>
          )}
        </span>
        <span className="mt-1 block font-mono text-[11px] text-zinc-500">
          NORAD {snapshot.satellite.noradId ?? snapshot.satellite.id}
        </span>
      </button>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <LayerToggle
          label="Orbit"
          title="Stable orbit arc built from propagated Cartesian state, not lat/lon ground samples."
          checked={snapshot.satellite.visual.showOrbit}
          onChange={(checked) => onVisualChange("showOrbit", checked)}
        />
        <LayerToggle label="Trail" checked={snapshot.satellite.visual.showTrail} onChange={(checked) => onVisualChange("showTrail", checked)} />
        <LayerToggle label="Ground" tone="lime" checked={snapshot.satellite.visual.showGroundTrack} onChange={(checked) => onVisualChange("showGroundTrack", checked)} />
      </div>
      {(snapshot.satellite.visual.showTrail || snapshot.satellite.visual.showGroundTrack) && (
        <p className="mt-2 font-mono text-[10px] leading-4 text-zinc-500">
          Orbit = stable space arc, Trail = recent space history, Ground = surface trace
        </p>
      )}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <LayerToggle label="Dot" tone="zinc" checked={snapshot.satellite.visual.showMarker} onChange={onMarkerChange} />
        <LayerToggle label="Name" tone="zinc" checked={snapshot.satellite.visual.showLabel} onChange={onLabelChange} />
        <button
          type="button"
          onClick={onFocus}
          className="border border-white/10 px-2 py-1 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
        >
          Focus
        </button>
      </div>
    </div>
  );
}

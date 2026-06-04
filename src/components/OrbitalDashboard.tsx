"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
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
  fetchMissionPropagationProfile,
  fetchMissionTrajectory,
  fetchMissions,
  fetchManualOrbitState,
  fetchManualOrbitTrajectory,
  fetchManeuvers,
  fetchOrbitTrajectory,
  reorderMissionTimelineEvents,
  setAnalysisMode,
  setMissionTimelineEventEnabled,
  updateMissionPropagationProfile,
  updateMissionTimelineEvent,
} from "@/services/orbitServerApi";
import {
  buildWorkspace,
  deleteMission,
  deleteMissionTemplate,
  deleteOrbit,
  deleteOrbitTemplate,
  duplicateMission,
  duplicateMissionTemplate,
  duplicateOrbit,
  duplicateOrbitTemplate,
  makeWorkspaceId,
  readMissionLibrary,
  readMissionTemplateLibrary,
  readOrbitTemplateLibrary,
  readOrbitLibrary,
  storedEventFromBackend,
  storedMissionFromBackend,
  upsertMission,
  upsertMissionEvents,
  upsertMissionTemplate,
  upsertOrbitTemplate,
  validateMissionTemplateImport,
  validateOrbitTemplateImport,
  upsertOrbit,
  validateWorkspaceImport,
  writeMissionLibrary,
  writeMissionTemplateLibrary,
  writeOrbitTemplateLibrary,
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
  BackendPropagationProfile,
  CreateTimelineEventRequest,
  CreateManualOrbitRequest,
  ManualOrbitType,
  PropagatorTypeId,
  UpdatePropagationProfileRequest,
} from "@/services/orbitServerApi";
import type {
  MissionLibraryState,
  MissionTemplate,
  MissionTemplateCategory,
  MissionTemplateEvent,
  MissionTemplateLibraryState,
  OrbitTemplate,
  OrbitTemplateCategory,
  OrbitTemplateLibraryState,
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
type OrbitSourceId = "catalog" | "tle" | "classical" | "cartesian" | "template";
type TleImportMode = "paste" | "upload" | "url";
type TimelineModalMode = "create" | "edit";
type TimelineTimeMode = "UTC" | "MET";
type TimelineScheduleMode = "UTC" | "MET" | "AFTER_EVENT";
type TimelineZoomPreset = "THIRTY_MIN" | "ONE_HOUR" | "THREE_HOURS" | "SIX_HOURS" | "TWELVE_HOURS" | "TWENTY_FOUR_HOURS" | "CUSTOM";
type TimelineSnapMode = "FREE" | "ONE_MIN" | "FIVE_MIN" | "TEN_MIN" | "THIRTY_MIN" | "ONE_HOUR";
type MissionDurationPreset = "ONE_ORBIT" | "THREE_HOURS" | "TWELVE_HOURS" | "TWENTY_FOUR_HOURS" | "CUSTOM";
type CommandModalId = "mission" | "analysis" | "workspace" | "templates";
type TimelineEditorDraft = {
  type: "COAST" | "FINITE_BURN";
  name: string;
  scheduleMode: TimelineScheduleMode;
  executionDateUtc: string;
  executionTimeUtc: string;
  metHours: string;
  metMinutes: string;
  metSeconds: string;
  scheduleDependencyId: string;
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
  templateId: string;
};
type MissionTrajectoryOverlay = {
  mission: SatelliteSnapshot | null;
  legacy: SatelliteSnapshot | null;
  generatedAt: string;
  message: string;
};
type TimelineLayoutBlock = {
  event: BackendMissionTimelineEvent;
  offsetSeconds: number;
  durationSeconds: number;
  widthPercent: number;
  startPercent: number;
};
type TimelineLayoutModel = {
  missionDurationSeconds: number;
  visibleSeconds: number;
  trackWidthPercent: number;
  blocks: TimelineLayoutBlock[];
  cursors: {
    missionStart: number;
    missionEnd: number;
    currentSimTime: number | null;
    selectedEvent: number | null;
  };
};
type TimelineInteractionModel = {
  snapMode: TimelineSnapMode;
  zoomPreset: TimelineZoomPreset;
  customVisibleSeconds: number;
};
type SchedulingUpdateCommand = {
  eventId: string;
  targetMetSeconds: number;
  executionTime: string;
  request: CreateTimelineEventRequest;
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
  scheduleMode: "MET",
  executionDateUtc: utcIsoToDateInput(initialSimulationTime.toISOString()),
  executionTimeUtc: utcIsoToTimeInput(initialSimulationTime.toISOString()),
  metHours: "0",
  metMinutes: "0",
  metSeconds: "0",
  scheduleDependencyId: "",
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
const timelineZoomOptions = [
  { id: "THIRTY_MIN", label: "30 min", seconds: 30 * 60 },
  { id: "ONE_HOUR", label: "1 hr", seconds: 60 * 60 },
  { id: "THREE_HOURS", label: "3 hr", seconds: 3 * 60 * 60 },
  { id: "SIX_HOURS", label: "6 hr", seconds: 6 * 60 * 60 },
  { id: "TWELVE_HOURS", label: "12 hr", seconds: 12 * 60 * 60 },
  { id: "TWENTY_FOUR_HOURS", label: "24 hr", seconds: 24 * 60 * 60 },
  { id: "CUSTOM", label: "Custom", seconds: null },
] satisfies Array<{ id: TimelineZoomPreset; label: string; seconds: number | null }>;
const timelineSnapOptions = [
  { id: "FREE", label: "Free", seconds: 1 },
  { id: "ONE_MIN", label: "1 min", seconds: 60 },
  { id: "FIVE_MIN", label: "5 min", seconds: 5 * 60 },
  { id: "TEN_MIN", label: "10 min", seconds: 10 * 60 },
  { id: "THIRTY_MIN", label: "30 min", seconds: 30 * 60 },
  { id: "ONE_HOUR", label: "1 hr", seconds: 60 * 60 },
] satisfies Array<{ id: TimelineSnapMode; label: string; seconds: number }>;
const missionTemplateCategories = [
  "LEO",
  "GTO",
  "Station Keeping",
  "Transfer",
  "Deployment",
  "Custom",
] satisfies MissionTemplateCategory[];
const orbitTemplateCategories = [
  "LEO",
  "MEO",
  "GEO",
  "GTO",
  "Polar",
  "Sun Sync",
  "Custom",
] satisfies OrbitTemplateCategory[];
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

function metOffsetPartsFromSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return {
    metHours: String(hours),
    metMinutes: String(minutes).padStart(2, "0"),
    metSeconds: String(seconds).padStart(2, "0"),
  };
}

function metOffsetSeconds(draft: TimelineEditorDraft) {
  const hours = Number(draft.metHours);
  const minutes = Number(draft.metMinutes);
  const seconds = Number(draft.metSeconds);
  if (![hours, minutes, seconds].every(Number.isFinite)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function metOffsetLabelFromSeconds(totalSeconds: number) {
  const sign = totalSeconds < 0 ? "T-" : "T+";
  const absolute = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function eventScheduleMode(event: BackendMissionTimelineEvent): TimelineScheduleMode {
  const mode = readStringParameter(event.parameters ?? {}, "scheduleMode", "MET");
  return mode === "UTC" || mode === "MET" || mode === "AFTER_EVENT" ? mode : "MET";
}

function eventMetOffsetSeconds(mission: BackendMission | null, event: BackendMissionTimelineEvent) {
  if (!mission) {
    return null;
  }
  const startMs = new Date(mission.scenarioStart).getTime();
  const eventMs = new Date(event.executionTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(eventMs)) {
    return null;
  }
  return Math.round((eventMs - startMs) / 1000);
}

function resolveEventMetOffsets(mission: BackendMission | null, events: BackendMissionTimelineEvent[]) {
  const resolved = new Map<string, number>();
  const warnings: string[] = [];
  const eventById = new Map<string, BackendMissionTimelineEvent>();
  const idCounts = new Map<string, number>();

  events.forEach((event) => {
    eventById.set(event.id, event);
    idCounts.set(event.id, (idCounts.get(event.id) ?? 0) + 1);
  });
  idCounts.forEach((count, id) => {
    if (count > 1) {
      warnings.push(`Duplicate event id ${id}.`);
    }
  });

  const visit = (event: BackendMissionTimelineEvent, path: string[]): number | null => {
    if (resolved.has(event.id)) {
      return resolved.get(event.id)!;
    }
    if (path.includes(event.id)) {
      warnings.push(`Circular dependency detected: ${[...path, event.id].join(" -> ")}.`);
      return null;
    }

    const parameters = event.parameters ?? {};
    const mode = eventScheduleMode(event);
    if (mode === "AFTER_EVENT") {
      const dependencyId = readStringParameter(parameters, "scheduleDependencyId", "");
      if (!dependencyId) {
        warnings.push(`${event.name} is missing a dependency event.`);
        return null;
      }
      const dependency = eventById.get(dependencyId);
      if (!dependency) {
        warnings.push(`${event.name} references missing event ${dependencyId}.`);
        return null;
      }
      const dependencyMet = visit(dependency, [...path, event.id]);
      if (dependencyMet === null) {
        warnings.push(`${event.name} has an unresolved dependency chain.`);
        return null;
      }
      const offsetSeconds = readNumberParameter(parameters, "scheduleOffsetSeconds", 0);
      const value = dependencyMet + offsetSeconds;
      resolved.set(event.id, value);
      return value;
    }

    const value = mode === "MET"
      ? readNumberParameter(parameters, "scheduleOffsetSeconds", eventMetOffsetSeconds(mission, event) ?? 0)
      : eventMetOffsetSeconds(mission, event);
    if (value === null) {
      warnings.push(`${event.name} has an invalid UTC execution time.`);
      return null;
    }
    resolved.set(event.id, value);
    return value;
  };

  events.forEach((event) => {
    visit(event, []);
  });

  return { offsets: resolved, warnings };
}

function executionIsoFromTimelineDraft(
  draft: TimelineEditorDraft,
  mission: BackendMission | null,
  events: BackendMissionTimelineEvent[] = [],
  editingEventId?: string | null,
) {
  if (draft.scheduleMode === "UTC") {
    return utcDateAndTimeInputToIso(draft.executionDateUtc, draft.executionTimeUtc);
  }
  if (!mission) {
    throw new Error("Mission is required for MET scheduling.");
  }
  const offsetSeconds = metOffsetSeconds(draft);
  if (offsetSeconds === null) {
    throw new Error("Valid schedule offset required.");
  }
  if (draft.scheduleMode === "AFTER_EVENT") {
    if (!draft.scheduleDependencyId) {
      throw new Error("Dependency event required.");
    }
    if (draft.scheduleDependencyId === editingEventId) {
      throw new Error("An event cannot depend on itself.");
    }
    const dependency = events.find((event) => event.id === draft.scheduleDependencyId);
    if (!dependency) {
      throw new Error("Dependency event not found.");
    }
    const { offsets } = resolveEventMetOffsets(mission, events);
    const dependencyOffset = offsets.get(dependency.id);
    if (dependencyOffset === undefined) {
      throw new Error("Dependency chain could not be resolved.");
    }
    return new Date(new Date(mission.scenarioStart).getTime() + (dependencyOffset + offsetSeconds) * 1000).toISOString();
  }
  return new Date(new Date(mission.scenarioStart).getTime() + offsetSeconds * 1000).toISOString();
}

function schedulingMetadata(draft: TimelineEditorDraft, executionTime: string) {
  if (draft.scheduleMode === "UTC") {
    return {
      scheduleMode: "UTC",
      scheduleValue: executionTime,
    };
  }
  const offsetSeconds = metOffsetSeconds(draft) ?? 0;
  if (draft.scheduleMode === "AFTER_EVENT") {
    return {
      scheduleMode: "AFTER_EVENT",
      scheduleValue: `after:${draft.scheduleDependencyId}+${metOffsetLabelFromSeconds(offsetSeconds)}`,
      scheduleDependencyId: draft.scheduleDependencyId,
      scheduleOffsetSeconds: offsetSeconds,
    };
  }
  return {
    scheduleMode: "MET",
    scheduleValue: metOffsetLabelFromSeconds(offsetSeconds),
    scheduleOffsetSeconds: offsetSeconds,
  };
}

function proposedEventsForDraft(
  draft: TimelineEditorDraft,
  mission: BackendMission,
  events: BackendMissionTimelineEvent[],
  editingEventId: string | null | undefined,
  sequenceIndex: number,
  enabled: boolean,
) {
  const proposedId = editingEventId ?? "draft-event";
  const existing = events.find((event) => event.id === proposedId);
  const proposed: BackendMissionTimelineEvent = {
    id: proposedId,
    missionId: mission.id,
    sequenceIndex,
    type: draft.type,
    name: draft.name.trim() || (draft.type === "COAST" ? "Coast" : "Finite Burn"),
    enabled,
    executionTime: existing?.executionTime ?? mission.scenarioStart,
    parameters: schedulingMetadata(draft, existing?.executionTime ?? mission.scenarioStart),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return [...events.filter((event) => event.id !== proposedId), proposed];
}

function templateWarnings(template: MissionTemplate) {
  const warnings: string[] = [];
  const ids = new Set<string>();
  const idCounts = new Map<string, number>();
  template.events.forEach((event) => {
    idCounts.set(event.templateEventId, (idCounts.get(event.templateEventId) ?? 0) + 1);
    ids.add(event.templateEventId);
  });
  idCounts.forEach((count, id) => {
    if (count > 1) {
      warnings.push(`Duplicate template event id ${id}.`);
    }
  });

  const eventById = new Map(template.events.map((event) => [event.templateEventId, event]));
  const visit = (event: MissionTemplateEvent, path: string[]) => {
    if (path.includes(event.templateEventId)) {
      warnings.push(`Template dependency cycle: ${[...path, event.templateEventId].join(" -> ")}.`);
      return;
    }
    const mode = readStringParameter(event.parameters, "scheduleMode", "MET");
    if (mode !== "AFTER_EVENT") {
      return;
    }
    const dependencyId = readStringParameter(event.parameters, "scheduleDependencyId", "");
    if (!dependencyId) {
      warnings.push(`${event.name} is missing a dependency source.`);
      return;
    }
    const dependency = eventById.get(dependencyId);
    if (!dependency) {
      warnings.push(`${event.name} references missing template event ${dependencyId}.`);
      return;
    }
    if (dependency.sequenceIndex >= event.sequenceIndex) {
      warnings.push(`${event.name} depends on an event that is not earlier in the template sequence.`);
    }
    visit(dependency, [...path, event.templateEventId]);
  };
  template.events.forEach((event) => visit(event, []));
  return warnings;
}

function orbitTemplateWarnings(template: OrbitTemplate) {
  const request = template.orbitDefinition;
  const warnings: string[] = [];
  if (request.type !== "CLASSICAL_ELEMENTS" && request.type !== "CARTESIAN_STATE") {
    warnings.push("Orbit templates support Classical Elements and Cartesian State only.");
  }
  if (request.type === "CLASSICAL_ELEMENTS" && !request.classicalElements) {
    warnings.push("Classical Elements template is missing orbital elements.");
  }
  if (request.type === "CARTESIAN_STATE" && !request.cartesianState) {
    warnings.push("Cartesian State template is missing position/velocity.");
  }
  if (!request.name.trim()) {
    warnings.push("Orbit template definition requires a name.");
  }
  return warnings;
}

function orbitTemplateFromStoredOrbit(orbit: StoredOrbit, name: string, category: OrbitTemplateCategory): OrbitTemplate {
  const request = orbit.orbitDefinition.manualRequest;
  if (!request || (request.type !== "CLASSICAL_ELEMENTS" && request.type !== "CARTESIAN_STATE")) {
    throw new Error("Only manual Classical Elements and Cartesian State orbits can be saved as orbit templates.");
  }
  const now = new Date().toISOString();
  return {
    templateId: makeWorkspaceId("orbit-template"),
    name,
    description: `Orbit template saved from ${orbit.orbitName}.`,
    category,
    tags: [category.toLowerCase().replaceAll(/\s+/g, "-")],
    createdAt: now,
    updatedAt: now,
    orbitDefinition: {
      ...structuredClone(request),
      name,
    },
  };
}

function orbitTemplateTypeLabel(template: OrbitTemplate) {
  return template.orbitDefinition.type === "CLASSICAL_ELEMENTS" ? "Classical Elements" : "Cartesian State";
}

function templateFromMission(mission: BackendMission, events: BackendMissionTimelineEvent[], name: string, category: MissionTemplateCategory): MissionTemplate {
  const now = new Date().toISOString();
  const eventIdMap = new Map<string, string>();
  events.forEach((event) => eventIdMap.set(event.id, makeWorkspaceId("template-event")));
  return {
    templateId: makeWorkspaceId("template"),
    name,
    description: `Template saved from ${mission.name}.`,
    category,
    tags: [category.toLowerCase().replaceAll(/\s+/g, "-")],
    createdAt: now,
    updatedAt: now,
    events: events.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex).map((event) => {
      const parameters = { ...(event.parameters ?? {}) };
      const mode = readStringParameter(parameters, "scheduleMode", "MET");
      if (mode === "UTC" || !mode) {
        const offsetSeconds = eventMetOffsetSeconds(mission, event) ?? 0;
        parameters.scheduleMode = "MET";
        parameters.scheduleValue = metOffsetLabelFromSeconds(offsetSeconds);
        parameters.scheduleOffsetSeconds = offsetSeconds;
      }
      const dependencyId = parameters.scheduleDependencyId;
      if (typeof dependencyId === "string") {
        parameters.scheduleDependencyId = eventIdMap.get(dependencyId) ?? dependencyId;
      }
      return {
        templateEventId: eventIdMap.get(event.id)!,
        type: event.type,
        name: event.name,
        enabled: event.enabled,
        parameters,
        sequenceIndex: event.sequenceIndex,
      };
    }),
  };
}

function resolveTemplateOffsets(template: MissionTemplate) {
  const offsets = new Map<string, number>();
  const warnings = templateWarnings(template);
  const eventById = new Map(template.events.map((event) => [event.templateEventId, event]));

  const visit = (event: MissionTemplateEvent, path: string[]): number | null => {
    if (offsets.has(event.templateEventId)) {
      return offsets.get(event.templateEventId)!;
    }
    if (path.includes(event.templateEventId)) {
      return null;
    }
    const mode = readStringParameter(event.parameters, "scheduleMode", "MET");
    if (mode === "AFTER_EVENT") {
      const dependencyId = readStringParameter(event.parameters, "scheduleDependencyId", "");
      const dependency = eventById.get(dependencyId);
      if (!dependency) {
        return null;
      }
      const dependencyOffset = visit(dependency, [...path, event.templateEventId]);
      if (dependencyOffset === null) {
        return null;
      }
      const offset = dependencyOffset + readNumberParameter(event.parameters, "scheduleOffsetSeconds", 0);
      offsets.set(event.templateEventId, offset);
      return offset;
    }
    const offset = readNumberParameter(event.parameters, "scheduleOffsetSeconds", 0);
    offsets.set(event.templateEventId, offset);
    return offset;
  };

  template.events.forEach((event) => visit(event, []));
  return { offsets, warnings };
}

function timelineDraftFromEvent(event: BackendMissionTimelineEvent, mission: BackendMission | null): TimelineEditorDraft {
  const parameters = event.parameters ?? {};
  const scheduleMode = eventScheduleMode(event);
  const storedOffsetSeconds = readNumberParameter(
    parameters,
    "scheduleOffsetSeconds",
    eventMetOffsetSeconds(mission, event) ?? 0,
  );
  const offsetParts = metOffsetPartsFromSeconds(storedOffsetSeconds);
  return {
    type: event.type === "COAST" ? "COAST" : "FINITE_BURN",
    name: event.name,
    scheduleMode,
    executionDateUtc: utcIsoToDateInput(event.executionTime, initialSimulationTime.toISOString()),
    executionTimeUtc: utcIsoToTimeInput(event.executionTime, initialSimulationTime.toISOString()),
    ...offsetParts,
    scheduleDependencyId: readStringParameter(parameters, "scheduleDependencyId", ""),
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
  mission: BackendMission | null,
  events: BackendMissionTimelineEvent[],
  sequenceIndex: number,
  enabled: boolean,
  editingEventId?: string | null,
): CreateTimelineEventRequest {
  const executionTime = executionIsoFromTimelineDraft(draft, mission, events, editingEventId);
  const schedule = schedulingMetadata(draft, executionTime);
  if (draft.type === "COAST") {
    return {
      sequenceIndex,
      type: "COAST",
      name: draft.name.trim() || "Coast",
      enabled,
      executionTime,
      parameters: schedule,
    };
  }

  return {
    sequenceIndex,
    type: "FINITE_BURN",
    name: draft.name.trim() || "Finite Burn",
    enabled,
    executionTime,
    parameters: {
      ...schedule,
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
  if (draft.scheduleMode === "UTC") {
    if (!draft.executionDateUtc) {
      errors.executionDateUtc = "Date required";
    }
    if (!draft.executionTimeUtc) {
      errors.executionTimeUtc = "Time required";
    }
    if (draft.executionDateUtc && draft.executionTimeUtc && !isValidUtcDateAndTimeInput(draft.executionDateUtc, draft.executionTimeUtc)) {
      errors.executionTimeUtc = "Invalid UTC time";
    }
  } else {
    const hours = Number(draft.metHours);
    const minutes = Number(draft.metMinutes);
    const seconds = Number(draft.metSeconds);
    if (!Number.isFinite(hours) || hours < 0) {
      errors.metHours = "Hours >= 0";
    }
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
      errors.metMinutes = "0-59";
    }
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 59) {
      errors.metSeconds = "0-59";
    }
    if (draft.scheduleMode === "AFTER_EVENT" && !draft.scheduleDependencyId) {
      errors.scheduleDependencyId = "Dependency required";
    }
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
    templateId: "",
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

function timelineEventDurationSeconds(event: BackendMissionTimelineEvent, nextEvent: BackendMissionTimelineEvent | null, mission: BackendMission | null) {
  if (event.type === "FINITE_BURN") {
    return Math.max(0, readNumberParameter(event.parameters ?? {}, "durationSeconds", 0));
  }
  const eventMs = new Date(event.executionTime).getTime();
  const nextMs = nextEvent
    ? new Date(nextEvent.executionTime).getTime()
    : mission
      ? new Date(mission.scenarioEnd).getTime()
      : Number.NaN;
  if (!Number.isFinite(eventMs) || !Number.isFinite(nextMs)) {
    return 0;
  }
  return Math.max(0, Math.round((nextMs - eventMs) / 1000));
}

function displayTimelineTime(mode: TimelineTimeMode, mission: BackendMission | null, iso: string) {
  return mode === "MET" && mission ? signedOffsetLabel(mission.scenarioStart, iso) : compactIsoUtc(iso);
}

function timelineAnalysis(mission: BackendMission | null, events: BackendMissionTimelineEvent[]) {
  const eventsBySequence = events.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex);
  const metCounts = new Map<number, BackendMissionTimelineEvent[]>();
  const resolvedSchedule = resolveEventMetOffsets(mission, events);
  const warnings: string[] = [...resolvedSchedule.warnings];
  let previousExecutionMs = Number.NEGATIVE_INFINITY;
  let invalidOrder = false;
  const missionDuration = mission ? missionDurationSeconds(mission) : 0;

  eventsBySequence.forEach((event) => {
    const executionMs = new Date(event.executionTime).getTime();
    if (!Number.isFinite(executionMs)) {
      warnings.push(`${event.name} has an invalid execution time.`);
      return;
    }
    const metOffset = resolvedSchedule.offsets.get(event.id);
    if (metOffset === undefined) {
      warnings.push(`${event.name} has an invalid MET offset.`);
    } else {
      const current = metCounts.get(metOffset) ?? [];
      metCounts.set(metOffset, [...current, event]);
      if (metOffset < 0) {
        warnings.push(`${event.name} has negative MET ${metOffsetLabelFromSeconds(metOffset)}.`);
      }
      if (mission && metOffset > missionDuration) {
        warnings.push(`${event.name} MET ${metOffsetLabelFromSeconds(metOffset)} is beyond mission end.`);
      }
    }
    const scheduleMode = readStringParameter(event.parameters ?? {}, "scheduleMode", "");
    if (scheduleMode && !["UTC", "MET", "AFTER_EVENT"].includes(scheduleMode)) {
      warnings.push(`${event.name} has invalid schedule mode metadata.`);
    }
    const scheduleOffset = event.parameters?.scheduleOffsetSeconds;
    if ((scheduleMode === "MET" || scheduleMode === "AFTER_EVENT") && typeof scheduleOffset !== "number") {
      warnings.push(`${event.name} is missing MET offset metadata.`);
    }
    if (scheduleMode === "AFTER_EVENT" && typeof event.parameters?.scheduleDependencyId !== "string") {
      warnings.push(`${event.name} is missing dependency metadata.`);
    }
    if (executionMs < previousExecutionMs) {
      invalidOrder = true;
    }
    previousExecutionMs = executionMs;
    const windowWarning = eventWindowError(mission, event.executionTime);
    if (windowWarning) {
      warnings.push(`${event.name} is outside the mission window.`);
    }
  });

  metCounts.forEach((duplicateEvents, metOffset) => {
    if (duplicateEvents.length > 1) {
      warnings.push(`Duplicate MET ${metOffsetLabelFromSeconds(metOffset)} for ${duplicateEvents.map((event) => event.name).join(", ")}.`);
    }
  });
  if (invalidOrder) {
    warnings.push("Timeline sequence order does not match chronological execution order.");
  }

  return {
    missionDuration,
    eventCount: events.length,
    burnCount: events.filter((event) => event.type === "FINITE_BURN").length,
    coastCount: events.filter((event) => event.type === "COAST").length,
    warnings,
  };
}

function visualTimelineBlocks(mission: BackendMission | null, events: BackendMissionTimelineEvent[]) {
  const resolvedSchedule = resolveEventMetOffsets(mission, events);
  const ordered = events.toSorted((a, b) => {
    const aOffset = resolvedSchedule.offsets.get(a.id);
    const bOffset = resolvedSchedule.offsets.get(b.id);
    return (aOffset ?? Number.POSITIVE_INFINITY) - (bOffset ?? Number.POSITIVE_INFINITY) || a.sequenceIndex - b.sequenceIndex;
  });
  const missionSeconds = mission ? Math.max(1, missionDurationSeconds(mission)) : 1;
  return ordered.map((event, index) => {
    const nextEvent = ordered[index + 1] ?? null;
    const durationSeconds = timelineEventDurationSeconds(event, nextEvent, mission);
    const offsetSeconds = resolvedSchedule.offsets.get(event.id) ?? 0;
    const widthPercent = Math.min(100, Math.max(18, (durationSeconds / missionSeconds) * 100));
    const startPercent = Math.min(100, Math.max(0, (offsetSeconds / missionSeconds) * 100));
    return {
      event,
      offsetSeconds,
      durationSeconds,
      widthPercent,
      startPercent,
    };
  });
}

function timelineVisibleSeconds(interaction: TimelineInteractionModel, mission: BackendMission | null) {
  const option = timelineZoomOptions.find((item) => item.id === interaction.zoomPreset);
  const fallback = mission ? missionDurationSeconds(mission) : 3 * 60 * 60;
  return Math.max(60, option?.seconds ?? (interaction.customVisibleSeconds || fallback));
}

function buildTimelineLayoutModel(
  mission: BackendMission,
  events: BackendMissionTimelineEvent[],
  interaction: TimelineInteractionModel,
  selectedEventId: string | null,
  simulationTimeIso: string,
): TimelineLayoutModel {
  const missionSeconds = Math.max(1, missionDurationSeconds(mission));
  const visibleSeconds = timelineVisibleSeconds(interaction, mission);
  const blocks = visualTimelineBlocks(mission, events);
  const selectedBlock = selectedEventId ? blocks.find((block) => block.event.id === selectedEventId) ?? null : null;
  const simOffset = Math.round((new Date(simulationTimeIso).getTime() - new Date(mission.scenarioStart).getTime()) / 1000);
  return {
    missionDurationSeconds: missionSeconds,
    visibleSeconds,
    trackWidthPercent: Math.max(100, (missionSeconds / visibleSeconds) * 100),
    blocks,
    cursors: {
      missionStart: 0,
      missionEnd: 100,
      currentSimTime: Number.isFinite(simOffset) ? Math.min(100, Math.max(0, (simOffset / missionSeconds) * 100)) : null,
      selectedEvent: selectedBlock ? selectedBlock.startPercent : null,
    },
  };
}

function snapTimelineOffset(seconds: number, snapMode: TimelineSnapMode) {
  const snapSeconds = timelineSnapOptions.find((item) => item.id === snapMode)?.seconds ?? 1;
  if (snapMode === "FREE" || snapSeconds <= 1) {
    return Math.round(seconds);
  }
  return Math.round(seconds / snapSeconds) * snapSeconds;
}

function buildSchedulingUpdateCommand(
  mission: BackendMission,
  events: BackendMissionTimelineEvent[],
  event: BackendMissionTimelineEvent,
  targetMetSeconds: number,
  snapMode: TimelineSnapMode,
): SchedulingUpdateCommand {
  const clampedMet = Math.min(missionDurationSeconds(mission), Math.max(0, snapTimelineOffset(targetMetSeconds, snapMode)));
  const executionTime = new Date(new Date(mission.scenarioStart).getTime() + clampedMet * 1000).toISOString();
  const parameters = { ...(event.parameters ?? {}) };
  const mode = eventScheduleMode(event);

  if (mode === "AFTER_EVENT") {
    const dependencyId = readStringParameter(parameters, "scheduleDependencyId", "");
    const dependencyMet = resolveEventMetOffsets(mission, events).offsets.get(dependencyId);
    if (!dependencyId || dependencyMet === undefined) {
      throw new Error(`${event.name} dependency source could not be resolved.`);
    }
    const dependencyOffsetSeconds = Math.max(0, clampedMet - dependencyMet);
    parameters.scheduleMode = "AFTER_EVENT";
    parameters.scheduleDependencyId = dependencyId;
    parameters.scheduleOffsetSeconds = dependencyOffsetSeconds;
    parameters.scheduleValue = `after:${dependencyId}+${metOffsetLabelFromSeconds(dependencyOffsetSeconds)}`;
  } else if (mode === "UTC") {
    parameters.scheduleMode = "UTC";
    parameters.scheduleValue = executionTime;
    delete parameters.scheduleOffsetSeconds;
    delete parameters.scheduleDependencyId;
  } else {
    parameters.scheduleMode = "MET";
    parameters.scheduleValue = metOffsetLabelFromSeconds(clampedMet);
    parameters.scheduleOffsetSeconds = clampedMet;
    delete parameters.scheduleDependencyId;
  }

  return {
    eventId: event.id,
    targetMetSeconds: clampedMet,
    executionTime,
    request: {
      sequenceIndex: event.sequenceIndex,
      type: event.type === "COAST" ? "COAST" : "FINITE_BURN",
      name: event.name,
      enabled: event.enabled,
      executionTime,
      parameters,
    },
  };
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
  if (source === "endpoint" && manualOrbitId) {
    return {
      label: "Imported TLE mission",
      detail: manualOrbitId,
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
  if (!(error instanceof Error)) {
    return fallback;
  }
  const message = error.message.trim();
  if (!message || message === "Failed to fetch" || message === "NetworkError when attempting to fetch resource.") {
    return fallback;
  }
  return message;
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
  const [templateLibrary, setTemplateLibrary] = useState<MissionTemplateLibraryState>(() => readMissionTemplateLibrary());
  const [orbitTemplateLibrary, setOrbitTemplateLibrary] = useState<OrbitTemplateLibraryState>(() => readOrbitTemplateLibrary());
  const [activeWorkspaceOrbitId, setActiveWorkspaceOrbitId] = useState<string | null>(null);
  const [activeWorkspaceMissionId, setActiveWorkspaceMissionId] = useState<string | null>(null);
  const workspaceImportInputRef = useRef<HTMLInputElement | null>(null);
  const templateImportInputRef = useRef<HTMLInputElement | null>(null);
  const orbitTemplateImportInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<string | null>(null);
  const [timelineModalMode, setTimelineModalMode] = useState<TimelineModalMode | null>(null);
  const [timelineDraft, setTimelineDraft] = useState<TimelineEditorDraft>(defaultTimelineDraft);
  const [isMissionSetupOpen, setIsMissionSetupOpen] = useState(false);
  const [missionSetupDraft, setMissionSetupDraft] = useState<MissionSetupDraft>(
    () => missionSetupDraftFor(null, initialSimulationTime),
  );
  const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
  const [timelineDragEventId, setTimelineDragEventId] = useState<string | null>(null);
  const [activeCommandModal, setActiveCommandModal] = useState<CommandModalId | null>(null);
  const [missionTrajectoryOverlay, setMissionTrajectoryOverlay] = useState<MissionTrajectoryOverlay | null>(null);
  const [showMissionComparison, setShowMissionComparison] = useState(false);
  const [isMissionTrajectoryLoading, setIsMissionTrajectoryLoading] = useState(false);
  const [showConjunctions, setShowConjunctions] = useState(false);
  const [conjunctionEvents, setConjunctionEvents] = useState<ConjunctionEvent[]>([]);
  const [selectedConjunctionId, setSelectedConjunctionId] = useState<string | null>(null);
  const [dynamicDataMessage, setDynamicDataMessage] = useState<string | null>(null);
  const [analysisConfig, setAnalysisConfig] = useState<BackendAnalysisConfigResponse | null>(null);
  const [missionPropagationProfile, setMissionPropagationProfile] = useState<BackendPropagationProfile | null>(null);
  const [propagationProfileStatus, setPropagationProfileStatus] = useState<string | null>(null);
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
  const canUseMissionTimeline = canUseAnalysisConfig || Boolean(manualOrbitId);
  const missionTimelineUnavailableReason = canUseMissionTimeline
    ? null
    : activeDataSource === "manual"
      ? "Create a manual Cartesian or Classical Elements orbit first, then create a mission."
      : activeDataSource === "endpoint"
        ? "Persist the imported TLE as a backend orbit before creating a mission timeline."
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
  const missionSummaryAnalysis = useMemo(() => timelineAnalysis(mission, missionTimelineEvents), [mission, missionTimelineEvents]);
  const dependencyCount = useMemo(() => missionTimelineEvents.filter((event) => eventScheduleMode(event) === "AFTER_EVENT").length, [missionTimelineEvents]);
  const trajectoryStatus = missionTrajectoryOverlay
    ? "Generated"
    : mission && missionTimelineEvents.length > 0
      ? "Needs Regeneration"
      : "Not Generated";
  const analysisLastTimestamp = missionTrajectoryOverlay?.generatedAt ?? (dynamicDataMessage ? "Recent" : "--");
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

  const saveTemplateLibrary = useCallback((next: MissionTemplateLibraryState) => {
    setTemplateLibrary(next);
    writeMissionTemplateLibrary(next);
  }, []);

  const saveOrbitTemplateLibrary = useCallback((next: OrbitTemplateLibraryState) => {
    setOrbitTemplateLibrary(next);
    writeOrbitTemplateLibrary(next);
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
      setMissionPropagationProfile(null);
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

  const saveCurrentMissionAsTemplate = useCallback(() => {
    if (!mission || missionTimelineEvents.length === 0) {
      toast.error("Create a mission timeline before saving a template.");
      return;
    }
    const name = window.prompt("Template name", `${mission.name} Template`)?.trim();
    if (!name) {
      return;
    }
    const categoryInput = window.prompt(`Category (${missionTemplateCategories.join(", ")})`, "Custom")?.trim() as MissionTemplateCategory | undefined;
    const category = missionTemplateCategories.includes(categoryInput as MissionTemplateCategory)
      ? categoryInput as MissionTemplateCategory
      : "Custom";
    const template = templateFromMission(mission, missionTimelineEvents, name, category);
    const warnings = templateWarnings(template);
    if (warnings.length > 0) {
      toast.error(warnings[0]);
      return;
    }
    saveTemplateLibrary(upsertMissionTemplate(templateLibrary, template));
    toast.success("Mission template saved.");
  }, [mission, missionTimelineEvents, saveTemplateLibrary, templateLibrary]);

  const renameTemplate = useCallback((template: MissionTemplate) => {
    const name = window.prompt("Rename template", template.name)?.trim();
    if (!name) {
      return;
    }
    saveTemplateLibrary(upsertMissionTemplate(templateLibrary, { ...template, name }));
  }, [saveTemplateLibrary, templateLibrary]);

  const editTemplateMetadata = useCallback((template: MissionTemplate) => {
    const description = window.prompt("Template description", template.description)?.trim();
    const tagsInput = window.prompt("Tags, comma separated", template.tags.join(", "))?.trim();
    const categoryInput = window.prompt(`Category (${missionTemplateCategories.join(", ")})`, template.category)?.trim();
    const category = missionTemplateCategories.includes(categoryInput as MissionTemplateCategory)
      ? categoryInput as MissionTemplateCategory
      : template.category;
    saveTemplateLibrary(upsertMissionTemplate(templateLibrary, {
      ...template,
      description: description ?? template.description,
      category,
      tags: tagsInput ? tagsInput.split(",").map((tag) => tag.trim()).filter(Boolean) : template.tags,
    }));
  }, [saveTemplateLibrary, templateLibrary]);

  const cloneTemplate = useCallback((template: MissionTemplate) => {
    const result = duplicateMissionTemplate(templateLibrary, template.templateId);
    saveTemplateLibrary(result.templateState);
    if (result.clonedTemplateId) {
      toast.success("Template duplicated.");
    }
  }, [saveTemplateLibrary, templateLibrary]);

  const deleteTemplate = useCallback((template: MissionTemplate) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) {
      return;
    }
    saveTemplateLibrary(deleteMissionTemplate(templateLibrary, template.templateId));
  }, [saveTemplateLibrary, templateLibrary]);

  const exportTemplate = useCallback((template: MissionTemplate) => {
    downloadJson(`${template.name.replaceAll(/\s+/g, "-").toLowerCase()}-template.json`, template);
  }, []);

  const importTemplateFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const parsed = validateMissionTemplateImport(JSON.parse(await file.text()));
      const importedTemplates = "templates" in parsed ? parsed.templates : [parsed];
      const importedIds = new Set<string>();
      for (const template of importedTemplates) {
        if (importedIds.has(template.templateId)) {
          throw new Error(`Duplicate template id in import: ${template.templateId}`);
        }
        importedIds.add(template.templateId);
      }
      const duplicateIds = importedTemplates.filter((template) => templateLibrary.templates.some((item) => item.templateId === template.templateId));
      if (duplicateIds.length > 0) {
        throw new Error(`Template id already exists: ${duplicateIds[0].templateId}`);
      }
      for (const template of importedTemplates) {
        const warnings = templateWarnings(template);
        if (warnings.length > 0) {
          throw new Error(warnings[0]);
        }
      }
      saveTemplateLibrary({
        schemaVersion: 1,
        templates: [...templateLibrary.templates, ...importedTemplates],
      });
      toast.success("Template JSON imported.");
    } catch (error) {
      toast.error(userErrorMessage(error, "Invalid template JSON."));
    }
  }, [saveTemplateLibrary, templateLibrary]);

  const saveCurrentOrbitAsTemplate = useCallback(() => {
    if (!activeStoredOrbit) {
      toast.error("Load a manual Classical Elements or Cartesian orbit before saving an orbit template.");
      return;
    }
    const name = window.prompt("Orbit template name", `${activeStoredOrbit.orbitName} Template`)?.trim();
    if (!name) {
      return;
    }
    const categoryInput = window.prompt(`Category (${orbitTemplateCategories.join(", ")})`, "Custom")?.trim();
    const category = orbitTemplateCategories.includes(categoryInput as OrbitTemplateCategory)
      ? categoryInput as OrbitTemplateCategory
      : "Custom";
    try {
      const template = orbitTemplateFromStoredOrbit(activeStoredOrbit, name, category);
      const warnings = orbitTemplateWarnings(template);
      if (warnings.length > 0) {
        throw new Error(warnings[0]);
      }
      saveOrbitTemplateLibrary(upsertOrbitTemplate(orbitTemplateLibrary, template));
      toast.success("Orbit template saved.");
    } catch (error) {
      toast.error(userErrorMessage(error, "Unable to save orbit template."));
    }
  }, [activeStoredOrbit, orbitTemplateLibrary, saveOrbitTemplateLibrary]);

  const renameOrbitTemplate = useCallback((template: OrbitTemplate) => {
    const name = window.prompt("Rename orbit template", template.name)?.trim();
    if (!name) {
      return;
    }
    saveOrbitTemplateLibrary(upsertOrbitTemplate(orbitTemplateLibrary, {
      ...template,
      name,
      orbitDefinition: { ...template.orbitDefinition, name },
    }));
  }, [orbitTemplateLibrary, saveOrbitTemplateLibrary]);

  const editOrbitTemplateMetadata = useCallback((template: OrbitTemplate) => {
    const description = window.prompt("Orbit template description", template.description)?.trim();
    const tagsInput = window.prompt("Tags, comma separated", template.tags.join(", "))?.trim();
    const categoryInput = window.prompt(`Category (${orbitTemplateCategories.join(", ")})`, template.category)?.trim();
    const category = orbitTemplateCategories.includes(categoryInput as OrbitTemplateCategory)
      ? categoryInput as OrbitTemplateCategory
      : template.category;
    saveOrbitTemplateLibrary(upsertOrbitTemplate(orbitTemplateLibrary, {
      ...template,
      description: description ?? template.description,
      category,
      tags: tagsInput ? tagsInput.split(",").map((tag) => tag.trim()).filter(Boolean) : template.tags,
    }));
  }, [orbitTemplateLibrary, saveOrbitTemplateLibrary]);

  const cloneOrbitTemplate = useCallback((template: OrbitTemplate) => {
    const result = duplicateOrbitTemplate(orbitTemplateLibrary, template.templateId);
    saveOrbitTemplateLibrary(result.templateState);
    if (result.clonedTemplateId) {
      toast.success("Orbit template duplicated.");
    }
  }, [orbitTemplateLibrary, saveOrbitTemplateLibrary]);

  const deleteOrbitTemplateAction = useCallback((template: OrbitTemplate) => {
    if (!window.confirm(`Delete orbit template "${template.name}"?`)) {
      return;
    }
    saveOrbitTemplateLibrary(deleteOrbitTemplate(orbitTemplateLibrary, template.templateId));
  }, [orbitTemplateLibrary, saveOrbitTemplateLibrary]);

  const exportOrbitTemplate = useCallback((template: OrbitTemplate) => {
    downloadJson(`${template.name.replaceAll(/\s+/g, "-").toLowerCase()}-orbit-template.json`, template);
  }, []);

  const importOrbitTemplateFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const parsed = validateOrbitTemplateImport(JSON.parse(await file.text()));
      const importedTemplates = "templates" in parsed ? parsed.templates : [parsed];
      const importedIds = new Set<string>();
      for (const template of importedTemplates) {
        if (importedIds.has(template.templateId)) {
          throw new Error(`Duplicate orbit template id in import: ${template.templateId}`);
        }
        importedIds.add(template.templateId);
        const warnings = orbitTemplateWarnings(template);
        if (warnings.length > 0) {
          throw new Error(warnings[0]);
        }
      }
      const duplicateIds = importedTemplates.filter((template) => orbitTemplateLibrary.templates.some((item) => item.templateId === template.templateId));
      if (duplicateIds.length > 0) {
        throw new Error(`Orbit template id already exists: ${duplicateIds[0].templateId}`);
      }
      saveOrbitTemplateLibrary({
        schemaVersion: 1,
        templates: [...orbitTemplateLibrary.templates, ...importedTemplates],
      });
      toast.success("Orbit template JSON imported.");
    } catch (error) {
      toast.error(userErrorMessage(error, "Invalid orbit template JSON."));
    }
  }, [orbitTemplateLibrary, saveOrbitTemplateLibrary]);

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

  const createOrbitFromTemplate = useCallback(async (template: OrbitTemplate) => {
    const warnings = orbitTemplateWarnings(template);
    if (warnings.length > 0) {
      toast.error(warnings[0]);
      return;
    }
    try {
      await handleCreateManualOrbit({
        ...structuredClone(template.orbitDefinition),
        name: `${template.name} Orbit`,
      });
      toast.success("Orbit created from template.");
    } catch (error) {
      toast.error(userErrorMessage(error, "Unable to create orbit from template."));
    }
  }, [handleCreateManualOrbit]);

  const handleLoadImportedTle = useCallback(async (raw: string, sourceLabel: string) => {
    const result = loadTleText(raw);
    if (result.satellites.length > 0) {
      const first = result.satellites[0];
      if (first.tle) {
        const orbit = await createManualOrbit({
          name: first.name,
          type: "TLE",
          tle: first.tle,
          propagatorType: "TLE_SGP4",
        });
        rememberOrbit(storedOrbitFromManualOrbit({
          name: first.name,
          type: "TLE",
          tle: first.tle,
          propagatorType: "TLE_SGP4",
        }, orbit, manualOrbitToSatellite(orbit)));
        storedOrbitsFromImportedTle(result.satellites, raw, sourceLabel).forEach(rememberOrbit);
        setActiveDataSource("endpoint");
        setManualOrbitId(orbit.id);
        setServerStateBySatelliteId(new Map());
        setServerOrbitSnapshots(null);
        setServerGroundTrackSnapshots(null);
        setActiveSourceModal(null);
      } else {
        storedOrbitsFromImportedTle(result.satellites, raw, sourceLabel).forEach(rememberOrbit);
        setActiveDataSource("endpoint");
        setManualOrbitId(null);
        setActiveSourceModal(null);
      }
    }
    setMessages(
      result.errors.length > 0
        ? result.errors
        : [`Loaded ${result.satellites.length} satellites from ${sourceLabel}. ${result.satellites[0]?.tle ? "Active imported TLE persisted for mission planning." : ""}`],
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

  const refreshMissionPropagationProfile = useCallback(async (missionId: string) => {
    const profile = await fetchMissionPropagationProfile(missionId);
    setMissionPropagationProfile(profile);
    setPropagationProfileStatus("Mission propagation profile loaded.");
    return profile;
  }, []);

  const updateMissionPropagationProfileAction = useCallback(async (request: UpdatePropagationProfileRequest) => {
    if (!mission) {
      const message = "Open a mission before editing its propagation profile.";
      setPropagationProfileStatus(message);
      toast.error(message);
      return;
    }
    try {
      setPropagationProfileStatus("Updating mission propagation profile...");
      const updated = await updateMissionPropagationProfile(mission.id, request);
      setMissionPropagationProfile(updated);
      setPropagationProfileStatus("Mission propagation profile updated.");
      toast.success("Propagation profile updated.");
    } catch (error) {
      const message = userErrorMessage(error, "Unable to update propagation profile.");
      setPropagationProfileStatus(message);
      toast.error(message);
    }
  }, [mission]);

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

  const instantiateTemplateEvents = useCallback(async (createdMission: BackendMission, template: MissionTemplate) => {
    const resolved = resolveTemplateOffsets(template);
    if (resolved.warnings.length > 0) {
      throw new Error(resolved.warnings[0]);
    }
    const backendIdByTemplateId = new Map<string, string>();
    const orderedEvents = template.events.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex);
    for (const templateEvent of orderedEvents) {
      const offsetSeconds = resolved.offsets.get(templateEvent.templateEventId);
      if (offsetSeconds === undefined) {
        throw new Error(`Template event "${templateEvent.name}" could not be resolved.`);
      }
      const parameters = { ...templateEvent.parameters };
      const dependencyId = parameters.scheduleDependencyId;
      if (typeof dependencyId === "string") {
        const backendDependencyId = backendIdByTemplateId.get(dependencyId);
        if (!backendDependencyId) {
          throw new Error(`Template event "${templateEvent.name}" depends on an event that has not been created.`);
        }
        parameters.scheduleDependencyId = backendDependencyId;
      }
      if (readStringParameter(parameters, "scheduleMode", "MET") === "AFTER_EVENT") {
        parameters.scheduleValue = `after:${String(parameters.scheduleDependencyId)}+${metOffsetLabelFromSeconds(readNumberParameter(parameters, "scheduleOffsetSeconds", 0))}`;
      } else {
        parameters.scheduleMode = "MET";
        parameters.scheduleValue = metOffsetLabelFromSeconds(offsetSeconds);
        parameters.scheduleOffsetSeconds = offsetSeconds;
      }
      const createdEvent = await createMissionTimelineEvent(createdMission.id, {
        sequenceIndex: templateEvent.sequenceIndex,
        type: templateEvent.type === "COAST" ? "COAST" : "FINITE_BURN",
        name: templateEvent.name,
        enabled: templateEvent.enabled,
        executionTime: new Date(new Date(createdMission.scenarioStart).getTime() + offsetSeconds * 1000).toISOString(),
        parameters,
      });
      backendIdByTemplateId.set(templateEvent.templateEventId, createdEvent.id);
    }
  }, []);

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
      const selectedTemplate = missionSetupDraft.templateId
        ? templateLibrary.templates.find((template) => template.templateId === missionSetupDraft.templateId) ?? null
        : null;
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
      if (selectedTemplate) {
        await instantiateTemplateEvents(created, selectedTemplate);
      }
      await refreshMissionPropagationProfile(created.id);
      await refreshMissionTimeline(created.id);
      setIsMissionSetupOpen(false);
      setTimelineStatus(selectedTemplate ? `Mission created from template "${selectedTemplate.name}".` : "Mission timeline initialized.");
      toast.success(selectedTemplate ? "Mission created from template." : "Mission timeline initialized.");
    } catch (error) {
      const message = userErrorMessage(error, "Unable to initialize mission timeline.");
      setTimelineStatus(message);
      toast.error(message);
    }
  }, [activeStoredOrbit, instantiateTemplateEvents, manualOrbitId, missionSetupDraft, refreshMissionPropagationProfile, refreshMissionTimeline, rememberMission, selectedNoradId, selectedSnapshot, templateLibrary.templates]);

  const openCreateTimelineModal = useCallback((type: TimelineEditorDraft["type"] = "FINITE_BURN") => {
    const offsetSeconds = mission
      ? Math.max(0, Math.round((simTimeRef.current.getTime() - new Date(mission.scenarioStart).getTime()) / 1000))
      : 0;
    setTimelineDraft({
      ...defaultTimelineDraft,
      type,
      name: type === "COAST" ? "Coast" : "Finite Burn",
      scheduleMode: "MET",
      executionDateUtc: utcIsoToDateInput(simTimeRef.current.toISOString()),
      executionTimeUtc: utcIsoToTimeInput(simTimeRef.current.toISOString()),
      ...metOffsetPartsFromSeconds(offsetSeconds),
    });
    setTimelineModalMode("create");
  }, [mission]);

  const openEditTimelineModal = useCallback((event: BackendMissionTimelineEvent) => {
    setTimelineDraft(timelineDraftFromEvent(event, mission));
    setSelectedTimelineEventId(event.id);
    setTimelineModalMode("edit");
  }, [mission]);

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
    const sequenceIndex = timelineModalMode === "edit" && selectedTimelineEvent
      ? selectedTimelineEvent.sequenceIndex
      : missionTimelineEvents.length;
    const enabled = timelineModalMode === "edit" && selectedTimelineEvent
      ? selectedTimelineEvent.enabled
      : true;
    const proposedEvents = proposedEventsForDraft(
      timelineDraft,
      mission,
      missionTimelineEvents,
      selectedTimelineEvent?.id ?? null,
      sequenceIndex,
      enabled,
    );
    const dependencyWarnings = resolveEventMetOffsets(mission, proposedEvents).warnings;
    if (dependencyWarnings.length > 0) {
      const message = dependencyWarnings[0];
      setTimelineStatus(message);
      toast.error(message);
      return;
    }
    const executionIso = executionIsoFromTimelineDraft(timelineDraft, mission, missionTimelineEvents, selectedTimelineEvent?.id ?? null);
    const windowError = eventWindowError(mission, executionIso);
    if (windowError) {
      setTimelineStatus(windowError);
      toast.error(windowError);
      return;
    }

    setTimelineStatus("Saving timeline event...");
    try {
      if (timelineModalMode === "edit" && selectedTimelineEvent) {
        const request = buildTimelineRequest(timelineDraft, mission, missionTimelineEvents, selectedTimelineEvent.sequenceIndex, selectedTimelineEvent.enabled, selectedTimelineEvent.id);
        await updateMissionTimelineEvent(mission.id, selectedTimelineEvent.id, request);
      } else {
        const request = buildTimelineRequest(timelineDraft, mission, missionTimelineEvents, missionTimelineEvents.length, true);
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
  }, [mission, missionTimelineEvents, refreshMissionTimeline, selectedTimelineEvent, timelineDraft, timelineModalMode]);

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

  const updateTimelineEventSchedule = useCallback(async (
    event: BackendMissionTimelineEvent,
    targetMetSeconds: number,
    snapMode: TimelineSnapMode,
  ) => {
    if (!mission) {
      return;
    }
    let command: SchedulingUpdateCommand;
    try {
      command = buildSchedulingUpdateCommand(mission, missionTimelineEvents, event, targetMetSeconds, snapMode);
      const proposedEvents = missionTimelineEvents.map((item) => item.id === event.id
        ? { ...item, executionTime: command.executionTime, parameters: command.request.parameters }
        : item);
      const dependencyWarnings = resolveEventMetOffsets(mission, proposedEvents).warnings;
      if (dependencyWarnings.length > 0) {
        throw new Error(dependencyWarnings[0]);
      }
      const windowError = eventWindowError(mission, command.executionTime);
      if (windowError) {
        throw new Error(windowError);
      }
      setMissionTimelineEvents(proposedEvents);
      setTimelineStatus(`Saving ${event.name} at ${metOffsetLabelFromSeconds(command.targetMetSeconds)}...`);
      await updateMissionTimelineEvent(mission.id, event.id, command.request);
      const refreshed = await refreshMissionTimeline(mission.id);
      setMissionTrajectoryOverlay(null);
      const saved = refreshed.find((item) => item.id === event.id);
      setTimelineStatus(saved ? `${saved.name} scheduled at ${signedOffsetLabel(mission.scenarioStart, saved.executionTime)}.` : "Timeline schedule updated.");
      toast.success("Timeline schedule updated.");
    } catch (error) {
      await refreshMissionTimeline(mission.id);
      const message = userErrorMessage(error, "Unable to update event schedule.");
      setTimelineStatus(message);
      toast.error(message);
    }
  }, [mission, missionTimelineEvents, refreshMissionTimeline]);

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
      await refreshMissionPropagationProfile(mission.id);
      setTimelineStatus("Mission trajectory generated.");
      toast.success("Mission trajectory generated.");
      setActiveCommandModal((current) => current === "mission" ? null : current);
    } catch (error) {
      const message = userErrorMessage(error, "Unable to generate mission trajectory.");
      setTimelineStatus(message);
      toast.error(message);
    } finally {
      setIsMissionTrajectoryLoading(false);
    }
  }, [manualOrbitId, mission, refreshMissionPropagationProfile, selectedNoradId, selectedSnapshot, trajectoryAnchorTime, trajectoryWindowOptions.stepSec]);

  useEffect(() => {
    let ignore = false;

    async function loadMissionProfile() {
      if (!mission) {
        setMissionPropagationProfile(null);
        setPropagationProfileStatus(null);
        return;
      }
      try {
        const profile = await fetchMissionPropagationProfile(mission.id);
        if (!ignore) {
          setMissionPropagationProfile(profile);
          setPropagationProfileStatus("Mission propagation profile loaded.");
        }
      } catch (error) {
        if (!ignore) {
          const message = userErrorMessage(error, "Unable to load mission propagation profile.");
          setMissionPropagationProfile(null);
          setPropagationProfileStatus(message);
        }
      }
    }

    loadMissionProfile();

    return () => {
      ignore = true;
    };
  }, [mission]);

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
          setMissionPropagationProfile(null);
          setPropagationProfileStatus(null);
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
          setMissionPropagationProfile(null);
          setPropagationProfileStatus(null);
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
          setMissionPropagationProfile(null);
          setPropagationProfileStatus(null);
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
                New Orbit
              </button>
              <button
                type="button"
                onClick={() => setActiveCommandModal("mission")}
                className="border border-emerald-300/55 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300 hover:text-slate-950"
              >
                Plan Mission
              </button>
              <button
                type="button"
                onClick={() => setActiveCommandModal("analysis")}
                className="border border-white/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
              >
                Analysis
              </button>
              <button
                type="button"
                onClick={() => setActiveCommandModal("workspace")}
                className="border border-white/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
              >
                Workspace
              </button>
              <button
                type="button"
                onClick={() => setActiveCommandModal("templates")}
                className="border border-white/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100"
              >
                Templates
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
      <section className="thin-scrollbar pointer-events-auto absolute top-24 right-4 bottom-4 z-20 w-[340px] max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto pr-1 max-sm:hidden">
        <HudPanel>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Sat Filter</p>
            <button
              type="button"
              onClick={() => {
                setShowAllOrbits((value) => {
                  const next = !value;
                  if (next) {
                    setSatellites((current) => current.map((satellite) => ({
                      ...satellite,
                      visual: {
                        ...satellite.visual,
                        showMarker: true,
                        showOrbit: true,
                      },
                    })));
                  }
                  return next;
                });
              }}
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
          <div className="thin-scrollbar mt-3 max-h-[34vh] space-y-2 overflow-auto pr-1">
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

        <CommandStatusBadges
          missionReady={Boolean(mission)}
          trajectoryReady={Boolean(missionTrajectoryOverlay)}
          warningCount={missionSummaryAnalysis.warnings.length}
          conjunctionReady={canShowConjunctions && conjunctionSnapshots.length > 0}
        />

        <CommandSummaryCard
          title="Mission Summary"
          cta="Plan Mission"
          onAction={() => setActiveCommandModal("mission")}
          rows={[
            ["Mission", mission?.name ?? "No mission"],
            ["Window", mission ? `${compactIsoUtc(mission.scenarioStart)} -> ${compactIsoUtc(mission.scenarioEnd)}` : "--"],
            ["Events", String(missionSummaryAnalysis.eventCount)],
            ["Burns / Coasts", `${missionSummaryAnalysis.burnCount} / ${missionSummaryAnalysis.coastCount}`],
            ["Dependencies", String(dependencyCount)],
            ["Warnings", String(missionSummaryAnalysis.warnings.length)],
            ["Trajectory", trajectoryStatus],
          ]}
        />

        <CommandSummaryCard
          title="Analysis Summary"
          cta="Analysis"
          onAction={() => setActiveCommandModal("analysis")}
          rows={[
            ["Range", effectiveShowRangeCheck && rangeMeasurement ? `${formatNumber(rangeMeasurement.distanceKm, 1)} km` : canUseRangeCheck ? "Available" : "Unavailable"],
            ["Conjunction", effectiveShowConjunctions ? `${conjunctionSnapshots.length} visible` : conjunctionSnapshots.length > 0 ? "Available" : "No events"],
            ["Maneuvers", effectiveShowManeuvers ? `${maneuverSnapshots.length} visible` : maneuverSnapshots.length > 0 ? "Available" : "No events"],
            ["Last Analysis", analysisLastTimestamp],
          ]}
        />

        <CommandSummaryCard
          title="Workspace Summary"
          cta="Workspace"
          secondaryCta="Templates"
          onAction={() => setActiveCommandModal("workspace")}
          onSecondaryAction={() => setActiveCommandModal("templates")}
          rows={[
            ["Active Orbit", activeStoredOrbit?.orbitName ?? selectedSnapshot?.satellite.name ?? "--"],
            ["Active Mission", activeStoredMission?.missionName ?? mission?.name ?? "--"],
            ["Orbits", String(orbitLibrary.length)],
            ["Missions", String(missionLibrary.missions.length)],
            ["Templates", String(templateLibrary.templates.length + orbitTemplateLibrary.templates.length)],
          ]}
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
          events={missionTimelineEvents}
          editingEventId={selectedTimelineEvent?.id ?? null}
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
          templates={templateLibrary.templates}
          onDraftChange={setMissionSetupDraft}
          onCreate={initializeMissionTimeline}
          onClose={() => setIsMissionSetupOpen(false)}
        />
      )}

      {activeCommandModal === "mission" && (
        <CommandModal title="Mission Planner" onClose={() => setActiveCommandModal(null)} size="mission">
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
            simulationTimeIso={simTime.toISOString()}
            onInitializeMission={openMissionSetup}
            onOpenCatalog={() => openOrbitSource("catalog")}
            onOpenWorkspace={() => setActiveCommandModal("workspace")}
            onOpenTemplates={() => setActiveCommandModal("templates")}
            onCreateEvent={openCreateTimelineModal}
            onEditEvent={openEditTimelineModal}
            onDeleteEvent={deleteTimelineEvent}
            onToggleEvent={toggleTimelineEventEnabled}
            onSelectEvent={setSelectedTimelineEventId}
            onGenerateTrajectory={generateMissionTrajectory}
            onToggleComparison={() => setShowMissionComparison((value) => !value)}
            onDragEvent={setTimelineDragEventId}
            onDropEvent={reorderTimelineEvent}
            onScheduleEvent={updateTimelineEventSchedule}
          />
        </CommandModal>
      )}

      {activeCommandModal === "workspace" && (
        <CommandModal title="Workspace" onClose={() => setActiveCommandModal(null)} size="wide">
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
        </CommandModal>
      )}

      {activeCommandModal === "templates" && (
        <CommandModal title="Templates" onClose={() => setActiveCommandModal(null)} size="wide">
          <TemplateLibraryPanel
            templateLibrary={templateLibrary}
            orbitTemplateLibrary={orbitTemplateLibrary}
            onSaveCurrentMissionAsTemplate={saveCurrentMissionAsTemplate}
            onRenameTemplate={renameTemplate}
            onEditTemplate={editTemplateMetadata}
            onCloneTemplate={cloneTemplate}
            onDeleteTemplate={deleteTemplate}
            onExportTemplate={exportTemplate}
            onSaveCurrentOrbitAsTemplate={saveCurrentOrbitAsTemplate}
            onCreateOrbitFromTemplate={createOrbitFromTemplate}
            onRenameOrbitTemplate={renameOrbitTemplate}
            onEditOrbitTemplate={editOrbitTemplateMetadata}
            onCloneOrbitTemplate={cloneOrbitTemplate}
            onDeleteOrbitTemplate={deleteOrbitTemplateAction}
            onExportOrbitTemplate={exportOrbitTemplate}
            onImportTemplate={() => templateImportInputRef.current?.click()}
            onImportOrbitTemplate={() => orbitTemplateImportInputRef.current?.click()}
          />
        </CommandModal>
      )}

      {activeCommandModal === "analysis" && (
        <CommandModal title="Analysis" onClose={() => setActiveCommandModal(null)} size="wide">
          <AnalysisModalContent
            selectedNoradId={selectedNoradId}
            canUseAnalysisConfig={canUseAnalysisConfig}
            analysisConfig={analysisConfig}
            missionPropagationProfile={missionPropagationProfile}
            propagationProfileStatus={propagationProfileStatus}
            analysisMessage={analysisMessage}
            rangePrimaryId={rangePrimaryId}
            rangeSecondaryId={rangeSecondaryId}
            satellites={satellites}
            canUseRangeCheck={canUseRangeCheck}
            effectiveShowRangeCheck={effectiveShowRangeCheck}
            rangeMeasurement={rangeMeasurement}
            maneuverSnapshots={maneuverSnapshots}
            missionEvents={missionTimelineEvents}
            selectedManeuverId={selectedManeuver?.event.id ?? null}
            showManeuvers={effectiveShowManeuvers}
            canShowManeuvers={canShowManeuvers}
            conjunctionSnapshots={conjunctionSnapshots}
            selectedConjunctionId={selectedConjunction?.event.id ?? null}
            showConjunctions={effectiveShowConjunctions}
            canShowConjunctions={canShowConjunctions}
            trajectoryOverlay={missionTrajectoryOverlay}
            showComparison={showMissionComparison}
            onApplyPreset={applySelectedPreset}
            onToggleMode={toggleSelectedMode}
            onUpdatePropagationProfile={updateMissionPropagationProfileAction}
            onToggleRangeCheck={toggleRangeCheck}
            onUpdateRangePrimary={updateRangePrimary}
            onUpdateRangeSecondary={updateRangeSecondary}
            onSelectManeuver={setSelectedManeuverId}
            onToggleManeuvers={() => setShowManeuvers((value) => !value)}
            onOpenManeuverModal={() => setIsManeuverModalOpen(true)}
            onSelectConjunction={setSelectedConjunctionId}
            onToggleConjunctions={() => setShowConjunctions((value) => !value)}
            onToggleComparison={() => setShowMissionComparison((value) => !value)}
          />
        </CommandModal>
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
          onCreateOrbitFromTemplate={createOrbitFromTemplate}
          onLoadImportedTle={handleLoadImportedTle}
          onLoadCatalogSatellite={handleLoadCatalogSatellite}
          orbitTemplates={orbitTemplateLibrary.templates}
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
      <input
        ref={templateImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={importTemplateFile}
      />
      <input
        ref={orbitTemplateImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={importOrbitTemplateFile}
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

function CommandStatusBadges({
  missionReady,
  trajectoryReady,
  warningCount,
  conjunctionReady,
}: {
  missionReady: boolean;
  trajectoryReady: boolean;
  warningCount: number;
  conjunctionReady: boolean;
}) {
  const badges = [
    { label: missionReady ? "Mission Active" : "No Mission", tone: missionReady ? "ok" : "idle" },
    { label: trajectoryReady ? "Trajectory Ready" : "Trajectory Pending", tone: trajectoryReady ? "ok" : "idle" },
    { label: warningCount > 0 ? `${warningCount} Warnings` : "No Warnings", tone: warningCount > 0 ? "warn" : "ok" },
    { label: conjunctionReady ? "Conjunction Ready" : "Conjunction Offline", tone: conjunctionReady ? "ok" : "idle" },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`border px-2 py-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] ${
            badge.tone === "ok"
              ? "border-emerald-300/35 bg-emerald-300/[0.05] text-emerald-100"
              : badge.tone === "warn"
                ? "border-amber-300/35 bg-amber-300/[0.05] text-amber-100"
                : "border-white/10 bg-black/25 text-zinc-500"
          }`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function CommandSummaryCard({
  title,
  rows,
  cta,
  secondaryCta,
  onAction,
  onSecondaryAction,
}: {
  title: string;
  rows: Array<[string, string]>;
  cta: string;
  secondaryCta?: string;
  onAction: () => void;
  onSecondaryAction?: () => void;
}) {
  return (
    <HudPanel>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{title}</p>
        <button type="button" onClick={onAction} className="border border-cyan-300/50 px-3 py-1.5 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300 hover:text-slate-950">
          {cta}
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5 text-xs last:border-b-0 last:pb-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</span>
            <span className="max-w-[190px] truncate text-right text-zinc-200" title={value}>{value}</span>
          </div>
        ))}
      </div>
      {secondaryCta && onSecondaryAction && (
        <button type="button" onClick={onSecondaryAction} className="mt-3 w-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
          {secondaryCta}
        </button>
      )}
    </HudPanel>
  );
}

function CommandModal({
  title,
  children,
  onClose,
  size = "normal",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "normal" | "wide" | "mission";
}) {
  const sizeClass = size === "mission"
    ? "max-h-[94vh] w-[min(1400px,95vw)]"
    : size === "wide"
      ? "max-h-[90vh] w-[min(1180px,90vw)]"
      : "max-h-[88vh] w-[min(760px,94vw)]";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className={`flex flex-col overflow-hidden border border-cyan-300/30 bg-[#071016]/96 shadow-2xl ${sizeClass}`}>
        <div className="flex items-center justify-between border-b border-cyan-300/20 px-5 py-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Command Center</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 transition hover:border-cyan-300 hover:text-white" aria-label={`Close ${title}`} title="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 overflow-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
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
  {
    id: "template",
    title: "Orbit Template",
    subtitle: "Reusable states",
    icon: "template",
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
        {id === "template" && <path d="M5 5h14v6H5zM5 15h6v4H5zM15 15h4v4h-4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />}
      </svg>
    </span>
  );
}

function OrbitSourceModal({
  source,
  onClose,
  onCreateManualOrbit,
  onCreateOrbitFromTemplate,
  onLoadImportedTle,
  onLoadCatalogSatellite,
  orbitTemplates,
  backendCatalogGroup,
  onBackendCatalogGroupChange,
  tleUrl,
  onTleUrlChange,
}: {
  source: OrbitSourceId;
  onClose: () => void;
  onCreateManualOrbit: (request: CreateManualOrbitRequest) => Promise<void>;
  onCreateOrbitFromTemplate: (template: OrbitTemplate) => Promise<void>;
  onLoadImportedTle: (raw: string, sourceLabel: string) => Promise<{ satellites: SatelliteObject[]; errors: string[] }>;
  onLoadCatalogSatellite: (satellite: SatelliteObject) => void;
  orbitTemplates: OrbitTemplate[];
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
        : source === "cartesian"
          ? "Cartesian State"
          : "Orbit Template";

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
          {source === "template" && (
            <OrbitTemplateFlow
              templates={orbitTemplates}
              onCreateOrbitFromTemplate={onCreateOrbitFromTemplate}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function OrbitTemplateFlow({
  templates,
  onCreateOrbitFromTemplate,
}: {
  templates: OrbitTemplate[];
  onCreateOrbitFromTemplate: (template: OrbitTemplate) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.templateId ?? "");
  const selected = templates.find((template) => template.templateId === selectedId) ?? templates[0] ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <div className="min-h-[360px] border border-white/10 bg-black/25">
        {templates.length === 0 ? (
          <div className="grid h-full min-h-[360px] place-items-center p-8 text-center">
            <div>
              <p className="text-sm font-semibold text-zinc-200">No orbit templates saved</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">Create a manual Classical Elements or Cartesian orbit, then save it as a reusable orbit template from the Workspace panel.</p>
            </div>
          </div>
        ) : (
          <div className="max-h-[430px] overflow-auto p-3">
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.templateId}
                  type="button"
                  onClick={() => setSelectedId(template.templateId)}
                  className={`w-full border p-3 text-left transition ${selected?.templateId === template.templateId ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-black/25 hover:border-cyan-300/45"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">{template.name}</span>
                      <span className="mt-1 block font-mono text-[10px] uppercase text-zinc-500">{template.category} / {orbitTemplateTypeLabel(template)}</span>
                    </span>
                    <span className="font-mono text-[10px] text-cyan-200">{template.tags.slice(0, 1).join("") || "template"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="border border-white/10 bg-black/25 p-4">
        {selected ? (
          <div className="flex h-full min-h-[320px] flex-col">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Selected Template</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{selected.name}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{selected.description || "No description."}</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="border border-cyan-300/15 bg-black/25 px-3 py-2">
                <p className="font-mono text-[10px] uppercase text-zinc-500">Type</p>
                <p className="mt-1 text-sm text-cyan-100">{orbitTemplateTypeLabel(selected)}</p>
              </div>
              <div className="border border-cyan-300/15 bg-black/25 px-3 py-2">
                <p className="font-mono text-[10px] uppercase text-zinc-500">Category</p>
                <p className="mt-1 text-sm text-cyan-100">{selected.category}</p>
              </div>
              <div className="border border-cyan-300/15 bg-black/25 px-3 py-2">
                <p className="font-mono text-[10px] uppercase text-zinc-500">Propagator</p>
                <p className="mt-1 text-sm text-cyan-100">{selected.orbitDefinition.propagatorType ?? "KEPLERIAN"}</p>
              </div>
              <div className="border border-cyan-300/15 bg-black/25 px-3 py-2">
                <p className="font-mono text-[10px] uppercase text-zinc-500">Updated</p>
                <p className="mt-1 font-mono text-xs text-cyan-100">{compactIsoUtc(selected.updatedAt)}</p>
              </div>
            </div>
            <div className="mt-auto flex justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => onCreateOrbitFromTemplate(selected)}
                className="border border-cyan-300 bg-cyan-300 px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200"
              >
                Create Orbit
              </button>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[320px] place-items-center text-sm text-zinc-500">Save or import an orbit template to create reusable manual orbits.</div>
        )}
      </div>
    </div>
  );
}

function TleImportFlow({
  tleUrl,
  onTleUrlChange,
  onLoadImportedTle,
}: {
  tleUrl: string;
  onTleUrlChange: (value: string) => void;
  onLoadImportedTle: (raw: string, sourceLabel: string) => Promise<{ satellites: SatelliteObject[]; errors: string[] }>;
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

  const importTle = async () => {
    setIsLoading(true);
    try {
      const result = await onLoadImportedTle(raw, mode === "url" ? "URL import" : mode === "upload" ? "uploaded file" : "pasted TLE");
      if (result.satellites.length === 0) {
        setStatus(result.errors[0] ?? "No valid TLE objects found.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to import TLE.");
    } finally {
      setIsLoading(false);
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
              disabled={preview.satellites.length === 0 || isLoading}
              className="border border-cyan-300 bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-zinc-500"
            >
              {isLoading ? "Importing" : "Import"}
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

function AnalysisModalContent({
  selectedNoradId,
  canUseAnalysisConfig,
  analysisConfig,
  missionPropagationProfile,
  propagationProfileStatus,
  analysisMessage,
  rangePrimaryId,
  rangeSecondaryId,
  satellites,
  canUseRangeCheck,
  effectiveShowRangeCheck,
  rangeMeasurement,
  maneuverSnapshots,
  missionEvents,
  selectedManeuverId,
  showManeuvers,
  canShowManeuvers,
  conjunctionSnapshots,
  selectedConjunctionId,
  showConjunctions,
  canShowConjunctions,
  trajectoryOverlay,
  showComparison,
  onApplyPreset,
  onToggleMode,
  onUpdatePropagationProfile,
  onToggleRangeCheck,
  onUpdateRangePrimary,
  onUpdateRangeSecondary,
  onSelectManeuver,
  onToggleManeuvers,
  onOpenManeuverModal,
  onSelectConjunction,
  onToggleConjunctions,
  onToggleComparison,
}: {
  selectedNoradId: string | number | null;
  canUseAnalysisConfig: boolean;
  analysisConfig: BackendAnalysisConfigResponse | null;
  missionPropagationProfile: BackendPropagationProfile | null;
  propagationProfileStatus: string | null;
  analysisMessage: string | null;
  rangePrimaryId: string;
  rangeSecondaryId: string;
  satellites: SatelliteObject[];
  canUseRangeCheck: boolean;
  effectiveShowRangeCheck: boolean;
  rangeMeasurement: { primary: SatelliteSnapshot; secondary: SatelliteSnapshot; distanceKm: number } | null;
  maneuverSnapshots: ManeuverSnapshot[];
  missionEvents: BackendMissionTimelineEvent[];
  selectedManeuverId: string | null;
  showManeuvers: boolean;
  canShowManeuvers: boolean;
  conjunctionSnapshots: ConjunctionSnapshot[];
  selectedConjunctionId: string | null;
  showConjunctions: boolean;
  canShowConjunctions: boolean;
  trajectoryOverlay: MissionTrajectoryOverlay | null;
  showComparison: boolean;
  onApplyPreset: (preset: AnalysisPresetId) => void;
  onToggleMode: (mode: string, enabled: boolean) => void;
  onUpdatePropagationProfile: (request: UpdatePropagationProfileRequest) => Promise<void>;
  onToggleRangeCheck: () => void;
  onUpdateRangePrimary: (satelliteId: string) => void;
  onUpdateRangeSecondary: (satelliteId: string) => void;
  onSelectManeuver: (eventId: string) => void;
  onToggleManeuvers: () => void;
  onOpenManeuverModal: () => void;
  onSelectConjunction: (eventId: string) => void;
  onToggleConjunctions: () => void;
  onToggleComparison: () => void;
}) {
  const [tab, setTab] = useState<"trajectory" | "range" | "conjunction" | "maneuver" | "propagation">("trajectory");
  const missionBurnEvents = useMemo(() => missionEvents.filter((event) => event.type === "FINITE_BURN"), [missionEvents]);
  const totalBurnDuration = missionBurnEvents.reduce((sum, event) => sum + readNumberParameter(event.parameters ?? {}, "durationSeconds", 0), 0);
  const visiblePropagationConfig = missionPropagationProfile ?? analysisConfig?.config ?? null;

  return (
    <div>
      <div className="grid grid-cols-5 border border-cyan-300/20 max-sm:grid-cols-2">
        {[
          { id: "trajectory" as const, label: "Trajectory" },
          { id: "range" as const, label: "Range" },
          { id: "conjunction" as const, label: "Conjunction" },
          { id: "maneuver" as const, label: "Maneuver" },
          { id: "propagation" as const, label: "Propagation" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3 py-2 font-mono text-xs uppercase transition ${tab === item.id ? "bg-cyan-300 text-slate-950" : "text-cyan-100 hover:bg-cyan-300/10"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "trajectory" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <HudPanel>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Trajectory Preview</p>
              <p className="mt-2 text-sm text-zinc-300">{trajectoryOverlay ? trajectoryOverlay.message : "No mission trajectory generated yet."}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <DetailMetric label="Mission Overlay" value={trajectoryOverlay?.mission ? "Ready" : "--"} />
                <DetailMetric label="Legacy Overlay" value={trajectoryOverlay?.legacy ? "Ready" : "--"} />
                <DetailMetric label="Comparison" value={showComparison ? "Visible" : "Hidden"} />
                <DetailMetric label="Generated" value={trajectoryOverlay ? compactIsoUtc(trajectoryOverlay.generatedAt) : "--"} />
              </div>
              <button type="button" disabled={!trajectoryOverlay} onClick={onToggleComparison} className="mt-3 workspace-action">
                {showComparison ? "Hide Comparison Overlay" : "Show Comparison Overlay"}
              </button>
            </HudPanel>

            <HudPanel>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Analysis Config</p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    {missionPropagationProfile ? "Mission profile used by trajectory" : selectedNoradId ? `NORAD ${selectedNoradId}` : "Manual/local orbit"}
                  </p>
                </div>
                <span className="border border-cyan-300/30 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
                  {visiblePropagationConfig?.propagatorType.replaceAll("_", " ") ?? "--"}
                </span>
              </div>
              {missionPropagationProfile ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <DetailMetric label="Profile" value={missionPropagationProfile.name} />
                  <DetailMetric label="Maneuvers" value={missionPropagationProfile.maneuverModelEnabled ? "Enabled" : "Disabled"} />
                  <DetailMetric label="Owner" value={missionPropagationProfile.ownerType.replaceAll("_", " ")} />
                  <DetailMetric label="Updated" value={compactIsoUtc(missionPropagationProfile.updatedAt)} />
                </div>
              ) : !canUseAnalysisConfig ? (
                <p className="mt-3 text-xs leading-5 text-zinc-500">Create or open a mission to view the exact mission propagation profile. Catalog-only analysis configuration is available for backend catalog orbits.</p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {analysisPresetOptions.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onApplyPreset(preset.id)}
                        className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${analysisConfig?.config.preset === preset.id ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-cyan-300/25 text-cyan-100 hover:border-cyan-300"}`}
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
                          onClick={() => onToggleMode(mode.id, !checked)}
                          className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${checked ? "border-lime-300 bg-lime-300/15 text-lime-100" : "border-white/10 text-zinc-500 hover:border-lime-300/60 hover:text-zinc-200"}`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {analysisMessage && <p className="mt-3 text-xs leading-5 text-cyan-100">{analysisMessage}</p>}
            </HudPanel>
          </div>
        )}

        {tab === "range" && (
          <HudPanel>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Range Analysis</p>
              <button type="button" aria-pressed={effectiveShowRangeCheck} disabled={!canUseRangeCheck} onClick={onToggleRangeCheck} className="workspace-action">
                {effectiveShowRangeCheck ? "On" : "Off"}
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{rangeMeasurement ? `${rangeMeasurement.primary.satellite.name} -> ${rangeMeasurement.secondary.satellite.name}: ${formatNumber(rangeMeasurement.distanceKm, 1)} km` : "Select two satellites to measure range."}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <select value={rangePrimaryId} onChange={(event) => onUpdateRangePrimary(event.target.value)} className="border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-cyan-300">
                {!rangePrimaryId && <option value="">Primary: Select satellite</option>}
                {satellites.map((satellite) => <option key={satellite.id} value={satellite.id}>Primary: {satellite.name}</option>)}
              </select>
              <select value={rangeSecondaryId} onChange={(event) => onUpdateRangeSecondary(event.target.value)} className="border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-cyan-300">
                {!rangeSecondaryId && <option value="">Secondary: Select satellite</option>}
                {satellites.map((satellite) => <option key={satellite.id} value={satellite.id} disabled={satellite.id === rangePrimaryId}>Secondary: {satellite.name}</option>)}
              </select>
            </div>
          </HudPanel>
        )}

        {tab === "conjunction" && (
          <ConjunctionPanel
            conjunctionSnapshots={conjunctionSnapshots}
            selectedConjunctionId={selectedConjunctionId}
            showConjunctions={showConjunctions}
            disabled={!canShowConjunctions}
            onSelectConjunction={onSelectConjunction}
            onToggleConjunctions={onToggleConjunctions}
          />
        )}

        {tab === "maneuver" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <HudPanel>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Mission Timeline Burn Summary</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <DetailMetric label="Burn Count" value={String(missionBurnEvents.length)} />
                <DetailMetric label="Duration" value={secondsToDurationLabel(totalBurnDuration)} />
                <DetailMetric label="Delta-V" value="Not computed" />
                <DetailMetric label="Timeline" value={missionBurnEvents.length > 0 ? "Available" : "--"} />
              </div>
              <div className="thin-scrollbar mt-3 max-h-[42vh] space-y-2 overflow-auto pr-1">
                {missionBurnEvents.length === 0 ? (
                  <p className="border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-500">No finite-burn mission events found.</p>
                ) : (
                  missionBurnEvents.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex).map((event) => (
                    <div key={event.id} className="border border-rose-300/25 bg-rose-300/[0.04] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{event.name}</p>
                          <p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">{compactIsoUtc(event.executionTime)}</p>
                        </div>
                        <span className="border border-rose-300/40 px-2 py-0.5 font-mono text-[10px] uppercase text-rose-100">Burn</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <DetailMetric label="Duration" value={`${readNumberParameter(event.parameters ?? {}, "durationSeconds", 0)}s`} />
                        <DetailMetric label="Thrust" value={`${readNumberParameter(event.parameters ?? {}, "thrustNewton", 0)} N`} />
                        <DetailMetric label="Frame" value={readStringParameter(event.parameters ?? {}, "directionFrame", "TNW")} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </HudPanel>
            <ManeuverPanel
              maneuverSnapshots={maneuverSnapshots}
              selectedManeuverId={selectedManeuverId}
              showManeuvers={showManeuvers}
              disabled={!canShowManeuvers}
              onSelectManeuver={onSelectManeuver}
              onToggleManeuvers={onToggleManeuvers}
              onOpenManeuverModal={onOpenManeuverModal}
            />
          </div>
        )}

        {tab === "propagation" && (
          <HudPanel>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Propagation Configuration</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {missionPropagationProfile
                ? "Exact mission propagation profile used by generated trajectories."
                : "Catalog analysis configuration fallback. Open or create a mission to edit the exact trajectory profile."}
            </p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {[
                ["Propagator", visiblePropagationConfig?.propagatorType.replaceAll("_", " ") ?? "Manual/default"],
                ["Gravity", visiblePropagationConfig?.gravityEnabled ? `ON ${visiblePropagationConfig.gravityDegree}x${visiblePropagationConfig.gravityOrder}` : "OFF"],
                ["Atmospheric Drag", visiblePropagationConfig?.dragEnabled ? "ON" : "OFF"],
                ["Solar Radiation", visiblePropagationConfig?.solarRadiationPressureEnabled ? "ON" : "OFF"],
                ["Third Body Sun", visiblePropagationConfig?.thirdBodySunEnabled ? "ON" : "OFF"],
                ["Third Body Moon", visiblePropagationConfig?.thirdBodyMoonEnabled ? "ON" : "OFF"],
                ["Maneuver Model", visiblePropagationConfig?.maneuverModelEnabled ? "ON" : "OFF"],
                ["Relativity / Tides", "Not configured"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border border-white/10 bg-black/25 px-3 py-2 text-xs">
                  <span className="font-mono uppercase tracking-[0.12em] text-zinc-500">{label}</span>
                  <span className={String(value).startsWith("ON") ? "font-mono text-lime-100" : "font-mono text-zinc-300"}>{value}</span>
                </div>
              ))}
            </div>
            {missionPropagationProfile ? (
              <PropagationProfileEditor
                key={`${missionPropagationProfile.id}-${missionPropagationProfile.updatedAt}`}
                profile={missionPropagationProfile}
                status={propagationProfileStatus}
                onUpdate={onUpdatePropagationProfile}
              />
            ) : propagationProfileStatus ? (
              <p className="mt-3 text-xs leading-5 text-zinc-500">{propagationProfileStatus}</p>
            ) : null}
          </HudPanel>
        )}
      </div>
    </div>
  );
}

function PropagationProfileEditor({
  profile,
  status,
  onUpdate,
}: {
  profile: BackendPropagationProfile;
  status: string | null;
  onUpdate: (request: UpdatePropagationProfileRequest) => Promise<void>;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExpert, setShowExpert] = useState(false);
  const [advancedDraft, setAdvancedDraft] = useState(() => spacecraftDraftFromProfile(profile));
  const [expertDraft, setExpertDraft] = useState(() => integratorDraftFromProfile(profile));

  const forceModes = [
    { key: "gravityEnabled" as const, label: "Gravity" },
    { key: "dragEnabled" as const, label: "Drag" },
    { key: "solarRadiationPressureEnabled" as const, label: "SRP" },
    { key: "thirdBodySunEnabled" as const, label: "Sun" },
    { key: "thirdBodyMoonEnabled" as const, label: "Moon" },
    { key: "maneuverModelEnabled" as const, label: "Maneuver" },
  ];

  const saveAdvanced = () => {
    void onUpdate({
      dryMassKg: numberFromDraft(advancedDraft.dryMassKg, profile.dryMassKg),
      fuelMassKg: numberFromDraft(advancedDraft.fuelMassKg, profile.fuelMassKg),
      dragAreaM2: numberFromDraft(advancedDraft.dragAreaM2, profile.dragAreaM2),
      dragCoefficient: numberFromDraft(advancedDraft.dragCoefficient, profile.dragCoefficient),
      srpAreaM2: numberFromDraft(advancedDraft.srpAreaM2, profile.srpAreaM2),
      reflectivityCoefficient: numberFromDraft(advancedDraft.reflectivityCoefficient, profile.reflectivityCoefficient),
      nominalThrustN: numberFromDraft(advancedDraft.nominalThrustN, profile.nominalThrustN),
      nominalIspS: numberFromDraft(advancedDraft.nominalIspS, profile.nominalIspS),
    });
  };

  const saveExpert = () => {
    void onUpdate({
      integratorMinStep: numberFromDraft(expertDraft.integratorMinStep, profile.integratorMinStep),
      integratorMaxStep: numberFromDraft(expertDraft.integratorMaxStep, profile.integratorMaxStep),
      integratorAbsTol: numberFromDraft(expertDraft.integratorAbsTol, profile.integratorAbsTol),
      integratorRelTol: numberFromDraft(expertDraft.integratorRelTol, profile.integratorRelTol),
    });
  };

  return (
    <div className="mt-5 border border-cyan-300/15 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">Mission Profile Editor</p>
          <p className="mt-1 text-xs text-zinc-500">{profile.name}</p>
        </div>
        <span className="border border-cyan-300/25 px-2 py-1 font-mono text-[10px] uppercase text-cyan-100">
          {profile.preset.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {forceModes.map((mode) => {
          const checked = Boolean(profile[mode.key]);
          return (
            <button
              key={mode.key}
              type="button"
              aria-pressed={checked}
              onClick={() => {
                void onUpdate({ [mode.key]: !checked });
              }}
              className={`border px-2 py-1.5 font-mono text-[10px] uppercase transition ${checked ? "border-lime-300 bg-lime-300/15 text-lime-100" : "border-white/10 text-zinc-500 hover:border-lime-300/60 hover:text-zinc-200"}`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="workspace-action">
          {showAdvanced ? "Hide Advanced" : "Advanced"}
        </button>
        <button type="button" onClick={() => setShowExpert((value) => !value)} className="workspace-action">
          {showExpert ? "Hide Expert" : "Expert"}
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {[
            ["dryMassKg", "Dry Mass kg"],
            ["fuelMassKg", "Fuel Mass kg"],
            ["dragAreaM2", "Drag Area m2"],
            ["dragCoefficient", "Drag Cd"],
            ["srpAreaM2", "SRP Area m2"],
            ["reflectivityCoefficient", "Reflectivity"],
            ["nominalThrustN", "Thrust N"],
            ["nominalIspS", "ISP s"],
          ].map(([key, label]) => (
            <ProfileNumberInput
              key={key}
              label={label}
              value={advancedDraft[key as keyof typeof advancedDraft]}
              onChange={(value) => setAdvancedDraft((current) => ({ ...current, [key]: value }))}
            />
          ))}
          <button type="button" onClick={saveAdvanced} className="workspace-action md:col-span-4">
            Save Advanced
          </button>
        </div>
      )}

      {showExpert && (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {[
            ["integratorMinStep", "Min Step s"],
            ["integratorMaxStep", "Max Step s"],
            ["integratorAbsTol", "Abs Tol"],
            ["integratorRelTol", "Rel Tol"],
          ].map(([key, label]) => (
            <ProfileNumberInput
              key={key}
              label={label}
              value={expertDraft[key as keyof typeof expertDraft]}
              onChange={(value) => setExpertDraft((current) => ({ ...current, [key]: value }))}
            />
          ))}
          <button type="button" onClick={saveExpert} className="workspace-action md:col-span-4">
            Save Expert
          </button>
        </div>
      )}

      {status && <p className="mt-3 text-xs leading-5 text-zinc-500">{status}</p>}
    </div>
  );
}

function ProfileNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-white/10 bg-black/35 px-2 py-1.5 text-xs text-zinc-100 outline-none transition focus:border-cyan-300"
      />
    </label>
  );
}

function spacecraftDraftFromProfile(profile: BackendPropagationProfile) {
  return {
    dryMassKg: String(profile.dryMassKg),
    fuelMassKg: String(profile.fuelMassKg),
    dragAreaM2: String(profile.dragAreaM2),
    dragCoefficient: String(profile.dragCoefficient),
    srpAreaM2: String(profile.srpAreaM2),
    reflectivityCoefficient: String(profile.reflectivityCoefficient),
    nominalThrustN: String(profile.nominalThrustN),
    nominalIspS: String(profile.nominalIspS),
  };
}

function integratorDraftFromProfile(profile: BackendPropagationProfile) {
  return {
    integratorMinStep: String(profile.integratorMinStep),
    integratorMaxStep: String(profile.integratorMaxStep),
    integratorAbsTol: String(profile.integratorAbsTol),
    integratorRelTol: String(profile.integratorRelTol),
  };
}

function numberFromDraft(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
            {orbitLibrary.length} orbits / {missionLibrary.missions.length} missions
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

function TemplateLibraryPanel({
  templateLibrary,
  orbitTemplateLibrary,
  onSaveCurrentMissionAsTemplate,
  onRenameTemplate,
  onEditTemplate,
  onCloneTemplate,
  onDeleteTemplate,
  onExportTemplate,
  onSaveCurrentOrbitAsTemplate,
  onCreateOrbitFromTemplate,
  onRenameOrbitTemplate,
  onEditOrbitTemplate,
  onCloneOrbitTemplate,
  onDeleteOrbitTemplate,
  onExportOrbitTemplate,
  onImportTemplate,
  onImportOrbitTemplate,
}: {
  templateLibrary: MissionTemplateLibraryState;
  orbitTemplateLibrary: OrbitTemplateLibraryState;
  onSaveCurrentMissionAsTemplate: () => void;
  onRenameTemplate: (template: MissionTemplate) => void;
  onEditTemplate: (template: MissionTemplate) => void;
  onCloneTemplate: (template: MissionTemplate) => void;
  onDeleteTemplate: (template: MissionTemplate) => void;
  onExportTemplate: (template: MissionTemplate) => void;
  onSaveCurrentOrbitAsTemplate: () => void;
  onCreateOrbitFromTemplate: (template: OrbitTemplate) => void;
  onRenameOrbitTemplate: (template: OrbitTemplate) => void;
  onEditOrbitTemplate: (template: OrbitTemplate) => void;
  onCloneOrbitTemplate: (template: OrbitTemplate) => void;
  onDeleteOrbitTemplate: (template: OrbitTemplate) => void;
  onExportOrbitTemplate: (template: OrbitTemplate) => void;
  onImportTemplate: () => void;
  onImportOrbitTemplate: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HudPanel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Orbit Templates</p>
            <p className="mt-1 text-[11px] text-zinc-500">{orbitTemplateLibrary.templates.length} reusable orbit definitions</p>
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={onSaveCurrentOrbitAsTemplate} className="workspace-action">Save Current</button>
            <button type="button" onClick={onImportOrbitTemplate} className="workspace-action">Import</button>
          </div>
        </div>
        <div className="mt-3 max-h-[58vh] space-y-2 overflow-auto pr-1">
          {orbitTemplateLibrary.templates.length === 0 ? (
            <p className="border border-white/10 bg-black/25 px-3 py-2 font-mono text-[10px] uppercase text-zinc-600">No orbit templates yet</p>
          ) : (
            orbitTemplateLibrary.templates.map((template) => (
              <div key={template.templateId} className="border border-white/10 bg-black/25 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{template.name}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">{template.category} / {orbitTemplateTypeLabel(template)}</p>
                  </div>
                  <span className="font-mono text-[10px] text-cyan-200">{template.tags.slice(0, 2).join(", ") || "orbit"}</span>
                </div>
                {template.description && <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-zinc-500">{template.description}</p>}
                <div className="mt-3 grid grid-cols-6 gap-1">
                  <button type="button" onClick={() => onCreateOrbitFromTemplate(template)} className="workspace-action">Use</button>
                  <button type="button" onClick={() => onRenameOrbitTemplate(template)} className="workspace-action">Name</button>
                  <button type="button" onClick={() => onEditOrbitTemplate(template)} className="workspace-action">Edit</button>
                  <button type="button" onClick={() => onCloneOrbitTemplate(template)} className="workspace-action">Clone</button>
                  <button type="button" onClick={() => onExportOrbitTemplate(template)} className="workspace-action">JSON</button>
                  <button type="button" onClick={() => onDeleteOrbitTemplate(template)} className="workspace-action danger">Del</button>
                </div>
              </div>
            ))
          )}
        </div>
      </HudPanel>

      <HudPanel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Mission Templates</p>
            <p className="mt-1 text-[11px] text-zinc-500">{templateLibrary.templates.length} reusable timelines</p>
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={onSaveCurrentMissionAsTemplate} className="workspace-action">Save Current</button>
            <button type="button" onClick={onImportTemplate} className="workspace-action">Import</button>
          </div>
        </div>
        <div className="mt-3 max-h-[58vh] space-y-2 overflow-auto pr-1">
          {templateLibrary.templates.length === 0 ? (
            <p className="border border-white/10 bg-black/25 px-3 py-2 font-mono text-[10px] uppercase text-zinc-600">No mission templates yet</p>
          ) : (
            templateLibrary.templates.map((template) => (
              <div key={template.templateId} className="border border-white/10 bg-black/25 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{template.name}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-zinc-500">{template.category} / {template.events.length} events</p>
                  </div>
                  <span className="font-mono text-[10px] text-cyan-200">{template.tags.slice(0, 2).join(", ") || "template"}</span>
                </div>
                {template.description && <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-zinc-500">{template.description}</p>}
                <div className="mt-3 grid grid-cols-5 gap-1">
                  <button type="button" onClick={() => onRenameTemplate(template)} className="workspace-action">Name</button>
                  <button type="button" onClick={() => onEditTemplate(template)} className="workspace-action">Edit</button>
                  <button type="button" onClick={() => onCloneTemplate(template)} className="workspace-action">Clone</button>
                  <button type="button" onClick={() => onExportTemplate(template)} className="workspace-action">JSON</button>
                  <button type="button" onClick={() => onDeleteTemplate(template)} className="workspace-action danger">Del</button>
                </div>
              </div>
            ))
          )}
        </div>
      </HudPanel>
    </div>
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
  simulationTimeIso,
  onInitializeMission,
  onOpenCatalog,
  onOpenWorkspace,
  onOpenTemplates,
  onCreateEvent,
  onEditEvent,
  onDeleteEvent,
  onToggleEvent,
  onSelectEvent,
  onGenerateTrajectory,
  onToggleComparison,
  onDragEvent,
  onDropEvent,
  onScheduleEvent,
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
  simulationTimeIso: string;
  onInitializeMission: () => void;
  onOpenCatalog: () => void;
  onOpenWorkspace: () => void;
  onOpenTemplates: () => void;
  onCreateEvent: (type?: TimelineEditorDraft["type"]) => void;
  onEditEvent: (event: BackendMissionTimelineEvent) => void;
  onDeleteEvent: (event: BackendMissionTimelineEvent) => void;
  onToggleEvent: (event: BackendMissionTimelineEvent) => void;
  onSelectEvent: (eventId: string) => void;
  onGenerateTrajectory: () => void;
  onToggleComparison: () => void;
  onDragEvent: (eventId: string | null) => void;
  onDropEvent: (sourceEventId: string, targetEventId: string) => void;
  onScheduleEvent: (event: BackendMissionTimelineEvent, targetMetSeconds: number, snapMode: TimelineSnapMode) => void;
}) {
  const [timeMode, setTimeMode] = useState<TimelineTimeMode>("UTC");
  const [zoomPreset, setZoomPreset] = useState<TimelineZoomPreset>("THREE_HOURS");
  const [customZoomHours, setCustomZoomHours] = useState("3");
  const [snapMode, setSnapMode] = useState<TimelineSnapMode>("FIVE_MIN");
  const interactionModel = useMemo<TimelineInteractionModel>(() => ({
    zoomPreset,
    snapMode,
    customVisibleSeconds: Math.max(60, Number(customZoomHours) * 3600 || 3 * 3600),
  }), [customZoomHours, snapMode, zoomPreset]);
  const analysis = useMemo(() => timelineAnalysis(mission, events), [events, mission]);
  const layoutModel = useMemo(() => mission
    ? buildTimelineLayoutModel(mission, events, interactionModel, selectedEventId, simulationTimeIso)
    : null, [events, interactionModel, mission, selectedEventId, simulationTimeIso]);

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
        <div className={`mt-3 border p-3 text-xs leading-5 ${
          canUseMissionTimeline
            ? "border-emerald-300/20 bg-emerald-300/[0.04] text-emerald-100"
            : "border-amber-300/20 bg-amber-300/[0.04] text-amber-100"
        }`}>
          {canUseMissionTimeline ? (
            <div className="space-y-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200">Mission Planning Setup</p>
                <p className="mt-1 text-emerald-100/85">Create a mission window first, then add Coast and Finite Burn events inside that scenario.</p>
              </div>
              <div className="grid gap-2 border border-emerald-300/15 bg-black/20 p-2 text-[11px]">
                <div className="flex justify-between gap-3">
                  <span className="font-mono uppercase text-emerald-200/70">Subject</span>
                  <span className="text-right">{subjectSummary.label}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="font-mono uppercase text-emerald-200/70">Next Step</span>
                  <span className="text-right">Define mission name and UTC window</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
                <button type="button" onClick={onInitializeMission} className="border border-emerald-300/50 px-3 py-2 font-mono text-[10px] uppercase text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/10">
                  Create Mission
                </button>
                <button type="button" onClick={onOpenTemplates} className="border border-cyan-300/40 px-3 py-2 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10">
                  From Template
                </button>
                <button type="button" onClick={onOpenWorkspace} className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
                  Import/Open
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p>{unavailableReason}</p>
              <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                <button type="button" onClick={onOpenCatalog} className="border border-cyan-300/45 px-3 py-2 font-mono text-[10px] uppercase text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/10">
                  Load Catalog
                </button>
                <button type="button" onClick={onOpenWorkspace} className="border border-white/15 px-3 py-2 font-mono text-[10px] uppercase text-zinc-300 transition hover:border-cyan-300 hover:text-cyan-100">
                  Workspace
                </button>
              </div>
            </div>
          )}
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

      {mission && (
        <div className="mt-3 border border-cyan-300/15 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Visual Mission Timeline</p>
              <p className="mt-1 text-[11px] text-zinc-500">Drag blocks left/right to reschedule. Backend execution remains UTC-based.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <div className="grid grid-cols-2 border border-cyan-300/20">
                {(["UTC", "MET"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTimeMode(mode)}
                    className={`px-2 py-1.5 font-mono text-[10px] uppercase transition ${
                      timeMode === mode
                        ? "bg-cyan-300 text-slate-950"
                        : "text-cyan-200 hover:bg-cyan-300/10"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <select value={zoomPreset} onChange={(event) => setZoomPreset(event.target.value as TimelineZoomPreset)} className="border border-cyan-300/20 bg-black/45 px-2 py-1.5 font-mono text-[10px] uppercase text-cyan-100 outline-none">
                {timelineZoomOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <select value={snapMode} onChange={(event) => setSnapMode(event.target.value as TimelineSnapMode)} className="border border-cyan-300/20 bg-black/45 px-2 py-1.5 font-mono text-[10px] uppercase text-cyan-100 outline-none">
                {timelineSnapOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
          </div>
          {zoomPreset === "CUSTOM" && (
            <label className="mt-2 flex items-center justify-end gap-2 font-mono text-[10px] uppercase text-zinc-500">
              Visible hours
              <input
                value={customZoomHours}
                onChange={(event) => setCustomZoomHours(event.target.value)}
                inputMode="decimal"
                className="w-20 border border-cyan-300/20 bg-black/45 px-2 py-1.5 text-cyan-100 outline-none"
              />
            </label>
          )}

          {layoutModel && (
          <VisualMissionTimeline
            mission={mission}
            layout={layoutModel}
            timeMode={timeMode}
            selectedEventId={selectedEventId}
            onSelectEvent={onSelectEvent}
            onScheduleEvent={(event, targetMetSeconds) => onScheduleEvent(event, targetMetSeconds, snapMode)}
          />
          )}

          <div className="mt-3 grid grid-cols-4 gap-2 max-sm:grid-cols-2">
            <TimelineMetric label="Duration" value={secondsToDurationLabel(analysis.missionDuration)} />
            <TimelineMetric label="Events" value={String(analysis.eventCount)} />
            <TimelineMetric label="Burns" value={String(analysis.burnCount)} />
            <TimelineMetric label="Coasts" value={String(analysis.coastCount)} />
          </div>

          {analysis.warnings.length > 0 && (
            <div className="mt-3 border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200">Timeline Warnings</p>
              <div className="mt-2 space-y-1">
                {analysis.warnings.map((warning) => (
                  <p key={warning} className="text-xs leading-5 text-amber-100">{warning}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="thin-scrollbar mt-3 max-h-[34vh] space-y-2 overflow-auto pr-1">
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
            {isTrajectoryLoading ? "Generating" : trajectoryOverlay ? "Update Trajectory" : "Generate Trajectory"}
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
            {showComparison ? "Hide Overlay" : "Show Overlay"}
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

function VisualMissionTimeline({
  mission,
  layout,
  timeMode,
  selectedEventId,
  onSelectEvent,
  onScheduleEvent,
}: {
  mission: BackendMission;
  layout: TimelineLayoutModel;
  timeMode: TimelineTimeMode;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onScheduleEvent: (event: BackendMissionTimelineEvent, targetMetSeconds: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    eventId: string;
    startClientX: number;
    startMetSeconds: number;
    previewMetSeconds: number;
  } | null>(null);
  const eventNameById = useMemo(() => {
    return new Map(layout.blocks.map(({ event }) => [event.id, event.name]));
  }, [layout.blocks]);

  const previewByEventId = dragState ? new Map([[dragState.eventId, dragState.previewMetSeconds]]) : new Map<string, number>();

  const updateDragPreview = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState || !trackRef.current) {
      return;
    }
    const width = trackRef.current.getBoundingClientRect().width;
    if (width <= 0) {
      return;
    }
    const deltaSeconds = ((pointerEvent.clientX - dragState.startClientX) / width) * layout.missionDurationSeconds;
    setDragState({
      ...dragState,
      previewMetSeconds: Math.min(layout.missionDurationSeconds, Math.max(0, dragState.startMetSeconds + deltaSeconds)),
    });
  };

  const endDrag = () => {
    if (!dragState) {
      return;
    }
    const block = layout.blocks.find((item) => item.event.id === dragState.eventId);
    setDragState(null);
    if (block) {
      onScheduleEvent(block.event, dragState.previewMetSeconds);
    }
  };

  if (layout.blocks.length === 0) {
    return (
      <div className="mt-3 border border-white/10 bg-black/25 px-3 py-4 text-center font-mono text-[10px] uppercase text-zinc-600">
        Empty timeline
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden border border-white/10 bg-black/30">
      <div className="overflow-x-auto">
        <div
          ref={trackRef}
          onPointerMove={updateDragPreview}
          onPointerUp={endDrag}
          onPointerCancel={() => setDragState(null)}
          className="relative h-52 min-w-full border-b border-white/10 bg-[linear-gradient(90deg,rgba(103,232,249,0.12)_1px,transparent_1px)] bg-[length:80px_100%]"
          style={{ width: `${layout.trackWidthPercent}%` }}
        >
          <TimelineCursor positionPercent={layout.cursors.missionStart} label="Start" tone="cyan" />
          <TimelineCursor positionPercent={layout.cursors.missionEnd} label="End" tone="cyan" />
          {layout.cursors.currentSimTime !== null && <TimelineCursor positionPercent={layout.cursors.currentSimTime} label="Sim" tone="lime" />}
          {layout.cursors.selectedEvent !== null && <TimelineCursor positionPercent={layout.cursors.selectedEvent} label="Selected" tone="rose" />}
          {layout.blocks.map(({ event, offsetSeconds, durationSeconds, widthPercent }) => {
          const isBurn = event.type === "FINITE_BURN";
          const scheduleMode = eventScheduleMode(event);
          const dependencyId = readStringParameter(event.parameters ?? {}, "scheduleDependencyId", "");
          const dependencyName = dependencyId ? eventNameById.get(dependencyId) ?? dependencyId : "";
          const dependencyOffset = readNumberParameter(event.parameters ?? {}, "scheduleOffsetSeconds", 0);
          const displayOffsetSeconds = previewByEventId.get(event.id) ?? offsetSeconds;
          const displayStartPercent = Math.min(100, Math.max(0, (displayOffsetSeconds / layout.missionDurationSeconds) * 100));
          const displayExecutionTime = previewByEventId.has(event.id)
            ? new Date(new Date(mission.scenarioStart).getTime() + displayOffsetSeconds * 1000).toISOString()
            : event.executionTime;
          return (
            <div
              key={event.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectEvent(event.id)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                  onSelectEvent(event.id);
                }
              }}
              onPointerDown={(pointerEvent) => {
                pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
                onSelectEvent(event.id);
                setDragState({
                  eventId: event.id,
                  startClientX: pointerEvent.clientX,
                  startMetSeconds: offsetSeconds,
                  previewMetSeconds: offsetSeconds,
                });
              }}
              style={{
                left: `${displayStartPercent}%`,
                width: `${Math.max(7, Math.min(widthPercent, 34))}%`,
              }}
              title={`Mission-relative position ${metOffsetLabelFromSeconds(displayOffsetSeconds)} (${formatNumber(displayStartPercent, 1)}%)`}
              className={`absolute top-14 min-h-28 min-w-[150px] cursor-grab touch-none border px-3 py-2 text-left transition active:cursor-grabbing ${
                selectedEventId === event.id
                  ? "border-cyan-300 bg-cyan-300/10"
                  : isBurn
                    ? "border-rose-300/35 bg-rose-300/[0.04] hover:border-rose-300/70"
                    : "border-sky-300/25 bg-sky-300/[0.03] hover:border-sky-300/60"
              } ${dragState?.eventId === event.id ? "z-20 shadow-[0_0_28px_rgba(103,232,249,0.20)]" : "z-10"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-white">{event.name}</span>
                <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase ${isBurn ? "border-rose-300/45 text-rose-100" : "border-sky-300/35 text-sky-100"}`}>
                  {isBurn ? "Burn" : "Coast"}
                </span>
              </span>
              <span className="mt-2 block font-mono text-[10px] text-cyan-100">
                {displayTimelineTime(timeMode, mission, displayExecutionTime)}
              </span>
              <span className="mt-1 block font-mono text-[10px] text-zinc-400">
                MET {metOffsetLabelFromSeconds(displayOffsetSeconds)}
              </span>
              {scheduleMode === "AFTER_EVENT" && (
                <span className="mt-1 block truncate font-mono text-[10px] text-amber-100">
                  after {dependencyName} + {metOffsetLabelFromSeconds(dependencyOffset).replace("T+", "")}
                </span>
              )}
              <span className="mt-1 block font-mono text-[10px] text-zinc-500">
                Duration {secondsToDurationLabel(durationSeconds)}
              </span>
              {dragState?.eventId === event.id && (
                <span className="mt-1 block font-mono text-[10px] text-lime-100">
                  Preview {metOffsetLabelFromSeconds(displayOffsetSeconds)}
                </span>
              )}
            </div>
          );
        })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 px-3 py-2 font-mono text-[10px] text-zinc-500">
        <span>{displayTimelineTime(timeMode, mission, mission.scenarioStart)}</span>
        <span>{timeMode === "MET" ? secondsToDurationLabel(missionDurationSeconds(mission)) : displayTimelineTime(timeMode, mission, mission.scenarioEnd)}</span>
      </div>
    </div>
  );
}

function TimelineCursor({
  positionPercent,
  label,
  tone,
}: {
  positionPercent: number;
  label: string;
  tone: "cyan" | "lime" | "rose";
}) {
  const color = tone === "lime" ? "border-lime-300 text-lime-100" : tone === "rose" ? "border-rose-300 text-rose-100" : "border-cyan-300 text-cyan-100";
  return (
    <div
      className={`pointer-events-none absolute top-0 h-full border-l ${color}`}
      style={{ left: `${Math.min(100, Math.max(0, positionPercent))}%` }}
    >
      <span className={`absolute top-2 -translate-x-1/2 border bg-black/75 px-1.5 py-0.5 font-mono text-[9px] uppercase ${color}`}>
        {label}
      </span>
    </div>
  );
}

function TimelineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-black/25 px-2 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] font-semibold text-zinc-100">{value}</p>
    </div>
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
  templates,
  onDraftChange,
  onCreate,
  onClose,
}: {
  draft: MissionSetupDraft;
  subjectSummary: { label: string; detail: string };
  templates: MissionTemplate[];
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
  const selectedTemplate = templates.find((template) => template.templateId === draft.templateId) ?? null;

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

            <div className="border border-cyan-300/15 bg-black/25 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Timeline Source</p>
                  <p className="mt-1 text-xs text-zinc-500">Create a blank mission or seed it from a reusable template.</p>
                </div>
                <div className="grid grid-cols-2 border border-cyan-300/20">
                  <button
                    type="button"
                    onClick={() => update({ templateId: "" })}
                    className={`px-3 py-2 font-mono text-[10px] uppercase transition ${!draft.templateId ? "bg-cyan-300 text-slate-950" : "text-cyan-200 hover:bg-cyan-300/10"}`}
                  >
                    Blank
                  </button>
                  <button
                    type="button"
                    disabled={templates.length === 0}
                    onClick={() => update({ templateId: draft.templateId || templates[0]?.templateId || "" })}
                    className={`px-3 py-2 font-mono text-[10px] uppercase transition ${draft.templateId ? "bg-cyan-300 text-slate-950" : "text-cyan-200 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:text-zinc-600"}`}
                  >
                    Template
                  </button>
                </div>
              </div>
              {draft.templateId && (
                <div className="mt-3 grid gap-2">
                  <select
                    value={draft.templateId}
                    onChange={(event) => update({ templateId: event.target.value })}
                    className="timeline-input"
                  >
                    {templates.map((template) => (
                      <option key={template.templateId} value={template.templateId}>
                        {template.name} / {template.category} / {template.events.length} events
                      </option>
                    ))}
                  </select>
                  {selectedTemplate && (
                    <p className="text-xs leading-5 text-zinc-500">
                      {selectedTemplate.description || "Template events will be copied with new backend event IDs."}
                    </p>
                  )}
                </div>
              )}
            </div>

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
  events,
  editingEventId,
  simulationTimeIso,
  draft,
  onDraftChange,
  onSave,
  onClose,
}: {
  mode: TimelineModalMode;
  mission: BackendMission | null;
  events: BackendMissionTimelineEvent[];
  editingEventId: string | null;
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
      return executionIsoFromTimelineDraft(draft, mission, events, editingEventId);
    } catch {
      return "Invalid UTC timestamp";
    }
  }, [draft, editingEventId, events, mission]);
  const missionWindowError = isoPreview.endsWith("Z") ? eventWindowError(mission, isoPreview) : null;
  const offsetFromMissionStart = mission && isoPreview.endsWith("Z")
    ? signedOffsetLabel(mission.scenarioStart, isoPreview)
    : "--";
  const dependencyCandidates = useMemo(
    () => events.filter((event) => event.id !== editingEventId).toSorted((a, b) => a.sequenceIndex - b.sequenceIndex),
    [editingEventId, events],
  );
  const dependencyEvent = dependencyCandidates.find((event) => event.id === draft.scheduleDependencyId) ?? null;
  const dependencyOffsetLabel = dependencyEvent && mission
    ? metOffsetLabelFromSeconds(resolveEventMetOffsets(mission, events).offsets.get(dependencyEvent.id) ?? 0)
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
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">Execute At</span>
                {(errors.executionDateUtc || errors.executionTimeUtc) && (
                  <span className="font-mono text-[10px] uppercase text-rose-200">{errors.executionDateUtc ?? errors.executionTimeUtc}</span>
                )}
                {(errors.metHours || errors.metMinutes || errors.metSeconds) && (
                  <span className="font-mono text-[10px] uppercase text-rose-200">{errors.metHours ?? errors.metMinutes ?? errors.metSeconds}</span>
                )}
              </span>
              <div className="mt-1 grid grid-cols-3 border border-cyan-300/20">
                {(["MET", "AFTER_EVENT", "UTC"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      if (mode === "MET" && mission && isoPreview.endsWith("Z")) {
                        const offsetSeconds = Math.max(0, Math.round((new Date(isoPreview).getTime() - new Date(mission.scenarioStart).getTime()) / 1000));
                        update({ scheduleMode: mode, scheduleDependencyId: "", ...metOffsetPartsFromSeconds(offsetSeconds) });
                        return;
                      }
                      if (mode === "AFTER_EVENT") {
                        update({
                          scheduleMode: mode,
                          scheduleDependencyId: draft.scheduleDependencyId || dependencyCandidates[0]?.id || "",
                        });
                        return;
                      }
                      if (mode === "UTC" && isoPreview.endsWith("Z")) {
                        update({
                          scheduleMode: mode,
                          executionDateUtc: utcIsoToDateInput(isoPreview),
                          executionTimeUtc: utcIsoToTimeInput(isoPreview),
                        });
                        return;
                      }
                      update({ scheduleMode: mode });
                    }}
                    className={`px-3 py-2 font-mono text-xs uppercase transition ${
                      draft.scheduleMode === mode
                        ? "bg-cyan-300 text-slate-950"
                        : "text-cyan-200 hover:bg-cyan-300/10"
                    }`}
                  >
                    {mode === "AFTER_EVENT" ? "After Event" : mode}
                  </button>
                ))}
              </div>
              {draft.scheduleMode === "MET" || draft.scheduleMode === "AFTER_EVENT" ? (
                <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 max-sm:grid-cols-1">
                  <input
                    value={draft.metHours}
                    onChange={(event) => update({ metHours: event.target.value })}
                    inputMode="numeric"
                    className="timeline-input"
                    aria-label="MET hours"
                    placeholder="Hours"
                  />
                  <input
                    value={draft.metMinutes}
                    onChange={(event) => update({ metMinutes: event.target.value })}
                    inputMode="numeric"
                    className="timeline-input"
                    aria-label="MET minutes"
                    placeholder="Minutes"
                  />
                  <input
                    value={draft.metSeconds}
                    onChange={(event) => update({ metSeconds: event.target.value })}
                    inputMode="numeric"
                    className="timeline-input"
                    aria-label="MET seconds"
                    placeholder="Seconds"
                  />
                  <span className="grid min-h-[42px] place-items-center border border-cyan-300/35 bg-cyan-300/[0.08] px-3 font-mono text-xs font-semibold uppercase text-cyan-100">
                    {draft.scheduleMode === "AFTER_EVENT" ? "Offset" : "MET"}
                  </span>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_150px_auto] gap-2 max-sm:grid-cols-1">
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
              )}
              {draft.scheduleMode === "AFTER_EVENT" && (
                <div className="mt-2 grid gap-2 border border-cyan-300/15 bg-black/25 px-3 py-2">
                  <TimelineField label="Source Event" error={errors.scheduleDependencyId}>
                    <select
                      value={draft.scheduleDependencyId}
                      onChange={(event) => update({ scheduleDependencyId: event.target.value })}
                      className="timeline-input"
                    >
                      <option value="">Select dependency source</option>
                      {dependencyCandidates.map((event) => (
                        <option key={event.id} value={event.id}>
                          [{event.sequenceIndex + 1}] {event.name}
                        </option>
                      ))}
                    </select>
                  </TimelineField>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                    Source MET: <span className="text-cyan-100">{dependencyOffsetLabel}</span>
                    {dependencyEvent && <span className="text-zinc-500"> / {dependencyEvent.name}</span>}
                  </p>
                </div>
              )}
              {(draft.scheduleMode === "MET" || draft.scheduleMode === "AFTER_EVENT") && (
                <p className="mt-2 border border-cyan-300/15 bg-black/25 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                  {draft.scheduleMode === "AFTER_EVENT" ? "Offset" : "Schedule"}: <span className="text-cyan-100">{metOffsetLabelFromSeconds(metOffsetSeconds(draft) ?? 0)}</span>
                  {draft.scheduleMode === "AFTER_EVENT" && <span> after source</span>}
                </p>
              )}
              <p className="mt-2 border border-white/10 bg-black/25 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                Computed UTC: <span className="text-cyan-100">{isoPreview}</span>
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
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Legacy Maneuver Events</p>
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
          ? "No legacy /api/maneuvers events found. Mission timeline burns are listed separately in the burn summary."
          : showManeuvers
            ? `${maneuverSnapshots.length} legacy event markers visible`
            : "Enable to show legacy maneuver markers and event details."}
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
}: {
  conjunctionSnapshots: ConjunctionSnapshot[];
  selectedConjunctionId: string | null;
  showConjunctions: boolean;
  disabled: boolean;
  onSelectConjunction: (conjunctionId: string) => void;
  onToggleConjunctions: () => void;
}) {
  const selectedConjunction = conjunctionSnapshots.find((snapshot) => snapshot.event.id === selectedConjunctionId) ?? conjunctionSnapshots[0] ?? null;

  return (
    <HudPanel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Conjunctions</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Conjunction sync is not yet implemented."
            className="cursor-not-allowed border border-white/10 px-2 py-1 font-mono text-[10px] uppercase text-zinc-600 opacity-70"
          >
            Coming Soon
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

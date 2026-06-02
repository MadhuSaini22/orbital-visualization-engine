import type { SatelliteObject } from "@/domain/orbit";
import type {
  BackendMission,
  BackendMissionTimelineEvent,
  CreateManualOrbitRequest,
  PropagatorTypeId,
} from "@/services/orbitServerApi";

export const ORBIT_LIBRARY_KEY = "orbit-library-v1";
export const MISSION_LIBRARY_KEY = "mission-library-v1";
export const WORKSPACE_LIBRARY_KEY = "workspace-library-v1";

export type StoredOrbitSourceType =
  | "CATALOG_TLE"
  | "IMPORTED_TLE"
  | "MANUAL_TLE"
  | "MANUAL_CARTESIAN"
  | "MANUAL_CLASSICAL";

export type StoredOrbitDefinition = {
  satellite?: SatelliteObject;
  satellites?: SatelliteObject[];
  manualRequest?: CreateManualOrbitRequest;
  backendManualOrbitId?: string;
  rawTle?: string;
  catalogGroup?: string;
};

export type StoredOrbit = {
  orbitId: string;
  orbitName: string;
  sourceType: StoredOrbitSourceType;
  creationDate: string;
  lastModified: string;
  orbitDefinition: StoredOrbitDefinition;
  propagatorType: PropagatorTypeId;
  summary: Record<string, string | number | boolean | null>;
};

export type StoredMission = {
  missionId: string;
  orbitId: string;
  backendMissionId?: string;
  missionName: string;
  description: string;
  startTime: string;
  endTime: string;
  duration: number;
  createdAt: string;
  updatedAt: string;
  backendMission?: BackendMission;
};

export type StoredEvent = {
  eventId: string;
  missionId: string;
  backendEventId?: string;
  type: string;
  executionTime: string;
  enabled: boolean;
  parameters: Record<string, unknown>;
  name: string;
  sequenceIndex: number;
  backendEvent?: BackendMissionTimelineEvent;
};

export type MissionLibraryState = {
  schemaVersion: 1;
  missions: StoredMission[];
  events: StoredEvent[];
};

export type StoredWorkspace = {
  schemaVersion: 1;
  exportedAt: string;
  ownerMode: "anonymous";
  orbits: StoredOrbit[];
  missions: StoredMission[];
  events: StoredEvent[];
};

const emptyMissionLibrary: MissionLibraryState = {
  schemaVersion: 1,
  missions: [],
  events: [],
};

function nowIso() {
  return new Date().toISOString();
}

export function makeWorkspaceId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseLocalStorage()) {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readOrbitLibrary() {
  const raw = readJson<unknown>(ORBIT_LIBRARY_KEY, []);
  return Array.isArray(raw) ? raw.filter(isStoredOrbit) : [];
}

export function writeOrbitLibrary(orbits: StoredOrbit[]) {
  writeJson(ORBIT_LIBRARY_KEY, orbits);
}

export function readMissionLibrary(): MissionLibraryState {
  const raw = readJson<unknown>(MISSION_LIBRARY_KEY, emptyMissionLibrary);
  if (!isMissionLibraryState(raw)) {
    return emptyMissionLibrary;
  }
  return raw;
}

export function writeMissionLibrary(state: MissionLibraryState) {
  writeJson(MISSION_LIBRARY_KEY, state);
}

export function buildWorkspace(orbits = readOrbitLibrary(), state = readMissionLibrary()): StoredWorkspace {
  return {
    schemaVersion: 1,
    exportedAt: nowIso(),
    ownerMode: "anonymous",
    orbits,
    missions: state.missions,
    events: state.events,
  };
}

export function writeWorkspace(workspace: StoredWorkspace) {
  writeOrbitLibrary(workspace.orbits);
  writeMissionLibrary({
    schemaVersion: 1,
    missions: workspace.missions,
    events: workspace.events,
  });
  writeJson(WORKSPACE_LIBRARY_KEY, workspace);
}

export function upsertOrbit(orbits: StoredOrbit[], orbit: StoredOrbit) {
  const next = orbits.filter((item) => item.orbitId !== orbit.orbitId);
  return [...next, { ...orbit, lastModified: nowIso() }].toSorted((a, b) => b.lastModified.localeCompare(a.lastModified));
}

export function deleteOrbit(orbits: StoredOrbit[], state: MissionLibraryState, orbitId: string) {
  const missionIds = new Set(state.missions.filter((mission) => mission.orbitId === orbitId).map((mission) => mission.missionId));
  return {
    orbits: orbits.filter((orbit) => orbit.orbitId !== orbitId),
    missionState: {
      schemaVersion: 1 as const,
      missions: state.missions.filter((mission) => mission.orbitId !== orbitId),
      events: state.events.filter((event) => !missionIds.has(event.missionId)),
    },
  };
}

export function duplicateOrbit(orbits: StoredOrbit[], orbitId: string, cloneMissions: boolean, state: MissionLibraryState) {
  const source = orbits.find((orbit) => orbit.orbitId === orbitId);
  if (!source) {
    return { orbits, missionState: state, clonedOrbitId: null };
  }
  const clonedOrbitId = makeWorkspaceId("orbit");
  const createdAt = nowIso();
  const clone: StoredOrbit = {
    ...structuredClone(source),
    orbitId: clonedOrbitId,
    orbitName: `${source.orbitName} Copy`,
    creationDate: createdAt,
    lastModified: createdAt,
  };
  if (!cloneMissions) {
    return {
      orbits: upsertOrbit(orbits, clone),
      missionState: state,
      clonedOrbitId,
    };
  }
  const missionIdMap = new Map<string, string>();
  const clonedMissions = state.missions
    .filter((mission) => mission.orbitId === orbitId)
    .map((mission) => {
      const missionId = makeWorkspaceId("mission");
      missionIdMap.set(mission.missionId, missionId);
      return {
        ...structuredClone(mission),
        missionId,
        orbitId: clonedOrbitId,
        backendMissionId: undefined,
        backendMission: undefined,
        missionName: `${mission.missionName} Copy`,
        createdAt,
        updatedAt: createdAt,
      };
    });
  const clonedEvents = state.events
    .filter((event) => missionIdMap.has(event.missionId))
    .map((event) => ({
      ...structuredClone(event),
      eventId: makeWorkspaceId("event"),
      missionId: missionIdMap.get(event.missionId)!,
      backendEventId: undefined,
      backendEvent: undefined,
    }));
  return {
    orbits: upsertOrbit(orbits, clone),
    missionState: {
      schemaVersion: 1 as const,
      missions: [...state.missions, ...clonedMissions],
      events: [...state.events, ...clonedEvents],
    },
    clonedOrbitId,
  };
}

export function upsertMission(state: MissionLibraryState, mission: StoredMission) {
  const nextMission = { ...mission, updatedAt: nowIso() };
  return {
    ...state,
    missions: [...state.missions.filter((item) => item.missionId !== mission.missionId), nextMission]
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export function upsertMissionEvents(state: MissionLibraryState, missionId: string, events: StoredEvent[]) {
  return {
    ...state,
    events: [
      ...state.events.filter((event) => event.missionId !== missionId),
      ...events.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex),
    ],
  };
}

export function deleteMission(state: MissionLibraryState, missionId: string) {
  return {
    schemaVersion: 1 as const,
    missions: state.missions.filter((mission) => mission.missionId !== missionId),
    events: state.events.filter((event) => event.missionId !== missionId),
  };
}

export function duplicateMission(state: MissionLibraryState, missionId: string) {
  const mission = state.missions.find((item) => item.missionId === missionId);
  if (!mission) {
    return { missionState: state, clonedMissionId: null };
  }
  const clonedMissionId = makeWorkspaceId("mission");
  const createdAt = nowIso();
  const clonedMission: StoredMission = {
    ...structuredClone(mission),
    missionId: clonedMissionId,
    backendMissionId: undefined,
    backendMission: undefined,
    missionName: `${mission.missionName} Copy`,
    createdAt,
    updatedAt: createdAt,
  };
  const clonedEvents = state.events
    .filter((event) => event.missionId === missionId)
    .map((event) => ({
      ...structuredClone(event),
      eventId: makeWorkspaceId("event"),
      missionId: clonedMissionId,
      backendEventId: undefined,
      backendEvent: undefined,
    }));
  return {
    missionState: {
      schemaVersion: 1 as const,
      missions: [...state.missions, clonedMission],
      events: [...state.events, ...clonedEvents],
    },
    clonedMissionId,
  };
}

export function storedEventFromBackend(event: BackendMissionTimelineEvent, missionId: string): StoredEvent {
  return {
    eventId: event.id,
    missionId,
    backendEventId: event.id,
    type: event.type,
    executionTime: event.executionTime,
    enabled: event.enabled,
    parameters: event.parameters ?? {},
    name: event.name,
    sequenceIndex: event.sequenceIndex,
    backendEvent: event,
  };
}

export function storedMissionFromBackend(mission: BackendMission, orbitId: string): StoredMission {
  return {
    missionId: mission.id,
    orbitId,
    backendMissionId: mission.id,
    missionName: mission.name,
    description: "",
    startTime: mission.scenarioStart,
    endTime: mission.scenarioEnd,
    duration: Math.max(0, Math.round((new Date(mission.scenarioEnd).getTime() - new Date(mission.scenarioStart).getTime()) / 1000)),
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    backendMission: mission,
  };
}

export function validateWorkspaceImport(value: unknown): StoredWorkspace {
  if (isStoredWorkspace(value)) {
    return value;
  }
  if (isStoredOrbit(value)) {
    const exportedAt = nowIso();
    return {
      schemaVersion: 1,
      exportedAt,
      ownerMode: "anonymous",
      orbits: [value],
      missions: [],
      events: [],
    };
  }
  if (isStoredMission(value)) {
    const exportedAt = nowIso();
    return {
      schemaVersion: 1,
      exportedAt,
      ownerMode: "anonymous",
      orbits: [],
      missions: [value],
      events: [],
    };
  }
  throw new Error("Invalid workspace JSON schema.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStoredOrbit(value: unknown): value is StoredOrbit {
  return isRecord(value)
    && typeof value.orbitId === "string"
    && typeof value.orbitName === "string"
    && typeof value.sourceType === "string"
    && typeof value.creationDate === "string"
    && typeof value.lastModified === "string"
    && isRecord(value.orbitDefinition)
    && typeof value.propagatorType === "string"
    && isRecord(value.summary);
}

function isStoredMission(value: unknown): value is StoredMission {
  return isRecord(value)
    && typeof value.missionId === "string"
    && typeof value.orbitId === "string"
    && typeof value.missionName === "string"
    && typeof value.startTime === "string"
    && typeof value.endTime === "string"
    && typeof value.duration === "number";
}

function isStoredEvent(value: unknown): value is StoredEvent {
  return isRecord(value)
    && typeof value.eventId === "string"
    && typeof value.missionId === "string"
    && typeof value.type === "string"
    && typeof value.executionTime === "string"
    && typeof value.enabled === "boolean"
    && isRecord(value.parameters)
    && typeof value.name === "string"
    && typeof value.sequenceIndex === "number";
}

function isMissionLibraryState(value: unknown): value is MissionLibraryState {
  return isRecord(value)
    && value.schemaVersion === 1
    && Array.isArray(value.missions)
    && value.missions.every(isStoredMission)
    && Array.isArray(value.events)
    && value.events.every(isStoredEvent);
}

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.exportedAt === "string"
    && Array.isArray(value.orbits)
    && value.orbits.every(isStoredOrbit)
    && Array.isArray(value.missions)
    && value.missions.every(isStoredMission)
    && Array.isArray(value.events)
    && value.events.every(isStoredEvent);
}

import type { CatalogGroundStation, GroundStation, GroundStationNetwork } from "@/domain/groundOperations";
import { groundStationCatalog } from "@/data/groundStationCatalog";
import { makeWorkspaceId } from "@/services/workspaceStorage";

const GROUND_STATION_LIBRARY_KEY = "ground-station-library-v1";
const GROUND_STATION_ASSIGNMENTS_KEY = "ground-station-assignments-v1";

type GroundStationLibraryState = {
  schemaVersion: 1;
  stations: GroundStation[];
};

type GroundStationAssignmentState = {
  schemaVersion: 1;
  assignments: Record<string, string[]>;
};

const emptyLibrary: GroundStationLibraryState = {
  schemaVersion: 1,
  stations: [],
};

const emptyAssignments: GroundStationAssignmentState = {
  schemaVersion: 1,
  assignments: {},
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readLibrary(): GroundStationLibraryState {
  if (!canUseLocalStorage()) {
    return emptyLibrary;
  }
  const raw = window.localStorage.getItem(GROUND_STATION_LIBRARY_KEY);
  if (!raw) {
    return emptyLibrary;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GroundStationLibraryState>;
    return {
      schemaVersion: 1,
      stations: Array.isArray(parsed.stations) ? parsed.stations.filter(isGroundStation) : [],
    };
  } catch {
    return emptyLibrary;
  }
}

function writeLibrary(state: GroundStationLibraryState) {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.setItem(GROUND_STATION_LIBRARY_KEY, JSON.stringify(state));
}

function assignmentKey(workspaceId: string, orbitId: string) {
  return `${workspaceId}:${orbitId}`;
}

function readAssignments(): GroundStationAssignmentState {
  if (!canUseLocalStorage()) {
    return emptyAssignments;
  }
  const raw = window.localStorage.getItem(GROUND_STATION_ASSIGNMENTS_KEY);
  if (!raw) {
    return emptyAssignments;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GroundStationAssignmentState>;
    const entries = Object.entries(parsed.assignments ?? {})
      .filter(([key, stationIds]) => typeof key === "string" && Array.isArray(stationIds))
      .map(([key, stationIds]) => [key, stationIds.filter((id): id is string => typeof id === "string")] as const);
    return {
      schemaVersion: 1,
      assignments: Object.fromEntries(entries),
    };
  } catch {
    return emptyAssignments;
  }
}

function writeAssignments(state: GroundStationAssignmentState) {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.setItem(GROUND_STATION_ASSIGNMENTS_KEY, JSON.stringify(state));
}

function isGroundStation(value: unknown): value is GroundStation {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const station = value as Partial<GroundStation>;
  return typeof station.id === "string"
    && typeof station.workspaceId === "string"
    && typeof station.name === "string"
    && typeof station.latitude === "number"
    && typeof station.longitude === "number"
    && typeof station.altitude === "number"
    && typeof station.minimumElevation === "number"
    && (station.source === "USER" || station.source === "CATALOG")
    && typeof station.network === "string"
    && typeof station.enabled === "boolean";
}

function stationFromCatalog(workspaceId: string, catalogStation: CatalogGroundStation): GroundStation {
  return {
    ...catalogStation,
    id: makeWorkspaceId(`ground-station-${catalogStation.catalogId}`),
    workspaceId,
    source: "CATALOG",
    enabled: true,
  };
}

export class GroundStationRepository {
  list(workspaceId: string) {
    return readLibrary().stations.filter((station) => station.workspaceId === workspaceId);
  }

  assignedStationIds(workspaceId: string, orbitId: string | null) {
    if (!orbitId) {
      return [];
    }
    const state = readAssignments();
    const key = assignmentKey(workspaceId, orbitId);
    return state.assignments[key] ?? [];
  }

  assignStation(workspaceId: string, orbitId: string | null, stationId: string) {
    if (!orbitId) {
      return [];
    }
    const state = readAssignments();
    const key = assignmentKey(workspaceId, orbitId);
    const nextIds = [...new Set([...(state.assignments[key] ?? []), stationId])];
    const nextState = {
      schemaVersion: 1 as const,
      assignments: {
        ...state.assignments,
        [key]: nextIds,
      },
    };
    writeAssignments(nextState);
    return nextIds;
  }

  assignStations(workspaceId: string, orbitId: string | null, stationIds: string[]) {
    if (!orbitId || stationIds.length === 0) {
      return this.assignedStationIds(workspaceId, orbitId);
    }
    const state = readAssignments();
    const key = assignmentKey(workspaceId, orbitId);
    const nextIds = [...new Set([...(state.assignments[key] ?? []), ...stationIds])];
    const nextState = {
      schemaVersion: 1 as const,
      assignments: {
        ...state.assignments,
        [key]: nextIds,
      },
    };
    writeAssignments(nextState);
    return nextIds;
  }

  unassignStation(workspaceId: string, orbitId: string | null, stationId: string) {
    if (!orbitId) {
      return [];
    }
    const state = readAssignments();
    const key = assignmentKey(workspaceId, orbitId);
    const nextIds = (state.assignments[key] ?? []).filter((id) => id !== stationId);
    const nextState = {
      schemaVersion: 1 as const,
      assignments: {
        ...state.assignments,
        [key]: nextIds,
      },
    };
    writeAssignments(nextState);
    return nextIds;
  }

  save(station: GroundStation) {
    const library = readLibrary();
    const stations = [
      ...library.stations.filter((item) => item.id !== station.id),
      station,
    ].toSorted((a, b) => a.network.localeCompare(b.network) || a.name.localeCompare(b.name));
    writeLibrary({ schemaVersion: 1, stations });
    return station;
  }

  delete(stationId: string) {
    const library = readLibrary();
    const assignments = readAssignments();
    writeLibrary({
      schemaVersion: 1,
      stations: library.stations.filter((station) => station.id !== stationId),
    });
    writeAssignments({
      schemaVersion: 1,
      assignments: Object.fromEntries(
        Object.entries(assignments.assignments).map(([key, stationIds]) => [
          key,
          stationIds.filter((id) => id !== stationId),
        ]),
      ),
    });
  }

  importStation(workspaceId: string, catalogStation: CatalogGroundStation) {
    const station = stationFromCatalog(workspaceId, catalogStation);
    return this.save(station);
  }

  importNetwork(workspaceId: string, network: GroundStationNetwork) {
    const imported = groundStationCatalog
      .filter((station) => station.network === network)
      .map((station) => stationFromCatalog(workspaceId, station));
    const library = readLibrary();
    writeLibrary({
      schemaVersion: 1,
      stations: [...library.stations, ...imported].toSorted((a, b) => a.network.localeCompare(b.network) || a.name.localeCompare(b.name)),
    });
    return imported;
  }

  clone(station: GroundStation) {
    return this.save({
      ...station,
      id: makeWorkspaceId("ground-station"),
      name: `${station.name} Copy`,
      source: "USER",
    });
  }
}

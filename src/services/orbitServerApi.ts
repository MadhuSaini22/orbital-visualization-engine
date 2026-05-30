const DEFAULT_ORBIT_SERVER_URL = "http://localhost:8080";

export function getOrbitServerBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_ORBIT_SERVER_URL?.trim();
  const baseUrl = configuredUrl && configuredUrl.length > 0 ? configuredUrl : DEFAULT_ORBIT_SERVER_URL;

  return baseUrl.replace(/\/+$/, "");
}

export function getOrbitServerDisplayUrl() {
  return getOrbitServerBaseUrl().replace(/^https?:\/\//, "");
}

function buildPath(path: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export async function fetchCatalogGroupTle(group: string, limit: number) {
  const url = `${getOrbitServerBaseUrl()}${buildPath("/api/catalog/tle", { group, limit })}`;
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.text();

  if (!response.ok) {
    const detail = body.trim();
    throw new Error(
      detail
        ? `Backend TLE request failed with status ${response.status}: ${detail}`
        : `Backend TLE request failed with status ${response.status} at ${url}.`,
    );
  }

  return body;
}

async function fetchJson<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  init?: RequestInit,
) {
  const url = `${getOrbitServerBaseUrl()}${buildPath(path, params)}`;
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.text();

  if (!response.ok) {
    let detail = body.trim();
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string") {
        detail = parsed.error;
      }
    } catch {
      // Keep the plain-text response body as the error detail.
    }
    throw new Error(detail ? `Backend request failed with status ${response.status}: ${detail}` : `Backend request failed with status ${response.status} at ${url}.`);
  }

  return (body ? JSON.parse(body) : null) as T;
}

export type BackendManeuverEvent = {
  id: string;
  noradId: number;
  name: string;
  status: "PLANNED" | "CANDIDATE" | "EXECUTED" | "CANCELLED";
  eventTime: string;
  deltaVMps: number;
  durationSec: number;
  frame: string;
  vector?: Record<string, number>;
  metadata?: Record<string, unknown>;
};

export type BackendConjunctionRecord = {
  id: string;
  sat1NoradId: number | null;
  sat2NoradId: number | null;
  sat1Name: string | null;
  sat2Name: string | null;
  createdAt: string | null;
  tca: string;
  missDistanceKm: number | null;
  probabilityOfCollision: number | null;
  relativeVelocityKmps: number | null;
  risk: "SAFE" | "WATCH" | "WARNING" | "CRITICAL";
  source: string;
  rawCdm: string;
};

export type BackendEphemerisState = {
  time: string;
  frame: string;
  positionKm: [number, number, number];
  velocityKmps: [number, number, number];
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
};

export type BackendPropagationResponse = {
  noradId: number;
  model: string;
  frame: string;
  analysisConfig: BackendAnalysisConfig;
  warnings: string[];
  states: BackendEphemerisState[];
};

export type AnalysisPresetId = "FAST_PREVIEW" | "OPERATIONAL_REVIEW" | "HIGH_FIDELITY" | "MANEUVER_PLANNING";

export type PropagatorTypeId = "TLE_SGP4" | "KEPLERIAN" | "NUMERICAL";
export type ManualOrbitType = "TLE" | "CLASSICAL_ELEMENTS" | "CARTESIAN_STATE";

export type BackendAnalysisConfig = {
  noradId: number;
  preset: AnalysisPresetId;
  propagatorType: PropagatorTypeId;
  gravityEnabled: boolean;
  gravityDegree: number;
  gravityOrder: number;
  dragEnabled: boolean;
  solarRadiationPressureEnabled: boolean;
  thirdBodySunEnabled: boolean;
  thirdBodyMoonEnabled: boolean;
  maneuverModelEnabled: boolean;
  notes: string | null;
  updatedAt: string;
};

export type BackendAnalysisConfigResponse = {
  config: BackendAnalysisConfig;
  activeModes: string[];
  warnings: string[];
};

export type CreateManualOrbitRequest = {
  name: string;
  type: ManualOrbitType;
  epoch?: string;
  frame?: string;
  centralBody?: string;
  propagatorType?: PropagatorTypeId;
  tle?: {
    line1: string;
    line2: string;
  };
  classicalElements?: {
    semiMajorAxisKm: number;
    eccentricity: number;
    inclinationDeg: number;
    raanDeg: number;
    argumentOfPeriapsisDeg: number;
    trueAnomalyDeg: number;
  };
  cartesianState?: {
    positionKm: [number, number, number];
    velocityKmps: [number, number, number];
  };
};

export type BackendManualOrbitResponse = {
  id: string;
  name: string;
  type: ManualOrbitType;
  epoch: string | null;
  frame: string;
  centralBody: string;
  propagatorType: PropagatorTypeId;
  warnings: string[];
};

export async function fetchManeuvers(noradId?: string | number) {
  return fetchJson<BackendManeuverEvent[]>("/api/maneuvers", {
    noradId,
  });
}

export async function fetchConjunctions(noradIds: Array<string | number>) {
  const ids = [...new Set(noradIds.map((id) => String(id).trim()).filter(Boolean))];
  return fetchJson<{ conjunctions: BackendConjunctionRecord[] }>("/api/conjunctions", {
    noradIds: ids.length > 0 ? ids.join(",") : undefined,
  });
}

export async function refreshConjunctions() {
  return fetchJson<{ conjunctions: BackendConjunctionRecord[] }>("/api/conjunctions/refresh", {}, {
    method: "POST",
  });
}

export async function fetchAnalysisConfig(noradId: string | number) {
  return fetchJson<BackendAnalysisConfigResponse>(`/api/satellites/${noradId}/analysis-config`);
}

export async function fetchCurrentOrbitState(noradId: string | number, time: string, init?: RequestInit) {
  return fetchJson<BackendEphemerisState>(`/api/orbits/${noradId}/current`, { time }, init);
}

export async function fetchOrbitTrajectory(
  noradId: string | number,
  from: string,
  to: string,
  stepSeconds: number,
  init?: RequestInit,
) {
  return fetchJson<BackendPropagationResponse>(`/api/orbits/${noradId}/trajectory`, {
    from,
    to,
    stepSeconds,
  }, init);
}

export async function createManualOrbit(request: CreateManualOrbitRequest) {
  return fetchJson<BackendManualOrbitResponse>("/api/manual-orbits", {}, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export async function fetchManualOrbitState(orbitId: string, time: string, init?: RequestInit) {
  return fetchJson<BackendEphemerisState>(`/api/manual-orbits/${orbitId}/current`, { time }, init);
}

export async function fetchManualOrbitTrajectory(
  orbitId: string,
  from: string,
  to: string,
  stepSeconds: number,
  init?: RequestInit,
) {
  return fetchJson<BackendPropagationResponse>(`/api/manual-orbits/${orbitId}/trajectory`, {
    from,
    to,
    stepSeconds,
  }, init);
}

export async function applyAnalysisPreset(noradId: string | number, preset: AnalysisPresetId) {
  return fetchJson<BackendAnalysisConfigResponse>(`/api/satellites/${noradId}/analysis-config/presets/${preset}`, {}, {
    method: "POST",
  });
}

export async function setAnalysisMode(noradId: string | number, mode: string, enabled: boolean) {
  return fetchJson<BackendAnalysisConfigResponse>(`/api/satellites/${noradId}/analysis-config/modes/${mode}`, {
    enabled: enabled ? "true" : "false",
  }, {
    method: "POST",
  });
}

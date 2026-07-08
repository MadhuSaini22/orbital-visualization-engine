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
  analysisConfig: BackendAnalysisConfig | null;
  warnings: string[];
  states: BackendEphemerisState[];
};

export type AnalysisPresetId = "FAST_PREVIEW" | "OPERATIONAL_REVIEW" | "HIGH_FIDELITY" | "MANEUVER_PLANNING";

export type PropagatorTypeId = "TLE_SGP4" | "KEPLERIAN" | "NUMERICAL";
export type NumericalIntegratorTypeId =
  | "DORMAND_PRINCE_853"
  | "DORMAND_PRINCE_54"
  | "CLASSICAL_RUNGE_KUTTA"
  | "GILL"
  | "LUTHER"
  | "MIDPOINT"
  | "THREE_EIGHTHES"
  | "ADAMS_BASHFORTH"
  | "ADAMS_MOULTON"
  | "GRAGG_BULIRSCH_STOER";
export type MissionTimelineEventType = "COAST" | "FINITE_BURN" | "IMPULSIVE_BURN" | "VECTOR_BURN" | "STATION_KEEPING" | "PLANE_CHANGE" | "HOHMANN_TRANSFER";
export type ManualOrbitType = "TLE" | "CLASSICAL_ELEMENTS" | "CARTESIAN_STATE";
export type ManeuverTemplateType = "CIRCULARIZATION" | "HOHMANN_TRANSFER" | "PLANE_CHANGE" | "APOGEE_RAISE" | "PERIGEE_RAISE" | "DEORBIT_BURN";
export type PlaneChangeExecutionStrategy = "ASCENDING_NODE" | "DESCENDING_NODE" | "APOAPSIS" | "IMMEDIATE";

export type BackendCapabilityRegistry = {
  propagators: Array<{
    id: PropagatorTypeId;
    label: string;
    description: string;
    supportsIntegrators: boolean;
    supportsForceModels: boolean;
    supportsManeuvers: boolean;
    supportsSpacecraftParameters: boolean;
  }>;
  integrators: Array<{
    id: NumericalIntegratorTypeId;
    label: string;
    description: string;
    adaptiveStep: boolean;
    backendClass: string;
  }>;
  forceModels: Array<{
    id: string;
    label: string;
    description: string;
    implemented: boolean;
    numericalOnly: boolean;
  }>;
  maneuverSupport: {
    finiteBurn: boolean;
    impulsiveBurn: boolean;
    vectorBurn: boolean;
    notes: string;
  };
  spacecraftParameters: string[];
};

export type BackendMission = {
  id: string;
  name: string;
  subjectNoradId: number | null;
  subjectOrbitId: string | null;
  propagatorType: PropagatorTypeId;
  scenarioStart: string;
  scenarioEnd: string;
  createdAt: string;
  updatedAt: string;
};

export type BackendMissionTimelineEvent = {
  id: string;
  missionId: string;
  sequenceIndex: number;
  type: MissionTimelineEventType;
  name: string;
  enabled: boolean;
  executionTime: string;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateMissionRequest = {
  name: string;
  subjectNoradId?: number;
  subjectOrbitId?: string;
  propagatorType: PropagatorTypeId;
  scenarioStart: string;
  scenarioEnd: string;
};

export type CreateTimelineEventRequest = {
  sequenceIndex: number;
  type: "COAST" | "FINITE_BURN" | "IMPULSIVE_BURN";
  name: string;
  enabled: boolean;
  executionTime: string;
  parameters: Record<string, unknown>;
};

export type UpdateTimelineEventRequest = Partial<CreateTimelineEventRequest>;

export type ManeuverTemplateRequest = {
  type: ManeuverTemplateType;
  targetAltitudeKm?: number;
  inclinationChangeDeg?: number;
  executionStrategy?: PlaneChangeExecutionStrategy;
  sequenceIndex?: number;
};

export type ManeuverTemplatePreview = {
  type: ManeuverTemplateType;
  templateInstanceId: string;
  metadata: Record<string, unknown>;
  warnings: string[];
  events: CreateTimelineEventRequest[];
};

export type ManeuverTemplateApplyResponse = {
  type: ManeuverTemplateType;
  templateInstanceId: string;
  metadata: Record<string, unknown>;
  warnings: string[];
  events: BackendMissionTimelineEvent[];
};

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
  dryMassKg: number;
  fuelMassKg: number;
  dragAreaM2: number;
  dragCoefficient: number;
  srpAreaM2: number;
  reflectivityCoefficient: number;
  nominalThrustN: number;
  nominalIspS: number;
  notes: string | null;
  updatedAt: string;
};

export type BackendAnalysisConfigResponse = {
  config: BackendAnalysisConfig;
  activeModes: string[];
  warnings: string[];
};

export type BackendPropagationProfile = Omit<BackendAnalysisConfig, "noradId"> & {
  id: string;
  ownerType: "SATELLITE" | "MANUAL_ORBIT" | "MISSION";
  ownerId: string;
  name: string;
  integratorType: NumericalIntegratorTypeId;
  integratorMinStep: number;
  integratorMaxStep: number;
  integratorAbsTol: number;
  integratorRelTol: number;
  createdAt: string;
};

export type UpdatePropagationProfileRequest = Partial<Omit<BackendPropagationProfile, "id" | "ownerType" | "ownerId" | "createdAt" | "updatedAt">>;

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

export type RuntimeCatalogSatellite = {
  noradCatalogId: number;
  catalogVersionId: number;
  historyId: number;
  sourceCode: string;
  sourceDisplayName: string;
  objectName: string;
  objectId: string | null;
  objectType: string | null;
  classification: string | null;
  countryCode: string | null;
  launchYear: number | null;
  launchNumber: number | null;
  launchPiece: string | null;
  epochAt: string;
  tleLine1: string;
  tleLine2: string;
  tleSha256: string;
  elementSetNo: number | null;
  ephemerisType: number | null;
  inclinationDeg: number;
  raanDeg: number;
  eccentricity: number;
  argumentOfPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionRevPerDay: number;
  meanMotionDot: number;
  meanMotionDdot: number;
  bstar: number;
  revolutionNumber: number | null;
  firstSeenVersionId: number;
  lastSeenVersionId: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type RuntimeSatelliteResponse = {
  catalogSatellite: RuntimeCatalogSatellite;
};

export type RuntimeObjectRef =
  | { type: "CATALOG_NORAD"; noradCatalogId: number; orbitId?: null }
  | { type: "MANUAL_ORBIT"; orbitId: string; noradCatalogId?: null };

export type RuntimeCartesianVector = {
  xMeters: number;
  yMeters: number;
  zMeters: number;
};

export type RuntimePropagatedState = {
  timestamp: string;
  frameName: string;
  position: RuntimeCartesianVector;
  velocity: RuntimeCartesianVector;
};

export type RuntimePropagationRequest = {
  noradCatalogId: number;
  start: string;
  end: string;
  stepSeconds: number;
  model?: string | null;
};

export type RuntimeOrbitPropagationRequest = {
  primaryObject: RuntimeObjectRef;
  start: string;
  end: string;
  stepSeconds: number;
  propagatorType?: PropagatorTypeId | null;
};

export type RuntimePropagationResponse = {
  satellite: RuntimeSatelliteResponse | null;
  startTime: string;
  stopTime: string;
  step: string;
  states: RuntimePropagatedState[];
};

export type RuntimeGroundStationId = {
  value: string;
};

export type RuntimeVisibilityRequest = {
  noradCatalogId: number;
  groundStationId: RuntimeGroundStationId;
  startTime: string;
  stopTime: string;
  step: string;
  minimumElevationDegrees: number;
};

export type RuntimeOrbitVisibilityRequest = {
  primaryObject: RuntimeObjectRef;
  groundStationId: RuntimeGroundStationId;
  startTime: string;
  stopTime: string;
  step: string;
  minimumElevationDegrees: number;
  propagatorType?: PropagatorTypeId | null;
};

export type RuntimeVisibilityWindow = {
  acquisitionOfSignalTime: string;
  lossOfSignalTime: string;
  maximumElevationTime: string;
  maximumElevationDegrees: number;
  duration: string;
};

export type RuntimeVisibilityResult = {
  request: RuntimeVisibilityRequest;
  windows: RuntimeVisibilityWindow[];
};

export type RuntimeEclipseRequest = {
  noradCatalogId: number;
  startTime: string;
  stopTime: string;
  step: string;
};

export type RuntimeOrbitEclipseRequest = {
  primaryObject: RuntimeObjectRef;
  startTime: string;
  stopTime: string;
  step: string;
  propagatorType?: PropagatorTypeId | null;
};

export type RuntimeEclipseInterval = {
  type: "SUNLIGHT" | "PENUMBRA" | "UMBRA";
  startTime: string;
  stopTime: string;
  duration: string;
};

export type RuntimeEclipseResult = {
  request: RuntimeEclipseRequest;
  intervals: RuntimeEclipseInterval[];
};

export type RuntimeRelativeFrame = "LVLH_RTN";

export type RuntimeRelativeMotionRequest = {
  primaryNoradCatalogId: number;
  secondaryNoradCatalogId: number;
  startTime: string;
  stopTime: string;
  step: string;
  frame: RuntimeRelativeFrame;
};

export type RuntimeOrbitRelativeMotionRequest = {
  primaryObject: RuntimeObjectRef;
  secondaryObject: RuntimeObjectRef;
  startTime: string;
  stopTime: string;
  step: string;
  frame: RuntimeRelativeFrame;
  propagatorType?: PropagatorTypeId | null;
};

export type RuntimeRelativeState = {
  timestamp: string;
  frame: RuntimeRelativeFrame;
  relativePosition: RuntimeCartesianVector;
  relativeVelocity: RuntimeCartesianVector;
};

export type RuntimeRelativeMotionResult = {
  request: RuntimeRelativeMotionRequest;
  states: RuntimeRelativeState[];
};

export type RuntimeConjunctionRequest = {
  primaryNoradCatalogId: number;
  secondaryNoradCatalogId: number;
  startTime: string;
  stopTime: string;
  step: string;
  relativeFrame: RuntimeRelativeFrame;
  missDistanceThresholdMeters: number;
};

export type RuntimeOrbitConjunctionRequest = {
  primaryObject: RuntimeObjectRef;
  secondaryObject: RuntimeObjectRef;
  startTime: string;
  stopTime: string;
  step: string;
  relativeFrame: RuntimeRelativeFrame;
  missDistanceThresholdMeters: number;
  propagatorType?: PropagatorTypeId | null;
};

export type RuntimeClosestApproach = {
  timeOfClosestApproach: string;
  missDistanceMeters: number;
  relativeSpeedMetersPerSecond: number;
  relativeState: RuntimeRelativeState;
};

export type RuntimeConjunctionResult = {
  request: RuntimeConjunctionRequest;
  closestApproach: RuntimeClosestApproach;
  status: "CLEAR" | "CONJUNCTION";
  refinementStatistics: {
    sampledStatesExamined: number;
    sampledMinimumIndex: number;
    refined: boolean;
    refinementOffsetSeconds: number;
  };
};

export type RuntimeCatalogConjunctionRequest = {
  primaryNoradCatalogId: number;
  startTime: string;
  stopTime: string;
  step: string;
  relativeFrame: RuntimeRelativeFrame;
  missDistanceThresholdMeters: number;
};

export type RuntimeOrbitCatalogScreeningRequest = {
  primaryObject: RuntimeObjectRef;
  startTime: string;
  stopTime: string;
  step: string;
  relativeFrame: RuntimeRelativeFrame;
  missDistanceThresholdMeters: number;
  propagatorType?: PropagatorTypeId | null;
};

export type RuntimeCatalogConjunctionCandidate = {
  satellite: RuntimeCatalogSatellite;
  conjunctionResult: RuntimeConjunctionResult;
};

export type RuntimeCatalogConjunctionResult = {
  request: RuntimeCatalogConjunctionRequest | RuntimeOrbitCatalogScreeningRequest;
  primarySatellite?: RuntimeCatalogSatellite | null;
  primaryObject?: RuntimeObjectRef | null;
  candidates: RuntimeCatalogConjunctionCandidate[];
  statistics: {
    catalogSatellitesSeen: number;
    skippedPrimarySatellites: number;
    analyzedCandidates: number;
    conjunctionCandidates: number;
    clearCandidates: number;
  };
  executionStatistics: {
    submittedTasks: number;
    successfulTasks: number;
    failedTasks: number;
  };
};

export type RuntimeCollisionProbabilityMethod = "ISOTROPIC_GAUSSIAN_ENCOUNTER_PLANE";

export type RuntimeCollisionProbabilityRequest = {
  conjunctionResult: RuntimeConjunctionResult;
  primaryCovarianceMetersSquared: number[][];
  secondaryCovarianceMetersSquared: number[][];
  hardBodyRadiusMeters: number;
  method: RuntimeCollisionProbabilityMethod;
};

export type RuntimeCollisionProbabilityResult = {
  request: RuntimeCollisionProbabilityRequest;
  probabilityOfCollision: number;
  statistics: {
    method: RuntimeCollisionProbabilityMethod;
    combinedEncounterPlaneVarianceMetersSquared: number;
    equivalentSigmaMeters: number;
    normalizedMissDistance: number;
    normalizedHardBodyRadius: number;
  };
};

export type RuntimeCovarianceMatrix = {
  values: number[][];
};

export type RuntimeCovariancePropagationRequest = {
  noradCatalogId: number;
  startTime: string;
  stopTime: string;
  step: string;
  initialCovariance: RuntimeCovarianceMatrix;
};

export type RuntimeOrbitCovariancePropagationRequest = {
  primaryObject: RuntimeObjectRef;
  startTime: string;
  stopTime: string;
  step: string;
  initialCovariance: RuntimeCovarianceMatrix;
  propagatorType?: PropagatorTypeId | null;
};

export type RuntimeCovarianceState = {
  timestamp: string;
  covarianceMatrix: RuntimeCovarianceMatrix;
};

export type RuntimeCovariancePropagationResponse = {
  request: RuntimeCovariancePropagationRequest | RuntimeOrbitCovariancePropagationRequest;
  satellite?: RuntimeSatelliteResponse | null;
  states: RuntimeCovarianceState[];
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

export async function fetchCapabilities() {
  return fetchJson<BackendCapabilityRegistry>("/api/capabilities");
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

export async function fetchMissions() {
  return fetchJson<BackendMission[]>("/api/missions");
}

export async function createMission(request: CreateMissionRequest) {
  return fetchJson<BackendMission>("/api/missions", {}, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export async function fetchMissionTimelineEvents(missionId: string) {
  return fetchJson<BackendMissionTimelineEvent[]>(`/api/missions/${missionId}/timeline/events`);
}

export async function createMissionTimelineEvent(missionId: string, request: CreateTimelineEventRequest) {
  return fetchJson<BackendMissionTimelineEvent>(`/api/missions/${missionId}/timeline/events`, {}, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export async function updateMissionTimelineEvent(
  missionId: string,
  eventId: string,
  request: UpdateTimelineEventRequest,
) {
  return fetchJson<BackendMissionTimelineEvent>(`/api/missions/${missionId}/timeline/events/${eventId}`, {}, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export async function deleteMissionTimelineEvent(missionId: string, eventId: string) {
  return fetchJson<void>(`/api/missions/${missionId}/timeline/events/${eventId}`, {}, {
    method: "DELETE",
  });
}

export async function reorderMissionTimelineEvents(missionId: string, eventIds: string[]) {
  return fetchJson<BackendMissionTimelineEvent[]>(`/api/missions/${missionId}/timeline/events/reorder`, {}, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ eventIds }),
  });
}

export async function setMissionTimelineEventEnabled(missionId: string, eventId: string, enabled: boolean) {
  return fetchJson<BackendMissionTimelineEvent>(`/api/missions/${missionId}/timeline/events/${eventId}/${enabled ? "enable" : "disable"}`, {}, {
    method: "POST",
  });
}

export async function previewManeuverTemplate(missionId: string, request: ManeuverTemplateRequest) {
  return fetchJson<ManeuverTemplatePreview>(`/api/missions/${missionId}/maneuver-templates/preview`, {}, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export async function applyManeuverTemplate(missionId: string, request: ManeuverTemplateRequest) {
  return fetchJson<ManeuverTemplateApplyResponse>(`/api/missions/${missionId}/maneuver-templates/apply`, {}, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export async function fetchMissionTrajectory(
  missionId: string,
  startTime: string,
  endTime: string,
  stepSeconds: number,
) {
  return fetchJson<BackendPropagationResponse>(`/api/missions/${missionId}/trajectory`, {}, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      missionId,
      startTime,
      endTime,
      stepSeconds,
    }),
  });
}

export async function fetchMissionPropagationProfile(missionId: string) {
  return fetchJson<BackendPropagationProfile>(`/api/missions/${missionId}/propagation-profile`);
}

export async function updateMissionPropagationProfile(missionId: string, request: UpdatePropagationProfileRequest) {
  return fetchJson<BackendPropagationProfile>(`/api/missions/${missionId}/propagation-profile`, {}, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
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

function postRuntimeJson<TResponse, TRequest>(path: string, request: TRequest) {
  return fetchJson<TResponse>(path, {}, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export async function fetchRuntimeSatellite(noradCatalogId: string | number) {
  return fetchJson<RuntimeSatelliteResponse>(`/api/runtime/satellites/${noradCatalogId}`);
}

export async function runRuntimePropagation(request: RuntimePropagationRequest) {
  return postRuntimeJson<RuntimePropagationResponse, RuntimePropagationRequest>("/api/runtime/propagation", request);
}

export async function runRuntimeOrbitPropagation(request: RuntimeOrbitPropagationRequest) {
  return postRuntimeJson<RuntimePropagationResponse, RuntimeOrbitPropagationRequest>("/api/runtime/propagation/orbit", request);
}

export async function runRuntimeVisibility(request: RuntimeVisibilityRequest) {
  return postRuntimeJson<RuntimeVisibilityResult, RuntimeVisibilityRequest>("/api/runtime/visibility", request);
}

export async function runRuntimeOrbitVisibility(request: RuntimeOrbitVisibilityRequest) {
  return postRuntimeJson<RuntimeVisibilityResult, RuntimeOrbitVisibilityRequest>("/api/runtime/visibility/orbit", request);
}

export async function runRuntimeEclipse(request: RuntimeEclipseRequest) {
  return postRuntimeJson<RuntimeEclipseResult, RuntimeEclipseRequest>("/api/runtime/eclipse", request);
}

export async function runRuntimeOrbitEclipse(request: RuntimeOrbitEclipseRequest) {
  return postRuntimeJson<RuntimeEclipseResult, RuntimeOrbitEclipseRequest>("/api/runtime/eclipse/orbit", request);
}

export async function runRuntimeRelativeMotion(request: RuntimeRelativeMotionRequest) {
  return postRuntimeJson<RuntimeRelativeMotionResult, RuntimeRelativeMotionRequest>("/api/runtime/relative-motion", request);
}

export async function runRuntimeOrbitRelativeMotion(request: RuntimeOrbitRelativeMotionRequest) {
  return postRuntimeJson<RuntimeRelativeMotionResult, RuntimeOrbitRelativeMotionRequest>("/api/runtime/relative-motion/orbit", request);
}

export async function runRuntimePairwiseConjunction(request: RuntimeConjunctionRequest) {
  return postRuntimeJson<RuntimeConjunctionResult, RuntimeConjunctionRequest>("/api/runtime/conjunctions/pairwise", request);
}

export async function runRuntimeOrbitPairwiseConjunction(request: RuntimeOrbitConjunctionRequest) {
  return postRuntimeJson<RuntimeConjunctionResult, RuntimeOrbitConjunctionRequest>("/api/runtime/conjunctions/pairwise/orbit", request);
}

export async function runRuntimeCatalogScreening(request: RuntimeCatalogConjunctionRequest) {
  return postRuntimeJson<RuntimeCatalogConjunctionResult, RuntimeCatalogConjunctionRequest>("/api/runtime/conjunctions/catalog-screening", request);
}

export async function runRuntimeOrbitCatalogScreening(request: RuntimeOrbitCatalogScreeningRequest) {
  return postRuntimeJson<RuntimeCatalogConjunctionResult, RuntimeOrbitCatalogScreeningRequest>("/api/runtime/conjunctions/catalog-screening/orbit", request);
}

export async function runRuntimeCollisionProbability(request: RuntimeCollisionProbabilityRequest) {
  return postRuntimeJson<RuntimeCollisionProbabilityResult, RuntimeCollisionProbabilityRequest>("/api/runtime/collision-probability", request);
}

export async function runRuntimeCovariancePropagation(request: RuntimeCovariancePropagationRequest) {
  return postRuntimeJson<RuntimeCovariancePropagationResponse, RuntimeCovariancePropagationRequest>("/api/runtime/covariance/propagate", request);
}

export async function runRuntimeOrbitCovariancePropagation(request: RuntimeOrbitCovariancePropagationRequest) {
  return postRuntimeJson<RuntimeCovariancePropagationResponse, RuntimeOrbitCovariancePropagationRequest>("/api/runtime/covariance/propagate/orbit", request);
}

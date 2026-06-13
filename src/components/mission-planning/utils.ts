import type {
  BackendCapabilityRegistry,
  BackendMission,
  BackendMissionTimelineEvent,
  BackendPropagationProfile,
  NumericalIntegratorTypeId,
} from "@/services/orbitServerApi";
import type { OrbitState } from "@/domain/orbit";
import type { OrbitSummary } from "./OrbitSummaryPanel";
import type { MissionTrajectoryOverlay } from "./types";
import type { TimelineInteractionModel, TimelineScheduleMode, TimelineSnapMode, TimelineTimeMode, TimelineZoomPreset } from "./types";

export const defaultMissionTrajectoryWindowMinutes = 90;
export const missionTrajectoryMinStepSeconds = 5;
export const missionTrajectoryMaxStepSeconds = 3600;

export const timelineZoomOptions = [
  { id: "THIRTY_MIN", label: "30 min", seconds: 30 * 60 },
  { id: "ONE_HOUR", label: "1 hr", seconds: 60 * 60 },
  { id: "THREE_HOURS", label: "3 hr", seconds: 3 * 60 * 60 },
  { id: "SIX_HOURS", label: "6 hr", seconds: 6 * 60 * 60 },
  { id: "TWELVE_HOURS", label: "12 hr", seconds: 12 * 60 * 60 },
  { id: "TWENTY_FOUR_HOURS", label: "24 hr", seconds: 24 * 60 * 60 },
  { id: "CUSTOM", label: "Custom", seconds: null },
] satisfies Array<{ id: TimelineZoomPreset; label: string; seconds: number | null }>;

export const timelineSnapOptions = [
  { id: "FREE", label: "Free", seconds: 1 },
  { id: "ONE_MIN", label: "1 min", seconds: 60 },
  { id: "FIVE_MIN", label: "5 min", seconds: 5 * 60 },
  { id: "TEN_MIN", label: "10 min", seconds: 10 * 60 },
  { id: "THIRTY_MIN", label: "30 min", seconds: 30 * 60 },
  { id: "ONE_HOUR", label: "1 hr", seconds: 60 * 60 },
] satisfies Array<{ id: TimelineSnapMode; label: string; seconds: number }>;

export function compactIsoUtc(iso: string) {
  return iso.replace(".000Z", "Z");
}

export function secondsToDurationLabel(seconds: number) {
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

export function metOffsetLabelFromSeconds(totalSeconds: number) {
  const sign = totalSeconds < 0 ? "T-" : "T+";
  const absolute = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function readNumberParameter(parameters: Record<string, unknown>, key: string, fallback: number) {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readStringParameter(parameters: Record<string, unknown>, key: string, fallback: string) {
  const value = parameters[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function eventScheduleMode(event: BackendMissionTimelineEvent): TimelineScheduleMode {
  const mode = readStringParameter(event.parameters ?? {}, "scheduleMode", "MET");
  return mode === "UTC" || mode === "MET" || mode === "AFTER_EVENT" ? mode : "MET";
}

export function missionDurationSeconds(mission: BackendMission) {
  return Math.max(0, Math.round((new Date(mission.scenarioEnd).getTime() - new Date(mission.scenarioStart).getTime()) / 1000));
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

export function displayTimelineTime(mode: TimelineTimeMode, mission: BackendMission | null, iso: string) {
  return mode === "MET" && mission ? signedOffsetLabel(mission.scenarioStart, iso) : compactIsoUtc(iso);
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

export function resolveEventMetOffsets(mission: BackendMission | null, events: BackendMissionTimelineEvent[]) {
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

function eventWindowError(mission: BackendMission | null, executionIso: string) {
  if (!mission) {
    return null;
  }
  const execution = new Date(executionIso);
  const start = new Date(mission.scenarioStart);
  const end = new Date(mission.scenarioEnd);
  return execution >= start && execution <= end ? null : "Event is outside the mission window.";
}

function timelineEventDurationSeconds(event: BackendMissionTimelineEvent, nextEvent: BackendMissionTimelineEvent | null, mission: BackendMission | null) {
  if (event.type === "FINITE_BURN") {
    return Math.max(0, readNumberParameter(event.parameters ?? {}, "durationSeconds", 0));
  }
  if (event.type === "IMPULSIVE_BURN") {
    return 0;
  }
  const eventMs = new Date(event.executionTime).getTime();
  const nextMs = nextEvent ? new Date(nextEvent.executionTime).getTime() : mission ? new Date(mission.scenarioEnd).getTime() : Number.NaN;
  if (!Number.isFinite(eventMs) || !Number.isFinite(nextMs)) {
    return 0;
  }
  return Math.max(0, Math.round((nextMs - eventMs) / 1000));
}

export function timelineAnalysis(mission: BackendMission | null, events: BackendMissionTimelineEvent[]) {
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
    if (eventWindowError(mission, event.executionTime)) {
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
    burnCount: events.filter((event) => event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN").length,
    finiteBurnCount: events.filter((event) => event.type === "FINITE_BURN").length,
    impulsiveBurnCount: events.filter((event) => event.type === "IMPULSIVE_BURN").length,
    coastCount: events.filter((event) => event.type === "COAST").length,
    cumulativeDeltaVMps: events.reduce((total, event) => total + estimatedEventDeltaVMps(event), 0),
    warnings,
  };
}

export type MissionFuelBudget = {
  initialMassKg: number | null;
  dryMassKg: number | null;
  initialFuelKg: number | null;
  consumedFuelKg: number;
  remainingFuelKg: number | null;
  fuelMarginPercent: number | null;
  remainingDeltaVMps: number | null;
  warnings: string[];
};

export type MissionTimelineAnalytics = {
  totalCoastSeconds: number;
  totalBurnTimeSeconds: number;
  burnCount: number;
  finiteBurnCount: number;
  impulsiveBurnCount: number;
  averageDeltaVMps: number;
  totalDeltaVMps: number;
  fuelBudget: MissionFuelBudget;
};

export type MissionOrbitEventType =
  | "PERIGEE_PASSAGE"
  | "APOGEE_PASSAGE"
  | "ASCENDING_NODE"
  | "DESCENDING_NODE"
  | "ECLIPSE_ENTRY"
  | "ECLIPSE_EXIT";

export type MissionOrbitEventMarker = {
  id: string;
  type: MissionOrbitEventType;
  timeUtc: string;
  altitudeKm: number;
  radiusKm: number;
  latitudeDeg: number;
  longitudeDeg: number;
  description: string;
};

export type DeltaVBreakdownItem = {
  key: string;
  label: string;
  deltaVMps: number;
  percent: number;
  burnCount: number;
};

export type SpacecraftPerformanceStatus = "Healthy" | "Caution" | "Critical" | "Unavailable";

export type ManeuverQualityAnalysis = {
  eventId: string;
  location: string;
  efficiency: string;
  alignment: string;
  rationale: string;
};

export type MissionDesignTargets = {
  targetAltitudeKm: number | null;
  targetInclinationDeg: number | null;
  targetEccentricity: number | null;
  targetRaanDeg: number | null;
  targetArgumentOfPerigeeDeg: number | null;
};

export type MissionConstraints = {
  maxBurnDurationSeconds: number | null;
  maxSingleBurnDeltaVMps: number | null;
  fuelReservePercent: number | null;
  minPerigeeAltitudeKm: number | null;
  maxEclipseDurationSeconds: number | null;
};

export type MonteCarloSettings = {
  samples: number;
  burnMagnitudeErrorPercent: number;
  burnDirectionErrorDeg: number;
  timingErrorSeconds: number;
};

export type ManeuverTargetingSolution = {
  id: string;
  target: string;
  current: string;
  desired: string;
  requiredDeltaVMps: number;
  estimatedFuelKg: number;
  method: string;
  confidence: "High" | "Medium" | "Low";
  rationale: string;
};

export type MissionObjectiveProgress = {
  label: string;
  current: string;
  target: string;
  progressPercent: number;
  status: "Achieved" | "In Progress" | "Needs Plan" | "Unavailable";
};

export type MissionConstraintViolation = {
  constraint: string;
  severity: "Warning" | "Violation";
  message: string;
};

export type MonteCarloDispersionResult = {
  samples: number;
  bestCaseDeltaVMps: number;
  averageDeltaVMps: number;
  worstCaseDeltaVMps: number;
  orbitSpreadKm: number;
  timingSpreadSeconds: number;
  robustness: "Robust" | "Sensitive" | "Fragile";
};

export type OrbitLifetimeEstimate = {
  classification: "Stable" | "Decaying" | "Reentry Risk" | "Unavailable";
  estimatedLifetime: string;
  dragSensitivity: string;
  rationale: string;
};

export type TradeStudySolution = {
  label: string;
  rank: number;
  deltaVMps: number;
  fuelKg: number;
  transferSeconds: number;
  score: number;
  rationale: string;
};

export type TargetSolverResidual = {
  parameter: string;
  initialError: number;
  finalError: number;
  unit: string;
  tolerance: number;
};

export type TargetSolverManeuverStep = {
  name: string;
  type: "IMPULSIVE_BURN" | "COAST";
  deltaVMps: number;
  durationSeconds: number;
  location: string;
  direction: string;
};

export type TargetSolverResult = {
  status: "Converged" | "Partial" | "Needs High-Fidelity Solve" | "Unavailable";
  iterations: number;
  totalDeltaVMps: number;
  estimatedFuelKg: number;
  residuals: TargetSolverResidual[];
  plan: TargetSolverManeuverStep[];
  rationale: string;
};

export type OptimizationCandidate = {
  mode: "Minimum dV" | "Minimum Fuel" | "Minimum Transfer Time";
  rank: number;
  deltaVMps: number;
  fuelKg: number;
  transferSeconds: number;
  residualScore: number;
  rationale: string;
};

export type RelativeMotionSettings = {
  radialOffsetKm: number;
  alongTrackOffsetKm: number;
  crossTrackOffsetKm: number;
  relativeDriftMps: number;
};

export type RelativeMotionAnalysis = {
  relativePositionKm: number;
  relativeVelocityMps: number;
  closestApproachKm: number;
  closestApproachTimeUtc: string | null;
  separationTrend: "Opening" | "Closing" | "Nearly Stationary" | "Unavailable";
  rationale: string;
};

export type GroundStationConfig = {
  latitudeDeg: number;
  longitudeDeg: number;
  elevationMaskDeg: number;
};

export type GroundStationAccess = {
  nextPassStartUtc: string | null;
  nextPassEndUtc: string | null;
  passDurationSeconds: number;
  maxElevationDeg: number;
  accessCount: number;
  accessTimeline: Array<{ startUtc: string; endUtc: string; durationSeconds: number; maxElevationDeg: number }>;
};

export type CoverageSettings = {
  swathWidthKm: number;
  minimumElevationDeg: number;
};

export type CoverageAnalysis = {
  accessOpportunities: number;
  approximateCoveragePercent: number;
  revisitTimeSeconds: number | null;
  rationale: string;
};

export type WalkerConstellationConfig = {
  pattern: "DELTA" | "STAR";
  satelliteCount: number;
  planeCount: number;
  phasing: number;
  altitudeKm: number;
  inclinationDeg: number;
};

export type WalkerConstellationAnalysis = {
  valid: boolean;
  satellitesPerPlane: number;
  raanSpacingDeg: number;
  inPlaneSpacingDeg: number;
  relativePhaseDeg: number;
  summary: string;
};

export type AerospaceReviewFinding = {
  area: string;
  severity: "Info" | "Warning" | "Critical";
  status: "Implemented" | "Partial" | "Screening Only" | "Missing";
  finding: string;
  recommendation: string;
};

export type CapabilityMatrixItem = {
  capability: string;
  currentStatus: "Implemented" | "Partial" | "Missing";
  orekit: "Implemented" | "Partial" | "Missing";
  gmat: "Implemented" | "Partial" | "Missing";
  stk: "Implemented" | "Partial" | "Missing";
  freeFlyer: "Implemented" | "Partial" | "Missing";
  note: string;
};

type ReducedTargetState = {
  altitudeKm: number;
  inclinationDeg: number;
  eccentricity: number;
};

const earthMuKm3S2 = 398600.4418;
const earthRadiusKm = 6378.137;

function formatSignedDegrees(value: number | null) {
  return value == null || !Number.isFinite(value) ? "Unavailable" : `${value.toFixed(3)} deg`;
}

function wetMass(profile: BackendPropagationProfile | null) {
  return profile ? profile.dryMassKg + profile.fuelMassKg : 1000;
}

export function missionTargetingSolutions(
  orbitSummary: OrbitSummary,
  targets: MissionDesignTargets,
  profile: BackendPropagationProfile | null,
): ManeuverTargetingSolution[] {
  const solutions: ManeuverTargetingSolution[] = [];
  const currentRadiusKm = orbitSummary.currentAltitudeKm == null ? null : orbitSummary.currentAltitudeKm + earthRadiusKm;
  const speedMps = (orbitSummary.localVelocityKmps ?? 0) * 1000;

  if (targets.targetAltitudeKm != null && currentRadiusKm != null && orbitSummary.currentAltitudeKm != null) {
    const targetRadiusKm = targets.targetAltitudeKm + earthRadiusKm;
    const transferA = (currentRadiusKm + targetRadiusKm) / 2;
    const circularCurrent = Math.sqrt(earthMuKm3S2 / currentRadiusKm) * 1000;
    const circularTarget = Math.sqrt(earthMuKm3S2 / targetRadiusKm) * 1000;
    const transferStart = Math.sqrt(earthMuKm3S2 * ((2 / currentRadiusKm) - (1 / transferA))) * 1000;
    const transferEnd = Math.sqrt(earthMuKm3S2 * ((2 / targetRadiusKm) - (1 / transferA))) * 1000;
    const deltaV = Math.abs(transferStart - circularCurrent) + Math.abs(circularTarget - transferEnd);
    solutions.push({
      id: "target-altitude",
      target: "Target altitude",
      current: `${orbitSummary.currentAltitudeKm.toFixed(2)} km`,
      desired: `${targets.targetAltitudeKm.toFixed(2)} km`,
      requiredDeltaVMps: deltaV,
      estimatedFuelKg: estimatePropellantKg(deltaV, wetMass(profile), profile?.nominalIspS ?? 220),
      method: "Two-impulse Hohmann targeting",
      confidence: orbitSummary.eccentricity != null && orbitSummary.eccentricity < 0.02 ? "High" : "Medium",
      rationale: "Altitude targeting is estimated with vis-viva and a coplanar Hohmann transfer.",
    });
  }

  if (targets.targetInclinationDeg != null && orbitSummary.inclinationDeg != null && speedMps > 0) {
    const deltaI = Math.abs(targets.targetInclinationDeg - orbitSummary.inclinationDeg);
    const deltaV = 2 * speedMps * Math.sin((deltaI * Math.PI / 180) / 2);
    solutions.push({
      id: "target-inclination",
      target: "Target inclination",
      current: formatSignedDegrees(orbitSummary.inclinationDeg),
      desired: formatSignedDegrees(targets.targetInclinationDeg),
      requiredDeltaVMps: deltaV,
      estimatedFuelKg: estimatePropellantKg(deltaV, wetMass(profile), profile?.nominalIspS ?? 220),
      method: "Pure plane-change targeting",
      confidence: deltaI <= 10 ? "High" : "Medium",
      rationale: "Inclination targeting uses dv = 2v sin(delta-i/2); node execution is preferred for operational plans.",
    });
  }

  if (targets.targetEccentricity != null && orbitSummary.eccentricity != null && speedMps > 0) {
    const deltaE = Math.abs(targets.targetEccentricity - orbitSummary.eccentricity);
    const deltaV = speedMps * Math.min(0.25, deltaE);
    solutions.push({
      id: "target-eccentricity",
      target: "Target eccentricity",
      current: orbitSummary.eccentricity.toFixed(6),
      desired: targets.targetEccentricity.toFixed(6),
      requiredDeltaVMps: deltaV,
      estimatedFuelKg: estimatePropellantKg(deltaV, wetMass(profile), profile?.nominalIspS ?? 220),
      method: "Apsis-shaping estimate",
      confidence: "Low",
      rationale: "Eccentricity targeting is a first-order apsis-shaping estimate; high-fidelity targeting should solve for burn location and final elements.",
    });
  }

  if (targets.targetRaanDeg != null && orbitSummary.raanDeg != null && speedMps > 0) {
    const delta = angularSeparationDeg(targets.targetRaanDeg, orbitSummary.raanDeg);
    solutions.push({
      id: "target-raan",
      target: "Target RAAN",
      current: formatSignedDegrees(orbitSummary.raanDeg),
      desired: formatSignedDegrees(targets.targetRaanDeg),
      requiredDeltaVMps: 2 * speedMps * Math.sin((delta * Math.PI / 180) / 2),
      estimatedFuelKg: estimatePropellantKg(2 * speedMps * Math.sin((delta * Math.PI / 180) / 2), wetMass(profile), profile?.nominalIspS ?? 220),
      method: "Plane rotation estimate",
      confidence: "Low",
      rationale: "RAAN targeting generally requires nodal targeting and may exploit natural J2 drift; this estimate is conservative.",
    });
  }

  if (targets.targetArgumentOfPerigeeDeg != null && orbitSummary.argumentOfPerigeeDeg != null && speedMps > 0) {
    const delta = angularSeparationDeg(targets.targetArgumentOfPerigeeDeg, orbitSummary.argumentOfPerigeeDeg);
    const deltaV = speedMps * Math.sin((delta * Math.PI / 180) / 2) * Math.max(orbitSummary.eccentricity ?? 0.01, 0.01);
    solutions.push({
      id: "target-argument-of-perigee",
      target: "Target argument of perigee",
      current: formatSignedDegrees(orbitSummary.argumentOfPerigeeDeg),
      desired: formatSignedDegrees(targets.targetArgumentOfPerigeeDeg),
      requiredDeltaVMps: deltaV,
      estimatedFuelKg: estimatePropellantKg(deltaV, wetMass(profile), profile?.nominalIspS ?? 220),
      method: "Apse-line rotation estimate",
      confidence: "Low",
      rationale: "Argument-of-perigee targeting is sensitive to eccentricity and burn phasing; use as a screening estimate.",
    });
  }

  return solutions.toSorted((a, b) => b.requiredDeltaVMps - a.requiredDeltaVMps);
}

function angularSeparationDeg(left: number, right: number) {
  const delta = Math.abs(((left - right + 180) % 360) - 180);
  return Number.isFinite(delta) ? delta : 0;
}

export function monteCarloDispersion(
  analytics: MissionTimelineAnalytics,
  settings: MonteCarloSettings,
): MonteCarloDispersionResult {
  const samples = Math.max(10, Math.round(settings.samples));
  const baseDeltaV = analytics.totalDeltaVMps;
  const magnitude = Math.max(0, settings.burnMagnitudeErrorPercent) / 100;
  const direction = Math.max(0, settings.burnDirectionErrorDeg) * Math.PI / 180;
  const timing = Math.max(0, settings.timingErrorSeconds);
  const sampledDeltaVs = Array.from({ length: samples }, (_, index) => {
    const magnitudeError = deterministicUnitSample(index, 1) * magnitude;
    const directionPenalty = Math.abs(deterministicUnitSample(index, 2)) * direction;
    const timingPenalty = Math.abs(deterministicUnitSample(index, 3)) * (timing / 3600);
    return Math.max(0, baseDeltaV * (1 + magnitudeError + directionPenalty + timingPenalty * 0.15));
  });
  const bestCaseDeltaVMps = Math.min(...sampledDeltaVs);
  const worstCaseDeltaVMps = Math.max(...sampledDeltaVs);
  const averageDeltaVMps = sampledDeltaVs.reduce((sum, value) => sum + value, 0) / sampledDeltaVs.length;
  const standardDeviation = Math.sqrt(sampledDeltaVs.reduce((sum, value) => sum + ((value - averageDeltaVMps) ** 2), 0) / sampledDeltaVs.length);
  const orbitSpreadKm = (worstCaseDeltaVMps - bestCaseDeltaVMps + standardDeviation) * 0.8;
  const combinedSigma = Math.sqrt(magnitude * magnitude + direction * direction + (timing / 3600) ** 2);
  const robustness = orbitSpreadKm > 25 || combinedSigma > 0.08 ? "Fragile" : orbitSpreadKm > 5 || combinedSigma > 0.03 ? "Sensitive" : "Robust";
  return {
    samples,
    bestCaseDeltaVMps,
    averageDeltaVMps,
    worstCaseDeltaVMps,
    orbitSpreadKm,
    timingSpreadSeconds: timing * 2,
    robustness,
  };
}

function deterministicUnitSample(index: number, salt: number) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 7.233)) * 43758.5453;
  return ((value - Math.floor(value)) * 2) - 1;
}

export function missionConstraintViolations(
  events: BackendMissionTimelineEvent[],
  analytics: MissionTimelineAnalytics,
  orbitSummary: OrbitSummary,
  orbitMarkers: MissionOrbitEventMarker[],
  constraints: MissionConstraints,
): MissionConstraintViolation[] {
  const violations: MissionConstraintViolation[] = [];
  events.filter((event) => event.enabled && (event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN")).forEach((event) => {
    const deltaV = estimatedEventDeltaVMps(event);
    if (constraints.maxSingleBurnDeltaVMps != null && deltaV > constraints.maxSingleBurnDeltaVMps) {
      violations.push({ constraint: "Max single-burn dV", severity: "Violation", message: `${event.name} requires ${deltaV.toFixed(2)} m/s, above ${constraints.maxSingleBurnDeltaVMps.toFixed(2)} m/s.` });
    }
    const duration = readNumberParameter(event.parameters ?? {}, "durationSeconds", 0);
    if (event.type === "FINITE_BURN" && constraints.maxBurnDurationSeconds != null && duration > constraints.maxBurnDurationSeconds) {
      violations.push({ constraint: "Max burn duration", severity: "Violation", message: `${event.name} duration ${duration.toFixed(0)}s exceeds ${constraints.maxBurnDurationSeconds.toFixed(0)}s.` });
    }
  });
  if (constraints.fuelReservePercent != null && analytics.fuelBudget.fuelMarginPercent != null && analytics.fuelBudget.fuelMarginPercent < constraints.fuelReservePercent) {
    violations.push({ constraint: "Fuel reserve", severity: analytics.fuelBudget.fuelMarginPercent < 0 ? "Violation" : "Warning", message: `Fuel margin ${analytics.fuelBudget.fuelMarginPercent.toFixed(1)}% is below reserve ${constraints.fuelReservePercent.toFixed(1)}%.` });
  }
  if (constraints.minPerigeeAltitudeKm != null && orbitSummary.perigeeAltitudeKm != null && orbitSummary.perigeeAltitudeKm < constraints.minPerigeeAltitudeKm) {
    violations.push({ constraint: "Minimum perigee", severity: "Violation", message: `Perigee ${orbitSummary.perigeeAltitudeKm.toFixed(2)} km is below ${constraints.minPerigeeAltitudeKm.toFixed(2)} km.` });
  }
  const eclipseDurations = eclipseDurationsSeconds(orbitMarkers);
  const maxEclipse = Math.max(0, ...eclipseDurations);
  if (constraints.maxEclipseDurationSeconds != null && maxEclipse > constraints.maxEclipseDurationSeconds) {
    violations.push({ constraint: "Eclipse duration", severity: "Warning", message: `Detected eclipse duration ${maxEclipse.toFixed(0)}s exceeds ${constraints.maxEclipseDurationSeconds.toFixed(0)}s.` });
  }
  return violations;
}

function eclipseDurationsSeconds(markers: MissionOrbitEventMarker[]) {
  const durations: number[] = [];
  let entry: MissionOrbitEventMarker | null = null;
  markers.forEach((marker) => {
    if (marker.type === "ECLIPSE_ENTRY") {
      entry = marker;
    }
    if (marker.type === "ECLIPSE_EXIT" && entry) {
      durations.push(Math.max(0, Math.round((new Date(marker.timeUtc).getTime() - new Date(entry.timeUtc).getTime()) / 1000)));
      entry = null;
    }
  });
  return durations;
}

export function orbitLifetimeEstimate(orbitSummary: OrbitSummary): OrbitLifetimeEstimate {
  const perigee = orbitSummary.perigeeAltitudeKm;
  if (perigee == null) {
    return { classification: "Unavailable", estimatedLifetime: "Unavailable", dragSensitivity: "Unknown", rationale: "Perigee altitude is unavailable." };
  }
  if (perigee < 180) {
    return { classification: "Reentry Risk", estimatedLifetime: "Hours to days", dragSensitivity: "Extreme", rationale: "Perigee is inside the dense upper atmosphere; decay is rapid and solar activity sensitive." };
  }
  if (perigee < 300) {
    return { classification: "Reentry Risk", estimatedLifetime: "Days to weeks", dragSensitivity: "High", rationale: "Very-low LEO perigee produces strong drag losses and short lifetime." };
  }
  if (perigee < 450) {
    return { classification: "Decaying", estimatedLifetime: "Months to a few years", dragSensitivity: "High", rationale: "LEO drag can dominate lifetime; atmospheric density and ballistic coefficient matter." };
  }
  if (perigee < 650) {
    return { classification: "Decaying", estimatedLifetime: "Years", dragSensitivity: "Medium", rationale: "Orbit is above the highest-drag regime but still sensitive to solar-cycle density." };
  }
  return { classification: "Stable", estimatedLifetime: "Many years", dragSensitivity: "Low", rationale: "Perigee is high enough that atmospheric drag is not expected to dominate short mission planning." };
}

export function missionObjectiveProgress(orbitSummary: OrbitSummary, targets: MissionDesignTargets): MissionObjectiveProgress[] {
  const objectives: MissionObjectiveProgress[] = [];
  if (targets.targetAltitudeKm != null) {
    objectives.push(progressMetric("Reach target altitude", orbitSummary.currentAltitudeKm, targets.targetAltitudeKm, "km", 50));
  }
  if (targets.targetInclinationDeg != null) {
    objectives.push(progressMetric("Reach target inclination", orbitSummary.inclinationDeg, targets.targetInclinationDeg, "deg", 1));
  }
  if (targets.targetEccentricity != null) {
    objectives.push(progressMetric("Reach target eccentricity", orbitSummary.eccentricity, targets.targetEccentricity, "", 0.005));
  }
  return objectives;
}

function progressMetric(label: string, current: number | null, target: number, unit: string, tolerance: number): MissionObjectiveProgress {
  if (current == null || !Number.isFinite(current)) {
    return { label, current: "Unavailable", target: `${target}${unit ? ` ${unit}` : ""}`, progressPercent: 0, status: "Unavailable" };
  }
  const error = Math.abs(current - target);
  const scale = Math.max(Math.abs(target), tolerance * 10);
  const progressPercent = Math.max(0, Math.min(100, (1 - (error / scale)) * 100));
  return {
    label,
    current: `${current.toFixed(unit === "" ? 6 : 2)}${unit ? ` ${unit}` : ""}`,
    target: `${target.toFixed(unit === "" ? 6 : 2)}${unit ? ` ${unit}` : ""}`,
    progressPercent,
    status: error <= tolerance ? "Achieved" : progressPercent > 50 ? "In Progress" : "Needs Plan",
  };
}

export function tradeStudySolutions(
  targetingSolutions: ManeuverTargetingSolution[],
  analytics: MissionTimelineAnalytics,
): TradeStudySolution[] {
  const totalTargetDeltaV = targetingSolutions.reduce((sum, solution) => sum + solution.requiredDeltaVMps, 0);
  const totalTargetFuel = targetingSolutions.reduce((sum, solution) => sum + solution.estimatedFuelKg, 0);
  const baselineTime = Math.max(analytics.totalCoastSeconds, 1);
  const candidates: TradeStudySolution[] = [
    {
      label: "Lowest dV",
      rank: 0,
      deltaVMps: totalTargetDeltaV * 0.9,
      fuelKg: totalTargetFuel * 0.9,
      transferSeconds: baselineTime * 1.4,
      score: 0,
      rationale: "Prioritizes energy efficiency with longer coast arcs and apsis/node placement.",
    },
    {
      label: "Fastest Transfer",
      rank: 0,
      deltaVMps: totalTargetDeltaV * 1.25,
      fuelKg: totalTargetFuel * 1.25,
      transferSeconds: baselineTime * 0.65,
      score: 0,
      rationale: "Accepts higher burn cost to reduce transfer time.",
    },
    {
      label: "Lowest Fuel",
      rank: 0,
      deltaVMps: totalTargetDeltaV * 0.95,
      fuelKg: totalTargetFuel * 0.85,
      transferSeconds: baselineTime * 1.2,
      score: 0,
      rationale: "Favors propellant margin and conservative execution.",
    },
    {
      label: "Balanced",
      rank: 0,
      deltaVMps: totalTargetDeltaV,
      fuelKg: totalTargetFuel,
      transferSeconds: baselineTime,
      score: 0,
      rationale: "Balances burn cost, propellant use, and schedule.",
    },
  ];
  const maxDv = Math.max(1, ...candidates.map((candidate) => candidate.deltaVMps));
  const maxFuel = Math.max(1, ...candidates.map((candidate) => candidate.fuelKg));
  const maxTime = Math.max(1, ...candidates.map((candidate) => candidate.transferSeconds));
  return candidates.map((candidate) => ({
    ...candidate,
    score: (candidate.deltaVMps / maxDv) * 0.4 + (candidate.fuelKg / maxFuel) * 0.4 + (candidate.transferSeconds / maxTime) * 0.2,
  })).toSorted((a, b) => a.score - b.score).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function solveTargetingProblem(
  orbitSummary: OrbitSummary,
  targets: MissionDesignTargets,
  profile: BackendPropagationProfile | null,
): TargetSolverResult {
  const solutions = missionTargetingSolutions(orbitSummary, targets, profile);
  const initialState = reducedTargetState(orbitSummary);
  const targetState = reducedDesiredState(initialState, targets);
  const activeKeys = (["altitudeKm", "inclinationDeg", "eccentricity"] as const)
    .filter((key) => Number.isFinite(targetState[key] - initialState[key]));
  if (solutions.length === 0 || activeKeys.length === 0) {
    return {
      status: "Unavailable",
      iterations: 0,
      totalDeltaVMps: 0,
      estimatedFuelKg: 0,
      residuals: [],
      plan: [],
      rationale: "No solvable target parameters are currently active or the orbit state is incomplete.",
    };
  }

  const solve = finiteDifferenceCorrector(initialState, targetState, activeKeys);
  const residuals = solverResiduals(orbitSummary, targets, solve.finalState);
  const hasLowConfidence = solutions.some((solution) => solution.confidence === "Low");
  const converged = residuals.every((residual) => Math.abs(residual.finalError) <= residual.tolerance);
  const totalDeltaVMps = Math.max(solve.controlNormMps, solutions.reduce((sum, solution) => sum + solution.requiredDeltaVMps, 0));
  const transferSeconds = hohmannTransferSeconds(orbitSummary, targets.targetAltitudeKm);
  const plan = solverManeuverPlan(solutions, transferSeconds);

  return {
    status: converged ? "Converged" : hasLowConfidence ? "Needs High-Fidelity Solve" : "Partial",
    iterations: solve.iterations,
    totalDeltaVMps,
    estimatedFuelKg: estimatePropellantKg(totalDeltaVMps, wetMass(profile), profile?.nominalIspS ?? 220),
    residuals,
    plan,
    rationale: hasLowConfidence
      ? "Finite-difference corrector solved altitude/inclination/eccentricity in a reduced-order model. RAAN and argument-of-perigee remain screening estimates and should be promoted to an Orekit numerical targeting solve before operations."
      : "Finite-difference corrector solved a reduced-order maneuver model with explicit residual tolerances. This is materially better than closed-form ranking, but still not a high-fidelity propagated shooting method.",
  };
}

function reducedTargetState(orbitSummary: OrbitSummary): ReducedTargetState {
  return {
    altitudeKm: orbitSummary.currentAltitudeKm ?? orbitSummary.perigeeAltitudeKm ?? 0,
    inclinationDeg: orbitSummary.inclinationDeg ?? 0,
    eccentricity: orbitSummary.eccentricity ?? 0,
  };
}

function reducedDesiredState(initialState: ReducedTargetState, targets: MissionDesignTargets): ReducedTargetState {
  return {
    altitudeKm: targets.targetAltitudeKm ?? initialState.altitudeKm,
    inclinationDeg: targets.targetInclinationDeg ?? initialState.inclinationDeg,
    eccentricity: targets.targetEccentricity ?? initialState.eccentricity,
  };
}

function finiteDifferenceCorrector(
  initialState: ReducedTargetState,
  targetState: ReducedTargetState,
  activeKeys: Array<keyof ReducedTargetState>,
) {
  let control: [number, number, number] = [0, 0, 0];
  let finalState = applyReducedManeuverModel(initialState, control);
  const tolerance = [0.5, 0.01, 0.0005];
  let iterations = 0;
  for (; iterations < 12; iterations += 1) {
    const residual = activeKeys.map((key) => finalState[key] - targetState[key]);
    if (residual.every((value, index) => Math.abs(value) <= tolerance[index])) {
      break;
    }
    const jacobian = finiteDifferenceJacobian(initialState, control, activeKeys);
    const step = solveLeastSquares3(jacobian, residual);
    control = [
      clamp(control[0] - step[0], -5000, 5000),
      clamp(control[1] - step[1], -5000, 5000),
      clamp(control[2] - step[2], -5000, 5000),
    ];
    finalState = applyReducedManeuverModel(initialState, control);
  }
  return {
    iterations,
    finalState,
    controlNormMps: Math.hypot(control[0], control[1], control[2]),
  };
}

function applyReducedManeuverModel(initialState: ReducedTargetState, controlMps: [number, number, number]): ReducedTargetState {
  const circularRadiusKm = earthRadiusKm + Math.max(120, initialState.altitudeKm);
  const circularSpeedMps = Math.sqrt(earthMuKm3S2 / circularRadiusKm) * 1000;
  return {
    altitudeKm: Math.max(-earthRadiusKm, initialState.altitudeKm + (2 * circularRadiusKm * controlMps[0] / circularSpeedMps)),
    inclinationDeg: initialState.inclinationDeg + (controlMps[1] / Math.max(circularSpeedMps, 1)) * 180 / Math.PI,
    eccentricity: clamp(initialState.eccentricity + controlMps[2] / Math.max(circularSpeedMps, 1), 0, 0.95),
  };
}

function finiteDifferenceJacobian(
  initialState: ReducedTargetState,
  controlMps: [number, number, number],
  activeKeys: Array<keyof ReducedTargetState>,
) {
  const epsilon = 0.1;
  const base = applyReducedManeuverModel(initialState, controlMps);
  return activeKeys.map((key) => {
    return [0, 1, 2].map((axis) => {
      const perturbed: [number, number, number] = [...controlMps];
      perturbed[axis] += epsilon;
      const shifted = applyReducedManeuverModel(initialState, perturbed);
      return (shifted[key] - base[key]) / epsilon;
    });
  });
}

function solveLeastSquares3(jacobian: number[][], residual: number[]) {
  const normal: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const rhs: [number, number, number] = [0, 0, 0];
  jacobian.forEach((row, rowIndex) => {
    for (let i = 0; i < 3; i += 1) {
      rhs[i] += row[i] * residual[rowIndex];
      for (let j = 0; j < 3; j += 1) {
        normal[i][j] += row[i] * row[j];
      }
    }
  });
  for (let i = 0; i < 3; i += 1) {
    normal[i][i] += 1.0e-8;
  }
  return solve3x3(normal, rhs);
}

function solve3x3(matrix: [number, number, number][], vector: [number, number, number]): [number, number, number] {
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let pivotRow = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(a[row][pivot]) > Math.abs(a[pivotRow][pivot])) {
        pivotRow = row;
      }
    }
    [a[pivot], a[pivotRow]] = [a[pivotRow], a[pivot]];
    const divisor = Math.abs(a[pivot][pivot]) < 1.0e-12 ? 1.0e-12 : a[pivot][pivot];
    for (let column = pivot; column < 4; column += 1) {
      a[pivot][column] /= divisor;
    }
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = a[row][pivot];
      for (let column = pivot; column < 4; column += 1) {
        a[row][column] -= factor * a[pivot][column];
      }
    }
  }
  return [a[0][3], a[1][3], a[2][3]];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function solverResiduals(orbitSummary: OrbitSummary, targets: MissionDesignTargets, finalState: ReducedTargetState): TargetSolverResidual[] {
  const residuals: TargetSolverResidual[] = [];
  if (targets.targetAltitudeKm != null && orbitSummary.currentAltitudeKm != null) {
    residuals.push({ parameter: "Altitude", initialError: orbitSummary.currentAltitudeKm - targets.targetAltitudeKm, finalError: finalState.altitudeKm - targets.targetAltitudeKm, unit: "km", tolerance: 0.5 });
  }
  if (targets.targetInclinationDeg != null && orbitSummary.inclinationDeg != null) {
    residuals.push({ parameter: "Inclination", initialError: orbitSummary.inclinationDeg - targets.targetInclinationDeg, finalError: finalState.inclinationDeg - targets.targetInclinationDeg, unit: "deg", tolerance: 0.01 });
  }
  if (targets.targetEccentricity != null && orbitSummary.eccentricity != null) {
    residuals.push({ parameter: "Eccentricity", initialError: orbitSummary.eccentricity - targets.targetEccentricity, finalError: finalState.eccentricity - targets.targetEccentricity, unit: "", tolerance: 0.0005 });
  }
  if (targets.targetRaanDeg != null && orbitSummary.raanDeg != null) {
    const initialError = angularSeparationDeg(orbitSummary.raanDeg, targets.targetRaanDeg);
    residuals.push({ parameter: "RAAN", initialError, finalError: initialError, unit: "deg", tolerance: 0.02 });
  }
  if (targets.targetArgumentOfPerigeeDeg != null && orbitSummary.argumentOfPerigeeDeg != null) {
    const initialError = angularSeparationDeg(orbitSummary.argumentOfPerigeeDeg, targets.targetArgumentOfPerigeeDeg);
    residuals.push({ parameter: "Argument of Perigee", initialError, finalError: initialError, unit: "deg", tolerance: 0.05 });
  }
  return residuals;
}

function solverManeuverPlan(solutions: ManeuverTargetingSolution[], transferSeconds: number): TargetSolverManeuverStep[] {
  const steps: TargetSolverManeuverStep[] = [];
  solutions.toSorted((a, b) => a.id.localeCompare(b.id)).forEach((solution) => {
    if (solution.id === "target-altitude") {
      steps.push({
        name: "Energy correction burn 1",
        type: "IMPULSIVE_BURN",
        deltaVMps: solution.requiredDeltaVMps / 2,
        durationSeconds: 0,
        location: "Initial tangent point",
        direction: "Tangential",
      });
      steps.push({
        name: "Transfer coast",
        type: "COAST",
        deltaVMps: 0,
        durationSeconds: transferSeconds,
        location: "Transfer ellipse",
        direction: "N/A",
      });
      steps.push({
        name: "Energy correction burn 2",
        type: "IMPULSIVE_BURN",
        deltaVMps: solution.requiredDeltaVMps / 2,
        durationSeconds: 0,
        location: "Target tangent point",
        direction: "Tangential",
      });
      return;
    }
    steps.push({
      name: solution.target,
      type: "IMPULSIVE_BURN",
      deltaVMps: solution.requiredDeltaVMps,
      durationSeconds: 0,
      location: solution.id.includes("inclination") || solution.id.includes("raan") ? "Node crossing preferred" : "Apsis or optimized true anomaly",
      direction: solution.id.includes("inclination") || solution.id.includes("raan") ? "Normal/anti-normal" : "Tangential/radial mix",
    });
  });
  return steps;
}

function hohmannTransferSeconds(orbitSummary: OrbitSummary, targetAltitudeKm: number | null) {
  if (targetAltitudeKm == null || orbitSummary.currentAltitudeKm == null) {
    return 0;
  }
  const r1 = orbitSummary.currentAltitudeKm + earthRadiusKm;
  const r2 = targetAltitudeKm + earthRadiusKm;
  const transferA = (r1 + r2) / 2;
  return Math.PI * Math.sqrt((transferA ** 3) / earthMuKm3S2);
}

export function optimizationCandidates(
  solver: TargetSolverResult,
  analytics: MissionTimelineAnalytics,
): OptimizationCandidate[] {
  const baseDeltaV = solver.totalDeltaVMps || analytics.totalDeltaVMps;
  const baseFuel = solver.estimatedFuelKg || analytics.fuelBudget.consumedFuelKg;
  const baseTime = Math.max(hohmannPlanCoastSeconds(solver.plan), analytics.totalCoastSeconds, 1);
  const residualScore = solver.residuals.reduce((sum, residual) => sum + Math.abs(residual.finalError) / Math.max(residual.tolerance, 1.0e-9), 0);
  const candidates: OptimizationCandidate[] = [
    {
      mode: "Minimum dV",
      rank: 0,
      deltaVMps: baseDeltaV * 0.92,
      fuelKg: baseFuel * 0.92,
      transferSeconds: baseTime * 1.35,
      residualScore: residualScore * 1.1,
      rationale: "Selects lower-energy phasing and accepts longer transfer/coast time.",
    },
    {
      mode: "Minimum Fuel",
      rank: 0,
      deltaVMps: baseDeltaV * 0.96,
      fuelKg: baseFuel * 0.88,
      transferSeconds: baseTime * 1.2,
      residualScore,
      rationale: "Prioritizes propellant margin using conservative maneuver sizing.",
    },
    {
      mode: "Minimum Transfer Time",
      rank: 0,
      deltaVMps: baseDeltaV * 1.28,
      fuelKg: baseFuel * 1.28,
      transferSeconds: baseTime * 0.58,
      residualScore: residualScore * 0.95,
      rationale: "Buys schedule by spending additional delta-v.",
    },
  ];
  const maxDv = Math.max(1, ...candidates.map((candidate) => candidate.deltaVMps));
  const maxFuel = Math.max(1, ...candidates.map((candidate) => candidate.fuelKg));
  const maxTime = Math.max(1, ...candidates.map((candidate) => candidate.transferSeconds));
  const maxResidual = Math.max(1, ...candidates.map((candidate) => candidate.residualScore));
  return candidates
    .map((candidate) => ({
      ...candidate,
      rank: (candidate.deltaVMps / maxDv) * 0.32 + (candidate.fuelKg / maxFuel) * 0.32 + (candidate.transferSeconds / maxTime) * 0.24 + (candidate.residualScore / maxResidual) * 0.12,
    }))
    .toSorted((a, b) => a.rank - b.rank)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function hohmannPlanCoastSeconds(plan: TargetSolverManeuverStep[]) {
  return plan.reduce((sum, step) => step.type === "COAST" ? sum + step.durationSeconds : sum, 0);
}

export function relativeMotionAnalysis(
  trajectoryOverlay: MissionTrajectoryOverlay | null,
  settings: RelativeMotionSettings,
): RelativeMotionAnalysis {
  const trajectory = trajectoryOverlay?.mission?.trajectory ?? [];
  const initialSeparation = Math.hypot(settings.radialOffsetKm, settings.alongTrackOffsetKm, settings.crossTrackOffsetKm);
  if (trajectory.length === 0) {
    return {
      relativePositionKm: initialSeparation,
      relativeVelocityMps: Math.abs(settings.relativeDriftMps),
      closestApproachKm: initialSeparation,
      closestApproachTimeUtc: null,
      separationTrend: "Unavailable",
      rationale: "Generate a trajectory to evaluate closest approach over the mission preview window.",
    };
  }
  const startMs = new Date(trajectory[0].timeUtc).getTime();
  const driftKmps = settings.relativeDriftMps / 1000;
  const samples = trajectory.map((state) => {
    const elapsedSeconds = Math.max(0, (new Date(state.timeUtc).getTime() - startMs) / 1000);
    const alongTrackKm = settings.alongTrackOffsetKm + driftKmps * elapsedSeconds;
    return {
      timeUtc: state.timeUtc,
      separationKm: Math.hypot(settings.radialOffsetKm, alongTrackKm, settings.crossTrackOffsetKm),
    };
  });
  const closest = samples.reduce((best, sample) => sample.separationKm < best.separationKm ? sample : best, samples[0]);
  const final = samples[samples.length - 1];
  const trend = Math.abs(final.separationKm - initialSeparation) < 0.1 ? "Nearly Stationary" : final.separationKm > initialSeparation ? "Opening" : "Closing";
  return {
    relativePositionKm: initialSeparation,
    relativeVelocityMps: Math.abs(settings.relativeDriftMps),
    closestApproachKm: closest.separationKm,
    closestApproachTimeUtc: closest.timeUtc,
    separationTrend: trend,
    rationale: "Relative motion uses a local RIC deputy offset and along-track drift model for rendezvous screening.",
  };
}

export function groundStationAccess(
  trajectoryOverlay: MissionTrajectoryOverlay | null,
  station: GroundStationConfig,
): GroundStationAccess {
  const trajectory = trajectoryOverlay?.mission?.trajectory ?? [];
  const accesses: GroundStationAccess["accessTimeline"] = [];
  let active: { startUtc: string; maxElevationDeg: number } | null = null;
  for (const state of trajectory) {
    const elevationDeg = groundElevationDeg(state, station);
    const inAccess = elevationDeg >= station.elevationMaskDeg;
    if (inAccess && !active) {
      active = { startUtc: state.timeUtc, maxElevationDeg: elevationDeg };
    } else if (inAccess && active) {
      active.maxElevationDeg = Math.max(active.maxElevationDeg, elevationDeg);
    } else if (!inAccess && active) {
      accesses.push({
        startUtc: active.startUtc,
        endUtc: state.timeUtc,
        durationSeconds: Math.max(0, Math.round((new Date(state.timeUtc).getTime() - new Date(active.startUtc).getTime()) / 1000)),
        maxElevationDeg: active.maxElevationDeg,
      });
      active = null;
    }
  }
  if (active && trajectory.length > 0) {
    const endUtc = trajectory[trajectory.length - 1].timeUtc;
    accesses.push({
      startUtc: active.startUtc,
      endUtc,
      durationSeconds: Math.max(0, Math.round((new Date(endUtc).getTime() - new Date(active.startUtc).getTime()) / 1000)),
      maxElevationDeg: active.maxElevationDeg,
    });
  }
  const next = accesses[0] ?? null;
  return {
    nextPassStartUtc: next?.startUtc ?? null,
    nextPassEndUtc: next?.endUtc ?? null,
    passDurationSeconds: next?.durationSeconds ?? 0,
    maxElevationDeg: next?.maxElevationDeg ?? 0,
    accessCount: accesses.length,
    accessTimeline: accesses,
  };
}

function groundElevationDeg(state: OrbitState, station: GroundStationConfig) {
  const spacecraft = geodeticToEcefKm(state.latitudeDeg, state.longitudeDeg, state.altitudeKm);
  const ground = geodeticToEcefKm(station.latitudeDeg, station.longitudeDeg, 0);
  const rho: [number, number, number] = [spacecraft[0] - ground[0], spacecraft[1] - ground[1], spacecraft[2] - ground[2]];
  const up = geodeticUpVector(station.latitudeDeg, station.longitudeDeg);
  const rhoNorm = vectorNorm(rho);
  if (rhoNorm <= 0) {
    return -90;
  }
  return Math.asin(Math.max(-1, Math.min(1, (rho[0] * up[0] + rho[1] * up[1] + rho[2] * up[2]) / rhoNorm))) * 180 / Math.PI;
}

function geodeticToEcefKm(latitudeDeg: number, longitudeDeg: number, altitudeKm: number): [number, number, number] {
  const lat = latitudeDeg * Math.PI / 180;
  const lon = longitudeDeg * Math.PI / 180;
  const radius = earthRadiusKm + altitudeKm;
  return [radius * Math.cos(lat) * Math.cos(lon), radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat)];
}

function geodeticUpVector(latitudeDeg: number, longitudeDeg: number): [number, number, number] {
  const lat = latitudeDeg * Math.PI / 180;
  const lon = longitudeDeg * Math.PI / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

export function coverageAnalysis(
  trajectoryOverlay: MissionTrajectoryOverlay | null,
  coverage: CoverageSettings,
): CoverageAnalysis {
  const trajectory = trajectoryOverlay?.mission?.trajectory ?? [];
  if (trajectory.length === 0) {
    return { accessOpportunities: 0, approximateCoveragePercent: 0, revisitTimeSeconds: null, rationale: "Generate a trajectory to estimate coverage from ground-track samples." };
  }
  const footprintRadiusKm = Math.max(0, coverage.swathWidthKm / 2);
  const footprintAreaKm2 = Math.PI * footprintRadiusKm * footprintRadiusKm;
  const earthAreaKm2 = 4 * Math.PI * earthRadiusKm * earthRadiusKm;
  const accessOpportunities = trajectory.filter((state) => state.altitudeKm > 0 && state.latitudeDeg >= -90 && state.latitudeDeg <= 90).length;
  const uniqueCells = new Set(trajectory.map((state) => `${Math.round(state.latitudeDeg / 5) * 5}:${Math.round(state.longitudeDeg / 5) * 5}`));
  const elevationMaskFactor = Math.max(0.2, Math.min(1, (90 - Math.max(0, coverage.minimumElevationDeg)) / 90));
  const approximateCoveragePercent = Math.min(100, (uniqueCells.size * footprintAreaKm2 / earthAreaKm2) * 100 * elevationMaskFactor);
  const revisitTimeSeconds = trajectory.length > 1
    ? Math.round((new Date(trajectory[trajectory.length - 1].timeUtc).getTime() - new Date(trajectory[0].timeUtc).getTime()) / Math.max(1, uniqueCells.size) / 1000)
    : null;
  return {
    accessOpportunities,
    approximateCoveragePercent,
    revisitTimeSeconds,
    rationale: `Coverage is approximated from ${uniqueCells.size} ground-track cells, a ${coverage.swathWidthKm.toFixed(0)} km swath, and ${coverage.minimumElevationDeg.toFixed(1)} deg minimum elevation; detailed EO planning should use sensor geometry and terrain masks.`,
  };
}

export function walkerConstellationAnalysis(config: WalkerConstellationConfig): WalkerConstellationAnalysis {
  const satelliteCount = Math.max(0, Math.round(config.satelliteCount));
  const planeCount = Math.max(0, Math.round(config.planeCount));
  const valid = satelliteCount > 0 && planeCount > 0 && satelliteCount % planeCount === 0;
  const satellitesPerPlane = valid ? satelliteCount / planeCount : 0;
  const raanSpacingDeg = planeCount > 0 ? (config.pattern === "STAR" ? 180 / planeCount : 360 / planeCount) : 0;
  const inPlaneSpacingDeg = satellitesPerPlane > 0 ? 360 / satellitesPerPlane : 0;
  const relativePhaseDeg = satelliteCount > 0 ? (360 * config.phasing) / satelliteCount : 0;
  return {
    valid,
    satellitesPerPlane,
    raanSpacingDeg,
    inPlaneSpacingDeg,
    relativePhaseDeg,
    summary: valid
      ? `Walker ${config.pattern.toLowerCase()} ${satelliteCount}/${planeCount}/${Math.round(config.phasing)} at ${config.altitudeKm.toFixed(0)} km and ${config.inclinationDeg.toFixed(2)} deg.`
      : "Satellite count must divide evenly by plane count for this basic Walker layout.",
  };
}

export function aerospaceReviewFindings({
  events,
  orbitSummary,
  profile,
  solver,
  relativeMotion,
  stationAccess,
  coverage,
  constellation,
}: {
  events: BackendMissionTimelineEvent[];
  orbitSummary: OrbitSummary;
  profile: BackendPropagationProfile | null;
  solver: TargetSolverResult;
  relativeMotion: RelativeMotionAnalysis;
  stationAccess: GroundStationAccess;
  coverage: CoverageAnalysis;
  constellation: WalkerConstellationAnalysis;
}): AerospaceReviewFinding[] {
  const findings: AerospaceReviewFinding[] = [
    {
      area: "Differential corrector",
      severity: "Warning",
      status: "Partial",
      finding: "The target solver now performs finite-difference Newton iterations, but over a reduced-order altitude/inclination/eccentricity model rather than propagated Cartesian states.",
      recommendation: "Move correction to backend Orekit propagation with finite-difference state transition sensitivities or Orekit partial derivatives.",
    },
    {
      area: "Lambert transfers",
      severity: "Critical",
      status: "Missing",
      finding: "No true point-to-point Lambert solver exists. Hohmann estimates only cover circular coplanar transfers.",
      recommendation: "Add a backend Lambert service for boundary-value transfers, multi-revolution options, and departure/arrival velocity residuals.",
    },
    {
      area: "Event detection",
      severity: "Warning",
      status: "Partial",
      finding: "Apsis, node, and eclipse events are derived from sampled trajectory points, so event time accuracy is bounded by sample cadence.",
      recommendation: "Use Orekit event detectors such as ApsideDetector, NodeDetector, EclipseDetector, and AltitudeDetector during propagation.",
    },
    {
      area: "Access and coverage",
      severity: "Warning",
      status: "Screening Only",
      finding: "Ground access and coverage use spherical geometry over sampled states without refraction, terrain masks, sensor attitude, or exact rise/set root finding.",
      recommendation: "Move access to backend topocentric-frame elevation event detection and sensor field-of-view geometry.",
    },
    {
      area: "Relative motion",
      severity: "Warning",
      status: "Screening Only",
      finding: "Relative motion uses a modeled RIC offset and along-track drift, not independently propagated chief/deputy states.",
      recommendation: "Add multi-spacecraft propagation with relative PV histories in RIC/LVLH and closest-approach root refinement.",
    },
  ];

  if (profile?.maneuverModelEnabled === false && events.some((event) => event.enabled && event.type !== "COAST")) {
    findings.push({
      area: "Maneuver execution",
      severity: "Critical",
      status: "Partial",
      finding: "Mission contains enabled burns while the propagation profile maneuver model is disabled.",
      recommendation: "Enable maneuver execution before accepting trajectory, fuel, or final-orbit products.",
    });
  }
  if (orbitSummary.perigeeAltitudeKm != null && orbitSummary.perigeeAltitudeKm < 160) {
    findings.push({
      area: "Reentry safety",
      severity: "Critical",
      status: "Implemented",
      finding: `Current perigee is ${orbitSummary.perigeeAltitudeKm.toFixed(1)} km, which is inside or near the operational reentry regime.`,
      recommendation: "Treat this as a reentry/disposal trajectory and run high-fidelity drag/lifetime analysis before mission approval.",
    });
  }
  if (solver.status !== "Converged" && solver.status !== "Unavailable") {
    findings.push({
      area: "Target convergence",
      severity: "Critical",
      status: "Partial",
      finding: `Target solver status is ${solver.status}; residuals are not flight-design quality.`,
      recommendation: "Do not turn this solution into an operations timeline until a propagated backend corrector converges.",
    });
  }
  if (stationAccess.accessCount === 0) {
    findings.push({
      area: "Ground operations",
      severity: "Warning",
      status: "Partial",
      finding: "No ground station access window is detected in the current trajectory preview.",
      recommendation: "Verify station coordinates, mission window, elevation mask, and trajectory generation span.",
    });
  }
  if (relativeMotion.closestApproachKm < 1) {
    findings.push({
      area: "Rendezvous safety",
      severity: "Critical",
      status: "Screening Only",
      finding: `Modeled closest approach is ${relativeMotion.closestApproachKm.toFixed(3)} km without an independently propagated deputy state.`,
      recommendation: "Run a two-spacecraft propagated relative-motion analysis before treating this as a safe rendezvous or proximity-operations plan.",
    });
  }
  if (coverage.approximateCoveragePercent > 80) {
    findings.push({
      area: "Coverage realism",
      severity: "Warning",
      status: "Screening Only",
      finding: "Approximate coverage is very high for a sample-based swath model.",
      recommendation: "Validate with sensor footprint clipping, Earth rotation, target grid, and revisit statistics before claiming coverage performance.",
    });
  }
  if (!constellation.valid) {
    findings.push({
      area: "Constellation geometry",
      severity: "Critical",
      status: "Partial",
      finding: "Walker constellation definition is invalid because satellites are not evenly distributed across planes.",
      recommendation: "Choose a satellite count divisible by plane count or implement mixed-plane custom constellation support.",
    });
  }
  return findings;
}

export function capabilityMatrix(): CapabilityMatrixItem[] {
  return [
    { capability: "High-fidelity numerical propagation", currentStatus: "Implemented", orekit: "Implemented", gmat: "Implemented", stk: "Implemented", freeFlyer: "Implemented", note: "Backend uses Orekit numerical propagation with configurable force models." },
    { capability: "Primitive maneuver execution", currentStatus: "Implemented", orekit: "Implemented", gmat: "Implemented", stk: "Implemented", freeFlyer: "Implemented", note: "Finite and impulsive burns exist; operational validation still needs deeper review." },
    { capability: "Maneuver templates", currentStatus: "Partial", orekit: "Missing", gmat: "Implemented", stk: "Implemented", freeFlyer: "Implemented", note: "Templates expand into primitives, but most targeting is still analytical/screening." },
    { capability: "Differential correction", currentStatus: "Partial", orekit: "Partial", gmat: "Implemented", stk: "Implemented", freeFlyer: "Implemented", note: "Frontend reduced-order finite-difference solve; needs backend propagated shooting." },
    { capability: "Lambert targeting", currentStatus: "Missing", orekit: "Partial", gmat: "Implemented", stk: "Implemented", freeFlyer: "Implemented", note: "No true point-to-point boundary-value solver is wired." },
    { capability: "Event-driven propagation", currentStatus: "Partial", orekit: "Implemented", gmat: "Implemented", stk: "Implemented", freeFlyer: "Implemented", note: "Current event markers are sample-derived; Orekit detectors should drive exact events." },
    { capability: "Ground station access", currentStatus: "Partial", orekit: "Implemented", gmat: "Partial", stk: "Implemented", freeFlyer: "Implemented", note: "Screening access exists; exact topocentric rise/set and constraints are not backend-owned." },
    { capability: "Sensor coverage", currentStatus: "Partial", orekit: "Partial", gmat: "Missing", stk: "Implemented", freeFlyer: "Implemented", note: "Approximate coverage only; no FOV/attitude/target grid engine yet." },
    { capability: "Relative motion / rendezvous", currentStatus: "Partial", orekit: "Partial", gmat: "Partial", stk: "Implemented", freeFlyer: "Implemented", note: "Modeled deputy only; no multi-spacecraft propagation service." },
    { capability: "Constellation design", currentStatus: "Partial", orekit: "Missing", gmat: "Missing", stk: "Implemented", freeFlyer: "Partial", note: "Basic Walker geometry only; no propagated constellation analysis." },
    { capability: "Mission report and audit trail", currentStatus: "Implemented", orekit: "Missing", gmat: "Partial", stk: "Implemented", freeFlyer: "Partial", note: "JSON reports include analysis, constraints, audit findings, and capability matrix." },
  ];
}

export function missionFuelBudget(events: BackendMissionTimelineEvent[], profile: BackendPropagationProfile | null): MissionFuelBudget {
  const warnings: string[] = [];
  const consumedFuelKg = events.reduce((sum, event) => {
    if (!event.enabled || event.type === "COAST") {
      return sum;
    }
    if (profile) {
      return sum + estimatePropellantKg(estimatedEventDeltaVMps(event), profile.dryMassKg + profile.fuelMassKg, profile.nominalIspS);
    }
    const metadataPropellant = readNumberParameter(event.parameters ?? {}, "estimatedPropellantKg", Number.NaN);
    if (Number.isFinite(metadataPropellant)) {
      return sum + Math.max(0, metadataPropellant);
    }
    return sum;
  }, 0);

  if (!profile) {
    return {
      initialMassKg: null,
      dryMassKg: null,
      initialFuelKg: null,
      consumedFuelKg,
      remainingFuelKg: null,
      fuelMarginPercent: null,
      remainingDeltaVMps: null,
      warnings,
    };
  }

  const initialMassKg = profile.dryMassKg + profile.fuelMassKg;
  const remainingFuelKg = profile.fuelMassKg - consumedFuelKg;
  const usableRemainingFuelKg = Math.max(0, remainingFuelKg);
  const fuelMarginPercent = profile.fuelMassKg > 0 ? (remainingFuelKg / profile.fuelMassKg) * 100 : null;
  const remainingDeltaVMps = profile.nominalIspS > 0 && profile.dryMassKg > 0
    ? profile.nominalIspS * 9.80665 * Math.log((profile.dryMassKg + usableRemainingFuelKg) / profile.dryMassKg)
    : null;

  if (remainingFuelKg < 0) {
    warnings.push(`Planned maneuvers exceed available fuel by ${Math.abs(remainingFuelKg).toFixed(2)} kg.`);
  } else if (fuelMarginPercent != null && fuelMarginPercent < 10) {
    warnings.push(`Fuel margin is ${fuelMarginPercent.toFixed(1)}%; reserve is below the 10% planning threshold.`);
  }

  return {
    initialMassKg,
    dryMassKg: profile.dryMassKg,
    initialFuelKg: profile.fuelMassKg,
    consumedFuelKg,
    remainingFuelKg,
    fuelMarginPercent,
    remainingDeltaVMps,
    warnings,
  };
}

export function missionTimelineAnalytics(
  mission: BackendMission | null,
  events: BackendMissionTimelineEvent[],
  profile: BackendPropagationProfile | null,
): MissionTimelineAnalytics {
  const resolved = resolveEventMetOffsets(mission, events);
  const ordered = events
    .filter((event) => event.enabled)
    .toSorted((a, b) => (resolved.offsets.get(a.id) ?? Number.POSITIVE_INFINITY) - (resolved.offsets.get(b.id) ?? Number.POSITIVE_INFINITY) || a.sequenceIndex - b.sequenceIndex);
  const totalCoastSeconds = ordered.reduce((sum, event, index) => {
    return event.type === "COAST" ? sum + timelineEventDurationSeconds(event, ordered[index + 1] ?? null, mission) : sum;
  }, 0);
  const totalBurnTimeSeconds = ordered.reduce((sum, event) => {
    return event.type === "FINITE_BURN" ? sum + readNumberParameter(event.parameters ?? {}, "durationSeconds", 0) : sum;
  }, 0);
  const burnEvents = ordered.filter((event) => event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN");
  const totalDeltaVMps = burnEvents.reduce((sum, event) => sum + estimatedEventDeltaVMps(event), 0);

  return {
    totalCoastSeconds,
    totalBurnTimeSeconds,
    burnCount: burnEvents.length,
    finiteBurnCount: burnEvents.filter((event) => event.type === "FINITE_BURN").length,
    impulsiveBurnCount: burnEvents.filter((event) => event.type === "IMPULSIVE_BURN").length,
    averageDeltaVMps: burnEvents.length > 0 ? totalDeltaVMps / burnEvents.length : 0,
    totalDeltaVMps,
    fuelBudget: missionFuelBudget(events, profile),
  };
}

function vectorNorm(values: [number, number, number]) {
  return Math.hypot(values[0], values[1], values[2]);
}

function sunUnitVectorEciApprox(date: Date): [number, number, number] {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const meanLongitudeDeg = (280.460 + 0.9856474 * n) % 360;
  const meanAnomalyDeg = (357.528 + 0.9856003 * n) % 360;
  const meanAnomalyRad = meanAnomalyDeg * Math.PI / 180;
  const eclipticLongitudeRad = (meanLongitudeDeg + 1.915 * Math.sin(meanAnomalyRad) + 0.020 * Math.sin(2 * meanAnomalyRad)) * Math.PI / 180;
  const obliquityRad = (23.439 - 0.0000004 * n) * Math.PI / 180;
  const x = Math.cos(eclipticLongitudeRad);
  const y = Math.cos(obliquityRad) * Math.sin(eclipticLongitudeRad);
  const z = Math.sin(obliquityRad) * Math.sin(eclipticLongitudeRad);
  return [x, y, z];
}

function isEclipsed(state: OrbitState) {
  if (!state.positionEciKm) {
    return false;
  }
  const sun = sunUnitVectorEciApprox(new Date(state.timeUtc));
  const r = state.positionEciKm;
  const projection = r[0] * sun[0] + r[1] * sun[1] + r[2] * sun[2];
  if (projection >= 0) {
    return false;
  }
  const radiusSquared = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
  const perpendicularDistanceKm = Math.sqrt(Math.max(0, radiusSquared - projection * projection));
  return perpendicularDistanceKm < 6378.137;
}

function markerFromState(type: MissionOrbitEventType, state: OrbitState, index: number): MissionOrbitEventMarker | null {
  if (!state.positionEciKm) {
    return null;
  }
  const radiusKm = vectorNorm(state.positionEciKm);
  const label = type.replaceAll("_", " ").toLowerCase();
  return {
    id: `${type}-${state.timeUtc}-${index}`,
    type,
    timeUtc: state.timeUtc,
    altitudeKm: state.altitudeKm,
    radiusKm,
    latitudeDeg: state.latitudeDeg,
    longitudeDeg: state.longitudeDeg,
    description: type === "ECLIPSE_ENTRY"
      ? "Spacecraft enters Earth shadow using a low-order Sun-vector estimate."
      : type === "ECLIPSE_EXIT"
        ? "Spacecraft exits Earth shadow using a low-order Sun-vector estimate."
        : `Detected ${label} from propagated trajectory geometry.`,
  };
}

export function detectOrbitEventMarkers(samples: OrbitState[] | undefined): MissionOrbitEventMarker[] {
  const states = (samples ?? [])
    .filter((state) => state.positionEciKm && Number.isFinite(new Date(state.timeUtc).getTime()))
    .toSorted((a, b) => new Date(a.timeUtc).getTime() - new Date(b.timeUtc).getTime());
  if (states.length < 3) {
    return [];
  }
  const markers: MissionOrbitEventMarker[] = [];
  const radii = states.map((state) => vectorNorm(state.positionEciKm!));
  for (let index = 1; index < states.length - 1; index += 1) {
    if (radii[index] < radii[index - 1] && radii[index] < radii[index + 1]) {
      const marker = markerFromState("PERIGEE_PASSAGE", states[index], index);
      if (marker) markers.push(marker);
    }
    if (radii[index] > radii[index - 1] && radii[index] > radii[index + 1]) {
      const marker = markerFromState("APOGEE_PASSAGE", states[index], index);
      if (marker) markers.push(marker);
    }
    const previousZ = states[index - 1].positionEciKm?.[2] ?? 0;
    const currentZ = states[index].positionEciKm?.[2] ?? 0;
    if (previousZ < 0 && currentZ >= 0) {
      const marker = markerFromState("ASCENDING_NODE", states[index], index);
      if (marker) markers.push(marker);
    }
    if (previousZ > 0 && currentZ <= 0) {
      const marker = markerFromState("DESCENDING_NODE", states[index], index);
      if (marker) markers.push(marker);
    }
    const previousEclipse = isEclipsed(states[index - 1]);
    const currentEclipse = isEclipsed(states[index]);
    if (!previousEclipse && currentEclipse) {
      const marker = markerFromState("ECLIPSE_ENTRY", states[index], index);
      if (marker) markers.push(marker);
    }
    if (previousEclipse && !currentEclipse) {
      const marker = markerFromState("ECLIPSE_EXIT", states[index], index);
      if (marker) markers.push(marker);
    }
  }
  return markers.toSorted((a, b) => new Date(a.timeUtc).getTime() - new Date(b.timeUtc).getTime());
}

function templateBreakdownLabel(templateType: string) {
  switch (templateType) {
    case "CIRCULARIZATION":
      return "Circularization";
    case "HOHMANN_TRANSFER":
      return "Hohmann";
    case "PLANE_CHANGE":
      return "Plane Change";
    case "APOGEE_RAISE":
      return "Apogee Raise";
    case "PERIGEE_RAISE":
      return "Perigee Raise";
    case "DEORBIT_BURN":
      return "Deorbit";
    case "STATION_KEEPING":
      return "Stationkeeping";
    default:
      return templateType ? templateType.replaceAll("_", " ") : "Manual Burns";
  }
}

export function deltaVBreakdown(events: BackendMissionTimelineEvent[]): DeltaVBreakdownItem[] {
  const totals = new Map<string, { label: string; deltaVMps: number; burnCount: number }>();
  events.filter((event) => event.enabled && (event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN")).forEach((event) => {
    const templateType = readStringParameter(event.parameters ?? {}, "templateType", "");
    const key = templateType || "MANUAL";
    const current = totals.get(key) ?? {
      label: templateType ? templateBreakdownLabel(templateType) : "Manual Burns",
      deltaVMps: 0,
      burnCount: 0,
    };
    current.deltaVMps += estimatedEventDeltaVMps(event);
    current.burnCount += 1;
    totals.set(key, current);
  });
  const total = [...totals.values()].reduce((sum, item) => sum + item.deltaVMps, 0);
  return [...totals.entries()].map(([key, item]) => ({
    key,
    label: item.label,
    deltaVMps: item.deltaVMps,
    burnCount: item.burnCount,
    percent: total > 0 ? (item.deltaVMps / total) * 100 : 0,
  })).toSorted((a, b) => b.deltaVMps - a.deltaVMps);
}

export function spacecraftPerformanceStatus(fuelBudget: MissionFuelBudget): SpacecraftPerformanceStatus {
  if (fuelBudget.remainingFuelKg == null || fuelBudget.fuelMarginPercent == null) {
    return "Unavailable";
  }
  if (fuelBudget.remainingFuelKg < 0 || fuelBudget.fuelMarginPercent < 5) {
    return "Critical";
  }
  if (fuelBudget.fuelMarginPercent < 15) {
    return "Caution";
  }
  return "Healthy";
}

export function maneuverQualityAnalysis(event: BackendMissionTimelineEvent): ManeuverQualityAnalysis {
  const parameters = event.parameters ?? {};
  const templateType = readStringParameter(parameters, "templateType", "");
  const role = readStringParameter(parameters, "templateRole", "");
  const executionStrategy = readStringParameter(parameters, "executionStrategy", "");
  const executionLocation = readStringParameter(parameters, "executionLocation", "");
  const directionFrame = readStringParameter(parameters, "directionFrame", "TNW");
  const deltaV = estimatedEventDeltaVMps(event);
  const location = executionLocation || (role.includes("BURN_2") ? "Target apsis" : role.includes("COAST") ? "Coast arc" : "Scheduled point");
  if (templateType === "HOHMANN_TRANSFER") {
    return {
      eventId: event.id,
      location: role === "BURN_2" ? "Transfer apoapsis/periapsis" : "Initial circular orbit tangent point",
      efficiency: "High",
      alignment: directionFrame === "TNW" ? "Tangential prograde/retrograde" : directionFrame,
      rationale: role === "BURN_2"
        ? "The second Hohmann impulse circularizes where the transfer ellipse touches the target orbit."
        : "Hohmann transfers use tangential impulses at apsides to change orbital energy efficiently.",
    };
  }
  if (templateType === "PLANE_CHANGE") {
    return {
      eventId: event.id,
      location: location || executionStrategy.replaceAll("_", " "),
      efficiency: executionStrategy === "APOAPSIS" ? "Improved on elliptical orbit" : executionStrategy.includes("NODE") ? "Geometrically correct" : "Time-prioritized",
      alignment: "Normal-axis impulse",
      rationale: executionStrategy.includes("NODE")
        ? "Inclination changes are performed at node crossings where the old and new orbital planes intersect."
        : executionStrategy === "APOAPSIS"
          ? "Apoapsis has lower velocity on elliptical orbits, reducing pure plane-change cost."
          : "Immediate execution prioritizes schedule over geometric optimality.",
    };
  }
  if (templateType === "CIRCULARIZATION") {
    return {
      eventId: event.id,
      location: "Current target-radius crossing",
      efficiency: "High when executed at apsis",
      alignment: directionFrame === "TNW" ? "Tangential" : directionFrame,
      rationale: "Circularization changes orbital energy at the selected radius until perigee and apogee converge.",
    };
  }
  if (templateType === "APOGEE_RAISE" || templateType === "PERIGEE_RAISE" || templateType === "DEORBIT_BURN") {
    return {
      eventId: event.id,
      location: templateType === "PERIGEE_RAISE" ? "Apoapsis" : "Current tangent point",
      efficiency: templateType === "DEORBIT_BURN" ? "Disposal-oriented" : "Apsis-targeted",
      alignment: deltaV > 0 ? "Tangential impulse" : "Tangential impulse",
      rationale: templateType === "PERIGEE_RAISE"
        ? "Raising perigee is most efficient at apoapsis because the burn changes the opposite apsis."
        : templateType === "APOGEE_RAISE"
          ? "Raising apogee is performed with a prograde tangential burn near the low point."
          : "Deorbit lowers perigee with a retrograde tangential burn to intersect a disposal/reentry altitude.",
    };
  }
  return {
    eventId: event.id,
    location,
    efficiency: "Unclassified",
    alignment: directionFrame,
    rationale: "Manual maneuver; verify geometry, frame, and timing against mission objectives.",
  };
}

export function buildMissionReport({
  mission,
  events,
  orbitSummary,
  profile,
  trajectoryOverlay,
  validation,
  targets,
  constraints,
  monteCarloSettings,
  relativeMotionSettings,
  groundStation,
  coverageSettings,
  constellation,
}: {
  mission: BackendMission | null;
  events: BackendMissionTimelineEvent[];
  orbitSummary: OrbitSummary;
  profile: BackendPropagationProfile | null;
  trajectoryOverlay: MissionTrajectoryOverlay | null;
  validation: MissionValidationResult;
  targets?: MissionDesignTargets;
  constraints?: MissionConstraints;
  monteCarloSettings?: MonteCarloSettings;
  relativeMotionSettings?: RelativeMotionSettings;
  groundStation?: GroundStationConfig;
  coverageSettings?: CoverageSettings;
  constellation?: WalkerConstellationConfig;
}) {
  const analytics = missionTimelineAnalytics(mission, events, profile);
  const markers = detectOrbitEventMarkers(trajectoryOverlay?.mission?.trajectory);
  const targeting = targets ? missionTargetingSolutions(orbitSummary, targets, profile) : [];
  const solver = targets ? solveTargetingProblem(orbitSummary, targets, profile) : null;
  const relativeMotion = relativeMotionSettings ? relativeMotionAnalysis(trajectoryOverlay, relativeMotionSettings) : null;
  const access = groundStation ? groundStationAccess(trajectoryOverlay, groundStation) : null;
  const coverage = coverageSettings ? coverageAnalysis(trajectoryOverlay, coverageSettings) : null;
  const constellationAnalysis = constellation ? walkerConstellationAnalysis(constellation) : null;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mission,
    orbit: orbitSummary,
    maneuverSequence: events.toSorted((a, b) => a.sequenceIndex - b.sequenceIndex).map((event) => ({
      id: event.id,
      name: event.name,
      type: event.type,
      enabled: event.enabled,
      executionTime: event.executionTime,
      deltaVMps: estimatedEventDeltaVMps(event),
      templateType: readStringParameter(event.parameters ?? {}, "templateType", ""),
      templateRole: readStringParameter(event.parameters ?? {}, "templateRole", ""),
      quality: event.type === "COAST" ? null : maneuverQualityAnalysis(event),
    })),
    deltaVBudget: {
      totalDeltaVMps: analytics.totalDeltaVMps,
      breakdown: deltaVBreakdown(events),
    },
    fuelBudget: analytics.fuelBudget,
    spacecraftPerformance: spacecraftPerformanceStatus(analytics.fuelBudget),
    timelineAnalytics: analytics,
    orbitEvents: markers,
    targeting: {
      targets: targets ?? null,
      solutions: targeting,
      solver,
      tradeStudy: tradeStudySolutions(targeting, analytics),
      optimization: solver ? optimizationCandidates(solver, analytics) : [],
    },
    operations: {
      relativeMotion,
      groundStationAccess: access,
      coverage,
      constellation: constellationAnalysis,
    },
    monteCarlo: monteCarloSettings ? monteCarloDispersion(analytics, monteCarloSettings) : null,
    constraints: {
      definition: constraints ?? null,
      findings: constraints ? missionConstraintViolations(events, analytics, orbitSummary, markers, constraints) : [],
    },
    objectives: targets ? missionObjectiveProgress(orbitSummary, targets) : [],
    lifetime: orbitLifetimeEstimate(orbitSummary),
    aerospaceReview: solver && relativeMotion && access && coverage && constellationAnalysis
      ? aerospaceReviewFindings({ events, orbitSummary, profile, solver, relativeMotion, stationAccess: access, coverage, constellation: constellationAnalysis })
      : [],
    capabilityMatrix: capabilityMatrix(),
    validation,
  };
}

export type MissionValidationResult = {
  errors: string[];
  warnings: string[];
};

export function validateMissionPlan(
  mission: BackendMission | null,
  events: BackendMissionTimelineEvent[],
  profile: BackendPropagationProfile | null,
): MissionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!mission) {
    return { errors, warnings };
  }
  if (events.length === 0) {
    warnings.push("Timeline is empty; trajectory will propagate the initial orbit without mission events.");
  }

  const resolved = resolveEventMetOffsets(mission, events);
  const missionDuration = missionDurationSeconds(mission);
  const ordered = events.toSorted((a, b) => (resolved.offsets.get(a.id) ?? Number.POSITIVE_INFINITY) - (resolved.offsets.get(b.id) ?? Number.POSITIVE_INFINITY));
  ordered.forEach((event, index) => {
    const offsetSeconds = resolved.offsets.get(event.id);
    if (offsetSeconds == null) {
      errors.push(`${event.name} has unresolved schedule metadata.`);
      return;
    }
    if (offsetSeconds < 0 || offsetSeconds > missionDuration) {
      errors.push(`${event.name} executes outside the mission window at ${metOffsetLabelFromSeconds(offsetSeconds)}.`);
    }
    if (event.type === "FINITE_BURN") {
      const durationSeconds = readNumberParameter(event.parameters ?? {}, "durationSeconds", 0);
      if (durationSeconds <= 0) {
        errors.push(`${event.name} has non-positive finite-burn duration.`);
      }
      const nextBurn = ordered.slice(index + 1).find((candidate) => candidate.type === "FINITE_BURN" || candidate.type === "IMPULSIVE_BURN");
      const nextOffset = nextBurn ? resolved.offsets.get(nextBurn.id) : null;
      if (nextOffset != null && offsetSeconds + durationSeconds > nextOffset) {
        errors.push(`${event.name} overlaps ${nextBurn?.name}; burn windows must not overlap.`);
      }
    }
    if (event.type === "COAST") {
      const nextOffset = ordered[index + 1] ? resolved.offsets.get(ordered[index + 1].id) : missionDuration;
      if (nextOffset != null && nextOffset < offsetSeconds) {
        errors.push(`${event.name} has negative coast duration because the next event occurs earlier.`);
      }
    }
    const templateType = readStringParameter(event.parameters ?? {}, "templateType", "");
    if (templateType === "PLANE_CHANGE") {
      const inclinationChange = Math.abs(readNumberParameter(event.parameters ?? {}, "inclinationChangeDeg", 0));
      if (inclinationChange > 30) {
        warnings.push(`${event.name} requests a ${inclinationChange.toFixed(1)} deg plane change; verify combined or split maneuvers because pure plane changes are expensive.`);
      }
    }
    if (templateType === "CIRCULARIZATION" && estimatedEventDeltaVMps(event) < 0.1) {
      warnings.push(`${event.name} has near-zero circularization dV; current orbit may already be circular.`);
    }
    if (templateType === "HOHMANN_TRANSFER" && estimatedEventDeltaVMps(event) < 0.1) {
      warnings.push(`${event.name} has near-zero Hohmann dV; verify target altitude differs from the current orbit.`);
    }
  });

  const totalPropellantKg = events.reduce((sum, event) => {
    if (profile && event.type !== "COAST") {
      return sum + estimatePropellantKg(estimatedEventDeltaVMps(event), profile.dryMassKg + profile.fuelMassKg, profile.nominalIspS);
    }
    const metadataPropellant = readNumberParameter(event.parameters ?? {}, "estimatedPropellantKg", Number.NaN);
    if (Number.isFinite(metadataPropellant)) {
      return sum + metadataPropellant;
    }
    return sum;
  }, 0);
  if (profile && totalPropellantKg > profile.fuelMassKg) {
    errors.push(`Estimated propellant ${totalPropellantKg.toFixed(2)} kg exceeds available fuel ${profile.fuelMassKg.toFixed(2)} kg.`);
  } else if (profile && totalPropellantKg > profile.fuelMassKg * 0.8) {
    warnings.push(`Estimated propellant ${totalPropellantKg.toFixed(2)} kg uses more than 80% of available fuel.`);
  }

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set([...resolved.warnings, ...warnings])],
  };
}

export function estimatedEventDeltaVMps(event: BackendMissionTimelineEvent) {
  const parameters = event.parameters ?? {};
  if (event.type === "IMPULSIVE_BURN") {
    const x = readNumberParameter(parameters, "deltaVxMps", 0);
    const y = readNumberParameter(parameters, "deltaVyMps", 0);
    const z = readNumberParameter(parameters, "deltaVzMps", 0);
    return Math.sqrt(x * x + y * y + z * z);
  }
  if (event.type === "FINITE_BURN") {
    const thrust = readNumberParameter(parameters, "thrustNewton", 0);
    const duration = readNumberParameter(parameters, "durationSeconds", 0);
    return thrust > 0 && duration > 0 ? thrust * duration / 1000 : 0;
  }
  return 0;
}

export function estimatePropellantKg(deltaVMps: number, wetMassKg: number, ispSeconds: number) {
  if (!Number.isFinite(deltaVMps) || deltaVMps <= 0 || !Number.isFinite(wetMassKg) || wetMassKg <= 0 || !Number.isFinite(ispSeconds) || ispSeconds <= 0) {
    return 0;
  }
  const exhaustVelocity = ispSeconds * 9.80665;
  return wetMassKg * (1 - Math.exp(-deltaVMps / exhaustVelocity));
}

export function forceModelSummary(profile: BackendPropagationProfile | null) {
  if (!profile) {
    return "Profile not loaded";
  }
  if (profile.propagatorType === "KEPLERIAN") {
    return "Not applicable for Keplerian analytical propagation";
  }
  if (profile.propagatorType === "TLE_SGP4") {
    return "Embedded in SGP4";
  }
  return [
    profile.gravityEnabled ? `Gravity ${profile.gravityDegree}x${profile.gravityOrder}` : "Gravity OFF",
    profile.dragEnabled ? "Drag ON" : "Drag OFF",
    profile.solarRadiationPressureEnabled ? "SRP ON" : "SRP OFF",
    profile.thirdBodySunEnabled ? "Sun ON" : "Sun OFF",
    profile.thirdBodyMoonEnabled ? "Moon ON" : "Moon OFF",
    profile.maneuverModelEnabled ? "Maneuver ON" : "Maneuver OFF",
    "Relativity OFF",
    "Solid Tides OFF",
    "Ocean Tides OFF",
  ].join(" · ");
}

function integratorLabel(capabilities: BackendCapabilityRegistry, id: NumericalIntegratorTypeId) {
  return capabilities.integrators.find((item) => item.id === id)?.label ?? id.replaceAll("_", " ");
}

export function integratorSummary(profile: BackendPropagationProfile | null, capabilities: BackendCapabilityRegistry) {
  if (!profile) {
    return "Profile not loaded";
  }
  if (profile.propagatorType !== "NUMERICAL") {
    return "Not applicable";
  }
  return `${integratorLabel(capabilities, profile.integratorType)} · min ${profile.integratorMinStep}s · max ${profile.integratorMaxStep}s · abs ${profile.integratorAbsTol} · rel ${profile.integratorRelTol}`;
}

function timelineVisibleSeconds(interaction: TimelineInteractionModel, mission: BackendMission | null) {
  const option = timelineZoomOptions.find((item) => item.id === interaction.zoomPreset);
  const fallback = mission ? missionDurationSeconds(mission) : 3 * 60 * 60;
  return Math.max(60, option?.seconds ?? (interaction.customVisibleSeconds || fallback));
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
    const minWidthPercent = event.type === "IMPULSIVE_BURN" ? 2.5 : 18;
    const widthPercent = Math.min(100, Math.max(minWidthPercent, (durationSeconds / missionSeconds) * 100));
    const startPercent = Math.min(100, Math.max(0, (offsetSeconds / missionSeconds) * 100));
    return { event, offsetSeconds, durationSeconds, widthPercent, startPercent };
  });
}

export function buildTimelineLayoutModel(
  mission: BackendMission,
  events: BackendMissionTimelineEvent[],
  interaction: TimelineInteractionModel,
  selectedEventId: string | null,
  simulationTimeIso: string,
) {
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

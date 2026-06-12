import type {
  BackendCapabilityRegistry,
  BackendMission,
  BackendMissionTimelineEvent,
  BackendPropagationProfile,
  NumericalIntegratorTypeId,
} from "@/services/orbitServerApi";
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

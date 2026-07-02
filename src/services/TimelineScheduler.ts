import type { BackendMission, BackendMissionTimelineEvent } from "@/services/orbitServerApi";

export type TimelineScheduleMode = "UTC" | "MET" | "AFTER_EVENT";

export function readNumberParameter(parameters: Record<string, unknown>, key: string, fallback: number) {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readStringParameter(parameters: Record<string, unknown>, key: string, fallback: string) {
  const value = parameters[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function metOffsetLabelFromSeconds(totalSeconds: number) {
  const sign = totalSeconds < 0 ? "T-" : "T+";
  const absolute = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function missionDurationSeconds(mission: BackendMission) {
  return Math.max(0, Math.round((new Date(mission.scenarioEnd).getTime() - new Date(mission.scenarioStart).getTime()) / 1000));
}

export function eventScheduleMode(event: BackendMissionTimelineEvent): TimelineScheduleMode {
  const mode = readStringParameter(event.parameters ?? {}, "scheduleMode", "MET");
  return mode === "UTC" || mode === "MET" || mode === "AFTER_EVENT" ? mode : "MET";
}

export function eventMetOffsetSeconds(mission: BackendMission | null, event: BackendMissionTimelineEvent) {
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

export function eventWindowError(mission: BackendMission | null, executionIso: string) {
  if (!mission) {
    return null;
  }
  const execution = new Date(executionIso);
  const start = new Date(mission.scenarioStart);
  const end = new Date(mission.scenarioEnd);
  return execution >= start && execution <= end ? null : "Event is outside the mission window.";
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

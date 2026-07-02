import type { ConjunctionEvent, ConjunctionSnapshot } from "@/domain/conjunction";
import { getConjunctionStatus } from "@/domain/conjunction";
import type { GroundStation, GroundStationDisplayOptions } from "@/domain/groundOperations";
import type { ManeuverEvent, ManeuverSnapshot } from "@/domain/maneuver";
import type { OrbitState, SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import type { GroundStationVisualizationModel } from "@/domain/visualization";
import { distanceBetweenOrbitStatesKm } from "@/geometry/distance";
import type { PropagationDataSource, PropagationEngine } from "@/services/PropagationEngine";
import { propagationEventStateKey } from "@/services/PropagationEngine";
import { GroundStationVisualizationService } from "@/services/GroundStationVisualizationService";
import {
  applyAnalysisPreset,
  fetchAnalysisConfig,
  fetchConjunctions,
  fetchManeuvers,
  setAnalysisMode,
  type AnalysisPresetId,
  type BackendAnalysisConfigResponse,
  type BackendConjunctionRecord,
  type BackendManeuverEvent,
  type BackendMission,
  type BackendMissionTimelineEvent,
} from "@/services/orbitServerApi";
import {
  eventScheduleMode,
  eventWindowError,
  metOffsetLabelFromSeconds,
  missionDurationSeconds,
  readStringParameter,
  resolveEventMetOffsets,
} from "@/services/TimelineScheduler";

export type AnalysisStatus = "idle" | "running" | "ready" | "cancelled" | "error";

export type MissionSummaryAnalysis = {
  missionDuration: number;
  eventCount: number;
  burnCount: number;
  finiteBurnCount: number;
  impulsiveBurnCount: number;
  coastCount: number;
  dependencyCount: number;
  warnings: string[];
};

export type AnalysisResult = {
  status: AnalysisStatus;
  maneuverSnapshots: ManeuverSnapshot[];
  conjunctionSnapshots: ConjunctionSnapshot[];
  groundStationVisualization: GroundStationVisualizationModel;
  missionSummary: MissionSummaryAnalysis;
  analysisConfig: BackendAnalysisConfigResponse | null;
  analysisMessage: string | null;
  maneuverEvents: ManeuverEvent[];
  conjunctionEvents: ConjunctionEvent[];
  dynamicMessage: string | null;
};

export type DeriveAnalysisRequest = {
  type: "derive";
  activeDataSource: PropagationDataSource;
  satellites: SatelliteObject[];
  simTime: Date;
  maneuverEvents: ManeuverEvent[];
  selectedManeuverId: string | null;
  conjunctionEvents: ConjunctionEvent[];
  selectedConjunctionId: string | null;
  propagationEngine: PropagationEngine;
  serverEventStateByKey: Map<string, OrbitState>;
  groundStations: GroundStation[];
  groundStationDisplay: GroundStationDisplayOptions;
  groundOperationsTargetSnapshot: SatelliteSnapshot | null;
  mission: BackendMission | null;
  missionTimelineEvents: BackendMissionTimelineEvent[];
};

export type LoadAnalysisConfigRequest = {
  type: "load-analysis-config";
  selectedNoradId: string | null;
  canUseAnalysisConfig: boolean;
};

export type UpdateAnalysisConfigRequest = {
  type: "update-analysis-config";
  selectedNoradId: string | null;
  canUseAnalysisConfig: boolean;
  action: "preset" | "mode";
  preset?: AnalysisPresetId;
  mode?: string;
  enabled?: boolean;
};

export type LoadManeuversRequest = {
  type: "load-maneuvers";
  loadedNoradIds: string[];
};

export type LoadConjunctionsRequest = {
  type: "load-conjunctions";
  loadedNoradIds: string[];
};

export type AnalysisRequest =
  | DeriveAnalysisRequest
  | LoadAnalysisConfigRequest
  | UpdateAnalysisConfigRequest
  | LoadManeuversRequest
  | LoadConjunctionsRequest;

const emptyGroundStationVisualization: GroundStationVisualizationModel = {
  markers: [],
  satelliteFootprint: null,
  stationAccessRegions: [],
  contactLines: [],
};

const emptyMissionSummary: MissionSummaryAnalysis = {
  missionDuration: 0,
  eventCount: 0,
  burnCount: 0,
  finiteBurnCount: 0,
  impulsiveBurnCount: 0,
  coastCount: 0,
  dependencyCount: 0,
  warnings: [],
};

const initialResult: AnalysisResult = {
  status: "idle",
  maneuverSnapshots: [],
  conjunctionSnapshots: [],
  groundStationVisualization: emptyGroundStationVisualization,
  missionSummary: emptyMissionSummary,
  analysisConfig: null,
  analysisMessage: null,
  maneuverEvents: [],
  conjunctionEvents: [],
  dynamicMessage: null,
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function isServerDrivenSource(source: PropagationDataSource) {
  return source === "backend" || source === "manual";
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

function getConjunctionStatusFromRisk(event: ConjunctionEvent, missDistanceKm: number) {
  if (event.risk === "CRITICAL") {
    return "critical" as const;
  }
  if (event.risk === "WARNING" || event.risk === "WATCH") {
    return "warning" as const;
  }
  return getConjunctionStatus(missDistanceKm, event.warningDistanceKm, event.criticalDistanceKm);
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

function normalizeBackendManeuvers(raw: BackendManeuverEvent[]): ManeuverEvent[] {
  return raw.map((event) => {
    const metadata = event.metadata ?? {};
    const metadataVector = metadata.deltaVVector;
    const vector = event.vector ?? (isNumberRecord(metadataVector) ? metadataVector : {});
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

function isNumberRecord(value: unknown): value is Record<string, number> {
  return typeof value === "object" && value !== null && Object.values(value).every((item) => typeof item === "number");
}

function derivedAnalysisSignature(result: AnalysisResult) {
  return JSON.stringify({
    maneuvers: result.maneuverSnapshots.map((snapshot) => ({
      id: snapshot.event.id,
      stateTime: snapshot.state?.timeUtc ?? null,
      preCount: snapshot.preTrajectory.length,
      postCount: snapshot.postTrajectory.length,
    })),
    conjunctions: result.conjunctionSnapshots.map((snapshot) => ({
      id: snapshot.event.id,
      status: snapshot.status,
      primaryTime: snapshot.primaryState?.timeUtc ?? null,
      secondaryTime: snapshot.secondaryState?.timeUtc ?? null,
      missDistanceKm: snapshot.missDistanceKm,
    })),
    groundStations: {
      markers: result.groundStationVisualization.markers.map((marker) => [marker.station.id, marker.isVisible]),
      footprint: result.groundStationVisualization.satelliteFootprint,
      regions: result.groundStationVisualization.stationAccessRegions.map((region) => [
        region.id,
        region.radiusMeters,
        region.isVisible,
      ]),
      contactLines: result.groundStationVisualization.contactLines.map((line) => [
        line.id,
        line.satelliteState.timeUtc,
      ]),
    },
    missionSummary: result.missionSummary,
  });
}

function missionSummaryAnalysis(mission: BackendMission | null, events: BackendMissionTimelineEvent[]): MissionSummaryAnalysis {
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
    burnCount: events.filter((event) => event.type === "FINITE_BURN" || event.type === "IMPULSIVE_BURN").length,
    finiteBurnCount: events.filter((event) => event.type === "FINITE_BURN").length,
    impulsiveBurnCount: events.filter((event) => event.type === "IMPULSIVE_BURN").length,
    coastCount: events.filter((event) => event.type === "COAST").length,
    dependencyCount: events.filter((event) => eventScheduleMode(event) === "AFTER_EVENT").length,
    warnings,
  };
}

export class AnalysisEngine {
  private result: AnalysisResult = initialResult;
  private status: AnalysisStatus = "idle";
  private readonly listeners = new Set<() => void>();
  private readonly groundStationVisualizationService = new GroundStationVisualizationService();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getResult() {
    return this.result;
  }

  getStatus() {
    return this.status;
  }

  cancelAnalysis() {
    this.status = "cancelled";
    this.result = {
      ...this.result,
      status: this.status,
    };
    this.notify();
  }

  async runAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
    if (this.status === "cancelled") {
      return this.result;
    }

    if (request.type === "derive") {
      const nextResult = this.deriveAnalysis(request);
      if (derivedAnalysisSignature(nextResult) === derivedAnalysisSignature(this.result)) {
        return this.result;
      }
      this.result = nextResult;
      this.status = this.result.status;
      this.notify();
      return this.result;
    }

    this.status = "running";
    this.result = {
      ...this.result,
      status: this.status,
    };
    this.notify();

    try {
      switch (request.type) {
        case "load-analysis-config":
          this.result = await this.loadAnalysisConfig(request);
          break;
        case "update-analysis-config":
          this.result = await this.updateAnalysisConfig(request);
          break;
        case "load-maneuvers":
          this.result = await this.loadManeuverEvents(request);
          break;
        case "load-conjunctions":
          this.result = await this.loadConjunctionEvents(request);
          break;
      }
      this.status = this.result.status;
    } catch (error) {
      this.status = "error";
      this.result = {
        ...this.result,
        status: this.status,
        dynamicMessage: error instanceof Error ? error.message : "Analysis failed.",
      };
    }

    this.notify();
    return this.result;
  }

  private deriveAnalysis(request: DeriveAnalysisRequest): AnalysisResult {
    const maneuverSnapshots = this.buildManeuverSnapshots(request);
    const conjunctionSnapshots = this.buildConjunctionSnapshots(request);
    const groundStationVisualization = this.groundStationVisualizationService.buildModel(
      request.groundStations,
      request.groundStationDisplay,
      request.groundOperationsTargetSnapshot,
    );
    const missionSummary = missionSummaryAnalysis(request.mission, request.missionTimelineEvents);

    return {
      ...this.result,
      status: "ready",
      maneuverSnapshots,
      conjunctionSnapshots,
      groundStationVisualization,
      missionSummary,
    };
  }

  private buildManeuverSnapshots(request: DeriveAnalysisRequest): ManeuverSnapshot[] {
    return request.maneuverEvents.flatMap((event) => {
      const satellite = request.satellites.find((item) => item.id === event.satelliteId || item.noradId === event.satelliteId);
      if (!satellite) {
        return [];
      }
      const eventTime = new Date(event.timeUtc);
      const serverEventState = request.serverEventStateByKey.get(propagationEventStateKey(satellite.id, event.timeUtc)) ?? null;

      return [{
        event,
        satellite,
        state: isServerDrivenSource(request.activeDataSource)
          ? serverEventState
          : request.propagationEngine.getState(satellite.id, event.timeUtc),
        preTrajectory: isServerDrivenSource(request.activeDataSource)
          ? []
          : request.propagationEngine.getTrajectory(
              satellite.id,
              addMinutes(eventTime, -45).toISOString(),
              event.timeUtc,
              90,
            ),
        postTrajectory: isServerDrivenSource(request.activeDataSource)
          ? []
          : request.propagationEngine.getTrajectory(
              satellite.id,
              event.timeUtc,
              addMinutes(eventTime, 45).toISOString(),
              90,
            ),
        minutesFromSimulationTime: (new Date(event.timeUtc).getTime() - request.simTime.getTime()) / 60000,
      }];
    });
  }

  private buildConjunctionSnapshots(request: DeriveAnalysisRequest): ConjunctionSnapshot[] {
    return request.conjunctionEvents.flatMap((event): ConjunctionSnapshot[] => {
      const primary = request.satellites.find((item) => item.id === event.primarySatelliteId || item.noradId === event.primarySatelliteId);
      const secondary = request.satellites.find((item) => item.id === event.secondarySatelliteId || item.noradId === event.secondarySatelliteId);

      if (!primary || !secondary) {
        return [];
      }

      if (event.tcaUtc && event.missDistanceKm !== undefined) {
        const primaryState = isServerDrivenSource(request.activeDataSource)
          ? request.serverEventStateByKey.get(propagationEventStateKey(primary.id, event.tcaUtc)) ?? null
          : request.propagationEngine.getState(primary.id, event.tcaUtc);
        const secondaryState = isServerDrivenSource(request.activeDataSource)
          ? request.serverEventStateByKey.get(propagationEventStateKey(secondary.id, event.tcaUtc)) ?? null
          : request.propagationEngine.getState(secondary.id, event.tcaUtc);
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

      for (let timeMs = startMs; timeMs <= endMs; timeMs += 120 * 1000) {
        if (isServerDrivenSource(request.activeDataSource)) {
          break;
        }
        const timeUtc = new Date(timeMs).toISOString();
        const primaryState = request.propagationEngine.getState(primary.id, timeUtc);
        const secondaryState = request.propagationEngine.getState(secondary.id, timeUtc);
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
  }

  private async loadAnalysisConfig(request: LoadAnalysisConfigRequest): Promise<AnalysisResult> {
    if (!request.selectedNoradId || !request.canUseAnalysisConfig) {
      return {
        ...this.result,
        status: "ready",
        analysisConfig: null,
        analysisMessage: null,
      };
    }

    try {
      const analysisConfig = await fetchAnalysisConfig(request.selectedNoradId);
      return {
        ...this.result,
        status: "ready",
        analysisConfig,
        analysisMessage: null,
      };
    } catch (error) {
      return {
        ...this.result,
        status: "error",
        analysisConfig: null,
        analysisMessage: error instanceof Error ? error.message : "Unable to load analysis configuration.",
      };
    }
  }

  private async updateAnalysisConfig(request: UpdateAnalysisConfigRequest): Promise<AnalysisResult> {
    if (!request.selectedNoradId || !request.canUseAnalysisConfig) {
      return {
        ...this.result,
        status: "ready",
        analysisMessage: "Analysis config is available for backend catalog orbits only.",
      };
    }

    try {
      const analysisConfig = request.action === "preset" && request.preset
        ? await applyAnalysisPreset(request.selectedNoradId, request.preset)
        : await setAnalysisMode(request.selectedNoradId, request.mode ?? "", Boolean(request.enabled));
      const analysisMessage = request.action === "preset" && request.preset
        ? `Applied ${request.preset.replaceAll("_", " ").toLowerCase()} preset.`
        : `${(request.mode ?? "").toUpperCase()} ${request.enabled ? "enabled" : "disabled"}.`;
      return {
        ...this.result,
        status: "ready",
        analysisConfig,
        analysisMessage,
      };
    } catch (error) {
      return {
        ...this.result,
        status: "error",
        analysisMessage: error instanceof Error ? error.message : "Unable to update analysis configuration.",
      };
    }
  }

  private async loadManeuverEvents(request: LoadManeuversRequest): Promise<AnalysisResult> {
    try {
      if (request.loadedNoradIds.length === 0) {
        return {
          ...this.result,
          status: "ready",
          maneuverEvents: [],
          dynamicMessage: null,
        };
      }

      const loadedIdSet = new Set(request.loadedNoradIds);
      const maneuverEvents = normalizeBackendManeuvers(await fetchManeuvers())
        .filter((event) => loadedIdSet.has(event.satelliteId));
      return {
        ...this.result,
        status: "ready",
        maneuverEvents,
        dynamicMessage: null,
      };
    } catch (error) {
      return {
        ...this.result,
        status: "error",
        maneuverEvents: [],
        dynamicMessage: error instanceof Error ? error.message : "Unable to load maneuvers from the backend.",
      };
    }
  }

  private async loadConjunctionEvents(request: LoadConjunctionsRequest): Promise<AnalysisResult> {
    try {
      if (request.loadedNoradIds.length === 0) {
        return {
          ...this.result,
          status: "ready",
          conjunctionEvents: [],
          dynamicMessage: null,
        };
      }

      const response = await fetchConjunctions(request.loadedNoradIds);
      return {
        ...this.result,
        status: "ready",
        conjunctionEvents: normalizeBackendConjunctions(response.conjunctions),
        dynamicMessage: null,
      };
    } catch (error) {
      return {
        ...this.result,
        status: "error",
        conjunctionEvents: [],
        dynamicMessage: error instanceof Error ? error.message : "Unable to load conjunctions from the backend.",
      };
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }
}

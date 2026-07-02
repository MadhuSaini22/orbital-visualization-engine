import type { OrbitState, SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import { SatelliteJsPropagator } from "@/propagation/SatelliteJsPropagator";
import type { Propagator } from "@/propagation/PropagatorInterface";
import { backendEphemerisStateToOrbitState, interpolateOrbitStateSamples } from "@/services/FrameTransformService";
import {
  fetchCurrentOrbitState,
  fetchManualOrbitState,
  fetchManualOrbitTrajectory,
  fetchOrbitTrajectory,
} from "@/services/orbitServerApi";
import { StateCacheService } from "@/services/StateCacheService";

export type PropagationDataSource = "sample" | "endpoint" | "backend" | "manual";

export type PropagationStatus =
  | "idle"
  | "propagating"
  | "ready"
  | "loading-backend"
  | "cancelled"
  | "error";

export type PropagationWindowOptions = {
  futureMinutes: number;
  pastMinutes: number;
  stepSec: number;
};

export type GroundTrackPropagationOptions = {
  pastMinutes: number;
  stepSec: number;
};

export type PropagationRequest = {
  source: PropagationDataSource;
  satellites: SatelliteObject[];
  simTimeUtc: string;
  trajectoryAnchorUtc: string;
  trajectoryWindow: PropagationWindowOptions;
  displayOrbitSnapshots?: SatelliteSnapshot[];
  groundTrackAnchorUtc: string;
  groundTrackWindow: GroundTrackPropagationOptions;
};

export type PropagationResult = {
  status: PropagationStatus;
  orbitSnapshots: SatelliteSnapshot[];
  currentSnapshots: SatelliteSnapshot[];
  groundTrackSnapshots: SatelliteSnapshot[];
  eventStatesByKey: Map<string, OrbitState>;
};

export type BackendTrajectorySnapshotRequest = {
  source: PropagationDataSource;
  manualOrbitId?: string | null;
  satellites: SatelliteObject[];
  startUtc: string;
  endUtc: string;
  centerUtc: string;
  stepSec: number;
  signal?: AbortSignal;
};

export type BackendEventStateRequest = {
  satellite: SatelliteObject;
  timeUtc: string;
};

export type BackendEventStateResult = {
  status: PropagationStatus;
  statesByKey: Map<string, OrbitState>;
  failed: boolean;
};

export type BackendSnapshotResult = {
  status: PropagationStatus;
  snapshots: SatelliteSnapshot[];
  failed: boolean;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function isServerDrivenSource(source: PropagationDataSource) {
  return source === "backend" || source === "manual";
}

function backendTrajectoryErrorMessage(kind: "trajectory" | "ground-track") {
  return kind === "trajectory"
    ? "Unable to load backend trajectory."
    : "Unable to load backend ground track.";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function propagationEventStateKey(satelliteId: string, timeUtc: string) {
  return `${satelliteId}@${timeUtc}`;
}

export class PropagationEngine {
  private propagator: Propagator;
  private stateCache: StateCacheService;
  private status: PropagationStatus = "idle";
  private serverOrbitSnapshots: SatelliteSnapshot[] | null = null;
  private serverGroundTrackSnapshots: SatelliteSnapshot[] | null = null;
  private serverStateBySatelliteId = new Map<string, OrbitState>();
  private serverEventStateByKey = new Map<string, OrbitState>();
  private readonly listeners = new Set<() => void>();

  constructor(private satellites: SatelliteObject[] = []) {
    this.propagator = new SatelliteJsPropagator(satellites);
    this.stateCache = new StateCacheService(this.propagator, satellites);
  }

  setSatellites(satellites: SatelliteObject[]) {
    this.satellites = satellites;
    this.propagator = new SatelliteJsPropagator(satellites);
    this.stateCache = new StateCacheService(this.propagator, satellites);
    this.notify();
  }

  propagate(request: PropagationRequest): PropagationResult {
    if (this.status === "cancelled") {
      return {
        status: this.status,
        orbitSnapshots: [],
        currentSnapshots: [],
        groundTrackSnapshots: [],
        eventStatesByKey: this.serverEventStateByKey,
      };
    }

    this.status = "propagating";
    const orbitSnapshots = this.orbitSnapshots(request);
    const displayOrbitSnapshots = request.displayOrbitSnapshots ?? orbitSnapshots;
    const currentSnapshots = this.currentSnapshots(request, displayOrbitSnapshots);
    const groundTrackSnapshots = this.groundTrackSnapshots(request);
    this.status = "ready";

    return {
      status: this.status,
      orbitSnapshots,
      currentSnapshots,
      groundTrackSnapshots,
      eventStatesByKey: this.serverEventStateByKey,
    };
  }

  refresh() {
    this.status = "idle";
    this.notify();
  }

  cancel() {
    this.status = "cancelled";
    this.notify();
  }

  getStatus() {
    return this.status;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  replaceServerOrbitSnapshots(snapshots: SatelliteSnapshot[] | null) {
    this.serverOrbitSnapshots = snapshots;
    this.notify();
  }

  replaceServerGroundTrackSnapshots(snapshots: SatelliteSnapshot[] | null) {
    this.serverGroundTrackSnapshots = snapshots;
    this.notify();
  }

  clearServerCurrentStates() {
    this.serverStateBySatelliteId = new Map();
    this.notify();
  }

  clearServerEventStates() {
    this.serverEventStateByKey = new Map();
    this.notify();
  }

  getState(satelliteId: string, timeUtc: string) {
    return this.propagator.getState(satelliteId, timeUtc);
  }

  getTrajectory(satelliteId: string, startUtc: string, endUtc: string, stepSec: number) {
    return this.propagator.getTrajectory(satelliteId, startUtc, endUtc, stepSec);
  }

  interpolateState(satelliteId: string, samples: OrbitState[] | undefined, timeUtc: string) {
    return interpolateOrbitStateSamples(satelliteId, samples, timeUtc);
  }

  async loadCurrentBackendState(
    source: PropagationDataSource,
    satellite: SatelliteObject,
    timeUtc: string,
    options: { manualOrbitId?: string | null; signal?: AbortSignal } = {},
  ) {
    this.status = "loading-backend";
    const backendState = source === "manual" && options.manualOrbitId
      ? await fetchManualOrbitState(options.manualOrbitId, timeUtc, { signal: options.signal })
      : await fetchCurrentOrbitState(satellite.noradId ?? satellite.id, timeUtc, { signal: options.signal });
    this.status = "ready";
    const state = backendEphemerisStateToOrbitState(satellite.id, backendState);
    this.serverStateBySatelliteId = new Map([[satellite.id, state]]);
    this.notify();
    return state;
  }

  async loadServerTrajectorySnapshots(request: BackendTrajectorySnapshotRequest): Promise<BackendSnapshotResult> {
    const result = await this.loadServerSnapshots(request, "trajectory");
    this.serverOrbitSnapshots = result.snapshots;
    this.notify();
    return result;
  }

  async loadServerGroundTrackSnapshots(request: BackendTrajectorySnapshotRequest): Promise<BackendSnapshotResult> {
    const result = await this.loadServerSnapshots(request, "ground-track");
    this.serverGroundTrackSnapshots = result.snapshots;
    this.notify();
    return result;
  }

  async loadServerEventStates(
    source: PropagationDataSource,
    requests: BackendEventStateRequest[],
    options: { manualOrbitId?: string | null; signal?: AbortSignal } = {},
  ): Promise<BackendEventStateResult> {
    this.status = "loading-backend";
    const pairs: Array<[string, OrbitState] | null> = [];
    const uniqueRequests = [...new Map(requests.map((request) => [
      propagationEventStateKey(request.satellite.id, request.timeUtc),
      request,
    ])).values()];

    for (const request of uniqueRequests) {
      try {
        const backendState = source === "manual" && options.manualOrbitId
          ? await fetchManualOrbitState(options.manualOrbitId, request.timeUtc, { signal: options.signal })
          : await fetchCurrentOrbitState(request.satellite.noradId ?? request.satellite.id, request.timeUtc, { signal: options.signal });
        pairs.push([
          propagationEventStateKey(request.satellite.id, request.timeUtc),
          backendEphemerisStateToOrbitState(request.satellite.id, backendState),
        ]);
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        pairs.push(null);
        this.status = "error";
        break;
      }
    }

    const statesByKey = new Map(pairs.filter((pair): pair is [string, OrbitState] => pair !== null));
    if (this.status !== "error") {
      this.status = "ready";
    }
    this.serverEventStateByKey = statesByKey;
    this.notify();
    return {
      status: this.status,
      statesByKey,
      failed: this.status === "error" || (uniqueRequests.length > 0 && statesByKey.size === 0),
    };
  }

  private orbitSnapshots(request: PropagationRequest) {
    if (isServerDrivenSource(request.source) && this.serverOrbitSnapshots) {
      return this.serverOrbitSnapshots;
    }

    return this.stateCache.getWindowedSnapshots(request.trajectoryAnchorUtc, request.trajectoryWindow);
  }

  private currentSnapshots(request: PropagationRequest, displayOrbitSnapshots: SatelliteSnapshot[]) {
    const ephemerisBySatelliteId = new Map(displayOrbitSnapshots.map((snapshot) => [
      snapshot.satellite.id,
      snapshot.trajectory ?? [],
    ]));

    return request.satellites.map((satellite) => {
      const ephemerisState = interpolateOrbitStateSamples(
        satellite.id,
        ephemerisBySatelliteId.get(satellite.id),
        request.simTimeUtc,
      );
      if (ephemerisState) {
        return {
          satellite,
          state: ephemerisState,
          error: undefined,
        };
      }

      const fallbackState = isServerDrivenSource(request.source)
        ? this.serverStateBySatelliteId.get(satellite.id) ?? null
        : this.propagator.getState(satellite.id, request.simTimeUtc);

      return {
        satellite,
        state: fallbackState,
        error: fallbackState ? undefined : "Waiting for ephemeris samples.",
      };
    });
  }

  private groundTrackSnapshots(request: PropagationRequest) {
    if (isServerDrivenSource(request.source) && this.serverGroundTrackSnapshots) {
      return this.serverGroundTrackSnapshots;
    }

    return this.stateCache.getGroundTrackSnapshots(request.groundTrackAnchorUtc, request.groundTrackWindow);
  }

  private async loadServerSnapshots(
    request: BackendTrajectorySnapshotRequest,
    kind: "trajectory" | "ground-track",
  ): Promise<BackendSnapshotResult> {
    this.status = "loading-backend";
    const centerTime = new Date(request.centerUtc);
    const snapshots: SatelliteSnapshot[] = [];

    for (const satellite of request.satellites) {
      try {
        const response = request.source === "manual" && request.manualOrbitId
          ? await fetchManualOrbitTrajectory(
              request.manualOrbitId,
              request.startUtc,
              request.endUtc,
              request.stepSec,
              { signal: request.signal },
            )
          : await fetchOrbitTrajectory(
              satellite.noradId ?? satellite.id,
              request.startUtc,
              request.endUtc,
              request.stepSec,
              { signal: request.signal },
            );
        const states = response.states.map((state) => backendEphemerisStateToOrbitState(satellite.id, state));

        snapshots.push(kind === "trajectory"
          ? {
              satellite,
              state: null,
              trajectory: states,
              futureTrajectory: states.filter((state) => new Date(state.timeUtc) >= centerTime),
              pastTrail: states.filter((state) => new Date(state.timeUtc) <= centerTime),
              groundTrack: states,
            }
          : {
              satellite,
              state: null,
              groundTrack: states,
            });
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        this.status = "error";
        snapshots.push({
          satellite,
          state: null,
          error: error instanceof Error ? error.message : backendTrajectoryErrorMessage(kind),
        });
        return {
          status: this.status,
          snapshots,
          failed: true,
        };
      }
    }

    this.status = "ready";
    return {
      status: this.status,
      snapshots,
      failed: request.satellites.length > 0 && snapshots.every((snapshot) => snapshot.error),
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  static isServerDrivenSource(source: PropagationDataSource) {
    return isServerDrivenSource(source);
  }

  static addMinutes(date: Date, minutes: number) {
    return addMinutes(date, minutes);
  }
}

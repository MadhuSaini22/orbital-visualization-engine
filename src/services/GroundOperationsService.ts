import type { GroundOperationsAnalysis, GroundStation, StationVisibilitySummary } from "@/domain/groundOperations";
import type { OrbitState, SatelliteSnapshot } from "@/domain/orbit";
import { AccessWindowService } from "@/services/AccessWindowService";
import { PassPredictionService } from "@/services/PassPredictionService";
import { VisibilityService } from "@/services/VisibilityService";

function stateTimeMs(state: OrbitState) {
  return new Date(state.timeUtc).getTime();
}

function uniqueStates(states: OrbitState[]) {
  const byTime = new Map<string, OrbitState>();
  states.forEach((state) => byTime.set(state.timeUtc, state));
  return [...byTime.values()].toSorted((a, b) => stateTimeMs(a) - stateTimeMs(b));
}

function nearestState(states: OrbitState[], timeUtc: string) {
  const targetMs = new Date(timeUtc).getTime();
  return states.reduce<OrbitState | null>((best, state) => {
    if (!best) {
      return state;
    }
    return Math.abs(stateTimeMs(state) - targetMs) < Math.abs(stateTimeMs(best) - targetMs) ? state : best;
  }, null);
}

export class GroundOperationsService {
  constructor(
    private readonly visibilityService = new VisibilityService(),
    private readonly accessWindowService = new AccessWindowService(),
    private readonly passPredictionService = new PassPredictionService(),
  ) {}

  analyze(snapshot: SatelliteSnapshot, stations: GroundStation[], nowUtc: string): GroundOperationsAnalysis {
    const states = uniqueStates([
      ...(snapshot.pastTrail ?? []),
      ...(snapshot.trajectory ?? []),
      ...(snapshot.futureTrajectory ?? []),
      ...(snapshot.state ? [snapshot.state] : []),
    ]);
    const enabledStations = stations.filter((station) => station.enabled);

    const stationSummaries: StationVisibilitySummary[] = enabledStations.map((station) => {
      const samples = this.visibilityService.computeSeries(station, states);
      const windows = this.accessWindowService.generateWindows(station, samples);
      const currentState = snapshot.state ?? nearestState(states, nowUtc);
      const current = currentState ? this.visibilityService.computeSample(station, currentState) : null;
      const maxElevationDeg = samples.length > 0
        ? Math.max(...samples.map((sample) => sample.elevationDeg))
        : null;
      const visibilityPercentage = samples.length > 0
        ? (samples.filter((sample) => sample.visible).length / samples.length) * 100
        : 0;

      return {
        station,
        current,
        nextWindow: this.passPredictionService.getNextPass(windows, nowUtc),
        maxElevationDeg,
        visibilityPercentage,
        windows,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      targetName: snapshot.satellite.name,
      sampleCount: states.length,
      stationSummaries,
      accessWindows: stationSummaries.flatMap((summary) => summary.windows)
        .toSorted((a, b) => new Date(a.aosUtc).getTime() - new Date(b.aosUtc).getTime()),
    };
  }
}

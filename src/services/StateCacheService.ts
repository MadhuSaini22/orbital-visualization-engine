import type { SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import type { Propagator } from "@/propagation/PropagatorInterface";

export type TrajectoryWindowOptions = {
  futureMinutes: number;
  pastMinutes: number;
  stepSec: number;
};

export type GroundTrackWindowOptions = {
  pastMinutes: number;
  stepSec: number;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export class StateCacheService {
  private groundTrackCacheKey: string | null = null;
  private groundTrackCache: SatelliteSnapshot[] = [];

  constructor(
    private readonly propagator: Propagator,
    private readonly satellites: SatelliteObject[],
  ) {}

  getCurrentSnapshots(timeUtc: string): SatelliteSnapshot[] {
    return this.satellites.map((satellite) => {
      const state = this.propagator.getState(satellite.id, timeUtc);
      return {
        satellite,
        state,
        error: state ? undefined : "No propagated position for this time.",
      };
    });
  }

  getWindowedSnapshots(timeUtc: string, options: TrajectoryWindowOptions): SatelliteSnapshot[] {
    const centerTime = new Date(timeUtc);
    const futureStartUtc = centerTime.toISOString();
    const futureEndUtc = addMinutes(centerTime, options.futureMinutes).toISOString();
    const pastStartUtc = addMinutes(centerTime, -options.pastMinutes).toISOString();
    const pastEndUtc = centerTime.toISOString();
    const groundStartUtc = addMinutes(centerTime, -options.pastMinutes).toISOString();
    const groundEndUtc = addMinutes(centerTime, options.futureMinutes).toISOString();

    return this.satellites.map((satellite) => {
      const trajectory = this.propagator.getTrajectory(
        satellite.id,
        pastStartUtc,
        futureEndUtc,
        options.stepSec,
      );
      const futureStartMs = new Date(futureStartUtc).getTime();
      const pastEndMs = new Date(pastEndUtc).getTime();
      const futureTrajectory = trajectory.filter((state) => new Date(state.timeUtc).getTime() >= futureStartMs);
      const pastTrail = trajectory.filter((state) => new Date(state.timeUtc).getTime() <= pastEndMs);

      // Ground track uses the same propagated states as orbit rendering, but the
      // Cesium layer projects each state to altitude zero. Keeping it here makes
      // the renderer a consumer of states rather than an owner of propagation.
      const groundStartMs = new Date(groundStartUtc).getTime();
      const groundEndMs = new Date(groundEndUtc).getTime();
      const groundTrack = trajectory.filter((state) => {
        const stateMs = new Date(state.timeUtc).getTime();
        return stateMs >= groundStartMs && stateMs <= groundEndMs;
      });

      return {
        satellite,
        state: null,
        trajectory,
        futureTrajectory,
        pastTrail,
        groundTrack,
      };
    });
  }

  getGroundTrackSnapshots(timeUtc: string, options: GroundTrackWindowOptions): SatelliteSnapshot[] {
    const cacheKey = `${timeUtc}|${options.pastMinutes}|${options.stepSec}`;
    if (this.groundTrackCacheKey === cacheKey) {
      return this.groundTrackCache;
    }

    const endTime = new Date(timeUtc);
    const startUtc = addMinutes(endTime, -options.pastMinutes).toISOString();
    const endUtc = endTime.toISOString();

    this.groundTrackCache = this.satellites
      .filter((satellite) => satellite.visual.showGroundTrack)
      .map((satellite) => ({
      satellite,
      state: null,
      groundTrack: this.propagator.getTrajectory(
        satellite.id,
        startUtc,
        endUtc,
        options.stepSec,
      ),
      }));
    this.groundTrackCacheKey = cacheKey;
    return this.groundTrackCache;
  }
}

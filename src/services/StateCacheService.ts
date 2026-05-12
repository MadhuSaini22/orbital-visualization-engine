import type { SatelliteObject, SatelliteSnapshot } from "@/domain/orbit";
import type { Propagator } from "@/propagation/PropagatorInterface";

export type TrajectoryWindowOptions = {
  futureMinutes: number;
  pastMinutes: number;
  stepSec: number;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export class StateCacheService {
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
      const futureTrajectory = this.propagator.getTrajectory(
        satellite.id,
        futureStartUtc,
        futureEndUtc,
        options.stepSec,
      );
      const pastTrail = this.propagator.getTrajectory(
        satellite.id,
        pastStartUtc,
        pastEndUtc,
        options.stepSec,
      );

      // Ground track uses the same propagated states as orbit rendering, but the
      // Cesium layer projects each state to altitude zero. Keeping it here makes
      // the renderer a consumer of states rather than an owner of propagation.
      const groundTrack = this.propagator.getTrajectory(
        satellite.id,
        groundStartUtc,
        groundEndUtc,
        options.stepSec,
      );

      return {
        satellite,
        state: null,
        trajectory: futureTrajectory,
        futureTrajectory,
        pastTrail,
        groundTrack,
      };
    });
  }
}

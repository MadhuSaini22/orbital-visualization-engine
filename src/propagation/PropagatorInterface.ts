import type { OrbitState } from "@/domain/orbit";

export interface Propagator {
  getState(satelliteId: string, timeUtc: string): OrbitState | null;
  getTrajectory(
    satelliteId: string,
    startUtc: string,
    endUtc: string,
    stepSec: number,
  ): OrbitState[];
}

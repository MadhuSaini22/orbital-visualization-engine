import * as satellite from "satellite.js";
import type { SatelliteObject, OrbitState } from "@/domain/orbit";
import type { Propagator } from "@/propagation/PropagatorInterface";

type SatRecordById = Map<string, satellite.SatRec>;

function magnitude(vector?: { x: number; y: number; z: number }) {
  if (!vector) {
    return undefined;
  }

  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
}

export class SatelliteJsPropagator implements Propagator {
  private readonly records: SatRecordById;

  constructor(satellites: SatelliteObject[]) {
    this.records = new Map(
      satellites.map((sat) => [sat.id, satellite.twoline2satrec(sat.tle.line1, sat.tle.line2)]),
    );
  }

  getState(satelliteId: string, timeUtc: string): OrbitState | null {
    const record = this.records.get(satelliteId);
    if (!record) {
      return null;
    }

    const date = new Date(timeUtc);
    const propagated = satellite.propagate(record, date);

    if (
      !propagated.position ||
      !propagated.velocity ||
      propagated.position === true ||
      propagated.velocity === true
    ) {
      return null;
    }

    const gmst = satellite.gstime(date);
    const geodetic = satellite.eciToGeodetic(propagated.position, gmst);
    const positionEcef = satellite.eciToEcf(propagated.position, gmst);

    return {
      satelliteId,
      timeUtc: date.toISOString(),
      frame: "GEODETIC",
      positionEciKm: [propagated.position.x, propagated.position.y, propagated.position.z],
      velocityEciKmps: [propagated.velocity.x, propagated.velocity.y, propagated.velocity.z],
      positionEcefKm: [positionEcef.x, positionEcef.y, positionEcef.z],
      gmstRad: gmst,
      latitudeDeg: satellite.degreesLat(geodetic.latitude),
      longitudeDeg: satellite.degreesLong(geodetic.longitude),
      altitudeKm: geodetic.height,
      velocityKmps: magnitude(propagated.velocity),
    };
  }

  getTrajectory(satelliteId: string, startUtc: string, endUtc: string, stepSec: number): OrbitState[] {
    const states: OrbitState[] = [];
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    const stepMs = Math.max(stepSec, 1) * 1000;

    for (let timeMs = startMs; timeMs <= endMs; timeMs += stepMs) {
      const state = this.getState(satelliteId, new Date(timeMs).toISOString());
      if (state) {
        states.push(state);
      }
    }

    return states;
  }
}

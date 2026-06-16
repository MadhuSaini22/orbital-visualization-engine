import * as satellite from "satellite.js";
import type { GroundStation, VisibilitySample } from "@/domain/groundOperations";
import type { OrbitState } from "@/domain/orbit";

const degToRad = Math.PI / 180;
const radToDeg = 180 / Math.PI;

type EcfVector = { x: number; y: number; z: number };

function stateToEcf(state: OrbitState): EcfVector | null {
  if (state.positionEcefKm) {
    return {
      x: state.positionEcefKm[0],
      y: state.positionEcefKm[1],
      z: state.positionEcefKm[2],
    };
  }
  if (Number.isFinite(state.latitudeDeg) && Number.isFinite(state.longitudeDeg) && Number.isFinite(state.altitudeKm)) {
    return satellite.geodeticToEcf({
      latitude: state.latitudeDeg * degToRad,
      longitude: state.longitudeDeg * degToRad,
      height: state.altitudeKm,
    });
  }
  return null;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

export class VisibilityService {
  computeSample(station: GroundStation, state: OrbitState): VisibilitySample | null {
    const positionEcf = stateToEcf(state);
    if (!positionEcf) {
      return null;
    }

    const lookAngles = satellite.ecfToLookAngles({
      latitude: station.latitude * degToRad,
      longitude: station.longitude * degToRad,
      height: station.altitude,
    }, positionEcf);
    const elevationDeg = lookAngles.elevation * radToDeg;

    return {
      stationId: station.id,
      stationName: station.name,
      timeUtc: state.timeUtc,
      elevationDeg,
      azimuthDeg: normalizeDegrees(lookAngles.azimuth * radToDeg),
      rangeKm: lookAngles.rangeSat,
      visible: elevationDeg >= station.minimumElevation,
    };
  }

  computeSeries(station: GroundStation, states: OrbitState[]) {
    return states
      .map((state) => this.computeSample(station, state))
      .filter((sample): sample is VisibilitySample => sample !== null);
  }
}

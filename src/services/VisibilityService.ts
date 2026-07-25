import type { GroundStation, VisibilitySample } from "@/domain/groundOperations";
import type { OrbitState } from "@/domain/orbit";

const degToRad = Math.PI / 180;
const radToDeg = 180 / Math.PI;
const wgs84EquatorialRadiusKm = 6378.137;
const wgs84Flattening = 1 / 298.257223563;

type EcfVector = { x: number; y: number; z: number };

function geodeticToEcf(latitudeRad: number, longitudeRad: number, heightKm: number): EcfVector {
  const eccentricitySquared = wgs84Flattening * (2 - wgs84Flattening);
  const sinLatitude = Math.sin(latitudeRad);
  const cosLatitude = Math.cos(latitudeRad);
  const radius = wgs84EquatorialRadiusKm / Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);
  return {
    x: (radius + heightKm) * cosLatitude * Math.cos(longitudeRad),
    y: (radius + heightKm) * cosLatitude * Math.sin(longitudeRad),
    z: (radius * (1 - eccentricitySquared) + heightKm) * sinLatitude,
  };
}

function stateToEcf(state: OrbitState): EcfVector | null {
  if (state.positionEcefKm) {
    return {
      x: state.positionEcefKm[0],
      y: state.positionEcefKm[1],
      z: state.positionEcefKm[2],
    };
  }
  if (Number.isFinite(state.latitudeDeg) && Number.isFinite(state.longitudeDeg) && Number.isFinite(state.altitudeKm)) {
    return geodeticToEcf(state.latitudeDeg * degToRad, state.longitudeDeg * degToRad, state.altitudeKm);
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

    const latitudeRad = station.latitude * degToRad;
    const longitudeRad = station.longitude * degToRad;
    const stationEcf = geodeticToEcf(latitudeRad, longitudeRad, station.altitude);
    const dx = positionEcf.x - stationEcf.x;
    const dy = positionEcf.y - stationEcf.y;
    const dz = positionEcf.z - stationEcf.z;
    const east = -Math.sin(longitudeRad) * dx + Math.cos(longitudeRad) * dy;
    const north = -Math.sin(latitudeRad) * Math.cos(longitudeRad) * dx
      - Math.sin(latitudeRad) * Math.sin(longitudeRad) * dy
      + Math.cos(latitudeRad) * dz;
    const up = Math.cos(latitudeRad) * Math.cos(longitudeRad) * dx
      + Math.cos(latitudeRad) * Math.sin(longitudeRad) * dy
      + Math.sin(latitudeRad) * dz;
    const rangeKm = Math.hypot(east, north, up);
    if (!Number.isFinite(rangeKm) || rangeKm === 0) return null;
    const elevationDeg = Math.asin(up / rangeKm) * radToDeg;

    return {
      stationId: station.id,
      stationName: station.name,
      timeUtc: state.timeUtc,
      elevationDeg,
      azimuthDeg: normalizeDegrees(Math.atan2(east, north) * radToDeg),
      rangeKm,
      visible: elevationDeg >= station.minimumElevation,
    };
  }

  computeSeries(station: GroundStation, states: OrbitState[]) {
    return states
      .map((state) => this.computeSample(station, state))
      .filter((sample): sample is VisibilitySample => sample !== null);
  }
}

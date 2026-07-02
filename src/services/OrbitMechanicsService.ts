import type { SatelliteSnapshot } from "@/domain/orbit";

export const EARTH_MU_KM3_S2 = 398600.4418;
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;

export type Vector3 = [number, number, number];

export type OrbitSummary = {
  orbitType: string;
  classification: string;
  currentAltitudeKm: number | null;
  localVelocityKmps: number | null;
  perigeeAltitudeKm: number | null;
  apogeeAltitudeKm: number | null;
  semiMajorAxisKm: number | null;
  inclinationDeg: number | null;
  eccentricity: number | null;
  raanDeg: number | null;
  argumentOfPerigeeDeg: number | null;
  periodSeconds: number | null;
};

export function vectorNorm(values: Vector3) {
  return Math.hypot(values[0], values[1], values[2]);
}

export function vectorCross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function circularOrbitPeriodSeconds(radiusKm: number) {
  return 2 * Math.PI * Math.sqrt((radiusKm ** 3) / EARTH_MU_KM3_S2);
}

export function classifyOrbit(perigeeAltitudeKm: number | null, apogeeAltitudeKm: number | null, eccentricity: number | null) {
  if (perigeeAltitudeKm == null || apogeeAltitudeKm == null) {
    return "Unknown";
  }
  const shape = eccentricity != null && eccentricity < 0.01 ? "Circular" : "Elliptical";
  if (perigeeAltitudeKm < 2000 && apogeeAltitudeKm < 2000) {
    return `LEO / ${shape}`;
  }
  if (perigeeAltitudeKm < 2000 && apogeeAltitudeKm > 30000) {
    return "GTO / Elliptical";
  }
  if (perigeeAltitudeKm >= 2000 && apogeeAltitudeKm < 30000) {
    return `MEO / ${shape}`;
  }
  if (Math.abs(perigeeAltitudeKm - 35786) < 1500 && Math.abs(apogeeAltitudeKm - 35786) < 1500) {
    return `GEO / ${shape}`;
  }
  if (apogeeAltitudeKm >= 30000) {
    return `HEO / ${shape}`;
  }
  return shape;
}

export function orbitSummaryFromSnapshot(snapshot: SatelliteSnapshot | null | undefined): OrbitSummary {
  const satellite = snapshot?.satellite;
  const state = snapshot?.state;
  const base: OrbitSummary = {
    orbitType: satellite?.sourceType === "TLE"
      ? "TLE"
      : satellite?.sourceType === "MANUAL_STATE"
        ? "Manual orbit"
        : satellite?.sourceType ?? "Unknown",
    classification: "Unknown",
    currentAltitudeKm: typeof state?.altitudeKm === "number" && Number.isFinite(state.altitudeKm) ? state.altitudeKm : null,
    localVelocityKmps: typeof state?.velocityKmps === "number" && Number.isFinite(state.velocityKmps) ? state.velocityKmps : null,
    perigeeAltitudeKm: null,
    apogeeAltitudeKm: null,
    semiMajorAxisKm: null,
    inclinationDeg: null,
    eccentricity: null,
    raanDeg: null,
    argumentOfPerigeeDeg: null,
    periodSeconds: null,
  };
  if (!state?.positionEciKm || !state.velocityEciKmps) {
    return { ...base, classification: classifyOrbit(null, null, null) };
  }

  const r = state.positionEciKm;
  const v = state.velocityEciKmps;
  const radiusKm = vectorNorm(r);
  const speedKmps = vectorNorm(v);
  const h = vectorCross(r, v);
  const hNorm = vectorNorm(h);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || !Number.isFinite(speedKmps) || hNorm <= 0) {
    return base;
  }

  const semiMajorAxisKm = 1 / ((2 / radiusKm) - ((speedKmps * speedKmps) / EARTH_MU_KM3_S2));
  const vxh = vectorCross(v, h);
  const eccentricityVector: Vector3 = [
    (vxh[0] / EARTH_MU_KM3_S2) - (r[0] / radiusKm),
    (vxh[1] / EARTH_MU_KM3_S2) - (r[1] / radiusKm),
    (vxh[2] / EARTH_MU_KM3_S2) - (r[2] / radiusKm),
  ];
  const eccentricity = vectorNorm(eccentricityVector);
  const inclinationDeg = Math.acos(Math.max(-1, Math.min(1, h[2] / hNorm))) * 180 / Math.PI;
  const nodeVector: Vector3 = [-h[1], h[0], 0];
  const nodeNorm = vectorNorm(nodeVector);
  const raanRad = nodeNorm > 1.0e-10 ? Math.atan2(nodeVector[1], nodeVector[0]) : Number.NaN;
  const argumentOfPerigeeCosine = nodeNorm > 1.0e-10 && eccentricity > 1.0e-8
    ? (nodeVector[0] * eccentricityVector[0] + nodeVector[1] * eccentricityVector[1] + nodeVector[2] * eccentricityVector[2]) / (nodeNorm * eccentricity)
    : Number.NaN;
  const argumentOfPerigeeBaseRad = Number.isFinite(argumentOfPerigeeCosine)
    ? Math.acos(Math.max(-1, Math.min(1, argumentOfPerigeeCosine)))
    : Number.NaN;
  const argumentOfPerigeeRad = Number.isFinite(argumentOfPerigeeBaseRad) && eccentricityVector[2] < 0
    ? (2 * Math.PI) - argumentOfPerigeeBaseRad
    : argumentOfPerigeeBaseRad;
  const perigeeRadiusKm = semiMajorAxisKm * (1 - eccentricity);
  const apogeeRadiusKm = semiMajorAxisKm * (1 + eccentricity);
  const periodSeconds = semiMajorAxisKm > 0 ? circularOrbitPeriodSeconds(semiMajorAxisKm) : null;
  const perigeeAltitudeKm = Number.isFinite(perigeeRadiusKm) ? perigeeRadiusKm - EARTH_EQUATORIAL_RADIUS_KM : null;
  const apogeeAltitudeKm = Number.isFinite(apogeeRadiusKm) ? apogeeRadiusKm - EARTH_EQUATORIAL_RADIUS_KM : null;

  return {
    ...base,
    currentAltitudeKm: radiusKm - EARTH_EQUATORIAL_RADIUS_KM,
    localVelocityKmps: speedKmps,
    perigeeAltitudeKm,
    apogeeAltitudeKm,
    semiMajorAxisKm: Number.isFinite(semiMajorAxisKm) ? semiMajorAxisKm : null,
    inclinationDeg: Number.isFinite(inclinationDeg) ? inclinationDeg : null,
    eccentricity: Number.isFinite(eccentricity) ? eccentricity : null,
    raanDeg: Number.isFinite(raanRad) ? ((raanRad * 180 / Math.PI) + 360) % 360 : null,
    argumentOfPerigeeDeg: Number.isFinite(argumentOfPerigeeRad) ? ((argumentOfPerigeeRad * 180 / Math.PI) + 360) % 360 : null,
    periodSeconds: periodSeconds != null && Number.isFinite(periodSeconds) ? periodSeconds : null,
    classification: classifyOrbit(perigeeAltitudeKm, apogeeAltitudeKm, eccentricity),
  };
}

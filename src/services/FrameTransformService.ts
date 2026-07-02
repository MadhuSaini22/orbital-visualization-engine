import type { OrbitState } from "@/domain/orbit";
import type { BackendEphemerisState } from "@/services/orbitServerApi";

function timestampMs(value: string) {
  return new Date(value).getTime();
}

function lerpNumber(a: number | undefined, b: number | undefined, alpha: number) {
  if (typeof a !== "number" || typeof b !== "number") {
    return undefined;
  }
  return a + (b - a) * alpha;
}

function lerpVector(
  a: [number, number, number] | undefined,
  b: [number, number, number] | undefined,
  alpha: number,
) {
  if (!a || !b) {
    return undefined;
  }
  return [
    a[0] + (b[0] - a[0]) * alpha,
    a[1] + (b[1] - a[1]) * alpha,
    a[2] + (b[2] - a[2]) * alpha,
  ] as [number, number, number];
}

function lerpLongitudeDeg(a: number, b: number, alpha: number) {
  let delta = b - a;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }

  const value = a + delta * alpha;
  return value > 180 ? value - 360 : value < -180 ? value + 360 : value;
}

export function interpolateOrbitStateSamples(
  satelliteId: string,
  samples: OrbitState[] | undefined,
  timeUtc: string,
): OrbitState | null {
  if (!samples || samples.length === 0) {
    return null;
  }

  const targetMs = timestampMs(timeUtc);
  const ordered = samples.toSorted((a, b) => timestampMs(a.timeUtc) - timestampMs(b.timeUtc));
  if (targetMs <= timestampMs(ordered[0].timeUtc)) {
    return { ...ordered[0], satelliteId };
  }
  if (targetMs >= timestampMs(ordered.at(-1)!.timeUtc)) {
    return { ...ordered.at(-1)!, satelliteId };
  }

  let low = 0;
  let high = ordered.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (timestampMs(ordered[mid].timeUtc) <= targetMs) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const before = ordered[low];
  const after = ordered[high];
  const beforeMs = timestampMs(before.timeUtc);
  const afterMs = timestampMs(after.timeUtc);
  const alpha = (targetMs - beforeMs) / Math.max(1, afterMs - beforeMs);
  const velocityEciKmps = lerpVector(before.velocityEciKmps, after.velocityEciKmps, alpha);
  const velocityEcefKmps = lerpVector(before.velocityEcefKmps, after.velocityEcefKmps, alpha);
  const velocityVector = velocityEcefKmps ?? velocityEciKmps;

  return {
    satelliteId,
    timeUtc,
    frame: before.frame,
    positionEciKm: lerpVector(before.positionEciKm, after.positionEciKm, alpha),
    velocityEciKmps,
    positionEcefKm: lerpVector(before.positionEcefKm, after.positionEcefKm, alpha),
    velocityEcefKmps,
    gmstRad: lerpNumber(before.gmstRad, after.gmstRad, alpha),
    latitudeDeg: before.latitudeDeg + (after.latitudeDeg - before.latitudeDeg) * alpha,
    longitudeDeg: lerpLongitudeDeg(before.longitudeDeg, after.longitudeDeg, alpha),
    altitudeKm: before.altitudeKm + (after.altitudeKm - before.altitudeKm) * alpha,
    velocityKmps: velocityVector
      ? Math.sqrt(velocityVector[0] ** 2 + velocityVector[1] ** 2 + velocityVector[2] ** 2)
      : lerpNumber(before.velocityKmps, after.velocityKmps, alpha),
  };
}

export function backendEphemerisStateToOrbitState(satelliteId: string, state: BackendEphemerisState): OrbitState {
  return {
    satelliteId,
    timeUtc: state.time,
    frame: "ECEF",
    positionEcefKm: state.positionKm,
    velocityEcefKmps: state.velocityKmps,
    latitudeDeg: state.latitudeDeg,
    longitudeDeg: state.longitudeDeg,
    altitudeKm: state.altitudeKm,
    velocityKmps: Math.sqrt(
      state.velocityKmps[0] ** 2 +
      state.velocityKmps[1] ** 2 +
      state.velocityKmps[2] ** 2,
    ),
  };
}

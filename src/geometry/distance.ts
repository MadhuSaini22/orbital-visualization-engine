import type { OrbitState } from "@/domain/orbit";

function getPositionKm(state: OrbitState) {
  return state.positionEciKm ?? state.positionEcefKm;
}

export function distanceBetweenOrbitStatesKm(a: OrbitState | null, b: OrbitState | null) {
  const positionA = a ? getPositionKm(a) : undefined;
  const positionB = b ? getPositionKm(b) : undefined;

  if (!positionA || !positionB) {
    return null;
  }

  const dx = positionB[0] - positionA[0];
  const dy = positionB[1] - positionA[1];
  const dz = positionB[2] - positionA[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

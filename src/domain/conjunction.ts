import type { OrbitState, SatelliteObject } from "@/domain/orbit";

export type ConjunctionStatus = "safe" | "warning" | "critical";

export type ConjunctionEvent = {
  id: string;
  primarySatelliteId: string;
  secondarySatelliteId: string;
  primaryName?: string;
  secondaryName?: string;
  startTimeUtc: string;
  endTimeUtc: string;
  tcaUtc?: string;
  missDistanceKm?: number;
  relativeVelocityKmps?: number | null;
  probabilityOfCollision?: number | null;
  risk?: "SAFE" | "WATCH" | "WARNING" | "CRITICAL";
  source?: string;
  warningDistanceKm: number;
  criticalDistanceKm: number;
};

export type ConjunctionSnapshot = {
  event: ConjunctionEvent;
  primary: SatelliteObject;
  secondary: SatelliteObject;
  tcaUtc: string;
  missDistanceKm: number;
  relativeVelocityKmps: number | null;
  status: ConjunctionStatus;
  primaryState: OrbitState | null;
  secondaryState: OrbitState | null;
};

export function getConjunctionStatus(
  missDistanceKm: number,
  warningDistanceKm: number,
  criticalDistanceKm: number,
): ConjunctionStatus {
  if (missDistanceKm <= criticalDistanceKm) {
    return "critical";
  }

  if (missDistanceKm <= warningDistanceKm) {
    return "warning";
  }

  return "safe";
}

export function getConjunctionTone(status: ConjunctionStatus) {
  if (status === "critical") {
    return {
      label: "Critical",
      color: "#ff4d4d",
    };
  }

  if (status === "warning") {
    return {
      label: "Warning",
      color: "#f59e0b",
    };
  }

  return {
    label: "Safe",
    color: "#22c55e",
  };
}

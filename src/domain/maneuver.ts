import type { OrbitState, SatelliteObject } from "@/domain/orbit";

export type ManeuverStatus = "planned" | "executed" | "candidate";

export type ManeuverType = "orbit_raise" | "phasing" | "station_keep" | "avoidance";

export type ManeuverEvent = {
  id: string;
  satelliteId: string;
  title: string;
  timeUtc: string;
  type: ManeuverType;
  status: ManeuverStatus;
  deltaVMps: number;
  durationSec: number;
  description: string;
};

export type ManeuverSnapshot = {
  event: ManeuverEvent;
  satellite: SatelliteObject;
  state: OrbitState | null;
  minutesFromSimulationTime: number;
};

export function getManeuverTone(status: ManeuverStatus) {
  if (status === "executed") {
    return {
      label: "Executed",
      color: "#22c55e",
    };
  }

  if (status === "candidate") {
    return {
      label: "Candidate",
      color: "#f59e0b",
    };
  }

  return {
    label: "Planned",
    color: "#ff4dff",
  };
}

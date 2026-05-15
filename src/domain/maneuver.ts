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
  deltaVVectorMps: [number, number, number];
  frame: "RTN" | "ECI" | "BODY" | "LVLH";
  durationSec: number;
  description: string;
  visual: {
    showBurnVector: boolean;
    showPrePostOrbit: boolean;
  };
};

export type ManeuverSnapshot = {
  event: ManeuverEvent;
  satellite: SatelliteObject;
  state: OrbitState | null;
  preTrajectory: OrbitState[];
  postTrajectory: OrbitState[];
  minutesFromSimulationTime: number;
};

export function getDeltaVMagnitudeMps(event: ManeuverEvent) {
  const [x, y, z] = event.deltaVVectorMps;
  return Math.sqrt(x ** 2 + y ** 2 + z ** 2);
}

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

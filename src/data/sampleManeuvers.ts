import type { ManeuverEvent } from "@/domain/maneuver";

export const sampleManeuvers: ManeuverEvent[] = [
  {
    id: "mnv-iss-raise-001",
    satelliteId: "25544",
    title: "ISS altitude trim",
    timeUtc: "2026-05-08T00:42:00.000Z",
    type: "orbit_raise",
    status: "planned",
    deltaVMps: 0.9,
    durationSec: 420,
    description: "Small prograde burn marker used to validate maneuver event visualization.",
  },
  {
    id: "mnv-noaa-phase-001",
    satelliteId: "33591",
    title: "NOAA phasing check",
    timeUtc: "2026-05-08T01:18:00.000Z",
    type: "phasing",
    status: "candidate",
    deltaVMps: 0.35,
    durationSec: 180,
    description: "Candidate phasing point for timeline and orbit-context review.",
  },
  {
    id: "mnv-landsat-keep-001",
    satelliteId: "39084",
    title: "LANDSAT station keep",
    timeUtc: "2026-05-08T02:05:00.000Z",
    type: "station_keep",
    status: "executed",
    deltaVMps: 0.55,
    durationSec: 260,
    description: "Executed maintenance burn marker for comparing planned and historical events.",
  },
];

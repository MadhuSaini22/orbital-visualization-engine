import type { ConjunctionEvent } from "@/domain/conjunction";

export const sampleConjunctions: ConjunctionEvent[] = [
  {
    id: "cnj-iss-noaa-window",
    primarySatelliteId: "25544",
    secondarySatelliteId: "33591",
    startTimeUtc: "2026-05-08T00:00:00.000Z",
    endTimeUtc: "2026-05-08T04:00:00.000Z",
    warningDistanceKm: 9000,
    criticalDistanceKm: 4500,
  },
];

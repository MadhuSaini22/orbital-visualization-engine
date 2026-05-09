export type SatelliteObject = {
  id: string;
  name: string;
  tle: {
    line1: string;
    line2: string;
  };
};

export type OrbitState = {
  satelliteId: string;
  timeUtc: string;
  frame: "ECI" | "ECEF" | "GEODETIC";
  positionEciKm?: [number, number, number];
  velocityEciKmps?: [number, number, number];
  positionEcefKm?: [number, number, number];
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  velocityKmps?: number;
};

export type SatelliteSnapshot = {
  satellite: SatelliteObject;
  state: OrbitState | null;
  trajectory?: OrbitState[];
  error?: string;
};

export type RangeMeasurement = {
  primary: SatelliteSnapshot;
  secondary: SatelliteSnapshot;
  distanceKm: number;
};

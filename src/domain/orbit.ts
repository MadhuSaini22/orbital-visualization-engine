export type SatelliteVisualSettings = {
  color?: string;
  showMarker: boolean;
  showLabel: boolean;
  showOrbit: boolean;
  showGroundTrack: boolean;
  showTrail: boolean;
};

export type SatelliteObject = {
  id: string;
  name: string;
  noradId?: string;
  sourceType: "TLE" | "EPHEMERIS" | "MANUAL_STATE";
  tle: {
    line1: string;
    line2: string;
  };
  visual: SatelliteVisualSettings;
  metadata?: {
    owner?: string;
    mission?: string;
    objectType?: "payload" | "debris" | "rocket_body" | "unknown";
  };
};

export type OrbitState = {
  satelliteId: string;
  timeUtc: string;
  frame: "ECI" | "ECEF" | "GEODETIC";
  positionEciKm?: [number, number, number];
  velocityEciKmps?: [number, number, number];
  positionEcefKm?: [number, number, number];
  velocityEcefKmps?: [number, number, number];
  gmstRad?: number;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  velocityKmps?: number;
};

export type SatelliteSnapshot = {
  satellite: SatelliteObject;
  state: OrbitState | null;
  trajectory?: OrbitState[];
  futureTrajectory?: OrbitState[];
  pastTrail?: OrbitState[];
  groundTrack?: OrbitState[];
  error?: string;
};

export type RangeMeasurement = {
  primary: SatelliteSnapshot;
  secondary: SatelliteSnapshot;
  distanceKm: number;
};
